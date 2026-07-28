from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .core.db import Base, engine

# Import all models so SQLAlchemy picks them up before create_all
from .models import CV, Job, Position, Profile, User  # noqa: F401
from .routes import (
    auth_router,
    cv_router,
    job_settings_router,
    jobs_router,
    positions_router,
    profile_router,
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


def create_app() -> FastAPI:
    app = FastAPI(title="Job Hunter API", version="1.0.0", lifespan=lifespan)

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

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
