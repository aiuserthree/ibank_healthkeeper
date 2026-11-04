"""1:1 실시간 연결 — 대전 한 판의 두 사람 브라우저가 서버를 거쳐 짧은 메시지를 주고받는다 (실시간 게임만).

주소: /api/play/rt/{match_id} (웹소켓) · /api/play/rt-check/{match_id} (GET — 웹소켓이 거절됐을 때 이유 묻기)
- 로그인 쿠키로 회원을 확인하고, 그 회원이 진행 중(ACTIVE)인 실시간 게임(REALTIME_GAMES) 판의
  도전한 사람(host) · 받은 사람(guest)일 때만 연다.
- 들어올 수 없으면 받기(accept) 전에 닫는다 → 서버는 HTTP 403 으로 끝내고 프레임을 하나도 읽지 않는다.
  브라우저는 거절 이유를 볼 수 없으니 rt-check 로 물어본다 (rt.js 가 알아서 한다).
- 받기 전에 이 연결의 웹소켓 상한을 줄인다 (메시지 16KB · 대기 8개 · 압축 끔) — uvicorn 기본값(16MiB · 32개 · 압축)은 너무 크다.
- 일꾼 프로세스가 둘이라 두 사람이 다른 프로세스에 붙을 수 있다 → Redis pub/sub 으로 전한다.
  자리(host · guest)마다 채널이 하나씩 있고, 각 연결은 제 채널을 듣고 상대 채널에 보낸다.
- 들어와 있는지는 Redis 키(자리 키, TTL)로 본다. 연결이 살아 있는 동안 TTL 을 늘리고, 상대 키도 함께 본다.
- 한 회원은 한 판에 연결 하나 — 새로 붙으면 예전 연결(다른 창 · 다른 프로세스)을 닫는다.
- 메시지 내용은 믿지 않는다 — 4KB 이하 JSON 객체만, 초당 개수 제한, 다시 JSON 으로 만들어 넘긴다.
- 30초마다 다시 본다 — 판이 끝났거나, 로그아웃 · 세션 만료 · 탈퇴 · 정지됐으면 닫는다.

서버 → 브라우저 (모두 "sys" 키가 있다)
  {"sys":"hello","role":"host"|"guest","peerHere":bool}   붙자마자 한 번
  {"sys":"peer","here":bool}                               상대가 들어오거나(다시 붙어도) 나갔을 때
  {"sys":"ping"}                                           20초마다 (연결 유지)
  {"sys":"pong","t":…}                                     브라우저가 보낸 {"sys":"ping","t":…} 에 대한 답
  {"sys":"error","code":"TOO_BIG"|"BAD_MESSAGE"|"RATE_LIMIT"}  보낸 메시지를 버렸을 때 (전하지 않음)
  {"sys":"bye","code":…}                                   연결된 뒤 서버가 닫기 직전 (닫는 코드와 같은 이유)
  {...상대가 보낸 객체, "from":"peer"}                      상대 메시지 ("sys" 키 없음)

닫는 코드: 4401 로그인 필요 · 4403 들어갈 수 없음 · 4404 판 없음(내 판 아님 · 컴퓨터 판 · 실시간 게임 아님) · 4408 다른 창에서 엶 ·
          4409 진행 중인 판 아님 — 4400~4499 는 다시 붙어도 소용없다. 4000 은 오래 조용해서 닫음(다시 붙으면 된다)
          (받기 전 거절은 브라우저에 1006 으로 보인다 — 이유는 rt-check 가 같은 이름으로 알려 준다)
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, Tuple
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request, Response, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from sqlalchemy import select

from app.config import get_settings
from app.core.deps import get_redis_client
from app.core.session import get_member_session
from app.database import AsyncSessionLocal
from app.models import Member, MemberStatus
from app.models.game import GameMatch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/play", tags=["play-rt"])

# 실시간 연결을 여는 게임 (game_match.game 키). 새 실시간 게임을 대전에 올리면 여기에 키를 더한다
REALTIME_GAMES = ("soccer", "volley")

# 정해 둔 값 — 시험에서 줄여 쓸 수 있게 모듈 값으로 둔다 (실행 중에 읽는다)
MAX_BYTES = 4096          # 메시지 하나의 최대 크기 (UTF-8 바이트)
RATE_PER_SEC = 150        # 초당 채워지는 메시지 수 — 브라우저(rt.js)는 120 에서 스스로 멈추니, 망에서 몰려 와도 여유가 있다
BURST = 150               # 한꺼번에 보낼 수 있는 최대 개수 — 넘치면 버린다
FRAME_MAX_BYTES = 16384   # 웹소켓 단계에서 받는 메시지 하나의 상한 — 넘으면 서버가 1009 로 닫는다 (앱 단계 상한은 MAX_BYTES)
FRAME_QUEUE = 8           # 앱이 읽기 전에 쌓아 두는 메시지 수
HEARTBEAT_SEC = 10.0      # 자리 키 TTL 늘리기 · 상대 확인 주기
PRESENCE_TTL_SEC = 30.0   # 자리 키 TTL — 프로세스가 죽어 정리를 못 해도 이만큼 지나면 나간 것으로 본다
PING_SEC = 20.0           # 브라우저로 ping 보내는 주기
RECHECK_SEC = 30.0        # 판 상태 · 로그인을 다시 보는 주기
IDLE_SEC = 90.0           # 브라우저에서 이만큼 아무것도 안 오면 닫는다 (브라우저는 15초마다 ping)
ERROR_NOTICE_SEC = 1.0    # 버렸다는 알림은 이 간격에 한 번만

# 닫는 이유 → 웹소켓 닫는 코드
CLOSE_CODES = {
    "UNAUTHORIZED": 4401,
    "FORBIDDEN": 4403,
    "MATCH_NOT_FOUND": 4404,
    "REPLACED": 4408,
    "MATCH_NOT_ACTIVE": 4409,
    "IDLE": 4000,
}

ROLES = ("host", "guest")


@dataclass(frozen=True)
class RtMember:
    id: int
    status: str      # MemberStatus 값
    session_id: str  # 다시 볼 때 같은 세션이 아직 있는지 본다


@dataclass(frozen=True)
class Seat:
    role: str    # host(도전한 사람) · guest(받은 사람)
    status: str  # 판 상태 — ACTIVE 일 때만 연다


SeatLoader = Callable[[int, int], Awaitable[Optional[Seat]]]


# ── 회원 · 판 찾기 (읽기만 — DB 연결은 바로 돌려준다) ─────────────────


async def load_member_status(member_id: int) -> Optional[str]:
    async with AsyncSessionLocal() as db:
        status = (await db.execute(select(Member.status).where(Member.id == member_id))).scalar_one_or_none()
    if status is None:
        return None
    return status.value if isinstance(status, MemberStatus) else str(status)


async def load_seat(match_id: int, member_id: int) -> Optional[Seat]:
    """그 판에서 이 회원의 자리. 판이 없거나, 내 판이 아니거나, 컴퓨터와 두는 판이거나, 실시간 게임이 아니면 None."""
    if not (0 < match_id < 2**63):
        return None
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                select(GameMatch.challenger_id, GameMatch.opponent_id, GameMatch.status, GameMatch.game).where(
                    GameMatch.id == match_id
                )
            )
        ).first()
    if row is None:
        return None
    challenger_id, opponent_id, status, game = row
    if game not in REALTIME_GAMES:
        return None  # 차례제 게임(오목 · 고스톱 등)은 대전 HTTP 로만 — 자유 메시지 통로를 열 까닭이 없다
    if opponent_id is None or challenger_id == opponent_id:
        return None
    if member_id == challenger_id:
        return Seat("host", status)
    if member_id == opponent_id:
        return Seat("guest", status)
    return None


async def member_from_session(redis: Redis, session_id: Optional[str]) -> Optional[RtMember]:
    """로그인 세션의 회원. 쿠키가 없거나 세션이 끝났거나 회원이 없으면 None."""
    if not session_id:
        return None
    data = await get_member_session(redis, session_id)
    member_id = data.get("member_id") if data else None
    if not isinstance(member_id, int) or isinstance(member_id, bool):
        return None
    status = await load_member_status(member_id)
    if status is None:
        return None
    return RtMember(member_id, status, session_id)


async def admit(
    redis: Redis, session_id: Optional[str], match_id: int, seat_loader: SeatLoader
) -> Tuple[Optional[str], Optional[RtMember], Optional[Seat]]:
    """들어올 수 있는지 — (거절 이유 · 없으면 None, 회원, 자리). DB · Redis 오류는 그대로 올린다."""
    who = await member_from_session(redis, session_id)
    if who is None or who.status == MemberStatus.WITHDRAWN.value:
        return "UNAUTHORIZED", None, None
    if who.status != MemberStatus.ACTIVE.value:
        return "FORBIDDEN", who, None
    seat = await seat_loader(match_id, who.id)
    if seat is None or seat.role not in ROLES:
        return "MATCH_NOT_FOUND", who, None
    if seat.status != "ACTIVE":
        return "MATCH_NOT_ACTIVE", who, seat
    return None, who, seat


def rt_seat_loader() -> SeatLoader:
    return load_seat


# ── Redis 이름 · 스크립트 ──────────────────────────────────────────────


def _channel(redis: Redis, match_id: int, role: str) -> str:
    # pub/sub 채널은 Redis DB 번호와 상관없이 서버 전체에서 하나 — 개발·운영이 같은 Redis를 써도 섞이지 않게 DB 번호를 붙인다
    return f"hk:{redis.connection_pool.connection_kwargs.get('db', 0)}:rt:{match_id}:{role}"


def _here_key(match_id: int, role: str) -> str:
    return f"rt:here:{match_id}:{role}"


def _other(role: str) -> str:
    return "guest" if role == "host" else "host"


# 채널에 흐르는 것: "m"+상대에게 그대로 보낼 JSON · "p1"/"p0" 상대가 들어옴/나감 · "k"+연결id 같은 자리에 새 연결이 붙음
# 들어오기: 내 자리 키를 내 연결로 바꾸고, 같은 자리의 예전 연결에 나가라고, 상대에게 들어왔다고 알린 뒤 상대가 있는지 돌려준다
_JOIN = """
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('PUBLISH', ARGV[3], 'k' .. ARGV[1])
redis.call('PUBLISH', ARGV[4], 'p1')
return redis.call('EXISTS', KEYS[2])
"""
# 살아 있음: 내 자리면 TTL 을 늘리고, 키가 사라졌으면 다시 잡고, 다른 연결이 가져갔으면 -1. 그 밖에는 상대가 있는지
_BEAT = """
local v = redis.call('GET', KEYS[1])
if v == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
elseif not v then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  redis.call('PUBLISH', ARGV[3], 'p1')
else
  return -1
end
return redis.call('EXISTS', KEYS[2])
"""
# 나가기: 아직 내 자리일 때만 지우고 상대에게 나갔다고 알린다 (새 연결에 자리를 넘긴 뒤면 아무것도 안 한다)
_LEAVE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('PUBLISH', ARGV[2], 'p0')
  return 1
end
return 0
"""


# ── 들어오기 전 검사 ───────────────────────────────────────────────────


def _origin_key(scheme: str, netloc: str) -> Optional[str]:
    """scheme://host[:port] 를 한 모양으로 (소문자 · 기본 포트는 뺌). 이상한 값이면 None."""
    scheme = (scheme or "").lower()
    if scheme not in ("http", "https") or not netloc:
        return None
    try:
        parts = urlsplit(f"{scheme}://{netloc}")
        host, port = parts.hostname, parts.port
    except ValueError:
        return None
    if not host or parts.username is not None or parts.path or parts.query or parts.fragment:
        return None
    if ":" in host:
        host = f"[{host}]"  # IPv6
    if port is None or port == (443 if scheme == "https" else 80):
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def _origin_ok(websocket: WebSocket) -> bool:
    """다른 사이트가 직원 브라우저의 쿠키로 붙는 것을 막는다.

    Origin 전체(scheme · host · port)가 이 사이트이거나 허용한 개발 주소(cors_origins)여야 한다.
    같은 호스트라도 다른 포트 · 다른 scheme 의 페이지는 막는다."""
    origin = websocket.headers.get("origin")
    if not origin:
        return True  # 브라우저가 아닌 곳 — 그래도 로그인 쿠키는 있어야 한다
    try:
        parts = urlsplit(origin.strip())
    except ValueError:
        return False
    if parts.path or parts.query or parts.fragment:
        return False
    got = _origin_key(parts.scheme, parts.netloc)
    if got is None:
        return False  # "null" 같은 것
    allowed = set()
    for item in get_settings().cors_origins:
        try:
            p = urlsplit(item)
        except ValueError:
            continue
        key = _origin_key(p.scheme, p.netloc)
        if key:
            allowed.add(key)
    # 이 사이트 주소 — nginx 가 X-Forwarded-Proto 를 덮어써 보낸다. 없으면(직접 붙음) 이 연결의 scheme 으로
    proto = (websocket.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if proto not in ("http", "https"):
        proto = "https" if websocket.url.scheme in ("wss", "https") else "http"
    own = _origin_key(proto, websocket.headers.get("host", ""))
    if own:
        allowed.add(own)
    return got in allowed


_frame_cap_warned = False


def _limit_frames(websocket: WebSocket) -> bool:
    """받기 전에 이 연결의 웹소켓 상한을 줄인다 — 메시지 FRAME_MAX_BYTES · 대기 FRAME_QUEUE 개 · 압축 끔.

    uvicorn(websockets 구현) 기본값은 메시지 16MiB · 대기 32개 · 압축(작은 압축 프레임이 크게 풀림)이라,
    서버가 프레임을 끝까지 풀어 메모리에 올린 뒤에야 앱이 크기를 볼 수 있다. 원래는 일꾼 설정(ws_max_size 등)으로 막을 일이고,
    여기서는 그 설정이 없어도 막히게 이 연결의 프로토콜 값만 바꾼다. 서버 모양이 다르면 아무것도 안 하고 False."""
    global _frame_cap_warned
    proto = getattr(getattr(websocket, "_receive", None), "__self__", None)
    ok = False
    if proto is not None and hasattr(proto, "max_size") and hasattr(proto, "max_queue"):
        try:
            if proto.max_size is None or proto.max_size > FRAME_MAX_BYTES:
                proto.max_size = FRAME_MAX_BYTES
            if proto.max_queue is None or proto.max_queue > FRAME_QUEUE:
                proto.max_queue = FRAME_QUEUE
            extensions = getattr(proto, "available_extensions", None)
            if isinstance(extensions, list):
                extensions.clear()  # 손잡기 때 이 목록으로 압축을 정한다 — 비우면 압축 없이 연다
            ok = True
        except Exception:  # noqa: BLE001 — 못 바꾸면 일꾼 설정에 맡긴다
            ok = False
    if not ok and not _frame_cap_warned:
        _frame_cap_warned = True
        logger.warning("rt: websocket frame limits not lowered here — set ws_max_size/ws_max_queue in the worker")
    return ok


def _no_constant(name: str):
    raise ValueError(name)  # NaN · Infinity 는 브라우저 JSON 이 못 읽는다


def _dumps(obj) -> str:
    # ensure_ascii — 짝 없는 서로게이트 같은 것도 안전한 글자로만 보낸다. NaN · Infinity(1e400 같은 수)는 내보내지 않는다
    return json.dumps(obj, separators=(",", ":"), allow_nan=False)


class _Bucket:
    """초당 개수 제한 (토큰 버킷)."""

    def __init__(self, rate: float, burst: float, now: float):
        self.rate, self.burst, self.tokens, self.at = rate, burst, burst, now

    def take(self, now: float) -> bool:
        self.tokens = min(self.burst, self.tokens + (now - self.at) * self.rate)
        self.at = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


async def _refuse(websocket: WebSocket, code: str) -> None:
    """받기 전에 닫는다 — 서버는 HTTP 403 으로 끝내고 프레임을 읽지 않는다."""
    try:
        await websocket.close(code=CLOSE_CODES[code], reason=code)
    except Exception:  # noqa: BLE001 — 이미 끊겼으면 그만
        pass


async def _bye(websocket: WebSocket, code: str) -> None:
    try:
        await websocket.send_text(_dumps({"sys": "bye", "code": code}))
    except Exception:  # noqa: BLE001 — 이미 끊겼으면 그만
        pass
    try:
        await websocket.close(code=CLOSE_CODES[code], reason=code)
    except Exception:  # noqa: BLE001
        pass


@router.get("/rt-check/{match_id}")
async def match_rt_check(
    match_id: int,
    request: Request,
    response: Response,
    redis: Redis = Depends(get_redis_client),
    seat_loader: SeatLoader = Depends(rt_seat_loader),
) -> dict:
    """웹소켓이 받기 전에 거절됐을 때 브라우저가 이유를 묻는다 (브라우저는 거절 이유를 볼 수 없다).

    {"ok": true} — 지금은 들어올 수 있다(잠깐 문제였으면 다시 붙으면 된다) · {"ok": false, "code": 이유} — 다시 붙어도 소용없다.
    Origin 은 여기서 보지 않는다 (읽기만 하고, 다른 사이트는 CORS 로 응답을 못 읽는다)."""
    response.headers["Cache-Control"] = "no-store"
    refuse, _, _ = await admit(redis, request.cookies.get(get_settings().session_cookie_name), match_id, seat_loader)
    if refuse is not None:
        return {"ok": False, "code": refuse}
    return {"ok": True}


@router.websocket("/rt/{match_id}")
async def match_rt(
    websocket: WebSocket,
    match_id: int,
    redis: Redis = Depends(get_redis_client),
    seat_loader: SeatLoader = Depends(rt_seat_loader),
) -> None:
    # 들어올 수 있는지 먼저 본다. 안 되면 받기(accept) 전에 닫는다 — 로그인 안 한 사람이나 남의 판에 붙은 사람은 프레임을 하나도 못 보낸다
    if not _origin_ok(websocket):
        await _refuse(websocket, "FORBIDDEN")
        return
    try:
        refuse, who, seat = await admit(
            redis, websocket.cookies.get(get_settings().session_cookie_name), match_id, seat_loader
        )
    except Exception as exc:  # noqa: BLE001 — DB · Redis 가 잠깐 안 되면 닫는다 (브라우저가 다시 붙는다)
        logger.warning("rt match %s: lookup failed (%s)", match_id, type(exc).__name__)
        try:
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass
        return
    if refuse is not None or who is None or seat is None:
        await _refuse(websocket, refuse or "FORBIDDEN")
        return
    _limit_frames(websocket)
    await websocket.accept()

    role, member_id = seat.role, who.id
    my_channel = _channel(redis, match_id, role)
    peer_channel = _channel(redis, match_id, _other(role))
    my_key, peer_key = _here_key(match_id, role), _here_key(match_id, _other(role))
    conn = secrets.token_hex(8)
    ttl_ms = str(int(PRESENCE_TTL_SEC * 1000))
    loop = asyncio.get_running_loop()
    send_lock = asyncio.Lock()
    state = {"peer": False, "peer_ver": 0, "last_recv": loop.time(), "gone": False}

    async def send(obj_or_text) -> None:
        text = obj_or_text if isinstance(obj_or_text, str) else _dumps(obj_or_text)
        async with send_lock:
            await websocket.send_text(text)

    pubsub = redis.pubsub()
    joined = False
    tasks: list[asyncio.Task] = []
    close_code: Optional[str] = None
    try:
        # 제 채널을 먼저 듣고(구독 확인까지 기다림) 나서 자리를 잡는다 — 그 사이 상대가 보낸 알림도 놓치지 않는다
        await pubsub.subscribe(my_channel)
        while True:
            ack = await asyncio.wait_for(pubsub.get_message(timeout=5.0), timeout=6.0)
            if ack is None:
                raise TimeoutError("subscribe not confirmed")
            if ack.get("type") == "subscribe":
                break
        peer_here = await redis.register_script(_JOIN)(
            keys=[my_key, peer_key], args=[conn, ttl_ms, my_channel, peer_channel]
        )
        joined = True
        state["peer"] = bool(peer_here)
        await send({"sys": "hello", "role": role, "peerHere": state["peer"]})

        async def reader() -> Optional[str]:
            """브라우저 → 상대. 크기 · 모양 · 개수를 보고 통과한 것만 상대 채널에 보낸다."""
            bucket = _Bucket(RATE_PER_SEC, BURST, loop.time())
            last_notice = -1e9
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    state["gone"] = True
                    return None
                now = loop.time()
                state["last_recv"] = now
                if not bucket.take(now):
                    if now - last_notice >= ERROR_NOTICE_SEC:
                        last_notice = now
                        await send({"sys": "error", "code": "RATE_LIMIT"})
                    continue
                text = message.get("text")
                if text is None or len(text) > MAX_BYTES or len(text.encode("utf-8")) > MAX_BYTES:
                    await send({"sys": "error", "code": "TOO_BIG" if text is not None else "BAD_MESSAGE"})
                    continue
                try:
                    obj = json.loads(text, parse_constant=_no_constant)
                except (ValueError, RecursionError):
                    obj = None
                if not isinstance(obj, dict):
                    await send({"sys": "error", "code": "BAD_MESSAGE"})
                    continue
                if "sys" in obj:  # 서버에 하는 말 — 상대에게 넘기지 않는다
                    if obj.get("sys") == "ping":
                        t = obj.get("t")
                        await send({"sys": "pong", "t": t if isinstance(t, (int, float)) and not isinstance(t, bool) else None})
                    continue
                obj["from"] = "peer"
                try:
                    payload = _dumps(obj)
                except (ValueError, RecursionError):
                    await send({"sys": "error", "code": "BAD_MESSAGE"})
                    continue
                await redis.publish(peer_channel, "m" + payload)

        async def pump() -> Optional[str]:
            """제 채널 → 브라우저."""
            joined_seen = False  # 내 'k' 보다 먼저 온 'k' 는 나보다 먼저 붙은 연결 것이라 상관없다
            async for item in pubsub.listen():
                if item.get("type") != "message":
                    continue
                data = item.get("data")
                if not isinstance(data, str) or not data:
                    continue
                kind, body = data[0], data[1:]
                if kind == "m":
                    await send(body)
                elif kind == "p":
                    state["peer"] = body == "1"
                    state["peer_ver"] += 1
                    await send({"sys": "peer", "here": state["peer"]})
                elif kind == "k":
                    if body == conn:
                        joined_seen = True
                    elif joined_seen:
                        return "REPLACED"
            return None

        async def heartbeat() -> Optional[str]:
            """자리 키 TTL 늘리기 · 상대 확인(죽은 프로세스 대비) · ping · 판 · 로그인 다시 보기 · 조용한 연결 닫기."""
            beat = redis.register_script(_BEAT)
            last_ping = last_check = loop.time()
            while True:
                await asyncio.sleep(HEARTBEAT_SEC)
                ver = state["peer_ver"]
                here = await beat(keys=[my_key, peer_key], args=[conn, ttl_ms, peer_channel])
                if here == -1:
                    return "REPLACED"
                if ver == state["peer_ver"] and bool(here) != state["peer"]:
                    state["peer"] = bool(here)
                    await send({"sys": "peer", "here": state["peer"]})
                now = loop.time()
                if now - state["last_recv"] > IDLE_SEC:
                    return "IDLE"
                if now - last_ping >= PING_SEC:
                    last_ping = now
                    await send({"sys": "ping"})
                if now - last_check >= RECHECK_SEC:
                    last_check = now
                    try:
                        why, again, current = await admit(redis, who.session_id, match_id, seat_loader)
                    except Exception as exc:  # noqa: BLE001 — DB 가 잠깐 안 돼도 연결은 그대로
                        logger.warning("rt match %s: recheck failed (%s)", match_id, type(exc).__name__)
                    else:
                        if why is None and (again is None or again.id != member_id or current is None or current.role != role):
                            why = "MATCH_NOT_FOUND"
                        if why is not None:
                            return why  # 판이 끝남(4409) · 로그아웃 · 세션 만료 · 탈퇴(4401) · 정지(4403) · 자리가 없어짐(4404)

        tasks = [asyncio.create_task(reader()), asyncio.create_task(pump()), asyncio.create_task(heartbeat())]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc is None:
                close_code = close_code or task.result()
            elif isinstance(exc, WebSocketDisconnect):
                state["gone"] = True
            else:
                logger.warning("rt match %s: relay stopped (%s)", match_id, type(exc).__name__)
    except WebSocketDisconnect:
        state["gone"] = True  # hello 를 보내기 전에 브라우저가 끊음 (또는 너무 큰 프레임으로 서버가 1009 로 닫음)
    except Exception as exc:  # noqa: BLE001 — Redis 가 안 되면 닫는다 (브라우저가 다시 붙는다)
        logger.warning("rt match %s: setup failed (%s)", match_id, type(exc).__name__)
    finally:

        async def cleanup(running: list) -> None:
            for task in running:
                task.cancel()
            if running:
                await asyncio.gather(*running, return_exceptions=True)
            if joined:
                try:
                    await redis.register_script(_LEAVE)(keys=[my_key], args=[conn, peer_channel])
                except Exception:  # noqa: BLE001 — 못 지워도 TTL 이 지나면 나간 것으로 본다
                    logger.warning("rt match %s: leave failed", match_id)
            try:
                await pubsub.unsubscribe()
            except Exception:  # noqa: BLE001 — 연결이 끊겼으면 닫기만 하면 된다
                pass
            try:
                await pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass

        # 정리는 따로 돌린다 — 서버가 이 작업을 취소하더라도(종료 등) 자리 정리는 끝까지 한다
        await asyncio.shield(asyncio.ensure_future(cleanup(tasks)))

    if close_code is not None:
        await _bye(websocket, close_code)
    elif not state["gone"]:
        try:
            await websocket.close(code=1011)  # Redis 가 끊기는 등 서버 쪽 문제 — 브라우저가 다시 붙는다
        except Exception:  # noqa: BLE001
            pass
