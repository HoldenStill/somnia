# Contributing to Somnia

Thank you for your interest in contributing to **Somnia**!

Somnia is an open-source, self-hosted batch manager for OpenRouter designed to provide seamless 50% inference cost savings with a modern web UI, KaTeX math rendering, and TrueNAS Scale / Docker support.

---

## Code Generation & Attribution Note

Please note that this project's entire codebase, test suites, and Docker architecture were designed and authored with **Gemini Antigravity** (Google DeepMind's Advanced Agentic Coding assistant), directed and curated by the project author (@Holden).

Contributions are welcome from human developers and agentic AI assistants alike!

---

## Development Setup

### 1. Backend Setup
```bash
# Clone the repository
git clone https://github.com/your-username/somnia.git
cd somnia

# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend/requirements.txt
pip install pytest pytest-asyncio

# Run tests
pytest backend/tests/ -v
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Running Locally
Run the backend with:
```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```
Open `http://localhost:8000` (or `http://localhost:5173` if running Vite development server with API proxy).

---

## Submitting Pull Requests

1. Fork the repository and create your feature branch (`git checkout -b feature/amazing-feature`).
2. Verify that all backend unit tests pass:
   ```bash
   pytest backend/tests/ -v
   ```
3. Verify that the frontend builds without type errors:
   ```bash
   cd frontend && npm run build
   ```
4. Commit your changes (`git commit -m "feat: add amazing feature"`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.
