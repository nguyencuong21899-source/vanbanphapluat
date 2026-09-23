from __future__ import annotations

from fastapi import Header, HTTPException, status

from .config import ADMIN_TOKEN


def require_admin(authorization: str | None = Header(default=None)) -> str:
    if authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Xác thực không hợp lệ")
    return "system-admin"

