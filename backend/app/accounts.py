import hashlib
import hmac
import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .config import ADMIN_TOKEN
from .db import connection

router = APIRouter(prefix="/api")
Role = Literal["admin", "legal", "manager", "employee"]


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._@-]+$")
    password: str = Field(min_length=12, max_length=256)


class AccountCreate(Credentials):
    display_name: str = Field(min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$")
    role: Role = "employee"
    department_id: UUID | None = None


def password_hash(password: str, salt: str) -> str:
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024**2)
    return f"{salt}:{digest.hex()}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Vui lòng đăng nhập")
    with connection() as conn:
        user = conn.execute(
            """SELECT a.id,a.username,a.display_name,a.role,a.department_id
            FROM sessions s JOIN accounts a ON a.id=s.account_id
            WHERE s.digest=%s AND s.expires_at>now() AND a.enabled""",
            (token_hash(authorization[7:]),),
        ).fetchone()
    if not user:
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    return user


def require_roles(*roles: Role):
    def check(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Anh/chị không có quyền thực hiện thao tác này")
        return user
    return check


def insert_account(conn, payload: AccountCreate) -> dict:
    if payload.department_id and not conn.execute("SELECT 1 FROM departments WHERE id=%s", (payload.department_id,)).fetchone():
        raise HTTPException(422, "Phòng ban không tồn tại")
    if payload.role == "manager" and not payload.department_id:
        raise HTTPException(422, "Quản lý phòng ban cần được gán phòng ban")
    user = conn.execute(
        """INSERT INTO accounts (username,display_name,email,password_hash,role,department_id)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (username) DO NOTHING
        RETURNING id,username,display_name,role,department_id""",
        (payload.username.lower(), payload.display_name, payload.email,
         password_hash(payload.password, secrets.token_hex(16)), payload.role, payload.department_id),
    ).fetchone()
    if not user:
        raise HTTPException(409, "Tên đăng nhập đã tồn tại")
    return user


@router.get("/auth/setup")
def setup_status():
    with connection() as conn:
        return {"required": not conn.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()}


@router.post("/auth/setup", status_code=201)
def setup(payload: AccountCreate, authorization: str = Header(default="")):
    if len(ADMIN_TOKEN) < 12 or ADMIN_TOKEN.startswith("CHANGEME") or not hmac.compare_digest(
        authorization.encode(), ("Bearer " + ADMIN_TOKEN).encode()
    ):
        raise HTTPException(401, "Mã thiết lập không hợp lệ")
    with connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(73020412)")
        if conn.execute("SELECT 1 FROM accounts LIMIT 1").fetchone():
            raise HTTPException(409, "Hệ thống đã được thiết lập")
        user = insert_account(conn, payload.model_copy(update={"role": "admin"}))
        audit(conn, user, "ACCOUNT_BOOTSTRAPPED", "account", user["id"])
        return user


@router.post("/auth/login")
def login(payload: Credentials):
    username = payload.username.lower()
    with connection() as conn:
        conn.execute("DELETE FROM login_attempts WHERE expires_at<=now()")
        attempt = conn.execute(
            """INSERT INTO login_attempts VALUES (%s,1,now()+interval '15 minutes')
            ON CONFLICT (bucket) DO UPDATE SET count=login_attempts.count+1
            WHERE login_attempts.count<10 RETURNING count""", (username,),
        ).fetchone()
        user = conn.execute("SELECT * FROM accounts WHERE username=%s", (username,)).fetchone()
    if not attempt:
        raise HTTPException(429, "Thử lại sau 15 phút")
    stored = user["password_hash"] if user else ("00" * 16 + ":" + "00" * 64)
    if not hmac.compare_digest(stored, password_hash(payload.password, stored.split(":")[0])) or not user or not user["enabled"]:
        raise HTTPException(401, "Tên đăng nhập hoặc mật khẩu không đúng")
    token = secrets.token_urlsafe(32)
    with connection() as conn:
        conn.execute("DELETE FROM login_attempts WHERE bucket=%s", (username,))
        conn.execute("DELETE FROM sessions WHERE expires_at<=now()")
        conn.execute("INSERT INTO sessions VALUES (%s,%s,now()+interval '12 hours')", (token_hash(token), user["id"]))
    return {"token": token}


@router.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return user


@router.get("/accounts")
def list_accounts(_: dict = Depends(require_roles("admin", "legal"))):
    with connection() as conn:
        return conn.execute("SELECT id,username,display_name,role,department_id FROM accounts WHERE enabled ORDER BY display_name").fetchall()


@router.post("/accounts", status_code=201)
def create_account(payload: AccountCreate, actor: dict = Depends(require_roles("admin"))):
    with connection() as conn:
        user = insert_account(conn, payload)
        audit(conn, actor, "ACCOUNT_CREATED", "account", user["id"])
        return user


@router.post("/auth/logout", status_code=204)
def logout(authorization: str = Header(), _: dict = Depends(current_user)):
    with connection() as conn:
        conn.execute("DELETE FROM sessions WHERE digest=%s", (token_hash(authorization[7:]),))


def audit(conn, user: dict, action: str, entity: str, entity_id, detail=None):
    from psycopg.types.json import Jsonb
    conn.execute(
        "INSERT INTO audit_events (actor,action,entity_type,entity_id,detail) VALUES (%s,%s,%s,%s,%s)",
        (user["username"], action, entity, str(entity_id), Jsonb(detail or {})),
    )
