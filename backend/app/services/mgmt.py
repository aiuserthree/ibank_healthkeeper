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
        # 아케이드 「문구 팡팡」의 단계 · 별 · 꾸미기 · 코인 · 아이템 진행 — 매니지먼트 목록에는 안 보인다
        MgmtGame("deskpop", "문구 팡팡 진행", "문구 팡팡 단계 · 별 · 꾸미기", "pencil", listed=False),
        # 아케이드 「옥상 덩크슛」의 별 · 가진 공 · 고른 공 · 미션 진행 — 매니지먼트 목록에는 안 보인다
        MgmtGame("hoops", "옥상 덩크슛 공 상점", "옥상 덩크슛 별 · 공 모으기", "dribbble", listed=False),
        # 아케이드 「곰돌이 새총 원정대」의 단계 · 별 · 금화 · 곰 마을 강화 · 소리 설정 — 매니지먼트 목록에는 안 보인다
        MgmtGame("slingfort", "곰돌이 새총 원정대 진행", "단계 · 별 · 금화 · 곰 마을", "castle", listed=False),
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


# 문구 팡팡 진행 저장 — 값 검사(타입 · 범위 · 길이 · 서로 맞물린 값까지. 점수와 엮어 검증하지는 않는다)
# 과제 별 값: 구역 10 × 과제 5(차례대로) — 화면(web/games/embed/deskpop.html 의 TASK_STARS)과 같아야 한다(시험이 비교)
DESKPOP_TASK_STARS = (
    (1, 1, 2, 3, 3),  # 빈 사무실 1~10단계
    (3, 4, 4, 4, 5),  # 탕비실 11~30
    (3, 4, 4, 4, 5),  # 회의실 31~50
    (3, 4, 4, 4, 5),  # 휴게 라운지 51~70
    (3, 4, 4, 4, 5),  # 체력단련실 71~90
    (5, 6, 6, 6, 7),  # 옥상 정원 91~120
    (5, 6, 6, 6, 7),  # 도서 코너 121~150
    (7, 8, 8, 8, 9),  # 사내 카페 151~190
    (9, 10, 10, 10, 11),  # 로비 191~240
    (11, 12, 12, 12, 13),  # 대표실 241~300
)
DESKPOP_AREA_LEVELS = (10, 20, 20, 20, 20, 30, 30, 40, 50, 60)  # 구역마다 단계 수(= 그 구역 과제 별 합)
DESKPOP_BOOST_KEYS = ("line", "stamp", "globe", "hammer", "rowRuler", "colTape", "fan")
DESKPOP_KEYS = {"level", "stars", "starsTotal", "tasks", "styles", "chest", "coins", "boost", "streak", "bestRun", "seen"}
DESKPOP_MAX_LEVEL = 100_000
DESKPOP_MAX_STARS = 100_000
DESKPOP_MAX_COINS = 9_999_999
DESKPOP_MAX_BOOST = 999
DESKPOP_MAX_RUN = 1_000_000  # game.py 상한과 같게
DESKPOP_MAX_SEEN = 64


def check_deskpop_state(state: dict) -> bool:
    """단계 · 별 · 과제 · 구역 상자 · 코인 · 아이템이 말이 되는지. 모르는 칸은 받지 않는다. 빈 상태({})는 처음."""
    if not isinstance(state, dict) or set(state) - DESKPOP_KEYS:
        return False
    level, stars, total = state.get("level", 1), state.get("stars", 0), state.get("starsTotal", 0)
    if not (
        _int_in(level, 1, DESKPOP_MAX_LEVEL)
        and _int_in(stars, 0, DESKPOP_MAX_STARS)
        and _int_in(total, 0, DESKPOP_MAX_STARS)
    ):
        return False
    if not stars <= total <= level - 1:  # 별은 처음 깬 단계마다 1개
        return False
    tasks = state.get("tasks", [0] * 10)
    if not isinstance(tasks, list) or len(tasks) != 10 or not all(_int_in(t, 0, 5) for t in tasks):
        return False
    if any(tasks[i] > 0 and tasks[i - 1] != 5 for i in range(1, 10)):  # 앞 구역을 다 꾸며야 뒤 구역
        return False
    spent = sum(sum(DESKPOP_TASK_STARS[i][:t]) for i, t in enumerate(tasks))
    if spent + stars > total:
        return False
    styles = state.get("styles", [[0] * 5] * 10)
    if not isinstance(styles, list) or len(styles) != 10:
        return False
    if not all(isinstance(r, list) and len(r) == 5 and all(_int_in(v, 0, 2) for v in r) for r in styles):
        return False
    chest = state.get("chest", 0)
    if not _int_in(chest, 0, 10) or chest > sum(1 for t in tasks if t == 5):
        return False
    if not _int_in(state.get("coins", 200), 0, DESKPOP_MAX_COINS):
        return False
    boost = state.get("boost", {})
    if not isinstance(boost, dict) or set(boost) - set(DESKPOP_BOOST_KEYS):
        return False
    if not all(_int_in(v, 0, DESKPOP_MAX_BOOST) for v in boost.values()):
        return False
    if not _int_in(state.get("streak", 0), 0, DESKPOP_MAX_STARS) or not _int_in(state.get("bestRun", 0), 0, DESKPOP_MAX_RUN):
        return False
    seen = state.get("seen", [])
    return (
        isinstance(seen, list)
        and len(seen) <= DESKPOP_MAX_SEEN
        and all(isinstance(x, str) and 0 < len(x) <= 32 for x in seen)
    )


STATE_CHECKS["deskpop"] = check_deskpop_state


# 곰돌이 새총 원정대 진행 저장 — 값 검사(칸 · 타입 · 범위 · 크기. 화면 web/games/embed/slingfort.html 의 cleanSave 와 같은 칸)
# 점수(단계 최고)는 원정 점수(game.py 상한 100,000)의 재료라 단계 하나 상한을 넉넉히 둔다(실제 한 판은 2,000 안팎)
SLINGFORT_LEVELS = 10
SLINGFORT_MAX_GOLD = 9_999_999
SLINGFORT_MAX_LEVEL_SCORE = 20_000
SLINGFORT_UP_MAX = {"bomb": 3, "shield": 3, "giant": 3, "horn": 2}  # 곰 마을 칸 수
SLINGFORT_KEYS = {"v", "gold", "unlocked", "last", "stars", "best", "cleared", "up", "music", "sfx", "summary"}
SLINGFORT_LEVEL_KEYS = {str(i) for i in range(1, SLINGFORT_LEVELS + 1)}


def check_slingfort_state(state: dict) -> bool:
    """금화 · 열린 단계 · 단계별 별 · 최고 점수 · 깬 단계 · 강화 단계 · 소리 설정이 말이 되는지. 모르는 칸은 받지 않는다. 빈 상태({})는 처음."""
    if not isinstance(state, dict) or set(state) - SLINGFORT_KEYS:
        return False
    if state.get("v", 1) != 1 or state.get("summary") is not None:
        return False
    unlocked, last = state.get("unlocked", 1), state.get("last", 1)
    if not (
        _int_in(state.get("gold", 0), 0, SLINGFORT_MAX_GOLD)
        and _int_in(unlocked, 1, SLINGFORT_LEVELS)
        and _int_in(last, 1, SLINGFORT_LEVELS)
        and last <= unlocked
    ):
        return False
    cleared = state.get("cleared", {})
    if not isinstance(cleared, dict) or set(cleared) - SLINGFORT_LEVEL_KEYS or any(v is not True for v in cleared.values()):
        return False
    if any(int(k) > unlocked for k in cleared):  # 깬 단계는 열린 단계 안
        return False
    stars = state.get("stars", {})
    if not isinstance(stars, dict) or set(stars) - set(cleared):  # 별은 깬 단계에만
        return False
    if not all(_int_in(v, 1, 3) for v in stars.values()):
        return False
    best = state.get("best", {})
    if not isinstance(best, dict) or set(best) - SLINGFORT_LEVEL_KEYS:
        return False
    if not all(_int_in(v, 0, SLINGFORT_MAX_LEVEL_SCORE) for v in best.values()):
        return False
    up = state.get("up", {})
    if not isinstance(up, dict) or set(up) - set(SLINGFORT_UP_MAX):
        return False
    if not all(_int_in(v, 0, SLINGFORT_UP_MAX[k]) for k, v in up.items()):
        return False
    return all(isinstance(state.get(k, True), bool) for k in ("music", "sfx"))


STATE_CHECKS["slingfort"] = check_slingfort_state


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
