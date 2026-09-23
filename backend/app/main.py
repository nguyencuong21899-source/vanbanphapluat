from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from .config import DOCUMENT_ROOT
from .db import add_audit_event, connection
from .schemas import DocumentCreate, ReviewDecision
from .security import require_admin

app = FastAPI(title="Traphaco Legal AI", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(_: str = Depends(require_admin)) -> dict:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("""SELECT COUNT(*) AS total_documents,
          COUNT(*) FILTER (WHERE legal_status = 'ACTIVE') AS active_documents,
          COUNT(*) FILTER (WHERE review_state = 'PENDING') AS pending_reviews,
          COUNT(*) FILTER (WHERE effective_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS effective_soon
          FROM documents""")
        totals = cur.fetchone()
        cur.execute("SELECT id, alert_type, severity, message, created_at FROM alerts WHERE NOT is_read ORDER BY created_at DESC LIMIT 10")
        alerts = cur.fetchall()
    return {"totals": totals, "alerts": alerts}


@app.get("/api/documents")
def list_documents(query: str | None = None, legal_status: str | None = None, _: str = Depends(require_admin)) -> list[dict]:
    clauses, values = [], []
    if query:
        clauses.append("(title ILIKE %s OR reference_number ILIKE %s OR internal_code ILIKE %s)")
        values.extend([f"%{query}%"] * 3)
    if legal_status:
        clauses.append("legal_status = %s")
        values.append(legal_status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT id, internal_code, reference_number, title, document_type, effective_on, legal_status, review_state, verification_level, last_checked_at FROM documents {where} ORDER BY effective_on DESC NULLS LAST, created_at DESC", values)
        return cur.fetchall()


@app.post("/api/documents", status_code=status.HTTP_201_CREATED)
def create_document(payload: DocumentCreate, actor: str = Depends(require_admin)) -> dict:
    data = payload.model_dump(mode="json")
    data["source_url"] = str(payload.source_url) if payload.source_url else None
    with connection() as conn, conn.cursor() as cur:
        try:
            cur.execute("""INSERT INTO documents (internal_code, reference_number, title, document_type, issuing_authority, issued_on, effective_on, expires_on, legal_status, applicability, primary_domain, departments, source_url, notes)
              VALUES (%(internal_code)s, %(reference_number)s, %(title)s, %(document_type)s, %(issuing_authority)s, %(issued_on)s, %(effective_on)s, %(expires_on)s, %(legal_status)s, %(applicability)s, %(primary_domain)s, %(departments)s, %(source_url)s, %(notes)s) RETURNING id""", data)
            document_id = cur.fetchone()["id"]
        except Exception as exc:
            if "documents_internal_code_key" in str(exc):
                raise HTTPException(status_code=409, detail="Mã nội bộ đã tồn tại") from exc
            raise
    add_audit_event(actor, "DOCUMENT_CREATED", "document", str(document_id), {"internal_code": payload.internal_code})
    return {"id": document_id}


@app.post("/api/documents/{document_id}/file", status_code=status.HTTP_201_CREATED)
def upload_source_file(document_id: UUID, file: UploadFile = File(...), actor: str = Depends(require_admin)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if file.content_type not in {"application/pdf", "text/plain", "text/markdown"} or suffix not in {".pdf", ".txt", ".md"}:
        raise HTTPException(status_code=415, detail="Chỉ nhận PDF, TXT hoặc Markdown")
    DOCUMENT_ROOT.mkdir(parents=True, exist_ok=True)
    destination = DOCUMENT_ROOT / f"{document_id}{suffix}"
    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    with connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE documents SET source_file_path = %s, source_sha256 = %s WHERE id = %s", (str(destination), digest, document_id))
        if cur.rowcount != 1:
            destination.unlink(missing_ok=True)
            raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
    add_audit_event(actor, "SOURCE_FILE_UPLOADED", "document", str(document_id), {"sha256": digest})
    return {"sha256": digest}


@app.get("/api/documents/{document_id}/file")
def download_source_file(document_id: UUID, _: str = Depends(require_admin)) -> FileResponse:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT source_file_path FROM documents WHERE id = %s", (document_id,))
        row = cur.fetchone()
    if not row or not row["source_file_path"]:
        raise HTTPException(status_code=404, detail="Chưa có tệp nguồn")
    path = Path(row["source_file_path"]).resolve()
    if DOCUMENT_ROOT not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Tệp nguồn không tồn tại")
    return FileResponse(path)


@app.post("/api/documents/{document_id}/review")
def review_document(document_id: UUID, payload: ReviewDecision, actor: str = Depends(require_admin)) -> dict:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE documents SET review_state = %s, notes = COALESCE(notes || E'\\n', '') || %s WHERE id = %s", (payload.decision, payload.note, document_id))
        if cur.rowcount != 1:
            raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
    add_audit_event(actor, f"DOCUMENT_{payload.decision}", "document", str(document_id), {"note": payload.note})
    return {"status": payload.decision}

