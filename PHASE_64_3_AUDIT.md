# PHASE 64.3 — AUDIT (Gateway `npm ci` Deep Diagnostic)

Fecha: 2026-09-04  
Alcance: **diagnóstico exclusivo** del coste de `npm ci --prefix gateway` en Windows CI.  
**Sin** optimización implementada. **Sin** cambios a package.json, lockfiles, versiones, runtime, MCP, Capability, Artifact, ObjectStorage, Android.  
**Sin** `npm audit fix`.

Referencias: `WINDOWS_CI_DEPENDENCY_AUDIT.md`, PHASE 64.2 (timing + drop workspace-http).

---

## Executive Summary

Tras PHASE 64.2, el cuello de botella observado en el release workflow es:

```text
protocol npm ci:  ~00:00:05
gateway npm ci:   ~00:03:19   ← foco de esta fase
node npm ci:      pendiente (timing en workflow; sin cifra en este informe)
web npm ci:       pendiente
```

**Conclusión diagnóstica:** el ~3m19s de gateway en `windows-latest` **no** se explica principalmente por compilación de `better-sqlite3`. El grafo (~258 paquetes añadidos, ~116 MB / ~8 500 ficheros en `node_modules`) y el coste de **reify/extract en NTFS + AV del runner** dominan. Los lifecycle scripts relevantes son pocos y, en Linux controlado, aportan ~0.1–0.2 s.

```text
ROOT CAUSE: MIXED
  primary  ≈ FILESYSTEM (npm reify/unpack en Windows)
  secondary ≈ CACHE (hit de tarball no elimina extract) + NETWORK (cold partial)
  NOT primary ≈ BETTER_SQLITE3 compile / node-gyp

CONFIDENCE: MEDIUM
  HIGH  → no es compile fallido de better-sqlite3 (prebuild existe; install completa; scripts locales << reify)
  MEDIUM → partición exacta FS vs network en el runner Windows sin A/B --ignore-scripts allí
```

---

## Tabla de tiempos

| Paso | Duración | Diagnóstico |
| ------------------------ | -------: | ----------- |
| protocol npm ci (Windows CI, post-64.2) | ~5.7s / ~5s | normal (1 paquete) |
| gateway npm ci (Windows CI) | **~3m19s** | investigar → FS/reify dominante (MIXED) |
| gateway `--ignore-scripts` (Windows CI) | **NOT_EXECUTED** | requiere job diagnóstico one-shot; no tocado el release path |
| gateway npm ci normal (Linux lab, cache warm) | ~1.3–3.3s | baseline rápido |
| gateway `--ignore-scripts` (Linux lab) | ~1.1s | scripts ≈ **0.2s** delta vs normal warm |
| better-sqlite3 install (Linux lab, `--timing`) | **~70ms** | prebuild path; sin `node-gyp` objs |
| npm `reify:unpack` (Linux lab, `--timing`) | **~776ms** | mayor coste local |
| npm `reify:audit` (Linux lab) | ~669ms | audit post-install (no es el 3m Windows) |
| esbuild install ×2 (Linux lab) | ~66ms total | platform binary |
| npm fetch/extract (Windows CI) | **no instrumentado por fase** | inferido: mayor parte de los ~199s |
| node npm ci (Windows CI) | pendiente | conservar timing 64.2 |
| web npm ci (Windows CI) | pendiente | conservar timing 64.2 |

**Clasificación A/B/C (Linux lab, no Windows):**

| Caso | Criterio | Resultado lab |
|------|----------|---------------|
| A | ignore-scripts ≈ segundos, normal ≫ | Parcial: scripts pequeños, no el cuello |
| B | ignore ≈ normal (~3m) | N/A en Linux (ambos ~1s) |
| C | mix extract + lifecycle | **Sí en lab**: unpack ≫ scripts |

**Extrapolación Windows:** el patrón “258 packages in 3m” + protocol ~5s encaja con **Case B o C en Windows** (extract/FS), no Case A (scripts). Confirmación Case B/C en el runner requiere `npm ci --ignore-scripts` one-shot (ver § Recomendación mínima).

---

## 1. Auditoría `gateway/package.json`

### Metadatos de scripts del package raíz

| Campo | Valor |
|-------|--------|
| `dependencies` | `@anthropic-ai/sdk`, `@aws-sdk/client-s3`, `@hono/node-server`, `@modelcontextprotocol/sdk`, **better-sqlite3**, `dotenv`, `hono`, `qrcode`, `ws`, `zod` |
| `devDependencies` | `@types/*`, **esbuild**, **tsx**, `typescript` |
| `optionalDependencies` | **ninguno** |
| `peerDependencies` | **ninguno** |
| scripts npm del package | solo `dev` / `start` / `typecheck` / `test` — **sin** `preinstall` / `install` / `postinstall` / `prepare` en el root del gateway |

### Cadena `better-sqlite3` → `prebuild-install`

```text
@mxideass/gateway
  └── better-sqlite3@11.10.0   (dependencies, hasInstallScript: true)
        └── prebuild-install@7.1.3
              └── (node-abi, simple-get, tar-fs, detect-libc, …)
```

Script de instalación de `better-sqlite3` (paquete publicado):

```text
install: prebuild-install || node-gyp rebuild --release
```

**¿Se ejecuta `prebuild-install` durante `npm ci`?**  
**Sí**, cuando los scripts no están ignorados: npm corre el lifecycle `install` de `better-sqlite3`, que invoca `prebuild-install` primero. Solo si ese comando falla (exit ≠ 0) se intenta `node-gyp rebuild`.

### Otros packages con `hasInstallScript` en el lockfile

| Package | Ámbito | Rol |
|---------|--------|-----|
| `better-sqlite3@11.10.0` | prod | prebuild-install \|\| node-gyp |
| `esbuild@0.25.12` | dev | binario de plataforma |
| `tsx/…/esbuild@0.28.2` | dev | idem |
| `fsevents@2.3.3` | dev optional | **omitido en win32** |

No hay más addons nativos tipo `node-pre-gyp` / `winax` en el lock de gateway.

---

## 2. Lifecycle scripts — evidencia

### Windows CI (release workflow)

- Scripts **habilitados** (no `--ignore-scripts`).
- Log de producto: `npm warn deprecated prebuild-install@7.1.3` + `added 258 packages … in 3m`.
- **No** se observó en el paste del usuario: `gyp ERR!`, `node-gyp rebuild`, descarga de VS Build Tools, ni fallo de prebuild.

### Linux lab (`npm ci --foreground-scripts` + `--timing`, árbol copiado a `/tmp`)

| Lifecycle | Duración aprox. |
|-----------|----------------:|
| better-sqlite3 `install` | ~70 ms |
| esbuild `install` (×2) | ~66 ms |
| Total `reify:build` / scripts | ~142 ms |
| `reify:unpack` | ~776 ms |

**Interpretación:** aunque `better-sqlite3` **sí** corre `prebuild-install` en `npm ci` normal, su coste medido es **sub-segundo** en un host sano con prebuild/cache. No puede, por sí solo, explicar ~199 s en CI salvo que en Windows estuviera en **retry/compile** (sin evidencia en logs actuales).

---

## 3. Comparación `npm ci` vs `--ignore-scripts`

### Linux lab (misma máquina, cache npm presente)

| Modo | ~REAL |
|------|------:|
| normal (1ª, modules vacíos) | 3.32 s |
| normal warm | 1.27 s |
| `--ignore-scripts` | 1.12 s |
| `--ignore-scripts` warm | 1.07 s |

Delta scripts ≈ **0.15–0.20 s**.

### Windows CI

```text
npm ci                  ≈ 00:03:19   (medido PHASE 64.2 timing)
npm ci --ignore-scripts = NOT_EXECUTED en runner
```

**No** se modificó el workflow de release para usar `--ignore-scripts`.

---

## 4. Diagnóstico `better-sqlite3` (checklist)

| # | Pregunta | Evidencia |
|---|----------|-----------|
| 1 | ¿Se descarga un prebuild? | **Esperado sí** en Windows Node 22: asset `better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz`. En Linux lab: prebuild usado (binario presente, sin objs de compile). |
| 2 | ¿URL? | `https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz` |
| 3 | ¿Cuánto tarda? | HEAD lab ~0.4 s; install script lab ~70 ms (cache `_prebuilds`). En Windows CI: **no** medido aparte del total 3m19s. |
| 4 | ¿Compilación local? | **No evidencia** en paste CI; lab: `HAS_COMPILE_OBJS=no`. |
| 5 | ¿`node-gyp`? | Solo como fallback del script; **no** aparece en logs CI pegados. |
| 6 | ¿Python/VS tooling download? | No en logs; VS ya suele estar en `windows-latest` si hiciera falta. |
| 7 | ¿`prebuild-install`? | **Sí** (warn deprecated en CI = el paquete está en el árbol y el path de install lo usa). |
| 8 | ¿Retry/timeout? | **No** observado en paste. |
| 9 | ¿Fallback prebuild→source? | **No** evidencia; install de gateway **completa** con audit. |
| 10 | ¿Binario PE en CI? | Validado por pipeline PHASE 64.1 **después** del package (gate PE). Implica que el `.node` instalado en Windows CI es PE usable — coherente con prebuild win32, no con ELF. |

**Importante:** existencia del prebuild en GitHub ≠ prueba de descarga en un run concreto; la combinación (install OK + PE gate + ausencia de gyp errors + deprecation warn de prebuild-install) es evidencia **fuerte** de path prebuild, no de compile de 3 minutos.

---

## 5. npm cache

| Ítem | Estado |
|------|--------|
| Workflow | `actions/setup-node` `cache: npm` + multi `cache-dependency-path` → **cache configured** |
| ¿Cache hit en el run de 3m19s? | **Desconocido** sin log de “Cache restored from …” del step Setup Node |
| Diferencia clave | Cache hit acelera **fetch de tarballs** a `~/.npm`; **no** evita escribir ~8 500 ficheros en `gateway/node_modules` ni correr install scripts |

Lab: `npm cache verify` OK; registry `https://registry.npmjs.org/`.

Cold vs warm (Linux lab): 3.32 s → 1.27 s (**cold ≫ warm** en módulos vacíos, pero ambos ≪ 3m). En Windows, incluso warm-cache suele dejar el extract como coste grande.

---

## 6. Red

| Probe | Resultado |
|-------|-----------|
| Prebuild win32 HEAD | HTTP 200, ~0.4 s (lab) |
| Prebuild linux HEAD | HTTP 200 |
| npm registry (lab) | operable (`npm ci` completa en segundos) |
| Windows CI network share of 3m19s | **no medido**; si cache hit, network no debería ser ~3m salvo saturación |

**Lectura:** 3 minutos alineados con **CPU/disk/AV extract** de un árbol grande en Windows, no con un único download de ~1 MB de prebuild.

---

## 7. npm `--timing` (lab)

Top (aprox.):

```text
reify            ~956 ms
reify:unpack     ~776 ms   ← dominante
reify:audit      ~669 ms
reify:build      ~142 ms   ← scripts (better-sqlite3 + esbuild)
```

No se subieron secretos. Timing Windows CI: **no capturado** (requeriría flag temporal en un job diagnóstico).

---

## 8. Cold / warm

| Entorno | Cold modules | Warm modules |
|---------|-------------:|-------------:|
| Linux lab | ~3.3 s | ~1.3 s |
| Windows CI | ~3m19s (al menos un run post-64.2) | desconocido segundo pass |

```text
Linux:  cold > warm, ambos rápidos
Windows: un solo dato ~3m19s; segunda instalación diagnóstica NO ejecutada
```

---

## 9. Tamaño del grafo

| Métrica | Valor |
|---------|------:|
| “added N packages” (CI) | 258 (+ audit 259) |
| Entradas lockfile (packages) | ~309 |
| prod / dev / optional (aprox.) | 247 / 62 / 53 |
| `node_modules` size (lab) | **~116 MB** |
| Ficheros / dirs | **~8521 / ~1637** |
| Lockfile size | ~156 KB |

Mayores en disco (lab): `typescript` ~23 M, `tsx` ~12 M, `better-sqlite3` ~12 M (incluye fuentes/deps), `@aws-sdk`/`@smithy`/`@esbuild` ~10–11 M c/u.

Dominio del tiempo en Windows (inferido):

```text
download   → secundario si cache hit
extract    → PRIMARIO (muchos ficheros pequeños en NTFS)
filesystem → PRIMARIO (I/O + Defender típico en windows-latest)
scripts    → menor (salvo compile nativo — no evidenciado)
native     → better-sqlite3 prebuild, coste bajo esperado
```

---

## 10. `node` / `web` npm ci

No modificados. El workflow PHASE 64.2 ya emite:

```text
[windows-installer] npm ci node START/END
[windows-installer] npm ci web START/END
```

Cifras: **pendientes** en este documento. Hipótesis: seguirán el mismo patrón proporcional al tamaño del árbol (node menor que gateway; web intermedio por Vite).

---

## ROOT CAUSE

```text
ROOT CAUSE: MIXED

primary:   FILESYSTEM — reify/unpack de ~258 paquetes / ~116MB / ~8.5k files en windows-latest
secondary: CACHE — configurada; hit no verificado; no elimina extract
secondary: NETWORK — posible en cold; no explica solo el muro de ~3m si prebuild+registry sanos
rejected as primary: BETTER_SQLITE3 compile / node-gyp (sin evidencia; prebuild win32 ABI127 disponible; PE gate posterior PASS en diseño 64.1)
lifecycle: presente pero menor en lab (~0.2s); en Windows no medido aparte

CONFIDENCE: MEDIUM
```

---

## Impacto

| Ítem | Impacto |
|------|---------|
| Wall-clock job Install | Gateway ~3m19s sigue siendo el tramo largo post-64.2 |
| Calidad del binario nativo | Independiente: se **debe** seguir instalando gateway en Windows para PE |
| Seguridad release | Sin cambios; no usar `--ignore-scripts` en release sin rebuild nativo explícito |
| Vulnerabilities banner (20) | Ruido de audit; fuera de alcance |

---

## Recomendación mínima (NO implementar en 64.3)

1. **Job diagnóstico one-shot** (`workflow_dispatch`), sin sustituir el release path:
   - `Measure-Command { npm ci --prefix gateway }`
   - `Measure-Command { npm ci --prefix gateway --ignore-scripts }` en directorio limpio separado
   - Opcional: `npm ci --timing` + artifact del `*-timing.json`
   - Log explícito: Cache restored yes/no del setup-node
2. Si `ignore-scripts ≈ normal (~3m)` → confirmar **FILESYSTEM**; optimizar después con extract/cache strategy, **no** tocar better-sqlite3.
3. Si `ignore-scripts ≪ normal` → re-abrir lifecycle; entonces instrumentar solo `better-sqlite3` / esbuild con `--foreground-scripts`.
4. Optimizaciones futuras candidatas (fase posterior, autorización aparte): `--omit=dev` **solo si** el job de package no necesita esbuild/tsx en gateway (hoy `package:windows` usa esbuild vía root `scripts/build.mjs` — verificar cwd/deps antes); paralelizar node/web; no eliminar better-sqlite3.

### Riesgo de la recomendación

| Acción | Riesgo |
|--------|--------|
| Job diagnóstico ignore-scripts | Bajo (aislado; no es el artefacto de release) |
| Poner `--ignore-scripts` en release | **Alto** — rompería better-sqlite3 PE sin rebuild explícito |
| Tocar versión better-sqlite3 ahora | Fuera de alcance; innecesario según evidencia |

---

## Qué NO se hizo (cumplimiento)

- No se modificó package.json / lockfiles / Node / Electron / better-sqlite3  
- No `npm audit fix`  
- No se cambió el workflow de release a `--ignore-scripts`  
- No se eliminaron install scripts  
- No se implementó optimización agresiva  

---

## PHASE 64.3 STATUS: DIAGNOSTIC COMPLETE

1. **Causa principal:** MIXED con primario **FILESYSTEM** (extract/reify Windows del grafo gateway), no compile de better-sqlite3.  
2. **Evidencia:** timing CI 3m19s; 258 pkgs / 116MB / 8.5k files; lab `--timing` unpack≫scripts; prebuild win32 ABI127 200; PE gate design; sin gyp errors en paste.  
3. **Duraciones:** ver tabla.  
4. **Impacto:** Install step dominado por gateway hasta medir node/web.  
5. **Recomendación mínima:** A/B `--ignore-scripts` one-shot en CI diagnóstico.  
6. **Riesgo:** bajo si el A/B no entra al path de ISCC; alto si se ignora scripts en release.
