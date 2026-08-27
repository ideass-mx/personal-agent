# PHASE 47 — Windows Product Shell & Installer Definition

**Estado:** PHASE 47 CLOSED / DESIGNED  
**Fecha:** 2026-08-27.

**Decision:** **READY FOR IMPLEMENTATION**

**Productive code changed:** **NONE**

**Estado de madurez:**

| Capa | Estado |
|------|--------|
| Diseño / definición | **designed** |
| Installer implementado | **not implemented** |
| Desktop Shell implementado | **not implemented** |
| Probado en Windows | **not Windows tested** |
| Probado en Android campo | **not Android field tested** |
| Field test K/D | **not field tested** (PHASE 44–46 BLOCKED) |

---

## 1. Product goal

El usuario debe percibir:

> «Instalé mi agente personal en mi PC.»

No:

> «Instalé Node + Gateway + MCP + varias herramientas.»

Android sigue siendo la **interfaz principal de conversación**.  
El **Desktop Control Center** es instalación, configuración, estado, diagnóstico, pairing y operación local.

---

## 2. Current architecture (congelada)

```text
Android (Hub-first WS)
  → Gateway process (hub/)  [Agent Runtime + SQLite + HTTP/WS + MCP client]
      → spawn child MCP stdio
          → Local Node (agent/)  [MCP Server + Tools]
```

- Identidad: `HUB_TOKEN` = instalación (PHASE 33).
- HITL: Gateway + ConfirmationWaiter (PHASE 28/38).
- Conversation: unidad de producto; History API (PHASE 32).
- Capacidades UX Android (PHASE 41–42).
- **Sin** Desktop Shell, instalador nativo, OTA, User/ACL, multi-node, A2A.

---

## 3. Current installation reality

| Qué existe hoy | Realidad |
|----------------|----------|
| Dev | `git clone` → `hub/.env` → `npm run install:all` → `npm run dev` |
| Package | `npm run package` → `dist/hub` + `dist/agent` + `hub.cmd` / `agent.cmd` |
| Runtime OS | **Node.js 22+ en PATH** (no SEA; `better-sqlite3`) |
| Config | Edición manual de `.env` |
| First-run producto | **No** — runbook técnico (PHASE 39) |
| Desktop UI | **No** |
| Installer MSI/NSIS/Inno | **No** |
| Windows service | **No** |
| Smoke | `smoke:package` = handshake + tools/list + filesystem.read (CI/Linux OK) |

**Hallazgo operativo (docs vs código):**

`dist/README.txt` afirma que `AGENT_FILESYSTEM_ROOT` se reenvía al Local Node.  
En el boot Single Node por defecto, `hub/src/index.ts` llama `attachLocalAgent` **sin** `filesystemRoot`; `childEnvForLocalNode` **filtra** `AGENT_FILESYSTEM_ROOT` del entorno heredado salvo overlay explícito (`attach-agent.ts`).

→ Clasificación: **E-47-01** (deuda operacional). PHASE 48 **debe** cablear first-run → `filesystemRoot` en attach. **No se corrige en PHASE 47** (definición only).

---

## 4. Target installation experience

```text
DOWNLOAD
→ INSTALL (wizard)
→ FIRST RUN (Control Center)
→ CONFIGURE WORKSPACE (carpeta AGENT_FILESYSTEM_ROOT)
→ START AGENT (Shell inicia Gateway → Node)
→ VERIFY GATEWAY / NODE / MCP / TOOLS
→ AGENT READY
→ CONNECT ANDROID (IP + token / QR futuro)
→ USE AGENT (Chat Android)
```

Cada transición: éxito, error humano, recovery (ver §11).

---

## 5. Installer responsibilities

### Debe instalar

| Artefacto | Notas |
|-----------|-------|
| Gateway empaquetado | `hub.cjs` + launcher `hub.cmd` + migrations |
| Local Node empaquetado | `agent.cjs` + `agent.cmd` (+ `winax` en Windows) |
| Runtime Node embebido | **Node 22 LTS portable** junto a la app (usuario no instala Node a mano) |
| Native addons | `better-sqlite3` (y `winax` si Excel) precompilados para Windows x64 |
| Desktop Control Center | binario del Shell (tray + ventana) |
| Shortcuts | Start Menu: «Agente personal», «Desinstalar» |
| Estructura de datos | `%LOCALAPPDATA%\Ideass\PersonalAgent\` (config, logs, SQLite) |
| Uninstaller | Ver §14 |

### No debe instalar (MVP)

| Item | Por qué |
|------|---------|
| Android APK | Canal móvil separado (sideload / store futuro) |
| Excel / Office | Dependencia del usuario; capability `office.excel.*` documentada |
| Anthropic account | Usuario pega API key en first-run (o modo avanzado) |
| Docker / WSL | Fuera de alcance |

### Dependencias externas restantes

| Dependencia | ¿Usuario la instala? | Notas |
|-------------|----------------------|-------|
| Node.js | **No** (embebido en installer) | Ideal MVP |
| Microsoft Excel | Solo si usa Excel tools | Detectar y mostrar «Solo Windows / requiere Excel» |
| Visual C++ redistributable | Si native addons lo exigen | Incluir en installer si aplica |

---

## 6. Desktop Shell responsibilities

### Hace

1. Estado general del agente (READY / …).  
2. First-run setup.  
3. Configuración de workspace (`AGENT_FILESYSTEM_ROOT`).  
4. Observar Gateway / Node / MCP / Tools (evidencia existente + stderr / health snapshot).  
5. Facilitar conexión Android (mostrar IP LAN, puerto, token enmascarado, QR futuro).  
6. Diagnóstico y apertura de logs.  
7. Restart / stop del Gateway (proceso hijo).  
8. Configuración (sin secretos en claro).  
9. Uninstall entry / enlace.  
10. Versión del producto.

### No hace

- Chat / Conversation UI (Android).  
- Agent Runtime / LLM loop.  
- Tool execution / MCP Server.  
- ConfirmationWaiter / policy.  
- Segunda implementación de Tools.  
- User/ACL / PermissionManager.

**Regla:** Shell **observa y controla procesos**; no es un segundo Runtime.

---

## 7. First-run flow

1. Detectar instalación nueva (sin `config.json` / sin token en AppData).  
2. Generar `HUB_TOKEN` criptográficamente fuerte (mostrar una vez + copiar).  
3. Pedir / validar `ANTHROPIC_API_KEY` (o diferir con modo «solo handshake» — no MVP chat).  
4. Pedir carpeta workspace → `AGENT_FILESYSTEM_ROOT`; crear si el usuario confirma; validar R/W.  
5. Elegir puerto (default 8787) o detectar ocupado.  
6. Escribir config en AppData (no pedir editar `.env` salvo Avanzado).  
7. Arrancar Gateway con `filesystemRoot` **explícito** (cierra E-47-01).  
8. Esperar stderr `[hub] READY` + health `ok`.  
9. Verificar snapshot `agentReady` / tools list (boot).  
10. Mostrar pantalla **AGENT READY** + pasos Android.  

Migrations SQLite: las ejecuta el Gateway al boot (existente) — Shell solo espera READY o ERROR.

---

## 8. Configuration model

| Clave | Usuario | UI | Interna |
|-------|---------|-----|---------|
| `HUB_TOKEN` | identidad instalación | generar / revelar una vez / copiar; **nunca completo en logs** | sí |
| `HUB_PORT` / URL | sí | editable | — |
| `AGENT_FILESYSTEM_ROOT` | sí (workspace) | picker de carpeta | pasado a Node vía attach |
| `ANTHROPIC_API_KEY` | sí | campo password; no logs | Gateway |
| Logging level | opcional | Avanzado | Shell + Gateway stderr |
| Startup with Windows | sí | checkbox | Task Scheduler / Shell |
| LLM provider | interno MVP | Anthropic only | — |

Fronteras PHASE 33: sin User/ACL; token = instalación.

---

## 9. Agent lifecycle

| Evento | Comportamiento objetivo |
|--------|-------------------------|
| Windows inicia | Si «Start with Windows»: Shell tray o tarea inicia Gateway |
| Usuario cierra ventana Shell | **Tray permanece**; Gateway **sigue** si fue iniciado como hijo/servicio gestionado |
| Usuario «Quit Agent» | Detiene Gateway (+ Node hijo) y sale tray |
| Gateway muere | Shell → estado ERROR/DEGRADED; botón Restart |
| Node muere mid-run | Fail-closed en tools (existente); Shell no miente con READY si detecta fallo de boot; **sin nueva API liveness MVP** — restart Gateway |
| MCP fail al boot | Gateway exit 1 (existente); Shell muestra ERROR + recovery |
| Windows reinicia | Misma lógica que startup |

**Quién mantiene vivo el agente:** proceso Gateway (padre). Shell es supervisor UX, no segundo Runtime.  
**MVP:** sin Windows Service obligatorio; opcional Task Scheduler «at logon». Service = G futura.

---

## 10. Ready state

### AGENT READY (producto)

Significa:

- Gateway HTTP/WS escuchando.  
- Boot: Node spawn + MCP handshake + tools/list OK.  
- Config mínima válida (token, API key si chat, FS root recomendado/obligatorio en Shell).  
- Puede aceptar Conversation desde Android.

### Estados UI Shell

| Estado | Significado | Evidencia MVP |
|--------|-------------|-----------------|
| STARTING | Arrancando | proceso vivo, aún no READY |
| READY | Listo | stderr READY + `GET /health` ok + boot agentReady |
| DEGRADED | Parcial | p.ej. WS up pero tools fallan en turno; o Excel ausente |
| DISCONNECTED | Android no conectado | 0 sesiones WS (si observable) o «aún no emparejado» |
| ERROR | Fallo | exit ≠0, port busy, config inválida |
| STOPPED | Detenido a propósito | Shell stop |

**Sin nueva API de liveness en PHASE 47.** Usar evidencia existente (`/health` snapshot + stderr + exit code). Liveness mid-run = deuda G (PHASE 48+ opcional).

### Pantalla conceptual

```text
Agente personal
Estado: READY

Gateway     ● Running
Node        ● Running (boot OK)
MCP         ● Connected (boot OK)
Tools       ● Available (boot list)
Workspace   ● Configured
Android     ○ Not connected

[ Conectar Android ] [ Configuración ] [ Diagnóstico ] [ Logs ] [ Reiniciar ]
```

Excel: chip «Excel — requiere Windows + Excel instalado» (disponible / no detectado).

---

## 11. Recovery matrix

| Condición | Copy humano | Acción |
|-----------|-------------|--------|
| Gateway DOWN | «El agente no está en ejecución.» | Reiniciar agente |
| Node DOWN / MCP FAILED al boot | «No se pudo preparar el agente en tu PC.» | Reiniciar; ver logs; reinstall si corrupto |
| Tool init FAILED | «Algunas capacidades no cargaron.» | Diagnóstico; reiniciar |
| Invalid FS root | «La carpeta de trabajo no es accesible.» | Elegir otra carpeta |
| Port occupied | «El puerto está en uso.» | Cambiar puerto / liberar |
| Config invalid | «Falta configuración.» | Abrir first-run / config |
| Missing dependency (Node embed) | «Instalación incompleta.» | Reparar / reinstalar |
| Corrupted installation | «La instalación parece dañada.» | Reinstall (conservar datos) |
| Android disconnected | «El teléfono no está conectado.» | Conectar Android (no es ERROR de PC) |
| Excel/COM error | «No se pudo usar Excel. ¿Está instalado?» | Abrir Excel / instalar Office |

Cada fila: estado + explicación breve + recovery + logs. Evitar stack traces como UX primaria.

---

## 12. Diagnostics

| Tema | Definición MVP |
|------|----------------|
| Ubicación logs | `%LOCALAPPDATA%\Ideass\PersonalAgent\logs\` (+ stderr capturado por Shell) |
| Niveles | info / warn / error |
| Rotación | tamaño/día simple |
| Nunca loguear | `HUB_TOKEN`, API keys, Authorization, contenido sensible de tools |
| Export diagnóstico | ZIP: logs sanitizados + versión + estados (sin secretos) |
| UI | Botón «Abrir logs» / «Exportar diagnóstico» |

---

## 13. Security boundaries

**No modificar (PHASE 47/48 Shell):**

Runtime, AgentTurnInput, ToolContext, ToolRegistry, MCP, ConfirmationWaiter, toolPolicy, auth model, Conversation/Workspace schema.

**No introducir:**

User/ACL, multi-user, multi-node, A2A, PermissionManager, marketplace, registry dinámico.

Shell no es autoridad de autorización. HITL sigue en Android → Gateway.

---

## 14. Uninstall

| Qué | Comportamiento |
|-----|----------------|
| Binarios / Shell / Node embed | Eliminar |
| Shortcuts / startup entries | Eliminar |
| Config / secretos en AppData | Preguntar |
| SQLite conversaciones | **Preguntar explícitamente** — default conservar o backup |
| Workspace (`AGENT_FILESYSTEM_ROOT`) | **Nunca borrar** la carpeta del usuario |
| Logs | Preguntar / opcional |

**No borrar datos de usuario en silencio.**

---

## 15. Update boundary

| MVP | Futuro (G) |
|-----|------------|
| Mostrar versión producto / build | OTA / auto-update |
| Compatibilidad documentada en release notes | Channel updates |
| Reinstall manual | Installer update |

OTA **fuera de MVP**. Documentar versión en Shell + About.

---

## 16. Android pairing

### MVP (implementable sin protocolo nuevo)

1. Shell muestra: IP LAN detectada, puerto, URL `ws://IP:PORT`.  
2. Token: botón «Copiar token» (valor completo solo al copiar; UI enmascara).  
3. Android Connection (existente): pegar URL + token → Probar y conectar.  

### Futuro (G — no PHASE 48 obligatorio)

- QR con URL + token (puede requerir encoding cuidadoso; **no** nuevo sistema de identidad).  
- Pairing code de corta vida.  

Si QR implica frames WS nuevos → fase futura. **Modelo `HUB_TOKEN = instalación` se mantiene.**

---

## 17. Excel / Windows behavior

- Tools `office.excel.*` dependen de Windows + Excel + COM (`winax`).  
- Shell: detectar Excel si es barato (registro / ruta); si no, copy estático.  
- Android Capacidades (PHASE 41): «Solo Windows» — mantener.  
- No prometer Excel en Linux/macOS builds.

---

## 18. Field-test readiness

PHASE 47 **prepara** PHASE 48+ field test. **No declara** K/D PASS.

| Field need (44 checklist) | Cómo lo habilita este diseño |
|---------------------------|------------------------------|
| Install from scratch | Installer + first-run |
| Workspace | FS root picker + E-47-01 fix en impl |
| READY | Estados Shell |
| Android connect | Pairing MVP IP+token |
| Gateway/Node restart | Botones Shell |
| Excel | Windows build + detection copy |
| Daily K1–K7 | Mismo producto; operador ejecuta checklist |

---

## 19. Implementation phases (propuesta; no iniciar automáticamente)

| Subfase | Alcance | Productive? |
|---------|---------|-------------|
| **48A** | Fix E-47-01 (FS root → attach); config AppData path Windows; document package Windows | Sí (mínimo) |
| **48B** | Installer Inno Setup + Node portable + dist + shortcuts | Sí |
| **48C** | Desktop Shell mínimo (tray + status + start/stop + first-run + pairing copy) | Sí |
| **48D** | Recovery copy + logs dir + export diagnóstico | Sí |
| **49** | Field test Windows+Android real (protocolo 44) | No (observación) |

---

## 20. Acceptance criteria (PHASE 47)

| Criterio | Cumple |
|----------|--------|
| Target Windows UX documentado | Sí |
| Installer responsibilities | Sí |
| Desktop Shell responsibilities | Sí |
| First-run flow | Sí |
| AGENT_FILESYSTEM_ROOT UX | Sí (+ E-47-01) |
| Gateway/Node/MCP lifecycle | Sí |
| READY state | Sí |
| Recovery matrix | Sí |
| Security boundaries | Sí |
| Sin cambios Runtime/MCP/policy | Sí (NONE productive) |
| Uninstall/data | Sí |
| Android connection flow | Sí |
| Field-test mapped | Sí |
| Distinguish designed vs tested | Sí |

---

## 21. Explicit non-goals

- Implementar installer/Shell en esta fase.  
- FGS HITL Android.  
- OTA.  
- Windows Service obligatorio.  
- Chat en Desktop.  
- Nueva API liveness.  
- User/ACL / QR identity.  
- Simular field PASS.  
- Cambiar protocolo WS.

---

## 22. Risks

| Riesgo | Mitigación |
|--------|------------|
| Electron peso / AV false positive | Tray mínimo; alternativa Tauri documentada |
| better-sqlite3 / winax ABI Windows | Build nativo en CI Windows; Node embed matching |
| E-47-01 confunde first-run | Fix obligatorio en 48A antes de field |
| Usuario cierra Shell y mata Gateway | Tray + política «cerrar ventana ≠ salir» |
| API key UX fricción | First-run claro; no logs |
| Field 44–46 sigue BLOCKED hasta hardware | 47 no lo resuelve; 48D→49 sí |

---

## 23. Findings A–G

### A — Correcto / esperado

| ID | Descripción |
|----|-------------|
| A-47-01 | Arquitectura Single Node adecuada como base del Shell |
| A-47-02 | Android como chat principal es la decisión correcta de producto |
| A-47-03 | `npm run package` + smoke es base válida del payload del installer |

### B

**Ninguno** que bloquee la definición.  
(E-47-01 es deuda operacional documentada; corrección en implementación, no scope creep silencioso aquí.)

### C

**Ninguno.**

### D — UX / producto (diseño)

| ID | Descripción |
|----|-------------|
| D-47-01 | Hoy la UX es «dev + .env» — lejana del vision «instalé mi agente» |
| D-47-02 | Pairing Android manual (IP+token) es MVP aceptable; QR es mejora |

### E — Deuda técnica / operacional

| ID | Descripción |
|----|-------------|
| E-47-01 | `AGENT_FILESYSTEM_ROOT` en `.env` Hub no llega al Node en boot default |
| E-47-02 | `/health.agentReady` es snapshot de boot, no liveness |
| E-47-03 | Sin captura estructurada de logs en producto |

### F — Documentación

| ID | Descripción |
|----|-------------|
| F-47-01 | `dist/README.txt` sobre-afirma reenvío de FS root |
| F-47-02 | architecture.md descarta Electron para el Agent — no contradice Shell thin |

### G — Futuro

| ID | Descripción |
|----|-------------|
| G-47-01 | QR pairing |
| G-47-02 | OTA |
| G-47-03 | Windows Service |
| G-47-04 | Live Node health API |
| G-47-05 | Tauri si Electron footprint es problema |

---

## 24. Recommendation for PHASE 48

**PHASE 48 = Implementation of Windows Product Shell & Installer (subfases A→C),**  
seguido de field test operador (protocolo 44) — **no automático**.

Orden sugerido:

1. **48A** — Cablear FS root + rutas datos Windows (desbloquea first-run honesto).  
2. **48B** — Installer (Inno + Node portable + dist).  
3. **48C** — Desktop Shell tray (Electron mínimo o Tauri).  
4. Luego **field test** Windows+Android (cerrar 44–46).

### Technology decision (MVP)

| Capa | Elección | Por qué |
|------|----------|---------|
| Installer | **Inno Setup** (alt: NSIS) | Simple, Windows-native, sin moda |
| Runtime | **Node 22 portable embebido** | Usuario no instala Node |
| Control Center | **Electron tray mínimo** | Mismo stack TS; velocidad MVP; Shell ≠ Runtime |
| Alternativa | Tauri | Si footprint/AV lo exigen después |
| Agent process | `hub.cmd` existente | No duplicar Gateway |

Prioridades respetadas: instalación sencilla → estabilidad → consumo aceptable → procesos Windows → logs → startup → mantenimiento.

---

## Architecture Changes

```text
NONE — definition / documentation only
```
