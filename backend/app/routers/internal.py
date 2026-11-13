"""안쪽 프로그램이 부르는 입구 — 사람이 아니라 사내망 맥의 작은 프로그램이 부른다.

POST /api/internal/leave-sync — 그룹웨어 휴가 받기 (scripts/gw-leave-sync.py 가 보낸다)
- 헤더 X-Leave-Sync-Token 이 설정값 LEAVE_SYNC_TOKEN 과 같아야 한다(상수 시간 비교).
  설정이 비면 입구가 꺼져 있다(503) · 헤더가 없으면 401 · 다르면 403.
- 본문 {"from","to","items":[{"email","day","start":"HH:MM","end":"HH:MM","kind","doc"}]} — 512KB · 2,000줄까지.
  from~to 날짜의 그룹웨어 줄을 통째로 바꿔 넣는다(여러 번 보내도 같다). 응답 {"saved","unmatched","days"}.
- 메일 같은 개인정보는 로그 · 오류 응답에 넣지 않는다.
"""

from __future__ import annotations

import hmac
from datetime import date, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.deps import get_redis_client
from app.core.errors import raise_app_error
from app.database import get_db
from app.services import leave as leave_service

router = APIRouter(prefix="/internal", tags=["internal"])

MAX_BODY_BYTES = 512 * 1024
MAX_ITEMS = 2000
MAX_DAYS = 31  # 한 번에 바꿔 넣는 날짜 수


class LeaveItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: str = Field(min_length=3, max_length=255)
    day: date
    start: str
    end: str
    kind: Literal["VACATION", "HALF", "QUARTER", "SPECIAL"]
    doc: Optional[str] = Field(None, max_length=40)

    @field_validator("start")
    @classmethod
    def _start(cls, v: str) -> str:
        leave_service.parse_hhmm(v)
        return v

    @field_validator("end")
    @classmethod
    def _end(cls, v: str) -> str:
        leave_service.parse_hhmm(v, allow_24=True)
        return v

    @model_validator(mode="after")
    def _order(self):
        if leave_service.parse_hhmm(self.start) >= leave_service.parse_hhmm(self.end, allow_24=True):
            raise ValueError("start 가 end 보다 앞서야 해요")
        return self


class LeaveSyncBody(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    items: List[LeaveItem] = Field(max_length=MAX_ITEMS)

    @model_validator(mode="after")
    def _range(self):
        if self.from_ > self.to:
            raise ValueError("from 이 to 보다 늦어요")
        if self.to - self.from_ > timedelta(days=MAX_DAYS - 1):
            raise ValueError(f"한 번에 {MAX_DAYS}일까지만 보낼 수 있어요")
        if any(not (self.from_ <= it.day <= self.to) for it in self.items):
            raise ValueError("from~to 밖의 날짜가 있어요")
        return self


def check_token(request: Request) -> None:
    """X-Leave-Sync-Token 확인 — 비어 있는 설정이면 입구 꺼짐."""
    expected = (get_settings().leave_sync_token or "").strip()
    if not expected:
        raise_app_error("LEAVE_SYNC_OFF", 503)
    got = request.headers.get("x-leave-sync-token")
    if not got:
        raise_app_error("UNAUTHORIZED", 401)
    if not hmac.compare_digest(got.strip().encode("utf-8"), expected.encode("utf-8")):
        raise_app_error("FORBIDDEN", 403)


async def read_body(request: Request) -> LeaveSyncBody:
    """본문 읽기 — 512KB 넘으면 413, 모양이 틀리면 422(받은 값은 되돌려 주지 않는다)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise_app_error("LEAVE_SYNC_TOO_BIG", 413)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY_BYTES:
            raise_app_error("LEAVE_SYNC_TOO_BIG", 413)
    try:
        return LeaveSyncBody.model_validate_json(bytes(raw))
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False, include_context=False, include_input=False)) from None


@router.post("/leave-sync")
async def leave_sync(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
):
    check_token(request)
    body = await read_body(request)
    return {"data": await leave_service.sync_leaves(db, redis, body.from_, body.to, body.items)}
