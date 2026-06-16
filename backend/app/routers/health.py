from __future__ import annotations

from fastapi import APIRouter, Depends
from neo4j import AsyncDriver
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, get_neo4j, get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    neo4j: AsyncDriver = Depends(get_neo4j),
):
    pg_ok = False
    redis_ok = False
    pgvector_ok = False
    neo4j_ok = False

    try:
        result = await db.execute(text("SELECT 1"))
        pg_ok = result.scalar() == 1
        ext = await db.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        )
        pgvector_ok = ext.scalar() is not None
    except Exception:
        pass

    try:
        redis_ok = (await redis.ping()) is True
    except Exception:
        pass

    try:
        await neo4j.verify_connectivity()
        neo4j_ok = True
    except Exception:
        pass

    all_ok = pg_ok and redis_ok
    status = "ok" if all_ok else "degraded"
    return {
        "data": {
            "status": status,
            "postgresql": pg_ok,
            "pgvector": pgvector_ok,
            "redis": redis_ok,
            "neo4j": neo4j_ok,
        }
    }
