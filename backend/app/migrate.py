from pathlib import Path

from .db import connection


def migrate() -> None:
    with connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(73020411)")
        conn.execute("CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY)")
        for path in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            if conn.execute("SELECT 1 FROM app_migrations WHERE name=%s", (path.name,)).fetchone():
                continue
            conn.execute(path.read_text(encoding="utf-8"), prepare=False)
            conn.execute("INSERT INTO app_migrations VALUES (%s)", (path.name,))
