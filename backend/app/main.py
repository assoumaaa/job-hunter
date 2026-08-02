from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .core.config import settings
from .core.db import Base, engine

# Import all models so SQLAlchemy picks them up before create_all
from .models import CV, Job, Position, Profile, User, UserSettings  # noqa: F401
from .routes import (
    auth_router,
    cv_router,
    job_settings_router,
    jobs_router,
    positions_router,
    profile_router,
    settings_router,
)


def _ensure_jobs_tweak_columns() -> None:
    """Idempotently add tweak/chat columns on sqlite. create_all doesn't ALTER
    existing tables, so we do it here once per startup."""
    inspector = inspect(engine)
    if "jobs" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("jobs")}
    with engine.begin() as conn:
        for column in ("originalCv", "originalCl", "chatCv", "chatCl"):
            if column not in existing:
                conn.execute(text(f'ALTER TABLE jobs ADD COLUMN "{column}" TEXT'))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_jobs_tweak_columns()
    yield


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built Vite SPA same-origin with the API (single-container deploy).

    In production the Docker image sets FRONTEND_DIST to the copied `build/` dir;
    the API lives under /api, hashed assets under /assets, and every other GET
    falls back to index.html so client-side routes (react-router) resolve. In
    local dev FRONTEND_DIST is unset and the Vite dev server serves the SPA, so
    this is a no-op.
    """
    if not settings.FRONTEND_DIST:
        return
    dist = Path(settings.FRONTEND_DIST)
    index = dist / "index.html"
    if not index.is_file():
        return

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # /api/* is an API namespace: never fall back to index.html for it.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)


def create_app() -> FastAPI:
    app = FastAPI(title="Job Hunter API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API is namespaced under /api so it can share an origin with the SPA. The
    # frontend calls /api/... (VITE_API_URL=/api) in both dev and production.
    app.include_router(auth_router, prefix="/api")
    app.include_router(jobs_router, prefix="/api")
    app.include_router(positions_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(job_settings_router, prefix="/api")
    app.include_router(cv_router, prefix="/api")
    app.include_router(settings_router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # Registered last so specific routes (/api/*, /health, /docs) win over the
    # SPA catch-all.
    _mount_frontend(app)

    return app


app = create_app()
