from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .core.db import Base, engine
from .routes import (
    auth_router,
    cv_router,
    job_settings_router,
    jobs_router,
    positions_router,
    profile_router,
)

# Import all models so SQLAlchemy picks them up before create_all
from .models import User, Job, Position, Profile, CV  # noqa: F401


def _ensure_jobs_tweak_columns() -> None:
    """Idempotently add originalCv/originalCl columns on sqlite. create_all
    doesn't ALTER existing tables, so we do it here once per startup."""
    inspector = inspect(engine)
    if "jobs" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("jobs")}
    with engine.begin() as conn:
        if "originalCv" not in existing:
            conn.execute(text('ALTER TABLE jobs ADD COLUMN "originalCv" TEXT'))
        if "originalCl" not in existing:
            conn.execute(text('ALTER TABLE jobs ADD COLUMN "originalCl" TEXT'))


def create_app() -> FastAPI:
    app = FastAPI(title="Job Hunter API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(auth_router)
    app.include_router(jobs_router)
    app.include_router(positions_router)
    app.include_router(profile_router)
    app.include_router(job_settings_router)
    app.include_router(cv_router)

    @app.on_event("startup")
    def on_startup():
        Base.metadata.create_all(bind=engine)
        _ensure_jobs_tweak_columns()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
