import logging
import os
import smtplib
import ssl
import time
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from .db import connection
from .migrate import migrate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def send_mail(task, remaining):
    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = task["email"]
    message["Subject"] = "Traphaco CNC | Nhắc hạn công việc pháp luật"
    link = os.environ["APP_BASE_URL"].rstrip("/") + "/?document=" + str(task["document_id"])
    deadline = "Hạn hôm nay" if remaining == 0 else f"Còn {remaining} ngày đến hạn"
    message.set_content(f"{deadline}\nCông việc: {task['requirement']}\n"
                        f"Văn bản: {task['title']}\nHạn nội bộ: {task['internal_deadline']}\n{link}")
    context = ssl.create_default_context()
    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "587"))
    implicit = os.getenv("SMTP_SECURITY") == "ssl"
    smtp = (smtplib.SMTP_SSL(host, port, timeout=15, context=context) if implicit
            else smtplib.SMTP(host, port, timeout=15))
    with smtp:
        if not implicit:
            smtp.starttls(context=context)
        if os.getenv("SMTP_USERNAME"):
            smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


def reminder_offsets():
    offsets = sorted({int(value.strip()) for value in os.getenv("REMINDER_DAYS", "7,3,1,0").split(",")})
    if any(value < 0 or value > 365 for value in offsets):
        raise ValueError("REMINDER_DAYS phải từ 0 đến 365")
    return offsets


def record_document_reminders(today=None):
    today = today or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    offsets = reminder_offsets()
    with connection() as conn:
        conn.execute("""
            WITH dates AS (
                SELECT d.id, d.title, event.kind, event.due, event.alert_type, event.label,
                       event.due - %(today)s::date AS remaining
                FROM documents d CROSS JOIN LATERAL (
                    VALUES
                        ('comment', CASE WHEN d.legal_status='DRAFT' THEN d.comment_deadline END,
                         'REVIEW_REQUIRED', 'Hạn góp ý'),
                        ('effective', CASE WHEN d.legal_status IN ('PENDING_EFFECT','ACTIVE','UNVERIFIED') THEN d.effective_on END,
                         'EFFECTIVE_SOON', 'Mốc hiệu lực đã ghi'),
                        ('expiry', CASE WHEN d.legal_status IN ('PENDING_EFFECT','ACTIVE','PARTIALLY_REPEALED','UNVERIFIED') THEN d.expires_on END,
                         'REVIEW_REQUIRED', 'Mốc hết hiệu lực cần đối chiếu')
                ) AS event(kind, due, alert_type, label)
                WHERE d.archived_at IS NULL
            )
            INSERT INTO alerts (document_id, alert_type, severity, message, reminder_key)
            SELECT id, alert_type, CASE WHEN remaining <= 1 THEN 'HIGH' ELSE 'MEDIUM' END,
                   label || ' ' || to_char(due,'DD/MM/YYYY') || ' · ' ||
                       CASE WHEN remaining=0 THEN 'Hôm nay' ELSE 'Nhắc trước ' || remaining || ' ngày' END ||
                       ' · ' || title,
                   concat_ws(':', id, kind, due, remaining)
            FROM dates WHERE remaining = ANY(%(offsets)s)
            ON CONFLICT (reminder_key) DO NOTHING
        """, {"today": today, "offsets": offsets})


def send_reminders():
    if not all(os.getenv(key) for key in ("SMTP_HOST", "SMTP_FROM", "APP_BASE_URL")):
        return
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    offsets = reminder_offsets()
    with connection() as conn:
        candidates = conn.execute("""SELECT p.id FROM implementation_plans p
            WHERE p.status IN ('OPEN','IN_PROGRESS') AND (p.internal_deadline-%s::date)=ANY(%s)
            ORDER BY p.internal_deadline LIMIT 500""", (today, offsets)).fetchall()
    for candidate in candidates:
        with connection() as conn:
            task = conn.execute("""SELECT p.*,d.title,a.email FROM implementation_plans p
                JOIN accounts a ON a.id=p.assignee_id AND a.enabled AND a.email IS NOT NULL
                JOIN documents d ON d.id=p.document_id AND d.archived_at IS NULL
                WHERE p.id=%s AND p.status IN ('OPEN','IN_PROGRESS') FOR UPDATE OF p""", (candidate["id"],)).fetchone()
            if not task or not task["internal_deadline"]:
                continue
            remaining = (task["internal_deadline"] - today).days
            if remaining not in offsets:
                continue
            key = (task["id"], task["internal_deadline"], remaining)
            if not conn.execute("""INSERT INTO reminder_deliveries (task_id,due_on,days_before,state)
                VALUES (%s,%s,%s,'SENDING') ON CONFLICT DO NOTHING RETURNING task_id""", key).fetchone():
                continue
        try:
            send_mail(task, remaining)
            state = "SENT"
        except (OSError, ValueError, KeyError) as exc:
            logger.warning("Gửi nhắc hạn thất bại cho %s: %s", task["id"], type(exc).__name__)
            state = "FAILED"
        with connection() as conn:
            conn.execute("""UPDATE reminder_deliveries SET state=%s,updated_at=now()
                WHERE task_id=%s AND due_on=%s AND days_before=%s""", (state, *key))


def main():
    migrate()
    while True:
        try:
            record_document_reminders()
        except Exception:
            logger.exception("Không tạo được thông báo mốc văn bản")
        try:
            send_reminders()
        except Exception:
            logger.exception("Không kiểm tra được nhắc hạn")
        time.sleep(300)


if __name__ == "__main__":
    main()
