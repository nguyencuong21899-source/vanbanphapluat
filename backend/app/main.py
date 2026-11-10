from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from . import accounts, analysis, documents, tasks
from .accounts import current_user
from .db import connection
from .migrate import migrate


@asynccontextmanager
async def lifespan(app):
    migrate()
    yield


app = FastAPI(title="Traphaco CNC – AI Legal Monitoring System", version="0.2.0", lifespan=lifespan)
for router in (accounts.router, documents.router, tasks.router, analysis.router):
    app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_error(_, exc):
    fields = [str(error["loc"][-1]) for error in exc.errors() if error["loc"]]
    return JSONResponse(status_code=422, content={"detail": "Dữ liệu chưa hợp lệ. Kiểm tra: " + ", ".join(fields)})


@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health():
    with connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(user: dict = Depends(current_user)):
    scope, args = tasks.task_scope(user)
    with connection() as conn:
        totals = conn.execute("""SELECT COUNT(*) AS total_documents,
          COUNT(*) FILTER (WHERE legal_status='ACTIVE') AS active_documents,
          COUNT(*) FILTER (WHERE created_at>=now()-interval '7 days') AS new_documents,
          COUNT(*) FILTER (WHERE legal_status='DRAFT' AND review_state='PENDING') AS pending_drafts,
          COUNT(*) FILTER (WHERE effective_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30) AS effective_soon
          FROM documents WHERE archived_at IS NULL""").fetchone()
        overdue = conn.execute(f"""SELECT COUNT(*) AS count FROM implementation_plans p
          WHERE p.internal_deadline<CURRENT_DATE AND p.status<>'DONE' AND {scope}""", args).fetchone()
        alerts = conn.execute("""SELECT a.id,a.document_id,a.alert_type,a.severity,a.message,a.created_at FROM alerts a
          LEFT JOIN documents d ON d.id=a.document_id
          WHERE NOT a.is_read AND d.archived_at IS NULL
            AND (a.reminder_key IS NULL OR (
                split_part(a.reminder_key, ':', 3)::date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                AND split_part(a.reminder_key, ':', 3)::date = CASE split_part(a.reminder_key, ':', 2)
                    WHEN 'comment' THEN CASE WHEN d.legal_status='DRAFT' THEN d.comment_deadline END
                    WHEN 'effective' THEN CASE WHEN d.legal_status IN ('PENDING_EFFECT','ACTIVE','UNVERIFIED') THEN d.effective_on END
                    WHEN 'expiry' THEN CASE WHEN d.legal_status IN ('PENDING_EFFECT','ACTIVE','PARTIALLY_REPEALED','UNVERIFIED') THEN d.expires_on END
                END
            ))
          ORDER BY a.created_at DESC LIMIT 10""").fetchall()
        return {"totals": {**totals, "overdue": overdue["count"]}, "alerts": alerts}
