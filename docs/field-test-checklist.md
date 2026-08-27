# Field Test Checklist — Operador

Checklist para ejecutar PHASE 44 en **PC Windows + Android físico**.  
No registrar secretos (HUB_TOKEN, API keys, rutas personales sensibles).

## Preflight

- [ ] Windows PC con Node 22+
- [ ] `hub/.env` configurado (`ANTHROPIC_API_KEY`, `HUB_TOKEN`, `AGENT_FILESYSTEM_ROOT`)
- [ ] Gateway arrancado (`npm run dev` o `dist/hub/hub`)
- [ ] stderr muestra `[hub] READY`
- [ ] `node scripts/field-test-preflight.mjs` → OK (desde repo en PC o Linux dev)
- [ ] Android app 0.1.0 instalada (`assembleDebug` o release)
- [ ] Teléfono y PC en misma red; firewall permite puerto Hub
- [ ] Connection Hub configurado; header «Agente listo»

Registrar: Windows build, modelo Android, versión Android, app 0.1.0.

---

## K1 — Conversación básica

- [ ] Nueva Conversation
- [ ] 3+ mensajes ida/vuelta
- [ ] Streaming visible
- [ ] History coherente tras cambiar de pantalla
- [ ] Segunda Conversation sin mezcla

**Resultado:** PASS | FAIL | PARTIAL

**Notas:**

---

## K2 — Leer archivos

Prompts sugeridos:

- «Lista los archivos en [carpeta bajo AGENT_FILESYSTEM_ROOT]»
- «Lee [archivo conocido] y resume su contenido»

- [ ] Tool list/read correcta
- [ ] Resultado comprensible
- [ ] Sin paths/secrets innecesarios en UI
- [ ] Persiste en history

**Resultado:**

**Notas:**

---

## K3 — Escribir archivo

- [ ] Solicitar crear/modificar archivo de prueba
- [ ] HITL aparece; label humano; datos sanitizados; countdown
- [ ] **Aprobar** → archivo cambia en disco; resultado en hilo
- [ ] Repetir → **Rechazar** → archivo NO cambia; hilo coherente

**Resultado:**

**Notas:**

---

## K4 — Ejecutar comando

Comando inocuo (ej. info sistema).

- [ ] HITL
- [ ] Approve → stdout legible
- [ ] Reject → 0 ejecución

**Resultado:**

**Notas:**

---

## D1 — Leer Excel (Windows obligatorio)

- [ ] Archivo `.xlsx` de prueba bajo FS root
- [ ] Leer hojas / datos / resumen
- [ ] Copy Windows visible si aplica
- [ ] Archivo no corrupto

**Resultado:**

**Notas:**

---

## D2 — Modificar Excel

- [ ] Modificación controlada (celda/hoja)
- [ ] HITL → approve → cambio real
- [ ] Reject → archivo intacto

**Resultado:**

**Notas:**

---

## K5 — Conversation isolation

- [ ] Conversation A: operación larga
- [ ] Cambiar a B durante ejecución
- [ ] Chunks/errores/done solo en A

**Resultado:**

**Notas:**

---

## K6 — Reconnect

- [ ] Operación en curso
- [ ] Desconectar Android (Wi‑Fi/avión)
- [ ] Reconectar
- [ ] History sin duplicados; misma Conversation

**Gateway SQLite vs Android UI — diferencias:**

---

## K7 — Android restart

- [ ] Conversation activa con mensajes
- [ ] Force-stop app
- [ ] Reabrir → Hub → history OK
- [ ] Sin confirm pending (segundo pase)

**Resultado:**

**Notas:**

---

## HITL Background

- [ ] Solicitar acción con confirm
- [ ] Salir de Chat → Settings
- [ ] Bloquear pantalla (opcional)
- [ ] Observar: ¿usuario sabe? ¿puede aprobar?

**Clasificación:** ACCEPTABLE | FRICCIÓN | BLOCKER

**Notas:**

---

## Node failure

- [ ] Operación en curso
- [ ] Detener Node (o kill agent process)
- [ ] UX Android + Gateway
- [ ] Reiniciar Gateway/Node
- [ ] Continuar Conversation

**Resultado:**

---

## Gateway restart

- [ ] Varios mensajes persistidos
- [ ] Detener Gateway
- [ ] Reiniciar
- [ ] Android reconecta; history OK

**Resultado:**

---

## Daily Agent Scenario (sesión completa)

Simular un día: preguntar → leer → escribir → comando → Excel → reject/approve → cambiar Conversation → disconnect/reconnect.

> ¿Se siente como agente personal o como demos técnicas?

**Respuesta:**

---

## Clasificación de hallazgos

Por cada problema: **A | B | C | D | E | F | G**

| ID | Clase | Descripción | Evidencia |
|----|-------|-------------|-----------|
| | | | |

---

## Cierre

- [ ] Matriz completa
- [ ] Sin secretos en evidencia
- [ ] Actualizar `docs/architecture/phase44-field-test-protocol.md` con resultados reales
- [ ] Decision final: PASS | READY WITH DEBT | BLOCKED
