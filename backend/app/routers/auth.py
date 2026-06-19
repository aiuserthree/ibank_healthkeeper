from __future__ import annotations

import logging
import secrets
from typing import Annotated, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import format_kst_iso
from app.config import get_settings
from app.core.deps import get_current_active_member, get_redis_client
from app.core.session import create_member_session, delete_member_session
from app.database import get_db
from app.models import Member
from app.services.legacy_usage import (
    get_member_apply_total,
    get_member_total_uses,
    count_member_usage_history,
    list_member_usage_history,
)
from app.services import account as account_service
from app.services.sso import (
    STATE_PREFIX,
    SSOAuthError,
    SSOClaims,
    generate_pkce,
    get_sso_provider,
    pop_sso_code,
    pop_sso_state,
    sso_config_error_message,
    store_sso_code,
    store_sso_state,
)

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(prefix="/me", tags=["me"])
settings = get_settings()
logger = logging.getLogger(__name__)


def _safe_return_path(return_to: Optional[str]) -> str:
    if not return_to:
        return settings.sso_success_path
    if return_to.startswith("/") and ".." not in return_to:
        return return_to
    return settings.sso_success_path


def _login_error_redirect(message: str) -> RedirectResponse:
    params = urlencode({"error": message})
    return RedirectResponse(
        url=f"{settings.app_base_url}/login?{params}",
        status_code=302,
    )


@router.get("/sso/login")
async def sso_login(
    returnTo: Optional[str] = Query(None),
    redis: Redis = Depends(get_redis_client),
):
    config_error = sso_config_error_message()
    if config_error:
        return _login_error_redirect(config_error)
    state = secrets.token_urlsafe(32)
    verifier, challenge = generate_pkce()
    await store_sso_state(redis, state, verifier=verifier, return_to=_safe_return_path(returnTo))
    provider = get_sso_provider()
    url = await provider.build_authorize_url(state, challenge)
    return RedirectResponse(url=url, status_code=302)


@router.get("/sso/mock", response_class=HTMLResponse)
async def sso_mock_page(state: str = Query(...)):
    from app.services.sso import MockSSOProvider

    users_html = ""
    for u in MockSSOProvider.MOCK_USERS:
        params = urlencode(
            {
                "state": state,
                "oid": u["oid"],
                "email": u["email"],
                "name": u["name"],
                "department": u.get("department", ""),
                "position": u.get("position", ""),
            }
        )
        users_html += f"""
            <a class="user-btn" href="/api/auth/sso/mock/complete?{params}">
              <strong>{u['name']}</strong><br><span>{u['email']}</span>
            </a>"""

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock SSO — 헬스키퍼</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #f8f9fb; margin: 0; padding: 40px 16px; }}
  .wrap {{ max-width: 420px; margin: 0 auto; }}
  h1 {{ font-size: 22px; color: #0b3558; }}
  p {{ color: #64748b; font-size: 14px; }}
  .user-btn {{ display: block; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 16px; margin: 12px 0; text-decoration: none; color: #0b3558; }}
  .user-btn:hover {{ border-color: #006bff; }}
  .user-btn span {{ font-size: 13px; color: #64748b; }}
</style></head><body><div class="wrap">
  <h1>Mock Microsoft SSO</h1>
  <p>개발용 계정을 선택하세요. (Entra ID 연결 전)</p>
  {users_html}
</div></body></html>"""


@router.get("/sso/mock/complete")
async def sso_mock_complete(
    state: str = Query(...),
    oid: str = Query(...),
    email: str = Query(...),
    name: str = Query(...),
    department: str = Query(""),
    position: str = Query(""),
    redis: Redis = Depends(get_redis_client),
):
    if not await redis.get(f"{STATE_PREFIX}{state}"):
        return _login_error_redirect("로그인 세션이 만료되었습니다. 다시 시도해주세요.")

    code = secrets.token_urlsafe(32)
    await store_sso_code(
        redis,
        code,
        SSOClaims(
            oid=oid,
            email=email.lower(),
            name=name,
            department=department or None,
            position=position or None,
        ),
    )
    params = urlencode({"code": code, "state": state})
    return RedirectResponse(url=f"/api/auth/sso/callback?{params}", status_code=302)


@router.get("/sso/callback")
async def sso_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
):
    stored = await pop_sso_state(redis, state)
    if not stored:
        return _login_error_redirect("로그인 세션이 만료되었습니다. 다시 시도해주세요.")

    return_to = stored.get("returnTo", settings.sso_success_path)
    verifier = stored.get("verifier", "")

    mock_claims = await pop_sso_code(redis, code)
    if mock_claims:
        claims = mock_claims
    else:
        provider = get_sso_provider()
        try:
            claims = await provider.exchange_code(code, verifier)
        except SSOAuthError as exc:
            logger.error("SSO failed: %s (%s)", exc.message, exc.detail)
            msg = exc.message
            if settings.debug and exc.detail:
                msg = f"{exc.message} ({exc.detail})"
            return _login_error_redirect(msg)
        except httpx.RequestError as exc:
            logger.error("SSO Microsoft network error: %s", exc)
            return _login_error_redirect(
                "Microsoft 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요."
            )
        except Exception:
            logger.exception("SSO callback unexpected error")
            return _login_error_redirect("Microsoft 로그인에 실패했습니다.")

    try:
        member = await account_service.upsert_member_from_sso(
            db,
            oid=claims.oid,
            email=claims.email,
            name=claims.name,
            department=claims.department,
            position=claims.position,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        msg = detail.get("error", {}).get("message", "로그인에 실패했습니다.")
        return _login_error_redirect(msg)

    session_id = await create_member_session(redis, member.id)
    redirect = RedirectResponse(
        url=f"{settings.app_base_url}{return_to}",
        status_code=302,
    )
    redirect.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_max_age,
    )
    return redirect


@router.get("/sso/status")
async def sso_status():
    """DEBUG=true 일 때만 SSO 설정 상태 확인 (로컬 Entra 연동 점검용)."""
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    missing = settings.sso_missing_fields()
    return {
        "data": {
            "provider": settings.sso_provider,
            "ready": settings.sso_ready(),
            "missing": missing,
            "appBaseUrl": settings.app_base_url,
            "redirectUri": settings.entra_redirect_uri,
            "allowedDomain": settings.sso_allowed_domain or None,
            "allowedDomains": settings.allowed_email_domains() or None,
            "loginUrl": f"{settings.app_base_url}/api/auth/sso/login",
        }
    }


@router.post("/logout")
async def logout(
    response: Response,
    redis: Redis = Depends(get_redis_client),
    hk_session: Annotated[Optional[str], Cookie(alias=settings.session_cookie_name)] = None,
):
    if hk_session:
        await delete_member_session(redis, hk_session)
    response.delete_cookie(settings.session_cookie_name)
    return {"data": {"message": "로그아웃되었습니다."}}


@me_router.get("/profile")
async def profile(
    member: Member = Depends(get_current_active_member),
    db: AsyncSession = Depends(get_db),
):
    total_uses = await get_member_total_uses(db, member)
    apply_total = await get_member_apply_total(db, member)
    usage_history_total = await count_member_usage_history(db, member)

    return {
        "data": {
            "name": member.name,
            "email": member.email,
            "department": member.department,
            "position": member.position,
            "lastLoginAt": format_kst_iso(member.last_login_at),
            "lastUsedDate": member.last_used_date.isoformat() if member.last_used_date else None,
            "totalUses": total_uses,
            "applyTotal": apply_total,
            "usageHistoryTotal": usage_history_total,
            "createdAt": format_kst_iso(member.created_at),
        }
    }


@me_router.get("/usage-history")
async def usage_history(
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data = await list_member_usage_history(db, member, page=page, page_size=pageSize)
    return {"data": data}


@me_router.get("/legacy-usages")
async def legacy_usages(
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """@deprecated — /me/usage-history 사용"""
    data = await list_member_usage_history(db, member, page=page, page_size=pageSize)
    return {"data": data}


@me_router.delete("")
async def withdraw(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    await account_service.withdraw(db, member)
    return {"data": {"message": "탈퇴가 완료되었습니다."}}
