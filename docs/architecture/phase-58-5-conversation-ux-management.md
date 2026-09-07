# PHASE 58.5 — Conversation UX: pin, delete, sidebar management

**Status:** PARTIAL  
**Fecha:** 2026-09-07

## Objetivo

Gestión humana de conversaciones en la Agent Console web: fijar / desfijar,
eliminar con confirmación, sidebar legible, y burbujas de mensaje más
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
| `ConversationSidebarList` | lista única (sin secciones Fijadas/Conversaciones); `IconPin` a la izquierda; menú ⋯ con pin/trash + texto |
| `ConversationThreadScreen` | sin label «Personal Agent» / cap-chip; composer hero pill (`is-compact` / `is-tall`) |
| CSS | `.msg.user` radio 22px; `.msg p` 16px; blank `translateY(-8%)`; hero shell sin borde, radius 28; `.conv-pin-slot` 16px |

Al eliminar la conversación activa: limpia mensajes, `active=null`, nav
`conversation` (blank New Chat).

## Refine visual (58.5)

- Sidebar: una sola `<ul class="conv-list">`; pin monocromo en slot fijo; sin
  `.conv-section` / labels de sección.
- Composer New Chat: pill (border 0, radius ≥ 28); compact centra send;
  tall reduce radius a 22.
- Thread blank: centrado con `translateY` (sin `vh` / `bottom: 0`).
- Sin etiqueta de agente en el hilo.

## Tests

- `gateway/tests/memory/conversation-pin-delete.test.ts`
- `gateway/tests/http/workspace-http.test.ts` (bloque PHASE 58.5)
- `web/tests/conversation-sidebar.test.ts`
- `web/tests/phase58-5-ux.test.ts`

## Validación pendiente

Status **PARTIAL** hasta E2E manual: fijar → reorder sidebar → eliminar activa → blank.
