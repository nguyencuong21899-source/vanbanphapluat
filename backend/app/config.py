from __future__ import annotations

import os
from pathlib import Path

DATABASE_URL = os.environ["DATABASE_URL"]
DOCUMENT_ROOT = Path(os.getenv("DOCUMENT_ROOT", "/data/documents")).resolve()
ADMIN_TOKEN = os.environ["APP_ADMIN_TOKEN"]
CHECK_SCHEDULE = os.getenv("CHECK_SCHEDULE", "17 2 * * 1")

