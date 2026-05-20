# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

There may be other agents working in this file, do not make changes or fixes to files that you are not working on. There may be linter errors unrelated to your work, but do not fix those.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build
npm run generate:schema  # Regenerate Zod schemas from database
```

There are no automated tests in this project.

## Environment Variables

Create `.env.local` with these variables:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_MODAL_BUDGET_ENDPOINT_URL=...   # Modal serverless endpoint with budget tracking
```

## Architecture

This is a React + Vite SPA (no backend — all server logic runs on Modal serverless functions and Supabase).

### Application Layout

The app renders a split-pane layout:
- **Left panel** — `SPIKEEditor`: Python code editor (CodeMirror) + xterm.js terminal for a connected MicroPython device
- **Right panel** — `ChatPanel`: AI chat assistant

Both panels are wrapped in `AuthProvider` and `SessionProvider` context providers (see `src/contexts/`).

### Routing

Three routes in `App.jsx`:
- `/` — Main editor + chat UI (`AppContent`)
- `/data` — `DataExtractor` admin tool for exporting session data
- `/usage` — `AdminUsageDashboard` for monitoring AI usage

### Session & Data Model

Sessions are the top-level unit. Each session has:
- A **hardware_platform** (`lilybot` or `microbit`) chosen at creation — determines connection type, stop code, and AI priming
- Multiple **conversations** (chat tabs) — one is "current"
- Multiple **code records** (code tabs) — one is "current"
- **Code snapshots** logged automatically at key events (`run_device`, `manual_save`, `ai_replace`, `chat_context`)
- **Console logs** and **interactions** (button clicks) also persisted to Supabase

All database schemas are defined as Zod schemas in `src/services/dbSchemas.js`. Supabase table names are in the `TABLES` constant there. Always validate inserts through these schemas.

`SessionContext` (`src/contexts/SessionContext.jsx`) manages all session state and exposes functions for switching sessions/conversations/code tabs, creating new ones (`createSessionWithPlatform`), back-filling platform on legacy rows (`assignPlatformToSession`), debounced live code saving (1s), and snapshot creation. Legacy sessions without `hardware_platform` are surfaced via `pendingPlatformSession` so the UI can force a platform pick before activating.

### Platform Abstraction

Hardware platforms are registered in `src/platforms/index.js` and each lives in its own folder (`src/platforms/<id>/`) exposing `{ id, label, connectionType, buildPriming(hardwareConfig), stopCode }`:
- `lilybot` → connectionType `pico`, dynamic priming built from the user's `hardwarePromptConfig`
- `microbit` → connectionType `microbit`, static priming

`SessionContext` derives `activePlatform` from the active session and exposes the resolved system prompt via `buildPriming(hardwarePromptConfig)`. `SPIKEEditor` uses `activePlatform.connectionType` to pick the serial driver and runs `activePlatform.stopCode` after connect/before run to halt motors. When adding a new platform, drop a folder under `src/platforms/`, export the platform object, and register it in `src/platforms/index.js`.

### Hardware Connection (SPIKEEditor)

`SPIKEEditor` connects to MicroPython hardware via WebSerial:
- `src/utils/microRepl.js` — `Board` class wrapping `@microbit/microbit-connection` + xterm.js terminal
- Supports **Raspberry Pi Pico W** (`pico`) and **micro:bit v2** (`microbit`)
- micro:bit flow: first connect attempt detects missing MicroPython → arms installer → second click flashes bundled `.hex` firmware from `src/assets/firmware/` then connects via serial (`src/utils/microbitInstall.js`)
- On connect, runs the active platform's `stopCode` to halt any running motors

### Per-User Hardware Configuration (LilyBot)

LilyBot priming is parameterized by the user's wiring. `src/services/hardwareConfig.js` loads:
- Available MPUs and components from Supabase `app_config` (keys: `LILYBOT_MPUS`, `LILYBOT_COMPONENTS`, `LILYBOT_HARDWARE_TEMPLATES`)
- Part metadata from `src/assets/fritzing/catalog.js` with Fritzing `.fzpz` files under `src/assets/fritzing/<folder>/`
- The user's selected MPU + pin-to-component mappings from auth user metadata (`lilybot_hardware_config`)

`toPromptHardwareConfig(...)` converts this into the structure consumed by `buildLilyBotPriming`. `HardwareConfigModal` is the UI for editing this; `MpuPinDiagram` / `ComponentPinDiagram` render the pinouts via parsed Fritzing data (`src/utils/fritzing.js`, `src/utils/pinDiagram.js`).

### AI Chat

`ChatPanel` streams responses from a Modal serverless endpoint via SSE. The streaming utility is in `src/utils/chatStream.js`. The primary function used is `streamChatCompletionWithBudget`, which sends the Supabase auth token and user ID to the backend for budget enforcement.

Available AI models are fetched at runtime from the Supabase `ai_models` table (not from env vars) via `src/services/aiModels.js`. The `ai_models` table columns: `model_name`, `provider`, `streamable`, `unlimited`, `default`.

The system prompt comes from `activePlatform.buildPriming(hardwarePromptConfig)`. Coding level prompts (beginner/intermediate/experienced) are in `src/prompts/codingLevels.js`.

### Modal Backend (`modal_functions/`)

The Python serverless code that backs the chat endpoint lives in this repo under `modal_functions/`. Deploy with `modal deploy modal_functions/<file>.py` (see `modal_functions/README.md`). `chat_with_budget.py` is the primary endpoint used by `streamChatCompletionWithBudget`; `budget_manager.py` enforces per-user daily budgets against Supabase. `modal_functions/db_schemas.json` is a JSON mirror of the Zod schemas — regenerate it together with the frontend schemas via `npm run generate:schema` when the DB shape changes.

### Key Service Files

- `src/services/supabase.js` — Supabase client (singleton)
- `src/services/sessionManager.js` — CRUD for sessions, conversations, code records (incl. `hardware_platform` field)
- `src/services/dataLogger.js` — logging messages, console output, interactions
- `src/services/hardwareConfig.js` — LilyBot wiring catalog + per-user config
- `src/services/aiUsage.js` — fetching daily budget usage per user
- `src/services/adminUsage.js` — aggregate usage data for admin dashboard
- `src/config/models.js` — static model-to-provider mapping (legacy, superseded by `ai_models` DB table)

### Styling

Plain CSS files co-located with components. Tailwind CSS v4 is also configured (via `@tailwindcss/vite`) but used sparingly.
