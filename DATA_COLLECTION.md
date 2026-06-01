# Data Collection Reference

This document describes every piece of data the Purdue AI Editor persists to Supabase, when each row is written, and what gets included in the admin data export at `/data`.

All tables live in the `public` schema and have row-level security (RLS) enabled. Regular users can only read/write their own rows; admins have read access across all users for the auditing tables.

## Tables at a glance

| Table | Written by | Exported by `/data` | Purpose |
|---|---|---|---|
| `user_profiles` | `AuthContext` first-login upsert | ✅ | Email + roster info per authenticated user |
| `ai_models` | Operator-managed (no app writes) | ❌ | Catalog of selectable chat models and pricing |
| `ai_usage` | Modal backend (`budget_manager.py`) | ❌ | Per-inference token + cost accounting |
| `sessions` | `sessionManager.createNewSession` | ✅ | Top-level work container, one per user "project" |
| `conversations` | `sessionManager.createConversation` | ✅ | Chat tab inside a session |
| `messages` | `dataLogger.logMessage` | ✅ | Every user/assistant/system chat message |
| `code` | `sessionManager.createCode` / live autosave | ✅ | Current contents of each code tab |
| `code_snapshots` | `sessionManager.createCodeSnapshot` | ✅ | Append-only history of code contents |
| `console` | `dataLogger.logConsole` | ✅ | Terminal output captures |
| `interactions` | `dataLogger.logInteraction` | ✅ | Toolbar/button click events |

`code` holds the *current* contents of each tab (mutated in place by live edits); `code_snapshots` is the append-only history. Both are included in the export so you can pull either the latest state of a tab or its full editing history.

---

## `user_profiles`

One row per authenticated user, keyed by `auth.users.id`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK to `auth.users.id` |
| `email` | text, unique | Pulled from the auth provider on first login |
| `students` | text | Optional roster string; the only column users can `UPDATE` themselves |
| `created_at` | timestamptz | Set on insert |
| `updated_at` | timestamptz | Auto-bumped by `trg_touch_user_profiles_updated_at` |

**Write path:** Upserted by `AuthContext` after a successful sign-in via `userProfileUpsertSchema`.

---

## `ai_models`

Static catalog of chat models. Operator-managed (no in-app writes). `ChatPanel` reads this at runtime via `src/services/aiModels.js`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `model_name` | text | e.g. `gpt-4o-mini` |
| `provider` | text | e.g. `openai`, `anthropic` (default `openai`) |
| `input_price` | real | USD per 1M input tokens |
| `cached_input_price` | real | USD per 1M cached input tokens |
| `output_price` | real | USD per 1M output tokens |
| `unlimited` | bool | If true, no daily budget cap applies |
| `streamable` | bool | If true, served via SSE |
| `default` | bool | One row should be marked as the default selection |

Readable by all authenticated users (used to populate the model picker).

---

## `ai_usage`

Inserted by the Modal backend after each chat inference for budget accounting.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK to `auth.users.id` |
| `timestamp` | timestamptz | Default `now()` |
| `model` | text | Model name actually used for the call |
| `input_tokens` | int | Uncached input tokens |
| `output_tokens` | int | Generated tokens |
| `cached_input_tokens` | int | Prompt cache hits |
| `reasoning_tokens` | int | Reasoning model thinking tokens (when applicable) |
| `cost_usd` | numeric(10,6) | Cost in USD, computed from `ai_models` prices |
| `created_at` | timestamptz | |

**Write path:** `modal_functions/budget_manager.py` `log_usage()`, called by `chat_with_budget.py` once a streamed response finishes. The frontend never writes to this table — only the Modal `service_role` key may insert.

**Read path:** Users can read their own rows (`src/services/aiUsage.js` for daily-budget display); admins can read all rows (`src/services/adminUsage.js` for the `/usage` dashboard).

---

## `sessions`

Top-level work container. One session bundles a hardware platform choice, multiple chat conversations, and multiple code tabs.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | Owner |
| `name` | text | Defaults to `Unnamed Session`; user-editable |
| `hardware_platform` | text | `lilybot` or `microbit`; chosen at creation. Legacy rows may be NULL and are surfaced as `pendingPlatformSession` until the user picks one |
| `start_time` | timestamptz | Set on insert |
| `last_updated` | timestamptz | Bumped on any meaningful session activity (code save, console write, etc.) |
| `loaded_timestamps` | timestamptz[] | Appended each time the session is loaded into the editor (`dataLogger.updateSessionOnLoad`) |
| `current_code_id` | bigint | FK → `code.id`, the currently active code tab |
| `current_console_id` | bigint | FK → `console.id`, the latest console capture |
| `current_conversation_id` | bigint | FK → `conversations.id`, the currently active chat tab |

**Write path:** Created by `sessionManager.createNewSession` (which also creates the first conversation, code tab, and console row). Pointers and `last_updated` are mutated by `dataLogger` and `sessionManager` as the user works.

---

## `conversations`

One row per chat tab inside a session.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `name` | text | Defaults to `Unnamed Chat`; user-editable |
| `start_time` | timestamptz | Set on insert |
| `last_updated` | timestamptz | Bumped on each new message |

**Write path:** `sessionManager.createConversation`. The first conversation (`Chat 1`) is created alongside the session.

---

## `messages`

Every message in every conversation — user prompts, assistant replies, and system primings.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | Owner of the conversation |
| `conversation_id` | bigint | FK → `conversations.id` |
| `role` | text | One of `system`, `user`, `assistant` |
| `content` | text | Full message text |
| `coding_level` | text | `beginner` / `intermediate` / `experienced` at send time |
| `ai_model` | text | Model selected when the message was sent |
| `prompt_tokens` | int | Set on assistant messages from the streaming response |
| `completion_tokens` | int | Set on assistant messages from the streaming response |
| `code_context_id` | bigint | FK → `code.id` snapshot the user attached as context |
| `console_context_id` | bigint | FK → `console.id` snapshot the user attached as context |
| `timestamp` | timestamptz | |

**Write path:** `dataLogger.logMessage`, called from `ChatPanel` for each role.

---

## `code`

The live, in-place contents of each code tab. **Not** an append-only log — rows here are updated by autosave as the user types.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `name` | text | Tab name; defaults to `Code Tab`; user-editable |
| `content` | text | Current code contents |
| `save_source` | text | Most recent reason the row was written/updated |
| `timestamp` | timestamptz | Last write time |

This table tracks current state rather than history; it **is** included in the data export as `Code` so you can pull the latest contents of each tab. `code_snapshots` remains the append-only auditable record of every change.

---

## `code_snapshots`

Append-only history of code edits and significant events. Every meaningful change in `code` also writes a snapshot here so the full editing history is preserved.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `code_id` | bigint | FK → `code.id` the snapshot belongs to |
| `session_id` | bigint | FK → `sessions.id` (denormalized for easy filtering) |
| `content` | text | Snapshot of code at that moment |
| `save_source` | text | Why the snapshot was taken (see below) |
| `timestamp` | timestamptz | |

### `save_source` values

| Value | Where it's emitted | Meaning |
|---|---|---|
| `init` | `sessionManager.createNewSession` | First code row created with the session |
| `tab_create` | `sessionManager.createCode` | User opened a new code tab |
| `live_edit` | Debounced autosave (1s) in `SessionContext` | User typed and the editor flushed |
| `manual_save` | `App.jsx` Save button | User explicitly hit Save |
| `chat_context` | `ChatPanel` when attaching code to a prompt | Snapshot taken so the message context is reproducible |
| `ai_replace` | `App.jsx` when AI replaces code | Captures the state right after an AI-generated replacement |
| `run_device` | `SPIKEEditor` Run button | Code as it was when sent to the hardware |
| `save_to_main_py` | `SPIKEEditor` (Pico) | Saved code as `main.py` on the device |
| `download_to_microbit` | `SPIKEEditor` (micro:bit) | Flashed code to the micro:bit |

> Indexes `idx_code_snapshots_code_id`, `idx_code_snapshots_session_id`, and `idx_code_snapshots_timestamp` exist to make history lookups cheap.

---

## `console`

Captures of the xterm.js terminal output.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `content` | text | Terminal contents at capture time |
| `save_source` | text | Why the capture was taken (see below) |
| `timestamp` | timestamptz | |

### `save_source` values

| Value | Where it's emitted | Meaning |
|---|---|---|
| `init` | `sessionManager.createNewSession` | Empty console row created with the session |
| `manual_save` | `App.jsx` Save button | User explicitly hit Save |
| `chat_context` | `ChatPanel` when attaching console output to a prompt | Capture so the prompt context is reproducible |
| `clear_console` | `SPIKEEditor` Clear Console button | Captures the buffer right before clearing |

Non-`chat_context` writes also update the parent session's `current_console_id` and `last_updated`.

---

## `interactions`

Toolbar/button click events. Pure analytics — no payload beyond which button was pressed.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `button_name` | text | See enumeration below |
| `timestamp` | timestamptz | |

### `button_name` values logged from `SPIKEEditor`

| Value | Trigger |
|---|---|
| `connect_<board>` | Connect button, where `<board>` is the target board id (`pico`, `microbit`) |
| `disconnect` | Disconnect button |
| `run_device` | Run on device |
| `send_ctrl_c` | Ctrl-C interrupt |
| `reset_device` | Soft reset |
| `clear_console` | Clear console |
| `save_to_main_py` | Save as `main.py` on Pico |
| `download_to_microbit` | Flash code to micro:bit |

---

## The data export at `/data`

The admin-only `DataExtractor` page (`src/components/data_extractor/DataExtractor.jsx`) bundles the eight exported tables above (`messages`, `sessions`, `console`, `code`, `code_snapshots`, `interactions`, `conversations`, `user_profiles`) into per-table CSVs zipped together as `data_export_<YYYY-MM-DD>.zip`. Each table is also exportable on its own via the per-table sections below the "Export Everything" button.

### Filters

Both filters apply to **every** table in the export and are combined with AND:

- **Time range** — `Start Time` and `End Time` (datetime-local). Applied against the table's natural time column:
  - `sessions`, `conversations` → `start_time`
  - `user_profiles` → `created_at`
  - all others (incl. `code`) → `timestamp`

  **Exception:** the structural/container tables `sessions`, `code`, `conversations`, and `user_profiles` are **exempt from the time range** — they are always exported in full so that rows created before the start time (but still referenced by the time-filtered tables) are present. They remain subject to the email filter. The exempt set lives in `TIME_RANGE_EXEMPT_TABLES` in `src/services/dataExport.js`.
- **Emails** — comma- or newline-separated list. Resolved to `user_id`s via `user_profiles.email`, then filtered with `.in('user_id', …)`. Empty means "all users". If the email list resolves to zero users, the export for that table is empty (rather than unfiltered).

### Per-table column selection

`DataExtractor` lets you toggle which columns ship in each per-table CSV. The defaults (columns marked `default: true` in the file) are tuned for readability — IDs and FKs are off by default, content/timestamps/names are on. The "Export Everything" button uses every column declared for each table regardless of the per-table toggles.

### Mechanics

`src/services/dataExport.js`:
- `fetchAllRowsForExport` pages through the table 1000 rows at a time, ordered by the time column ascending.
- `convertRowsToCsv` CSV-encodes each value (quoted, internal `"` doubled; objects are `JSON.stringify`d).
- `exportAllTablesAsZip` calls the fetcher for each table, builds CSV blobs in memory with `JSZip`, and triggers a browser download.

### What is **not** in the export

- `ai_models` (operator-managed catalog)
- `ai_usage` (surfaced separately via the `/usage` admin dashboard)
- Anything in `auth.users` beyond what's already mirrored into `user_profiles`
