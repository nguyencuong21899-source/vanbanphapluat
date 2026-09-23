from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def add_audit_event(actor: str, action: str, entity_type: str, entity_id: str | None, detail: dict) -> None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO audit_events (actor, action, entity_type, entity_id, detail) VALUES (%s, %s, %s, %s, %s::jsonb)",
            (actor, action, entity_type, entity_id, psycopg.types.json.Jsonb(detail)),
        )

