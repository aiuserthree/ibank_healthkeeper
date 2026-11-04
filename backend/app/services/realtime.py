"""화면을 바로 바꾸기 위한 알림 — 바뀐 쪽이 Redis 채널에 알리고, 기다리던 요청이 그 즉시 깨어난다."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)


def channel(redis, kind: str, key) -> str:
    # pub/sub 채널은 Redis DB 번호와 상관없이 서버 전체에서 하나 — 개발·운영이 같은 Redis를 써도 섞이지 않게 DB 번호를 붙인다
    return f"hk:{redis.connection_pool.connection_kwargs.get('db', 0)}:{kind}:{key}"


async def publish(kind: str, *keys) -> None:
    """바뀌었다고 알린다. 알림이 실패해도 바뀐 내용은 이미 저장됐다."""
    try:
        from app.database import get_redis

        redis = await get_redis()
        for key in keys:
            await redis.publish(channel(redis, kind, key), "1")
    except Exception:  # noqa: BLE001
        logger.warning("realtime publish failed", exc_info=True)


async def wait_for_change(kind: str, key, unchanged: Callable[[], Awaitable[bool]], seconds: float) -> None:
    """unchanged() 가 참이면 알림이 올 때까지(최대 seconds) 기다린다.

    채널을 먼저 듣고 나서 unchanged() 를 보므로, 그 사이에 바뀐 것도 놓치지 않는다.
    unchanged() 안에서 DB 를 읽었다면 기다리기 전에 트랜잭션을 끝내 연결을 돌려줘야 한다.
    """
    from app.database import get_redis

    pubsub = None
    try:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel(redis, kind, key))
    except Exception:  # noqa: BLE001
        logger.warning("realtime subscribe failed", exc_info=True)
        pubsub = None
    try:
        if not await unchanged() or pubsub is None:
            return
        loop = asyncio.get_running_loop()
        end = loop.time() + seconds
        while (left := end - loop.time()) > 0:
            if await pubsub.get_message(ignore_subscribe_messages=True, timeout=left):
                return
            await asyncio.sleep(0.05)  # 구독 확인 같은 빈 응답에 헛돌지 않게
    finally:
        if pubsub is not None:
            try:
                await pubsub.unsubscribe()
                await pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass
