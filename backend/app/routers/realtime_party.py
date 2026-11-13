"""여러 명 실시간 연결 — 여러 명 대전(app/services/party.py) 한 판의 브라우저들이 서버를 거쳐 짧은 메시지를 주고받는다.

주소: /api/play/rt/party/{판 id} (웹소켓) · /api/play/rt-check/party/{판 id} (GET — 거절 이유 묻기)
  1:1 통로(realtime_ws.py)와 같은 접두어(/api/play/rt/)라 nginx 의 웹소켓 설정을 그대로 쓴다.
- 들어올 수 있는 사람: 그 판의 주인(host) · 들어온 사람(JOINED, guest). 판이 OPEN(대기실) · RACING(경주 중)일 때만.
- 별 모양: 주인이 가운데. 손님이 보낸 것은 주인에게만(from = 손님 회원 id), 주인이 보낸 것은 손님 모두에게
  (또는 "to": 회원 id 를 넣으면 그 손님에게만 — 서버가 "to" 는 떼고 넘긴다).
- 크기 · 개수 제한 · Origin 검사 · 로그인 다시 보기 · 한 사람 연결 하나는 1:1 통로와 같다(같은 도구를 쓴다).

서버 → 브라우저
  {"sys":"hello","role":"host"|"guest","me":내 id,"peerHere":주인이 있나(손님) · "here":[와 있는 손님 id …](주인)}
  {"sys":"peer","id":손님 id(주인에게) · 없으면 주인(손님에게),"here":bool}
  {"sys":"ping"} · {"sys":"pong","t":…} · {"sys":"error","code":…} · {"sys":"bye","code":…}
  {...보낸 객체, "from": 보낸 회원 id(손님이 보냄) | "host"}
닫는 코드는 1:1 통로와 같다(4401 · 4403 · 4404 · 4408 · 4409 · 4000).
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.config import get_settings
from app.core.deps import get_redis_client
from app.database import AsyncSessionLocal
from app.models import MemberStatus
from app.routers.realtime_ws import (
    BURST, ERROR_NOTICE_SEC, HEARTBEAT_SEC, IDLE_SEC, MAX_BYTES, PING_SEC, PRESENCE_TTL_SEC, RATE_PER_SEC, RECHECK_SEC,
    _Bucket, _bye, _dumps, _limit_frames, _no_constant, _origin_ok, _refuse, member_from_session,
)
from app.services import party as party_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/play", tags=["play-rt-party"])

LIVE = ("OPEN", "RACING")


async def load_party_seat(party_id: int, member_id: int):
    """(역할, 판 상태, 자리에 있는 사람 id 들) 또는 None."""
    if not (0 < party_id < 2**63):
        return None
    async with AsyncSessionLocal() as db:
        return await party_service.seat_for_rt(db, party_id, member_id)


async def admit(redis: Redis, session_id: Optional[str], party_id: int):
    who = await member_from_session(redis, session_id)
    if who is None or who.status == MemberStatus.WITHDRAWN.value:
        return "UNAUTHORIZED", None, None
    if who.status != MemberStatus.ACTIVE.value:
        return "FORBIDDEN", who, None
    seat = await load_party_seat(party_id, who.id)
    if seat is None:
        return "MATCH_NOT_FOUND", who, None
    if seat[1] not in LIVE:
        return "MATCH_NOT_ACTIVE", who, seat
    return None, who, seat


def _db(redis: Redis) -> int:
    return redis.connection_pool.connection_kwargs.get("db", 0)


def _ch(redis: Redis, party_id: int, name: str) -> str:
    return f"hk:{_db(redis)}:prt:{party_id}:{name}"  # name: host · all · g{id}


def _here(party_id: int, name: str) -> str:
    return f"prt:here:{party_id}:{name}"


# 들어오기: 내 자리 키를 내 연결로, 같은 자리의 예전 연결에 나가라고(k), 상대 쪽에 들어왔다고(p1…) 알린다
_JOIN = """
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('PUBLISH', ARGV[3], 'k' .. ARGV[1])
redis.call('PUBLISH', ARGV[4], ARGV[5])
return 1
"""
_BEAT = """
local v = redis.call('GET', KEYS[1])
if v == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
elseif not v then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  redis.call('PUBLISH', ARGV[3], ARGV[4])
else
  return -1
end
return 1
"""
_LEAVE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('PUBLISH', ARGV[2], ARGV[3])
  return 1
end
return 0
"""


@router.get("/rt-check/party/{party_id}")
async def party_rt_check(party_id: int, request: Request, response: Response, redis: Redis = Depends(get_redis_client)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    refuse, _, _ = await admit(redis, request.cookies.get(get_settings().session_cookie_name), party_id)
    return {"ok": False, "code": refuse} if refuse is not None else {"ok": True}


@router.websocket("/rt/party/{party_id}")
async def party_rt(websocket: WebSocket, party_id: int, redis: Redis = Depends(get_redis_client)) -> None:
    if not _origin_ok(websocket):
        await _refuse(websocket, "FORBIDDEN")
        return
    try:
        refuse, who, seat = await admit(redis, websocket.cookies.get(get_settings().session_cookie_name), party_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("rt party %s: lookup failed (%s)", party_id, type(exc).__name__)
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

    role, member_id = seat[0], who.id
    host = role == "host"
    seated = [int(x) for x in seat[2]]
    me_name = "host" if host else f"g{member_id}"
    my_channels = [_ch(redis, party_id, "host")] if host else [_ch(redis, party_id, me_name), _ch(redis, party_id, "all")]
    out_channel = _ch(redis, party_id, "all") if host else _ch(redis, party_id, "host")
    my_key = _here(party_id, me_name)
    kick_channel = my_channels[0]
    presence_note = "p1" if host else f"p1{member_id}"
    leave_note = "p0" if host else f"p0{member_id}"
    conn = secrets.token_hex(8)
    ttl_ms = str(int(PRESENCE_TTL_SEC * 1000))
    loop = asyncio.get_running_loop()
    send_lock = asyncio.Lock()
    state = {"last_recv": loop.time(), "gone": False, "here": {}, "host_here": False}

    async def send(obj_or_text) -> None:
        text = obj_or_text if isinstance(obj_or_text, str) else _dumps(obj_or_text)
        async with send_lock:
            await websocket.send_text(text)

    async def who_here() -> None:
        """주인: 와 있는 손님 · 손님: 주인이 있는지 — 자리 키로 본다."""
        if host:
            guests = [i for i in seated if i != member_id]
            vals = await redis.mget([_here(party_id, f"g{i}") for i in guests]) if guests else []
            state["here"] = {i: v is not None for i, v in zip(guests, vals)}
        else:
            state["host_here"] = bool(await redis.exists(_here(party_id, "host")))

    pubsub = redis.pubsub()
    joined = False
    tasks: list[asyncio.Task] = []
    close_code: Optional[str] = None
    try:
        await pubsub.subscribe(*my_channels)
        got = 0
        while got < len(my_channels):
            ack = await asyncio.wait_for(pubsub.get_message(timeout=5.0), timeout=6.0)
            if ack is None:
                raise TimeoutError("subscribe not confirmed")
            if ack.get("type") == "subscribe":
                got += 1
        await redis.register_script(_JOIN)(keys=[my_key], args=[conn, ttl_ms, kick_channel, out_channel, presence_note])
        joined = True
        await who_here()
        if host:
            await send({"sys": "hello", "role": "host", "me": member_id, "here": [i for i, h in state["here"].items() if h]})
        else:
            await send({"sys": "hello", "role": "guest", "me": member_id, "peerHere": state["host_here"]})

        async def reader() -> Optional[str]:
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
                if "sys" in obj:
                    if obj.get("sys") == "ping":
                        t = obj.get("t")
                        await send({"sys": "pong", "t": t if isinstance(t, (int, float)) and not isinstance(t, bool) else None})
                    continue
                target = out_channel
                if host:
                    to = obj.pop("to", None)
                    if isinstance(to, int) and not isinstance(to, bool) and to in seated and to != member_id:
                        target = _ch(redis, party_id, f"g{to}")
                    obj["from"] = "host"
                else:
                    obj.pop("to", None)
                    obj["from"] = member_id
                try:
                    payload = _dumps(obj)
                except (ValueError, RecursionError):
                    await send({"sys": "error", "code": "BAD_MESSAGE"})
                    continue
                await redis.publish(target, "m" + payload)

        async def pump() -> Optional[str]:
            joined_seen = False
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
                    here = body[:1] == "1"
                    rest = body[1:]
                    if host and rest.isdigit():
                        gid = int(rest)
                        if gid not in seated:
                            seated.append(gid)  # 대기실에 새로 들어온 사람
                        state["here"][gid] = here
                        await send({"sys": "peer", "id": gid, "here": here})
                    elif not host and not rest:
                        state["host_here"] = here
                        await send({"sys": "peer", "here": here})
                elif kind == "k" and item.get("channel") == kick_channel:
                    if body == conn:
                        joined_seen = True
                    elif joined_seen:
                        return "REPLACED"
            return None

        async def heartbeat() -> Optional[str]:
            beat = redis.register_script(_BEAT)
            last_ping = last_check = loop.time()
            while True:
                await asyncio.sleep(HEARTBEAT_SEC)
                r = await beat(keys=[my_key], args=[conn, ttl_ms, out_channel, presence_note])
                if r == -1:
                    return "REPLACED"
                before = (dict(state["here"]), state["host_here"])
                await who_here()
                if host:
                    for gid, h in state["here"].items():
                        if before[0].get(gid) != h:
                            await send({"sys": "peer", "id": gid, "here": h})
                elif before[1] != state["host_here"]:
                    await send({"sys": "peer", "here": state["host_here"]})
                now = loop.time()
                if now - state["last_recv"] > IDLE_SEC:
                    return "IDLE"
                if now - last_ping >= PING_SEC:
                    last_ping = now
                    await send({"sys": "ping"})
                if now - last_check >= RECHECK_SEC:
                    last_check = now
                    try:
                        why, again, current = await admit(redis, who.session_id, party_id)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("rt party %s: recheck failed (%s)", party_id, type(exc).__name__)
                    else:
                        if why is None and (again is None or again.id != member_id or current is None or current[0] != role):
                            why = "MATCH_NOT_FOUND"
                        if why is not None:
                            return why
                        seated[:] = [int(x) for x in current[2]]

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
                logger.warning("rt party %s: relay stopped (%s)", party_id, type(exc).__name__)
    except WebSocketDisconnect:
        state["gone"] = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("rt party %s: setup failed (%s)", party_id, type(exc).__name__)
    finally:

        async def cleanup(running: list) -> None:
            for task in running:
                task.cancel()
            if running:
                await asyncio.gather(*running, return_exceptions=True)
            if joined:
                try:
                    await redis.register_script(_LEAVE)(keys=[my_key], args=[conn, out_channel, leave_note])
                except Exception:  # noqa: BLE001
                    logger.warning("rt party %s: leave failed", party_id)
            try:
                await pubsub.unsubscribe()
            except Exception:  # noqa: BLE001
                pass
            try:
                await pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass

        await asyncio.shield(asyncio.ensure_future(cleanup(tasks)))

    if close_code is not None:
        await _bye(websocket, close_code)
    elif not state["gone"]:
        try:
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass
