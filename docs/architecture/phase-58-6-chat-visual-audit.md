# PHASE 58.6 — Chat visual audit (scroll + tipografía)

**Status:** PARTIAL  
**Fecha:** 2026-09-07

## Root cause

`.thread` tenía `width: min(760px, …)` **y** `overflow-y: auto`. La barra de
scroll quedaba pegada al borde de la columna de mensajes, no al borde derecho
del work-area.

## Fix

| Pieza | Cambio |
|-------|--------|
| `.thread` | Ancho 100% (full-bleed); es el único scroll vertical del hilo |
| `.thread-inner` | `width: min(760px, calc(100% - 48px))` centra el contenido |
| `.work-area:has(> .conversation-screen)` | `overflow: hidden` (sin doble scroll) |
| `.conversation-screen` | `overflow: hidden`; padding 0 |
| `.blank-state` | Grid `1fr / auto / 1.35fr` (sin `vh` / `translateY`) |
| Composer | Pill sin borde, radius 30; textarea min 28 / max 240; shell min 56 |

## Tipografía

Gemini usa **Google Sans Text**; equivalente de producto: **Roboto**
(`--font-chat` / `--font-ui` en `tokens.css` + carga en `web/index.html`).

## Bubble usuario

`--user-bubble` / `--user-bubble-ink`; `.msg.user` radius ≥ 24.

## Tests

- `web/tests/phase58-6-scroll-audit.test.ts`
- `web/tests/composer-multiline.test.ts` (MIN=28)
- Ajustes en `composer-blank-layout` / `phase58-5-ux` si rompen contratos

## Validación pendiente

Status **PARTIAL** hasta inspección visual manual:

1. Scrollbar del hilo en el borde derecho del work-area (no junto a 760px).
2. Blank New Chat centrado upper-middle sin saltos por `vh`.
3. Tipografía chat legible ~16px Roboto; bubble usuario azul sobrio.
4. Composer pill compacto (~56px) y crecimiento hasta 240px.
