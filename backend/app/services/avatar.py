from __future__ import annotations

import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
AVATAR_DIR = BACKEND_ROOT / "data" / "avatars"

# UI 최대 lg(56px)·Retina(2x) 기준 — 작은 썸네일을 키우면 뿌옇게 보임
GRAPH_PHOTO_URLS = (
    "https://graph.microsoft.com/v1.0/me/photos/360x360/$value",
    "https://graph.microsoft.com/v1.0/me/photos/240x240/$value",
    "https://graph.microsoft.com/v1.0/me/photos/120x120/$value",
    "https://graph.microsoft.com/v1.0/me/photo/$value",
)

MICROSOFT_TIMEOUT = httpx.Timeout(connect=15.0, read=30.0, write=15.0, pool=15.0)


def _avatar_path(member_id: int) -> Path:
    return AVATAR_DIR / f"{member_id}.jpg"


def avatar_path(member_id: int) -> Path:
    return _avatar_path(member_id)


def has_avatar(member_id: int) -> bool:
    return _avatar_path(member_id).is_file()


def avatar_public_url(member_id: int) -> str | None:
    """로그인한 본인 프로필용 — /api/me/avatar 는 세션 회원 사진만 반환한다."""
    path = _avatar_path(member_id)
    if not path.is_file():
        return None
    return f"/api/me/avatar?v={int(path.stat().st_mtime)}"


def member_avatar_url(member_id: int) -> str | None:
    """다른 회원 아바타(양도 후보 등) — member_id 별 공개 URL."""
    path = _avatar_path(member_id)
    if not path.is_file():
        return None
    return f"/api/members/{member_id}/avatar?v={int(path.stat().st_mtime)}"


def admin_member_avatar_url(member_id: int) -> str | None:
    path = _avatar_path(member_id)
    if not path.is_file():
        return None
    return f"/api/admin/members/{member_id}/avatar?v={int(path.stat().st_mtime)}"


def save_avatar(member_id: int, data: bytes) -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    _avatar_path(member_id).write_bytes(data)


async def fetch_graph_photo(access_token: str) -> bytes | None:
    headers = {"Authorization": f"Bearer {access_token}"}
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=0)
    async with httpx.AsyncClient(timeout=MICROSOFT_TIMEOUT, transport=transport) as client:
        for url in GRAPH_PHOTO_URLS:
            try:
                resp = await client.get(url, headers=headers)
            except httpx.RequestError as exc:
                logger.warning("Microsoft Graph photo request failed (%s): %s", url, exc)
                continue
            if resp.status_code == 200 and resp.content:
                return resp.content
            if resp.status_code == 404:
                continue
            logger.warning(
                "Microsoft Graph photo unexpected status %s for %s",
                resp.status_code,
                url,
            )
    return None


async def fetch_and_store_from_graph(access_token: str, member_id: int) -> bool:
    data = await fetch_graph_photo(access_token)
    if not data:
        return False
    save_avatar(member_id, data)
    return True
