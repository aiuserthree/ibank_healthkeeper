from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import asyncio
from json import JSONDecodeError

import httpx
import jwt
from redis.asyncio import Redis

from app.config import get_settings
from app.core.errors import raise_app_error

logger = logging.getLogger(__name__)

STATE_PREFIX = "sso:state:"
CODE_PREFIX = "sso:code:"
STATE_TTL = 600
MICROSOFT_TIMEOUT = httpx.Timeout(connect=15.0, read=30.0, write=15.0, pool=15.0)
MICROSOFT_RETRIES = 3


def _microsoft_http_client() -> httpx.AsyncClient:
    # 서버 IPv6 미지원 환경에서 login.microsoftonline.com 연결 지연 방지
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=0)
    return httpx.AsyncClient(timeout=MICROSOFT_TIMEOUT, transport=transport)


async def _post_with_retry(client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(MICROSOFT_RETRIES):
        try:
            return await client.post(url, **kwargs)
        except httpx.RequestError as exc:
            last_exc = exc
            logger.warning(
                "Microsoft POST attempt %s/%s failed: %s",
                attempt + 1,
                MICROSOFT_RETRIES,
                exc,
            )
            if attempt + 1 >= MICROSOFT_RETRIES:
                break
            await asyncio.sleep(0.5 * (attempt + 1))
    raise SSOAuthError(
        "Microsoft 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.",
        detail=str(last_exc) if last_exc else "",
    ) from last_exc


async def _post_form_via_curl(url: str, data: dict[str, str]) -> tuple[int, str]:
    """httpx가 gunicorn 워커에서 불안정할 때 curl(IPv4)로 폼 POST."""
    cmd = [
        "curl",
        "-4",
        "-sS",
        "--connect-timeout",
        "15",
        "--max-time",
        "25",
        "-w",
        "\n__HTTP_CODE__:%{http_code}",
        "-X",
        "POST",
        url,
    ]
    for key, value in data.items():
        cmd.extend(["--data-urlencode", f"{key}={value}"])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        raise SSOAuthError(
            "Microsoft 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.",
            detail=err or f"curl exit {proc.returncode}",
        )

    raw = stdout.decode("utf-8", errors="replace")
    marker = "\n__HTTP_CODE__:"
    if marker not in raw:
        raise SSOAuthError(
            "Microsoft 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.",
            detail="unexpected curl response",
        )
    body, status_text = raw.rsplit(marker, 1)
    return int(status_text.strip()), body


async def _microsoft_post(url: str, data: dict[str, str]) -> tuple[int, dict[str, Any]]:
    """gunicorn 환경에서 httpx가 불안정하므로 curl(IPv4) 우선."""
    status, body = await _post_form_via_curl(url, data)
    try:
        return status, json.loads(body)
    except JSONDecodeError as exc:
        raise SSOAuthError(
            "Microsoft 로그인 응답을 해석하지 못했습니다.",
            detail=body[:200],
        ) from exc


async def _fetch_json_via_curl(url: str) -> dict[str, Any]:
    cmd = [
        "curl",
        "-4",
        "-sS",
        "--connect-timeout",
        "15",
        "--max-time",
        "25",
        url,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise SSOAuthError(
            "Microsoft ID 토큰 검증에 실패했습니다.",
            detail=stderr.decode("utf-8", errors="replace").strip(),
        )
    return json.loads(stdout.decode("utf-8", errors="replace"))


async def _decode_id_token(id_token: str, tenant: str, audience: str) -> dict[str, Any]:
    issuer = f"https://login.microsoftonline.com/{tenant}/v2.0"
    jwks_url = f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    if not kid:
        raise SSOAuthError("Microsoft ID 토큰 헤더가 올바르지 않습니다.")

    jwks = await _fetch_json_via_curl(jwks_url)

    signing_key = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            signing_key = jwt.PyJWK.from_dict(key).key
            break
    if signing_key is None:
        raise SSOAuthError("Microsoft ID 토큰 서명 키를 찾지 못했습니다.")

    return jwt.decode(
        id_token,
        signing_key,
        algorithms=["RS256"],
        audience=audience,
        issuer=issuer,
        leeway=60,
    )


async def _get_with_retry(client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response | None:
    last_exc: Exception | None = None
    for attempt in range(MICROSOFT_RETRIES):
        try:
            return await client.get(url, **kwargs)
        except httpx.TimeoutException as exc:
            last_exc = exc
            if attempt + 1 >= MICROSOFT_RETRIES:
                break
            await asyncio.sleep(0.5 * (attempt + 1))
    logger.warning("Microsoft Graph request timed out: %s", last_exc)
    return None


class SSOAuthError(Exception):
    """Raised when Microsoft Entra login fails; message is safe to show in debug mode."""

    def __init__(self, message: str, *, detail: str = ""):
        super().__init__(message)
        self.message = message
        self.detail = detail


@dataclass
class SSOClaims:
    oid: str
    email: str
    name: str
    department: str | None = None
    position: str | None = None
    access_token: str | None = None


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_pkce() -> tuple[str, str]:
    verifier = _b64url(secrets.token_bytes(32))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge


async def store_sso_state(
    redis: Redis,
    state: str,
    *,
    verifier: str,
    return_to: str,
) -> None:
    payload = json.dumps({"verifier": verifier, "returnTo": return_to})
    await redis.setex(f"{STATE_PREFIX}{state}", STATE_TTL, payload)


async def pop_sso_state(redis: Redis, state: str) -> dict[str, str] | None:
    key = f"{STATE_PREFIX}{state}"
    raw = await redis.get(key)
    if not raw:
        return None
    await redis.delete(key)
    return json.loads(raw)


async def store_sso_code(redis: Redis, code: str, claims: SSOClaims) -> None:
    payload = json.dumps(
        {
            "oid": claims.oid,
            "email": claims.email,
            "name": claims.name,
            "department": claims.department,
            "position": claims.position,
        }
    )
    await redis.setex(f"{CODE_PREFIX}{code}", STATE_TTL, payload)


async def pop_sso_code(redis: Redis, code: str) -> SSOClaims | None:
    key = f"{CODE_PREFIX}{code}"
    raw = await redis.get(key)
    if not raw:
        return None
    await redis.delete(key)
    data = json.loads(raw)
    return SSOClaims(
        oid=data["oid"],
        email=data["email"],
        name=data["name"],
        department=data.get("department"),
        position=data.get("position"),
    )


def validate_allowed_domain(email: str) -> None:
    settings = get_settings()
    domains = settings.allowed_email_domains()
    if not domains:
        return
    addr = email.strip().lower()
    if not any(addr.endswith(f"@{domain}") for domain in domains):
        raise_app_error("FORBIDDEN", 403)


def _matches_allowed(email: str, domains: list[str]) -> bool:
    addr = email.strip().lower()
    return any(addr.endswith(f"@{domain}") for domain in domains)


def resolve_sso_email(
    *,
    preferred_username: str = "",
    id_email: str = "",
    upn: str = "",
    graph_mail: str | None = None,
    graph_upn: str | None = None,
) -> str:
    """마이페이지·SSO 계정 이메일 — Entra 로그인 UPN(preferred_username) 우선. Graph mail은 사용하지 않음."""
    del graph_mail, graph_upn  # Graph mail(@ibank.co.kr)은 프로필 표시에 쓰지 않음
    settings = get_settings()
    allowed = settings.allowed_email_domains()
    candidates = [
        preferred_username.strip(),
        upn.strip(),
        id_email.strip(),
    ]
    if allowed:
        for candidate in candidates:
            if candidate and _matches_allowed(candidate, allowed):
                return candidate.lower()
    for candidate in candidates:
        if candidate:
            return candidate.lower()
    return ""


def sso_config_error_message() -> str | None:
    settings = get_settings()
    missing = settings.sso_missing_fields()
    if not missing:
        return None
    return f"Microsoft SSO 설정이 필요합니다: {', '.join(missing)} (.env 확인)"


class SSOProvider(ABC):
    @abstractmethod
    async def build_authorize_url(self, state: str, code_challenge: str) -> str:
        ...

    @abstractmethod
    async def exchange_code(self, code: str, verifier: str) -> SSOClaims:
        ...


class MockSSOProvider(SSOProvider):
    MOCK_USERS = [
        {
            "oid": "mock-001",
            "email": "minsu.kim@ibank.co.kr",
            "name": "김민수",
            "department": "디지털혁신부",
            "position": "과장",
        },
        {
            "oid": "mock-002",
            "email": "yuna.lee@ibank.co.kr",
            "name": "이유나",
            "department": "인사팀",
            "position": "대리",
        },
        {
            "oid": "mock-003",
            "email": "jiho.park@ibank.co.kr",
            "name": "박지호",
            "department": "IT운영팀",
            "position": "차장",
        },
    ]

    async def build_authorize_url(self, state: str, code_challenge: str) -> str:
        settings = get_settings()
        return f"{settings.app_base_url}/api/auth/sso/mock?state={state}"

    async def exchange_code(self, code: str, verifier: str) -> SSOClaims:
        raise_app_error("AUTH_FAILED", 401)


class EntraSSOProvider(SSOProvider):
    def __init__(self) -> None:
        self.settings = get_settings()
        self.tenant = self.settings.entra_tenant_id
        self.authority = f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0"

    async def build_authorize_url(self, state: str, code_challenge: str) -> str:
        params = {
            "client_id": self.settings.entra_client_id,
            "response_type": "code",
            "redirect_uri": self.settings.entra_redirect_uri,
            "response_mode": "query",
            "scope": "openid profile email User.Read",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self.authority}/authorize?{urlencode(params)}"

    async def exchange_code(self, code: str, verifier: str) -> SSOClaims:
        token_url = f"{self.authority}/token"
        data = {
            "client_id": self.settings.entra_client_id,
            "client_secret": self.settings.entra_client_secret,
            "code": code,
            "redirect_uri": self.settings.entra_redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
            "scope": "openid profile email User.Read",
        }
        status, tokens = await _microsoft_post(token_url, data)
        if status != 200:
            detail = tokens.get("error_description") or tokens.get("error") or str(tokens)
            logger.error("Entra token exchange failed (%s): %s", status, detail)
            raise SSOAuthError(
                "Microsoft 토큰 교환에 실패했습니다. 클라이언트 ID/비밀과 Redirect URI를 확인하세요.",
                detail=str(detail),
            )

        id_token = tokens.get("id_token")
        access_token = tokens.get("access_token")
        if not id_token:
            raise SSOAuthError("Microsoft 로그인 응답에 ID 토큰이 없습니다.")

        try:
            claims = await _decode_id_token(id_token, self.tenant, self.settings.entra_client_id)
        except SSOAuthError:
            raise
        except Exception as exc:
            logger.exception("Entra id_token validation failed")
            raise SSOAuthError("Microsoft ID 토큰 검증에 실패했습니다.", detail=str(exc)) from exc

        oid = claims.get("oid") or claims.get("sub")
        id_preferred = claims.get("preferred_username") or ""
        id_email = claims.get("email") or ""
        id_upn = claims.get("upn") or ""
        name = claims.get("name") or ""

        department: str | None = None
        position: str | None = None
        graph_mail: str | None = None
        graph_upn: str | None = None
        if access_token:
            try:
                async with _microsoft_http_client() as client:
                    me = await _get_with_retry(
                        client,
                        "https://graph.microsoft.com/v1.0/me"
                        "?$select=displayName,mail,userPrincipalName,department,jobTitle",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    if me and me.status_code == 200:
                        profile = me.json()
                        graph_mail = profile.get("mail") or None
                        graph_upn = profile.get("userPrincipalName") or None
                        name = name or profile.get("displayName") or name
                        department = profile.get("department") or None
                        position = profile.get("jobTitle") or None
                    elif me and me.status_code == 403:
                        logger.warning(
                            "Microsoft Graph /me returned 403 — Entra 앱에 User.Read 위임 권한이 있는지 확인하세요."
                        )
            except Exception:
                logger.exception("Microsoft Graph /me lookup failed")

        email = resolve_sso_email(
            preferred_username=id_preferred,
            id_email=id_email,
            upn=id_upn,
            graph_mail=graph_mail,
            graph_upn=graph_upn,
        )
        if not name and email:
            name = email.split("@")[0]

        if not oid or not email:
            logger.error("Entra claims missing oid/email: %s", {k: claims.get(k) for k in ("oid", "sub", "email", "preferred_username")})
            raise SSOAuthError(
                "Microsoft 계정에서 이메일 정보를 가져오지 못했습니다. API 권한(openid, profile, email)을 확인하세요.",
                detail=f"oid={oid}, email={email}",
            )
        return SSOClaims(
            oid=str(oid),
            email=email.lower(),
            name=name,
            department=department,
            position=position,
            access_token=access_token,
        )


def get_sso_provider() -> SSOProvider:
    settings = get_settings()
    if settings.sso_provider == "entra":
        return EntraSSOProvider()
    return MockSSOProvider()
