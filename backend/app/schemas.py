from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

LegalStatus = Literal["DRAFT", "PENDING_EFFECT", "ACTIVE", "PARTIALLY_REPEALED", "REPEALED", "SUSPENDED", "UNVERIFIED"]


class DocumentCreate(BaseModel):
    internal_code: str = Field(min_length=3, max_length=100)
    title: str = Field(min_length=3, max_length=1000)
    document_type: str = Field(min_length=2, max_length=100)
    reference_number: str | None = Field(default=None, max_length=100)
    issuing_authority: str | None = Field(default=None, max_length=500)
    issued_on: date | None = None
    effective_on: date | None = None
    expires_on: date | None = None
    legal_status: LegalStatus = "UNVERIFIED"
    applicability: str = Field(default="UNVERIFIED", max_length=100)
    primary_domain: str | None = Field(default=None, max_length=200)
    departments: list[str] = Field(default_factory=list, max_length=20)
    source_url: HttpUrl | None = None
    notes: str | None = Field(default=None, max_length=10000)


class ReviewDecision(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    note: str = Field(min_length=3, max_length=5000)

