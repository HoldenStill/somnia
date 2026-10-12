<div align="center">

# 🌙 Somnia

### Self-Hosted OpenRouter Batch Processing Dashboard & Background Engine

**Run bulk LLM workloads asynchronously at a 50% discount with zero rate-limit anxiety, beautiful KaTeX math rendering, and Docker / TrueNAS Scale simplicity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![OpenRouter Batch API](https://img.shields.io/badge/OpenRouter-50%25_Off_Batch-teal.svg)](https://openrouter.ai/)
[![Built with Gemini Antigravity](https://img.shields.io/badge/Built_with-Gemini_Antigravity-7c3aed.svg)](https://deepmind.google/)

</div>

---

> [!IMPORTANT]
> ### 🤖 Project Genesis & Attribution Disclosure
> **100% of the code, backend architecture, frontend interfaces, unit test suites, and Docker containerization in this repository were designed, generated, and verified entirely by Gemini Antigravity** (Google DeepMind's Advanced Agentic Coding assistant).
>
> The human author, **HoldenStill** ([@Holden](https://github.com/HoldenStill)), provided the initial concept, core requirements, homelab infrastructure needs, iterative feature directions (such as electrical engineering use cases, scroll fatigue solutions, KaTeX LaTeX math support, and cost transparency), and human evaluation. Every line of Python, TypeScript, SQL, Tailwind CSS, shell scripts, and documentation was implemented and tested by the autonomous AI assistant.

---

## 💡 What is Somnia?

When sending dozens or hundreds of prompts to top-tier LLMs (like Claude Sonnet 3.5/5.5, GPT-4o, DeepSeek R1/V4, or Gemini 2.5 Pro), real-time API requests have major drawbacks:
1. **You pay 100% full price** for synchronous inference.
2. **You risk rate limits (429), gateway timeouts (504), and dropped browser tabs**.
3. **You must write custom scripts** or inspect raw JSON files to gather results.

**Somnia** is a self-hosted, single-container web application and background orchestration engine that interfaces directly with **OpenRouter's Batch API** (`POST /api/v1/batches`). 

Upload a CSV of inputs, write a template with `{{variable}}` substitution, select any batch-ready model, and Somnia automatically routes your requests to off-peak queues—**saving 50% on token costs**, polling results in the background, and presenting outputs in an elegant, distraction-free dashboard.

---

## ✨ Features

### 💰 50% Inference Cost Savings & Persistent Budget Tracking
- **Automatic 50% Discount**: Routes requests strictly through OpenRouter's `:batch` endpoints for guaranteed discounted rates.
- **Persistent Header Cost Badge**: Top-level header always displays total batch spend and total token counts (e.g. `$0.00731 • 1.6k tok`).
- **5-Card Stats Summary Bar**: Instant visibility into `Total Items`, `Completed`, `Failed`, `Batch Cost (50% Off)`, and `Progress %`.
- **Per-Task Cost Traceability**: Every individual task card displays its exact cost and token usage breakdown (e.g. `$0.00195 (422 tok)`).
- **Pre-Flight Budget Estimator**: Immediate cost and token estimation shown in the batch creation modal *before* launching.

### 🧭 Batch Item Navigator (Zero Scroll Fatigue)
- **Focused Tabs View**: Inspect one task at a time with dedicated screen real estate.
- **Scrollable Horizontal Tab Bar**: Jump across tasks with live status indicators (`✓` completed, `✗` failed, `⏳` pending) and primary input preview chips.
- **Quick-Jump Dropdown**: Switch instantly via a selector combobox showing task numbers, inputs, and costs.
- **Keyboard Arrow Navigation**: Cycle through tasks effortlessly using the **`←`** and **`→`** arrow keys.
- **Feed View Toggle**: Prefer vertical scrolling? Toggle between focused `Tabs` view and stacked `Feed` view anytime.

### 📐 KaTeX LaTeX Mathematical & Markdown Rendering
- **Full KaTeX Math Equation Support**: Seamlessly renders inline math ($f_c = \frac{1}{2\pi RC}$) and multi-line display derivations ($$H(s) = \frac{1}{1 + sRC}$$), ideal for STEM students, researchers, and engineers.
- **Dual-Mode Output Switcher**: Switch between formatted Markdown (with syntax-highlighted code blocks and 1-click copy) and raw source text globally or on individual task cards.

### 🛠️ Power User Controls & Homelab Integration
- **Row 1 Dry-Run Preview**: Preview your rendered prompt with real CSV data before submission.
- **System Prompts & Structured JSON**: Inject system instructions or enforce JSON schema outputs (`response_format: { type: "json_object" }`).
- **Reasoning Effort Control**: Configure reasoning intensity (`low`, `medium`, `high`) for models like `o1`, `o3-mini`, or `deepseek-r1`.
- **Webhook Notifications**: Receive automatic alerts on **Discord**, **NTFY**, or **Gotify** when batches finish.
- **1-Click Failed Row Retry**: Retries errored rows into a brand-new batch without touching succeeded items.
- **Multi-Format Export**: Download results as CSV, JSON, or ready-to-share Markdown (`.md`) reports.
- **Collapsible Slim Sidebar**: Shrinks to a 64px icon rail (Gemini style) with a smooth draggable resize divider (240px–500px).
- **Zero-Dependency Architecture**: Embedded APScheduler background poller + SQLite Write-Ahead Logging (WAL) database. No Redis, Celery, or external databases needed.

---

## 🚀 Quickstart Deployment

### Option 1: Docker Compose (Recommended)

Save the following as `docker-compose.yml`:

```yaml
services:
  somnia:
    image: ghcr.io/holden/somnia:latest  # or build locally
    container_name: somnia
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key  # Optional: can also be configured in UI
      - DATA_DIR=/app/data
      - POLL_INTERVAL_MINUTES=5
      - PUID=1000
      - PGID=1000
    volumes:
      - ./somnia-data:/app/data
```

Launch the container:
```bash
docker compose up -d
```
Open **`http://localhost:8000`** in your browser.

---

### Option 2: TrueNAS Scale (Custom App)

Somnia is specifically architected for TrueNAS Scale:
1. In TrueNAS Scale, navigate to **Apps** → **Discover Apps** → **Install Custom App**.
2. **Application Name**: `somnia`
3. **Image repository**: `ghcr.io/holden/somnia` (tag: `latest`)
4. **Port Forwarding**: Host Port `8000` → Container Port `8000`.
5. **Storage / Host Path Volume**:
   - Host Path: `/mnt/your-pool/appdata/somnia`
   - Mount Path: `/app/data`
6. **Environment Variables**:
   - `PUID`: `1000` (or your dataset's owner UID)
   - `PGID`: `1000` (or your dataset's owner GID)
   - `OPENROUTER_API_KEY`: `sk-or-v1-...`
7. Click **Install**. For a step-by-step walkthrough, see [`TRUENAS_SETUP.md`](TRUENAS_SETUP.md).

---

### Option 3: Local Development (Python + Vite)

#### 1. Backend Setup
```bash
# Clone repository
git clone https://github.com/Holden/somnia.git
cd somnia

# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r backend/requirements.txt
pip install pytest pytest-asyncio

# Run backend unit tests
pytest backend/tests/ -v

# Start FastAPI backend
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` for Vite hot-reloading (with backend proxy to port 8000), or build static assets with `npm run build` to have FastAPI serve them directly at `http://127.0.0.1:8000`.

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key. Can also be set in Web Settings. | *None* |
| `DATA_DIR` | Directory where SQLite database (`somnia.db`) and exports are stored. | `/app/data` (or `./data`) |
| `POLL_INTERVAL_MINUTES` | Frequency of background status checks for active batches. | `5` |
| `PUID` | Process User ID for container file permissions (TrueNAS compatibility). | `1000` |
| `PGID` | Process Group ID for container file permissions. | `1000` |
| `PORT` | Web server listening port. | `8000` |

---

## 📁 Repository Structure

```
somnia/
├── backend/
│   ├── app/
│   │   ├── routers/          # FastAPI routes: batches, models, settings
│   │   ├── services/         # Batch processing, OpenRouter API client, poller
│   │   ├── config.py         # App configuration & persistence paths
│   │   ├── database.py       # SQLite schema, WAL mode, migrations, usage resolution
│   │   ├── models.py         # Pydantic schemas for batches, items, and costs
│   │   └── main.py           # FastAPI entrypoint, SPA static mounting
│   ├── tests/                # Automated backend test suite (pytest)
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/       # React components: BatchDetailView, NewBatchModal,
│   │   │                     # Sidebar, MarkdownRenderer, SettingsModal
│   │   ├── lib/              # API client, TypeScript types, formatting utilities
│   │   ├── App.tsx           # Layout, sidebar width state, active batch selection
│   │   └── index.css         # Tailwind dark theme styles
│   ├── package.json          # Node dependencies (React 18, Vite 6, Tailwind, KaTeX)
│   └── vite.config.ts        # Vite configuration & backend proxy
├── .github/
│   └── workflows/ci.yml      # Automated GitHub Actions test & build workflow
├── docker-compose.yml        # Standard self-hosted Docker deployment
├── Dockerfile                # Multi-stage build (Node builder -> Python runtime)
├── entrypoint.sh             # Linux non-root permission handling (PUID/PGID)
├── TRUENAS_SETUP.md          # Step-by-step TrueNAS Scale deployment guide
├── LICENSE                   # MIT License
└── README.md                 # Project documentation
```

---

## 🧪 Testing

Somnia includes an automated unit test suite covering API endpoints, CSV interpolation, model validation, background polling, and token/cost accounting:

```bash
# Run pytest test suite
pytest backend/tests/ -v
```

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).

---

<div align="center">
<sub>Crafted autonomously by <strong>Gemini Antigravity</strong> (Google DeepMind) • Conceived and directed by <strong>Holden</strong></sub>
</div>
