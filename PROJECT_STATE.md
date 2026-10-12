# PROJECT_STATE.md

## Current Goal
Feature Complete: UI Ergonomic Scaling, Pre-Flight Cost Estimator, Row 1 Prompt Preview, System Prompt & Structured Output, Webhook Notifications, Failed Row Retry, and Markdown Report Export fully implemented and verified.

---

## Architecture Decision Record (ADR)
- **ADR-001: OpenRouter Batch Submission**: Use OpenRouter's native **Inline JSON Array** method (`POST /api/v1/batches`) with `/v1/chat/completions` endpoint rather than OpenAI legacy file-upload, as specified by OpenRouter architecture.
- **ADR-002: Background Poller**: Use `apscheduler` (`AsyncIOScheduler`) embedded within the FastAPI application lifecycle instead of an external worker (Celery/Redis) to keep self-hosted container deployment minimal and zero-dependency for TrueNAS Scale.
- **ADR-003: Database & Concurrency**: Use SQLite (`aiosqlite` and Python `sqlite3`) with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) enabled, stored in `/app/data/somnia.db` for persistence across container updates.
- **ADR-004: State Management for Batches**: Track `is_unread` boolean flag in SQLite. New completed batches set `is_unread = 1` triggering a pulsing teal dot in the UI until explicitly read (`POST /api/batches/{id}/read`).
- **ADR-005: Permissions & User IDs**: Support standard PUID/PGID (1000:1000) for TrueNAS dataset compatibility and non-root execution.
- **ADR-006: Batch Model Filtering & Custom Slugs**: Filter for batch-verified models by default with "50% Off / Batch Ready" badges to prevent 400 validation errors, and provide a custom model input toggle for newly released models without supporting full-price real-time execution.
- **ADR-007: UI Ergonomics & Responsive Sizing**: Scale modal dialogs (`max-w-4xl` / `max-w-5xl`) for comfortable high-resolution and laptop reading, expand model dropdown to `max-h-[440px]` with larger font scales and provider grouping (OpenAI, Anthropic, DeepSeek, Google, Meta, etc.).
- **ADR-008: Pre-flight Budget & Token Estimation**: Calculate estimated tokens from template + CSV text and multiply by OpenRouter prompt/completion pricing with 50% batch discount to show immediate cost estimations before submission.
- **ADR-009: Homelab Webhook Notifications & Resilience**: Support configurable webhook notifications (Discord, NTFY, Gotify) upon batch completion/failure, and support 1-click retry for failed batch items into a new batch.
- **ADR-010: OpenRouter :batch Tag Enforcement & Model Catalog Validation**: OpenRouter strictly routes batch requests only to models with a `:batch` endpoint (76 models in catalog), with 50% discount already built into their `:batch` pricing. Enforce `:batch` slugs in backend validation, auto-append `:batch` when a valid counterpart exists, block non-batch models with descriptive errors, fix pre-flight cost estimator double-discounting, and provide inline `:batch` assistance in custom slug input.
- **ADR-011: Markdown & KaTeX Formatted vs Raw Response Toggle**: Provide a dual-mode viewer for generated outputs in BatchDetailView with global and per-item toggles between formatted Markdown (with GFM tables, code blocks with copy, and KaTeX LaTeX math equation rendering) and raw pre-formatted text.
- **ADR-012: Collapsible Slim Sidebar & Drag-to-Resize Width**: Implement a Gemini-style collapsible sidebar that shrinks to a slim icon rail (64px) with quick-access buttons and badges, alongside a draggable resize divider allowing users to smoothly adjust sidebar width between 240px and 500px, persisting state in localStorage.
- **ADR-013: Batch Item Navigator (Tabbed/Focused & Dropdown View)**: Replace mandatory vertical scrolling in BatchDetailView with a dual-mode row navigation system: a **Focused Item View** featuring a scrollable horizontal tab bar, row-picker jump dropdown, and Prev/Next keyboard/button controls to view individual task responses without scroll fatigue, accompanied by an **All Rows (Feed)** view toggle.
- **ADR-014: Persistent Batch Spend & Per-Task Cost Accounting**: Track exact token and cost accounting from OpenRouter `usage` (or compute fallback from model pricing) across database, API, and UI. Display persistent batch-level spend in the top header and a dedicated 5-card Stats Summary Bar, and display per-task cost pills in task headers, response bars, quick-jump dropdown options, and feed rows without invading existing layout elements.

---

## Task List

### Feature: Persistent Batch Spend & Per-Task Cost Accounting
- [x] Backend: Add `total_cost`, `total_tokens`, `total_prompt_tokens`, `total_completion_tokens`, `estimated_cost` to models and migrations in `database.py`
- [x] Backend: Extract item usage/cost in `poller.py` and aggregate batch-level totals upon completion
- [x] Backend: Add usage resolution and model pricing fallbacks in `database.py` and API routers
- [x] Frontend: Add `formatCost` and `formatTokens` utility functions in `utils.ts`
- [x] Frontend: Add persistent top header cost badge and 5-card Stats Summary Bar card in `BatchDetailView.tsx`
- [x] Frontend: Add per-task cost pills to focused task header, response subtitle, quick-jump dropdown, and feed view
- [x] Frontend: Show batch cost in sidebar archive items in `Sidebar.tsx`
- [x] Verify: Run backend test suite, build frontend, and verify with browser agent (0 errors)

### Feature: Tabbed & Dropdown Batch Item Navigator
- [x] Frontend: Add layout mode state (`'focused'` | `'feed'`) with persistence in `BatchDetailView.tsx`
- [x] Frontend: Implement horizontal scrollable row tabs bar with status badges (✓ / ✗ / ⏳) and active highlighting
- [x] Frontend: Implement quick-jump dropdown selector with row preview and Prev/Next (`←` / `→`) navigation controls
- [x] Frontend: Build focused single-item card layout maximizing vertical viewport space for rendered response
- [x] Frontend: Retain 'All Rows (Feed)' toggle for bulk scanning and global search
- [x] Verify: Build frontend, test with browser agent, verify navigation between tasks, and check console stability


### Feature: Markdown Formatting & Collapsible Resizable Sidebar
- [x] Frontend: Install and configure `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, and `katex`
- [x] Frontend: Implement `MarkdownRenderer` component supporting GitHub Flavored Markdown, code blocks with copy, and LaTeX math equations
- [x] Frontend: Add Raw vs Formatted toggle (both global toolbar switch and per-row card toggle) in `BatchDetailView.tsx`
- [x] Frontend: Implement draggable resize handle in `Sidebar.tsx` / `App.tsx` with min/max bounds and localStorage persistence
- [x] Frontend: Implement Gemini-style collapsible slim sidebar rail with icon-only state, tooltips, and expand/collapse button
- [x] Verify: Build frontend, test with browser agent, and verify responsive behavior and KaTeX equation rendering



### Feature: OpenRouter :batch Tag Adaptation & Validation
- [x] Backend: Refactor `models.py` (`check_is_batch_ready`, real `:batch` `FALLBACK_MODELS`, batch model registry)
- [x] Backend: Update `batch_service.py` to auto-normalize `<model>:batch` and reject models lacking `:batch` endpoints before submission
- [x] Backend: Improve OpenRouter client error handling for 400 `:batch` rejection responses
- [x] Backend: Add tests for `:batch` validation and auto-normalization
- [x] Frontend: Fix pre-flight cost estimator double-discount calculation in `NewBatchModal.tsx`
- [x] Frontend: Default to `:batch` model, display `:batch` badges, warn and disable submit on non-batch models
- [x] Frontend: Add `:batch` helper toggle / suggestion in custom model slug input
- [x] Verify: Build frontend, run pytest, and verify with browser agent


### Feature: Ergonomic Scaling & Power Features
- [x] Backend: Add `system_prompt`, `response_format_json` to batch models, SQLite migrations, and batch submission
- [x] Backend: Add `webhook_url` support to settings and poller notification dispatcher
- [x] Backend: Add `POST /api/batches/{id}/retry-failed` endpoint for retrying errored rows
- [x] Backend: Add Markdown (.md) report export in `GET /api/batches/{id}/export?format=markdown`
- [x] Frontend: Update `api.ts` with new payload fields, webhook settings, retry API, and markdown export
- [x] Frontend: Expand `NewBatchModal` width (`max-w-4xl`), implement provider-grouped model combobox with larger typography
- [x] Frontend: Add Pre-Flight Token & Cost Estimator widget in `NewBatchModal`
- [x] Frontend: Add "Preview Row 1 Prompt" inspection widget in `NewBatchModal`
- [x] Frontend: Add System Prompt textarea and JSON Mode switch in Advanced Controls
- [x] Frontend: Expand `SettingsModal` (`max-w-lg`) and add Webhook URL configuration with Test button
- [x] Frontend: Add "Retry Failed Rows" and "Export Markdown (.md)" to `BatchDetailView`
- [x] Verify: Build frontend, run all backend tests, and ensure end-to-end functionality

### Phase 1: Foundation (Backend & Poller) - Completed
- [x] Initialize `PROJECT_STATE.md`
- [x] Create backend directory structure and `requirements.txt`
- [x] Implement `app/config.py` (environment variables, `/app/data` persistence paths, PUID/PGID)
- [x] Implement `app/database.py` (SQLite schema, WAL mode, batches, batch_items, settings tables)
- [x] Implement `app/models.py` (Pydantic models for batch creation, items, settings, OpenRouter response shapes)
- [x] Implement `app/services/openrouter.py` (OpenRouter API client for batch submission, polling, model listing)
- [x] Implement `app/services/batch_service.py` (CSV parsing, variable interpolation `{{var}}`, batch preparation, export formatters)
- [x] Implement `app/services/poller.py` (APScheduler background loop polling active batches every 5 minutes + on-demand triggers)
- [x] Implement FastAPI endpoints (`routers/batches.py`, `routers/models.py`, `routers/settings.py`, `main.py`)
- [x] Write and run automated tests for backend logic, database, and poller (10/10 tests passing)

### Phase 2: Interface (React + Vite + Tailwind + Shadcn) - Completed
- [x] Scaffold React + Vite frontend with Tailwind CSS
- [x] Build Dark mode UI components with LibreChat aesthetic
- [x] Implement Sidebar (Active with spinners vs Archive, pulsing teal unread dot)
- [x] Implement New Batch Form (CSV upload, header chips `{{col}}`, prompt template, model selector, temperature slider, reasoning effort dropdown)
- [x] Implement Batch Detail view (data table, copy response, progress, export CSV/JSON, mark as read)
- [x] Implement Settings modal (API key configuration)

### Phase 3: Deployment (Docker & TrueNAS Scale) - Completed
- [x] Write multi-stage `Dockerfile` (Node builder -> Python runner)
- [x] Write `docker-compose.yml` with `/app/data` volume and PUID/PGID 1000:1000
- [x] Write `TRUENAS_SETUP.md` with complete deployment walkthrough
