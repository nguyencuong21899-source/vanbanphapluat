from datetime import datetime
from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from psycopg.errors import UniqueViolation
from pydantic import BaseModel

from .accounts import audit, current_user, require_roles
from .config import DOCUMENT_ROOT
from .db import connection
from .schemas import DocumentCreate, LegalStatus, ReviewDecision

router = APIRouter(prefix="/api/documents")
editors = require_roles("admin", "legal", "manager")
reviewers = require_roles("admin", "legal")
FIELDS = tuple(DocumentCreate.model_fields)
PUBLIC = ", ".join(FIELDS) + """, id, archived_at, updated_at, created_at,
    review_state, verification_level, last_checked_at, source_file_path IS NOT NULL AS has_file, source_filename"""
MAX_FILE = 20 * 1024**2
MEDIA = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/plain",
}


class DocumentUpdate(DocumentCreate):
    revision: str


@router.get("")
def list_documents(query: str = "", legal_status: LegalStatus | None = None,
                   archived: bool = False, _: dict = Depends(current_user)):
    filters = ["archived_at IS NOT NULL" if archived else "archived_at IS NULL"]
    params = []
    if query:
        filters.append("(title ILIKE %s OR reference_number ILIKE %s OR internal_code ILIKE %s OR source_url ILIKE %s)")
        params.extend([f"%{query}%"] * 4)
    if legal_status:
        filters.append("legal_status=%s")
        params.append(legal_status)
    with connection() as conn:
        return conn.execute(f"SELECT {PUBLIC} FROM documents WHERE {' AND '.join(filters)} ORDER BY updated_at DESC", params).fetchall()


def editable_fields(conn, payload: DocumentCreate, actor: dict, document_id=None):
    data = {key: getattr(payload, key) for key in FIELDS}
    data["source_url"] = str(payload.source_url) if payload.source_url else None
    if actor["role"] == "manager":
        if document_id:
            previous = conn.execute("SELECT legal_status, applicability FROM documents WHERE id=%s", (document_id,)).fetchone()
            if not previous:
                raise HTTPException(404, "Không tìm thấy văn bản")
            data.update(previous)
        else:
            data.update(legal_status="DRAFT" if payload.legal_status == "DRAFT" else "UNVERIFIED",
                        applicability="UNVERIFIED")
    if data["source_url"]:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (data["source_url"],))
        exists = conn.execute(
            """SELECT id FROM documents WHERE source_url=%s AND archived_at IS NULL
            AND id IS DISTINCT FROM %s::uuid LIMIT 1""", (data["source_url"], document_id),
        ).fetchone()
        if exists:
            raise HTTPException(409, "Đường link đã có trong danh mục")
    return data


@router.post("", status_code=201)
def create_document(payload: DocumentCreate, actor: dict = Depends(editors)):
    try:
        with connection() as conn:
            data = editable_fields(conn, payload, actor)
            placeholders = ", ".join(f"%({key})s" for key in FIELDS)
            doc = conn.execute(f"INSERT INTO documents ({', '.join(FIELDS)}) VALUES ({placeholders}) RETURNING {PUBLIC}", data).fetchone()
            audit(conn, actor, "DOCUMENT_CREATED", "document", doc["id"], {"fields": payload.model_dump(mode="json")})
            label = "Dự thảo mới: " if doc["legal_status"] == "DRAFT" else "Văn bản mới: "
            conn.execute("INSERT INTO alerts (document_id,alert_type,severity,message) VALUES (%s,'NEW_DOCUMENT','LOW',%s)",
                         (doc["id"], label + doc["title"]))
            return doc
    except UniqueViolation as exc:
        raise HTTPException(409, "Mã nội bộ đã tồn tại") from exc


@router.put("/{document_id}")
def update_document(document_id: UUID, payload: DocumentUpdate, actor: dict = Depends(editors)):
    try:
        revision = datetime.fromisoformat(payload.revision)
    except ValueError as exc:
        raise HTTPException(422, "Phiên bản chỉnh sửa không hợp lệ") from exc
    try:
        with connection() as conn:
            data = editable_fields(conn, payload, actor, document_id)
            previous = conn.execute("SELECT legal_status FROM documents WHERE id=%s", (document_id,)).fetchone()
            assignments = ", ".join(f"{key}=%({key})s" for key in FIELDS)
            row = conn.execute(
                f"""UPDATE documents SET {assignments}, review_state='PENDING'
                WHERE id=%(id)s AND updated_at=%(revision)s AND archived_at IS NULL RETURNING {PUBLIC}""",
                {**data, "id": document_id, "revision": revision},
            ).fetchone()
            if not row:
                raise HTTPException(409, "Văn bản đã thay đổi. Vui lòng tải lại trước khi lưu.")
            audit(conn, actor, "DOCUMENT_UPDATED", "document", document_id, {"fields": payload.model_dump(mode="json")})
            if previous and previous["legal_status"] != row["legal_status"]:
                conn.execute("INSERT INTO alerts (document_id,alert_type,severity,message) VALUES (%s,'STATUS_CHANGED','MEDIUM',%s)",
                             (document_id, "Tình trạng pháp lý vừa cập nhật: " + row["title"]))
            return row
    except UniqueViolation as exc:
        raise HTTPException(409, "Mã nội bộ đã tồn tại") from exc


@router.post("/{document_id}/archive", status_code=204)
@router.post("/{document_id}/restore", status_code=204)
def archive_or_restore(document_id: UUID, request: Request,
                       actor: dict = Depends(editors)):
    restore = request.url.path.endswith("/restore")
    with connection() as conn:
        row = conn.execute("SELECT source_url FROM documents WHERE id=%s", (document_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Không tìm thấy văn bản")
        if restore and row["source_url"]:
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (row["source_url"],))
            if conn.execute("SELECT 1 FROM documents WHERE id<>%s AND source_url=%s AND archived_at IS NULL",
                            (document_id, row["source_url"])).fetchone():
                raise HTTPException(409, "Đường link đã có trong danh mục")
        conn.execute("UPDATE documents SET archived_at=CASE WHEN %s THEN NULL ELSE now() END WHERE id=%s", (restore, document_id))
        audit(conn, actor, "DOCUMENT_RESTORED" if restore else "DOCUMENT_ARCHIVED", "document", document_id)


@router.get("/{document_id}/history")
def document_history(document_id: UUID, _: dict = Depends(current_user)):
    with connection() as conn:
        return conn.execute("""SELECT actor,action,detail,created_at FROM audit_events
            WHERE entity_type='document' AND entity_id=%s ORDER BY created_at DESC LIMIT 100""", (str(document_id),)).fetchall()


@router.post("/{document_id}/review")
def review(document_id: UUID, payload: ReviewDecision, actor: dict = Depends(reviewers)):
    with connection() as conn:
        if not conn.execute("UPDATE documents SET review_state=%s WHERE id=%s AND archived_at IS NULL",
                            (payload.decision, document_id)).rowcount:
            raise HTTPException(404, "Không tìm thấy văn bản")
        audit(conn, actor, "DOCUMENT_" + payload.decision, "document", document_id, {"note": payload.note})
        return {"status": payload.decision}


def source_path(value: str | None) -> Path:
    if value:
        path = Path(value).resolve()
        if DOCUMENT_ROOT in path.parents and path.is_file() and path.suffix in MEDIA:
            return path
    raise HTTPException(404, "Chưa có tệp nguồn hoặc tệp đã mất")


def validate_upload(path: Path, suffix: str) -> None:
    try:
        if suffix == ".pdf":
            with path.open("rb") as stream:
                if not stream.read(5) == b"%PDF-":
                    raise ValueError
        elif suffix == ".docx":
            with ZipFile(path) as archive:
                entries = archive.infolist()
                if ("word/document.xml" not in archive.namelist() or len(entries) > 1000
                        or sum(entry.file_size for entry in entries) > 50 * 1024**2
                        or any(entry.filename.lower().endswith("vbaproject.bin") for entry in entries)):
                    raise ValueError
        else:
            path.read_text(encoding="utf-8")
    except (ValueError, BadZipFile) as exc:
        raise HTTPException(415, "Nội dung không khớp định dạng tệp") from exc


@router.post("/{document_id}/file", status_code=201)
def upload(document_id: UUID, file: UploadFile = File(...), actor: dict = Depends(editors)):
    filename = Path((file.filename or "").replace("\\", "/")).name
    suffix = Path(filename).suffix.lower()
    if suffix not in MEDIA or len(filename) > 255 or any(ord(char) < 32 for char in filename):
        raise HTTPException(415, "Chỉ nhận PDF, DOCX, TXT hoặc Markdown")
    DOCUMENT_ROOT.mkdir(parents=True, exist_ok=True)
    path = DOCUMENT_ROOT / f"{document_id}-{uuid4().hex}{suffix}"
    digest, size = sha256(), 0
    try:
        with path.open("xb") as stream:
            while chunk := file.file.read(1024**2):
                size += len(chunk)
                if size > MAX_FILE:
                    raise HTTPException(413, "Tệp vượt quá 20 MB")
                digest.update(chunk)
                stream.write(chunk)
        if size == 0:
            raise HTTPException(422, "Tệp trống")
        validate_upload(path, suffix)
        checksum = digest.hexdigest()
        with connection() as conn:
            if not conn.execute("""UPDATE documents SET source_file_path=%s,source_filename=%s,source_sha256=%s
                WHERE id=%s AND archived_at IS NULL""", (str(path), filename, checksum, document_id)).rowcount:
                raise HTTPException(404, "Không tìm thấy văn bản")
            audit(conn, actor, "SOURCE_FILE_UPLOADED", "document", document_id, {"sha256": checksum, "filename": filename, "path": path.name})
    except UniqueViolation as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(409, "Nội dung tệp đã được lưu ở văn bản khác") from exc
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {"sha256": checksum}


@router.get("/{document_id}/file")
def download(document_id: UUID, _: dict = Depends(current_user)):
    with connection() as conn:
        row = conn.execute("SELECT source_file_path, source_filename FROM documents WHERE id=%s AND archived_at IS NULL",
                           (document_id,)).fetchone()
    path = source_path(row["source_file_path"] if row else None)
    return FileResponse(path, media_type=MEDIA[path.suffix], filename=row["source_filename"] or path.name,
                        content_disposition_type="inline" if path.suffix == ".pdf" else "attachment")
