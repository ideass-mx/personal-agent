# PHASE 58.5 — Conversation UX: pin, delete, sidebar management

**Status:** PARTIAL  
**Fecha:** 2026-09-07

## Objetivo

Gestión humana de conversaciones en la Agent Console web: fijar / desfijar,
eliminar con confirmación, sidebar por secciones, y burbujas de mensaje más
legibles — sobre APIs Gateway ya expuestas.

## Gateway (ya implementado)

- Migración `db/migrations/014_conversation_pinned.sql` (`pinned INTEGER NOT NULL DEFAULT 0`).
- `setConversationPinned`, `deleteConversation`, `compareConversationsForSidebar`.
- Lista reciente / por workspace: orden **pinned DESC**, luego actividad.
- HTTP: `PATCH /conversations/:id` `{ pinned: boolean }` · `DELETE /conversations/:id`
  (borra mensajes + fila; auth Bearer).

## Web

| Pieza | Cambio |
|-------|--------|
| `ConversationMeta.pinned?` | default `false` si falta en JSON |
| `patchConversationPinned` / `deleteConversation` | cliente HTTP |
| `compareConversationsForSidebar` | fijadas primero, luego `updatedAt\|\|createdAt` |
| `AppContext` | `setConversationPinned`, `removeConversation` (optimista; fallo → refresh) |
| `ConversationSidebarList` | secciones Fijadas / Conversaciones, menú ⋯, confirm pequeño |
| CSS | `.msg.user` radio 22px; `.msg.agent` abierto; sidebar menu/confirm |

Al eliminar la conversación activa: limpia mensajes, `active=null`, nav
`conversation` (blank New Chat).

## Tests

- `gateway/tests/memory/conversation-pin-delete.test.ts`
- `gateway/tests/http/workspace-http.test.ts` (bloque PHASE 58.5)
- `web/tests/conversation-sidebar.test.ts`
- `web/tests/phase58-5-ux.test.ts`

## Validación pendiente

Status **PARTIAL** hasta E2E manual: fijar → reorder sidebar → eliminar activa → blank.
