"""매일 키우는 운영 게임(매니지먼트 — 오피스 타운(key civ) · 옥상 쉼터 카페 · 옥상 텃밭) — 진행 상태 저장 · 불러오기 · 처음부터 다시.

게임의 규칙과 계산은 화면(web/games/<게임>.html)이 맡고, 서버는 회원 · 게임마다 한 줄(mgmt_save)에
상태(JSON) · 버전 · 저장한 서버 시각을 남긴다. 화면은 불러올 때 받은 서버 시각(now)과 저장 시각(savedAt)의
차이로 자리를 비운 동안의 진행을 계산한다(휴대폰 시계를 바꿔도 소용없게).
다른 창 · 기기에서 먼저 저장했으면(버전이 다르면) 덮어쓰지 않고 MGMT_STALE(409)로 알린다.
이용 시간은 아케이드와 같다(업무 시간에는 닫힘) — 저장은 닫히기 직전에 하던 것까지 10분 더 받는다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error, register_messages
from app.core.time import format_kst_iso, now_kst
from app.models import Member, MgmtSave
from app.services import game as game_service


@dataclass(frozen=True)
class MgmtGame:
    key: str
    title: str
    desc: str
    icon: str
    # 매니지먼트 목록(/manage)에 보일지 — 아케이드 게임이 이야기 모드 진행만 여기 저장할 때는 False
    listed: bool = True


MGMT_GAMES: dict[str, MgmtGame] = {
    g.key: g
    for g in (
        MgmtGame("civ", "오피스 타운", "빈 동네에 작은 회사를 차리고, 회사와 함께 커 가는 귀여운 회사 동네를 꾸며요", "building-2"),
        MgmtGame("cafe", "옥상 쉼터 카페", "옥상에 작은 카페를 차려 메뉴를 늘리고 손님을 모아요", "coffee"),
        MgmtGame("farm", "옥상 텃밭", "출근 전에 심고 점심 · 퇴근 후에 거둬 텃밭을 넓혀요", "sprout"),
        # 아케이드 「햇살 농장 3D」의 이야기 모드 진행 — 매니지먼트 목록에는 안 보인다
        MgmtGame("eggfarm", "햇살 농장 이야기", "햇살 농장 3D 이야기 모드 진행", "egg", listed=False),
        # 아케이드 「옥상 덩크슛」의 별 · 가진 공 · 고른 공 · 미션 진행 — 매니지먼트 목록에는 안 보인다
        MgmtGame("hoops", "옥상 덩크슛 공 상점", "옥상 덩크슛 별 · 공 모으기", "dribbble", listed=False),
    )
}

MAX_STATE_BYTES = 128 * 1024  # 한 게임 상태의 최대 크기

register_messages(
    {
        "MGMT_STALE": "다른 창이나 기기에서 먼저 저장했어요. 최신 상태를 다시 불러올게요.",
        "MGMT_TOO_BIG": "저장할 내용이 너무 커요. 화면을 새로 불러 주세요.",
        "MGMT_BAD_STATE": "저장할 수 없는 값이 있어요. 화면을 새로 불러 주세요.",
    },
    {"MGMT_STALE": 409, "MGMT_TOO_BIG": 413, "MGMT_BAD_STATE": 422},
)


# 옥상 덩크슛 공 상점 저장 — 값 검사(상한만. 별을 판 점수와 엮어 검증하지는 않는다)
HOOPS_SKIN_COUNT = 64  # 공 번호 0 ~ 63 (지금 30종 · 늘어날 여유)
HOOPS_MAX_STARS = 200_000
HOOPS_MAX_STAT = 1_000_000
HOOPS_STAT_KEYS = ("best", "bestCombo", "bestBounceCombo", "bestMade", "bestRunScore", "bestStage", "totalStars")


def _int_in(v, lo: int, hi: int) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def check_hoops_state(state: dict) -> bool:
    """별 수 · 가진 공 · 고른 공 · 미션 기록이 말이 되는지. 모르는 칸은 받지 않는다."""
    allowed = {"stars", "owned", "skin", "summary", *HOOPS_STAT_KEYS}
    if not isinstance(state, dict) or set(state) - allowed:
        return False
    if not _int_in(state.get("stars", 0), 0, HOOPS_MAX_STARS):
        return False
    owned = state.get("owned", [0])
    if not isinstance(owned, list) or not owned or len(owned) > HOOPS_SKIN_COUNT or len(set(owned)) != len(owned):
        return False
    if not all(_int_in(i, 0, HOOPS_SKIN_COUNT - 1) for i in owned):
        return False
    skin = state.get("skin", 0)
    if not _int_in(skin, 0, HOOPS_SKIN_COUNT - 1) or skin not in owned:
        return False
    if not all(_int_in(state.get(k, 0), 0, HOOPS_MAX_STAT) for k in HOOPS_STAT_KEYS):
        return False
    return state.get("summary") is None


STATE_CHECKS = {"hoops": check_hoops_state}


def _game(key: str) -> MgmtGame:
    g = MGMT_GAMES.get(key)
    if not g:
        raise_app_error("NOT_FOUND", 404)
    return g


async def _row(db: AsyncSession, member: Member, key: str) -> MgmtSave | None:
    return (
        await db.execute(select(MgmtSave).where(MgmtSave.member_id == member.id, MgmtSave.game == key))
    ).scalar_one_or_none()


def _out(row: MgmtSave | None) -> dict:
    return {
        "state": row.state if row and row.state else None,  # None = 처음 — 화면이 새 판을 만든다
        "version": row.version if row else 0,
        "resets": row.resets if row else 0,
        "savedAt": format_kst_iso(row.saved_at) if row else None,
        "now": format_kst_iso(now_kst()),
    }


async def list_games(db: AsyncSession, member: Member) -> list[dict]:
    """매니지먼트 게임 목록 — 내가 시작했는지 · 마지막으로 저장한 때 · 화면이 남긴 짧은 요약(state.summary)."""
    rows = {
        r.game: r
        for r in (await db.execute(select(MgmtSave).where(MgmtSave.member_id == member.id))).scalars().all()
    }
    out = []
    for g in MGMT_GAMES.values():
        if not g.listed:
            continue
        r = rows.get(g.key)
        summary = (r.state or {}).get("summary") if r else None
        out.append(
            {
                "key": g.key,
                "title": g.title,
                "desc": g.desc,
                "icon": g.icon,
                "started": bool(r and r.state),
                "savedAt": format_kst_iso(r.saved_at) if r else None,
                "summary": summary if isinstance(summary, dict) else None,
            }
        )
    return out


async def load(db: AsyncSession, member: Member, key: str) -> dict:
    _game(key)
    game_service.ensure_open(member=member)
    return _out(await _row(db, member, key))


async def save(db: AsyncSession, member: Member, key: str, state: dict, version: int) -> dict:
    _game(key)
    game_service.ensure_open(grace=True, member=member)
    if len(json.dumps(state, ensure_ascii=False).encode("utf-8")) > MAX_STATE_BYTES:
        raise_app_error("MGMT_TOO_BIG", 413)
    check = STATE_CHECKS.get(key)
    if check and not check(state):
        raise_app_error("MGMT_BAD_STATE", 422)
    now = now_kst()
    if version == 0:
        # 처음 저장 — 같은 판을 두 창에서 동시에 처음 저장해도 한 줄만 생기게(나머지는 MGMT_STALE)
        done = await db.execute(
            pg_insert(MgmtSave)
            .values(member_id=member.id, game=key, state=state, version=1, resets=0, saved_at=now)
            .on_conflict_do_nothing(constraint="uq_mgmt_save_member_game")
            .returning(MgmtSave.id)
        )
    else:
        # 내가 본 버전일 때만 고친다 — 그새 다른 창이 저장했으면 0줄
        done = await db.execute(
            update(MgmtSave)
            .where(MgmtSave.member_id == member.id, MgmtSave.game == key, MgmtSave.version == version)
            .values(state=state, version=MgmtSave.version + 1, saved_at=now)
            .returning(MgmtSave.id)
        )
    if done.first() is None:
        await db.rollback()
        raise_app_error("MGMT_STALE", 409)
    await db.commit()
    return _out(await _row(db, member, key))


async def reset(db: AsyncSession, member: Member, key: str) -> dict:
    """처음부터 다시 — 상태를 비우고 횟수만 남긴다."""
    _game(key)
    game_service.ensure_open(grace=True, member=member)
    row = await _row(db, member, key)
    if row is not None:
        row.state = {}
        row.version = row.version + 1
        row.resets = row.resets + 1
        row.saved_at = now_kst()
        await db.commit()
        await db.refresh(row)
    return _out(row)
