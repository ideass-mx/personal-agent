# PHASE 61.2.3 — Windows Local LLM Runtime Packaging & Preflight

## Problema

En Windows limpio, el artefacto oficial `llama-b10537` se extraía correctamente
junto con el GGUF Qwen3 4B, pero:

```text
.\llama-server.exe --version
→ exit -1073741515  (0xC0000135 STATUS_DLL_NOT_FOUND)
```

El proceso moría **antes** de `/health` → el Gateway acababa en
`RUNTIME_HEALTH_TIMEOUT`. El onboarding podía marcar éxito tras
descarga+extract sin comprobar ejecutabilidad.

## Root cause (evidencia PE)

Análisis estático de imports del zip oficial
`llama-b10537-bin-win-cpu-x64.zip`:

```text
llama-server.exe
    ↓
KERNEL32.dll              ✓ (sistema)
api-ms-win-crt-*.dll      ✓ (UCRT sistema)
llama-server-impl.dll     ✓ (en el zip)
VCRUNTIME140.dll          ✗ (no viene en el zip)

llama-server-impl.dll
    ↓
llama.dll / ggml*.dll     ✓ (en el zip)
VCRUNTIME140.dll          ✗
VCRUNTIME140_1.dll        ✗
MSVCP140.dll              ✗
```

Confirmado: `unzip -l llama-b10537-bin-win-cpu-x64.zip` no lista
`vcruntime140*.dll` ni `msvcp140.dll`.

Son el runtime Microsoft Visual C++ 2015–2022 **x64**. No se infirió por
ausencia en `System32`; se confirmó por imports PE.

## Estrategia (Opción A)

Empaquetar app-local (side-by-side) las tres DLLs junto a `llama-server.exe`:

- Origen: redistributable oficial `vc_redist.x64.exe`
- Assets: `gateway/assets/local-llm/win-x64-vc140/`
- Copia en install: `ensureWindowsVc140Sidecars(installRoot)`
- Build: `scripts/build.mjs` copia assets a `dist/gateway/assets/...`
  (y el package Windows copia `dist/gateway`).

No se instala el redistributable de sistema de forma silenciosa.
No se requiere Visual Studio / Node / Ollama en el equipo final.

## Preflight

`runRuntimePreflight` / `assertRuntimePreflight`:

1. Existe `llama-server(.exe)`
2. Sidecars VC140 presentes (Windows)
3. `llama-server --version` con `cwd = runtime dir` y
   `PATH = runtime dir + PATH existente`
4. Exit `0` → READY; `0xC0000135` → `RUNTIME_DEPENDENCY_MISSING`

**No** carga el GGUF. **No** usa `/health`.

El marker `runtime.json` incluye `preflightOk: true` solo tras éxito.
`isInstalled()` exige `preflightOk === true`.

## Validación de modelo (segunda etapa)

Tras preflight OK, el install HTTP:

1. Descarga + SHA-256 del GGUF
2. Instala/valida runtime
3. `ensureReady(modelPath)` → spawn + `/health`

Errores de runtime vs modelo quedan separados.

## Onboarding

Fases reales:

- Descargando modelo
- Verificando modelo
- Preparando motor local
- Validando motor local
- Iniciando el modelo
- Listo

Si falla el motor tras modelo OK:

- Título: «No pudimos preparar el motor local»
- Mensaje: modelo OK / motor no pudo iniciarse
- Acciones: Reintentar · Ver detalles (`0xC0000135` solo en detalles)

## Criterios

| Check | Estado en repo |
|-------|----------------|
| Dependencia exacta identificada | Sí (VC140 x64) |
| Sidecars empaquetados | Sí |
| Preflight `--version` | Sí |
| No marcar instalado sin preflight | Sí |
| PATH/cwd controlados | Sí |
| Tests 61.2.3 | Sí |
| Windows limpio real | Pendiente de validación en máquina destino |

## No tocado

AgentRuntime, MCP, Research, Identity, Android, Tailscale, protocolo Gateway,
Ollama, timeouts de health artificialmente aumentados.
