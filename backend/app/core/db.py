from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

# Managed Postgres (Render, Heroku, …) hands out a bare `postgresql://` (or the
# legacy `postgres://`) URL, which SQLAlchemy routes to psycopg2 — but this
# project ships psycopg (v3). Pin the driver so the provider's URL works unchanged.
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgres://") :]
elif _db_url.startswith("postgresql://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgresql://") :]

# check_same_thread is a SQLite-only flag; only pass it for a SQLite URL so a
# Postgres DATABASE_URL (production) isn't handed an argument its driver rejects.
_connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}
engine = create_engine(_db_url, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
