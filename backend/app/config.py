import os
from pathlib import Path

# Base data directory: defaults to /app/data in Docker, or local ./data for development
DEFAULT_DATA_DIR = Path("/app/data") if os.path.exists("/app/data") or os.environ.get("IN_DOCKER") else Path("./data")
DATA_DIR = Path(os.environ.get("DATA_DIR", str(DEFAULT_DATA_DIR))).resolve()

# Subdirectories
DB_PATH = DATA_DIR / "somnia.db"
RESULTS_DIR = DATA_DIR / "results"
LOGS_DIR = DATA_DIR / "logs"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Polling configuration
POLL_INTERVAL_MINUTES = int(os.environ.get("POLL_INTERVAL_MINUTES", "5"))

# OpenRouter base URLs
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY_ENV = os.environ.get("OPENROUTER_API_KEY", "")

# TrueNAS PUID / PGID
PUID = int(os.environ.get("PUID", "1000"))
PGID = int(os.environ.get("PGID", "1000"))
