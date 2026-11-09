from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .accounts import audit, current_user, require_roles
from .db import connection

router = APIRouter(prefix="/api")
reviewers = require_roles("admin", "legal")


class Department(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=5000)
    keywords: str = Field(default="", max_length=2000)


@router.get("/departments")
def departments(_: dict = Depends(current_user)):
    with connection() as conn:
        return conn.execute("SELECT * FROM departments ORDER BY name").fetchall()


@router.post("/departments", status_code=201)
def create_department(payload: Department, user: dict = Depends(require_roles("admin"))):
    with connection() as conn:
        row = conn.execute("""INSERT INTO departments (name,description,keywords) VALUES (%s,%s,%s)
            ON CONFLICT (name) DO NOTHING RETURNING *""", (payload.name, payload.description, payload.keywords)).fetchone()
        if not row:
            raise HTTPException(409, "Tên phòng ban đã tồn tại")
        audit(conn, user, "DEPARTMENT_CREATED", "department", row["id"])
        return row


@router.put("/departments/{department_id}")
def update_department(department_id: UUID, payload: Department, user: dict = Depends(require_roles("admin"))):
    from psycopg.errors import UniqueViolation
    try:
        with connection() as conn:
            row = conn.execute("""UPDATE departments SET name=%s,description=%s,keywords=%s WHERE id=%s RETURNING *""",
                               (payload.name, payload.description, payload.keywords, department_id)).fetchone()
            if not row:
                raise HTTPException(404, "Phòng ban không tồn tại")
            audit(conn, user, "DEPARTMENT_UPDATED", "department", department_id)
            return row
    except UniqueViolation as exc:
        raise HTTPException(409, "Tên phòng ban đã tồn tại") from exc


class TaskCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    document_id: UUID
    requirement: str = Field(min_length=3, max_length=3000)
    assignee_id: UUID
    internal_deadline: date


class TaskStatus(BaseModel):
    status: Literal["OPEN", "IN_PROGRESS", "DONE"]


def task_scope(user):
    if user["role"] in {"admin", "legal"}:
        return "TRUE", ()
    if user["role"] == "manager":
        return "(p.department_id=%s OR p.assignee_id=%s)", (user["department_id"], user["id"])
    return "p.assignee_id=%s", (user["id"],)


@router.get("/tasks")
def tasks(user: dict = Depends(current_user)):
    scope, args = task_scope(user)
    with connection() as conn:
        return conn.execute(f"""SELECT p.id,p.document_id,p.requirement,p.internal_deadline,p.status,
            d.title,a.display_name AS assignee,dep.name AS department
            FROM implementation_plans p JOIN documents d ON d.id=p.document_id
            LEFT JOIN accounts a ON a.id=p.assignee_id LEFT JOIN departments dep ON dep.id=p.department_id
            WHERE {scope} ORDER BY p.internal_deadline NULLS LAST,p.created_at DESC""", args).fetchall()


@router.post("/tasks", status_code=201)
def create_task(payload: TaskCreate, user: dict = Depends(reviewers)):
    with connection() as conn:
        assignee = conn.execute("SELECT department_id FROM accounts WHERE id=%s AND enabled", (payload.assignee_id,)).fetchone()
        if not assignee or not conn.execute("SELECT 1 FROM documents WHERE id=%s AND archived_at IS NULL",
                                           (payload.document_id,)).fetchone():
            raise HTTPException(422, "Người xử lý hoặc văn bản không tồn tại")
        row = conn.execute("""INSERT INTO implementation_plans
            (document_id,requirement,assignee_id,department_id,internal_deadline) VALUES (%s,%s,%s,%s,%s) RETURNING id""",
            (payload.document_id, payload.requirement, payload.assignee_id, assignee["department_id"],
             payload.internal_deadline)).fetchone()
        audit(conn, user, "TASK_CREATED", "task", row["id"])
        return row


@router.patch("/tasks/{task_id}")
def update_task(task_id: UUID, payload: TaskStatus, user: dict = Depends(current_user)):
    scope, args = task_scope(user)
    with connection() as conn:
        row = conn.execute(f"UPDATE implementation_plans p SET status=%s WHERE id=%s AND {scope} RETURNING id",
                           (payload.status, task_id, *args)).fetchone()
        if not row:
            raise HTTPException(404, "Không tìm thấy công việc trong phạm vi được giao")
        audit(conn, user, "TASK_STATUS", "task", task_id, {"status": payload.status})
        return row


@router.get("/reminders")
def reminder_history(_: dict = Depends(reviewers)):
    with connection() as conn:
        return conn.execute("""SELECT r.*, p.requirement FROM reminder_deliveries r
            JOIN implementation_plans p ON p.id=r.task_id ORDER BY r.updated_at DESC LIMIT 100""").fetchall()
