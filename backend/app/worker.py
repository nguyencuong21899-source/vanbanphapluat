from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from croniter import croniter

from .config import CHECK_SCHEDULE
from .db import connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def run_legal_check() -> None:
    """Creates a review item; source-specific collectors require legal approval before enablement."""
    with connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO alerts (alert_type, severity, message) VALUES ('REVIEW_REQUIRED', 'LOW', 'Đợt rà soát nguồn pháp luật đã chạy; các thay đổi cần được pháp chế xác minh.')")


def main() -> None:
    while True:
        now = datetime.now(timezone.utc)
        next_run = croniter(CHECK_SCHEDULE, now).get_next(datetime)
        logger.info("Next legal review: %s", next_run.isoformat())
        time.sleep(max((next_run - now).total_seconds(), 1))
        try:
            run_legal_check()
        except Exception:
            logger.exception("Legal review failed")


if __name__ == "__main__":
    main()

