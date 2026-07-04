from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import AsyncSessionLocal, close_neo4j, close_redis
from app.routers import admin, auth, health, reservation
from app.services import scheduler as sched

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def _run_job(name: str, fn) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await fn(db)
        except Exception:
            logger.exception("Scheduler job %s failed", name)


def _async_job(name: str, fn):
    async def _job() -> None:
        await _run_job(name, fn)

    return _job


def _schedule_jobs() -> None:
    scheduler.add_job(
        _async_job("precreate", sched.job_precreate_cycle),
        CronTrigger(day_of_week="mon-sat", hour=0, minute=0),
        id="j0_precreate",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("open", sched.job_open_cycle),
        CronTrigger(day_of_week="wed", hour=9, minute=0),
        id="j1_open",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("close", sched.job_close_batch),
        CronTrigger(day_of_week="wed", hour=17, minute=0),
        id="j2_close",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("reapply_open", sched.job_reapply_open),
        CronTrigger(day_of_week="thu", hour=9, minute=0),
        id="j3_reapply_open",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("reapply_close", sched.job_reapply_close),
        CronTrigger(day_of_week="thu", hour=17, minute=0),
        id="j4_reapply_close",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("mail_retry", sched.job_mail_retry),
        CronTrigger(minute="*/5"),
        id="j5_mail_retry",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("teams_reminder", sched.job_teams_reminder),
        CronTrigger(minute="*"),
        id="j6_teams_reminder",
        replace_existing=True,
    )
    scheduler.add_job(
        _async_job("teams_open_notice", sched.job_teams_open_notice),
        CronTrigger(day_of_week="wed", hour=8, minute=55),
        id="j7_teams_open_notice",
        replace_existing=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.sso_provider == "entra":
        if settings.sso_ready():
            logger.info(
                "SSO: Microsoft Entra enabled (redirect=%s)",
                settings.entra_redirect_uri,
            )
        else:
            logger.warning(
                "SSO: SSO_PROVIDER=entra but missing env: %s",
                ", ".join(settings.sso_missing_fields()),
            )
    else:
        logger.info("SSO: mock provider (dev login picker at /api/auth/sso/mock)")
    _schedule_jobs()
    scheduler.start()
    async with AsyncSessionLocal() as db:
        try:
            await sched.job_open_cycle(db)
        except Exception:
            logger.exception("Startup open-cycle sync failed")
    yield
    scheduler.shutdown(wait=False)
    await close_redis()
    await close_neo4j()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(auth.me_router, prefix="/api")
    app.include_router(reservation.system_router, prefix="/api")
    app.include_router(reservation.router, prefix="/api")
    app.include_router(admin.router, prefix="/api")
    return app
