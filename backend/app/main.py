import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .database import init_db
from .services.poller import start_poller, stop_poller
from .routers import batches, models, settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("somnia")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Somnia database...")
    await init_db()
    logger.info("Starting OpenRouter background poller...")
    start_poller()
    yield
    logger.info("Shutting down OpenRouter background poller...")
    stop_poller()

app = FastAPI(
    title="Somnia - OpenRouter Batch Manager",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(batches.router)
app.include_router(models.router)
app.include_router(settings.router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "Somnia", "version": "1.0.0"}

# Static files / SPA serving
static_dirs = [
    Path("/app/static"),
    Path("/app/dist"),
    Path(__file__).parent.parent.parent / "frontend" / "dist"
]

frontend_dist = next((d for d in static_dirs if d.exists() and (d / "index.html").exists()), None)

if frontend_dist:
    logger.info(f"Serving frontend static files from {frontend_dist}")
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        target_file = frontend_dist / full_path
        if target_file.is_file():
            return FileResponse(str(target_file))
        return FileResponse(str(frontend_dist / "index.html"))
