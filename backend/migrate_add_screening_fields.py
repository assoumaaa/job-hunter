"""
One-time migration: add new screening/generation columns to existing SQLite database.

Run from the backend directory:
    python migrate_add_screening_fields.py

Safe to re-run — skips columns that already exist.
"""

import sqlite3
import sys

DB_PATH = "job_hunter.db"

MIGRATIONS = [
    # Job table: screening intelligence
    ("jobs", "archetype", "TEXT"),
    ("jobs", "screeningScore", "TEXT"),
    ("jobs", "screeningReason", "TEXT"),
    # Profile table: narrative + deal-breakers
    ("profiles", "narrative", "TEXT"),
    ("profiles", "dealBreakers", "TEXT"),
]


def get_existing_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def main():
    try:
        conn = sqlite3.connect(DB_PATH)
    except Exception as e:
        print(f"Could not open {DB_PATH}: {e}")
        sys.exit(1)

    cursor = conn.cursor()
    added = 0

    for table, column, col_type in MIGRATIONS:
        existing = get_existing_columns(cursor, table)
        if column in existing:
            print(f"  skip  {table}.{column} (already exists)")
            continue
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        print(f"  added {table}.{column} ({col_type})")
        added += 1

    conn.commit()
    conn.close()
    print(f"\nDone. {added} column(s) added.")


if __name__ == "__main__":
    main()
