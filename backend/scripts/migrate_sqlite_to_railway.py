"""One-off: copy local SQLite data into a target Postgres (e.g. Railway).

The app was developed against a local SQLite file (`backend/job_hunter.db`)
before the Postgres switch, so this moves that data up to the deployed DB.

It REPLACES the destination's rows with the SQLite contents (delete-then-insert,
in FK order) so that logging in on the deployed app links you to the imported
user by `clerk_user_id` and all your data shows up. It reads through the app's
typed models, so SQLite→Postgres type conversion (bools, datetimes) is handled.

Usage (from the backend/ dir, with its venv):
    # validate the source read only, no destination needed:
    .venv/bin/python scripts/migrate_sqlite_to_railway.py --dry-run

    # do the copy:
    .venv/bin/python scripts/migrate_sqlite_to_railway.py "postgresql://…public-url…"
    # or: DEST_URL="postgresql://…" .venv/bin/python scripts/migrate_sqlite_to_railway.py
"""

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, delete, insert, select

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import app.models  # noqa: E402,F401 — registers every model on Base
from app.core.db import Base  # noqa: E402

SQLITE_PATH = BACKEND / "job_hunter.db"


def _norm(url: str) -> str:
    """Pin a bare postgres URL to the psycopg (v3) driver the app ships."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def main() -> None:
    args = sys.argv[1:]
    dry = "--dry-run" in args
    positional = [a for a in args if not a.startswith("--")]
    dest_url = (positional[0] if positional else os.environ.get("DEST_URL", "")).strip()

    if not SQLITE_PATH.is_file():
        sys.exit(f"SQLite file not found: {SQLITE_PATH}")

    src = create_engine(f"sqlite:///{SQLITE_PATH}")
    tables = Base.metadata.sorted_tables  # parents before children

    if dry:
        with src.connect() as s:
            for t in tables:
                n = len(s.execute(select(t)).fetchall())
                print(f"  {t.name}: {n} rows")
        print("Dry run OK — source reads cleanly through the models.")
        return

    if not dest_url:
        sys.exit("Provide the destination Postgres URL as an arg or DEST_URL env var.")

    dst = create_engine(_norm(dest_url))
    Base.metadata.create_all(dst)  # idempotent; Railway already has the schema

    with src.connect() as s, dst.begin() as d:
        for t in reversed(tables):  # wipe children first
            d.execute(delete(t))
        for t in tables:  # insert parents first
            rows = [dict(r._mapping) for r in s.execute(select(t))]
            if rows:
                d.execute(insert(t), rows)
            print(f"  {t.name}: {len(rows)} rows copied")

    print("Done. Refresh the app and log in — your data should appear.")


if __name__ == "__main__":
    main()
