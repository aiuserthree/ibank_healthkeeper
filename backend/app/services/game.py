"""점심 라운지 — 게임 목록 · 점수 저장 · 오늘/이번 주/전체 · 부서 순위."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.config import get_settings
from app.core.time import now_kst, today_kst
from app.models import GamePlay, Member, MemberStatus
from app.services.avatar import member_avatar_url
from app.services.fun_stats import DEPARTMENT_RANKING_EXCLUDED
from app.services.korean_holidays import is_public_holiday


@dataclass(frozen=True)
class Game:
    key: str
    title: str
    category: str  # MINI(미니 게임) · QUIZ(퀴즈) · STUDY(어학)
    desc: str
    icon: str
    unit: str  # 점수 뒤에 붙는 말 — "time" 은 초 → 분:초, "centi" 는 1/100초 → 분:초.백분초(지금은 쓰는 게임 없음)
    max_score: int
    lower_better: bool = False
    # 하루 한 번만 순위에 반영 (모두 같은 문제를 받는 '오늘의 도전')
    daily_once: bool = False


GAMES: dict[str, Game] = {
    g.key: g
    for g in (
        Game("blocks", "점심 블록", "MINI", "줄을 채워 지우기 · 10줄마다 도시락 블록", "blocks", "점", 10_000_000),
        Game("shooter", "세균 격파", "MINI", "9가지 무기로 세균 편대 격파 · 같은 무기 3단계", "rocket", "점", 10_000_000),
        Game("match3", "비타민 3매치", "MINI", "3개·네모로 맞춰 펑! · 단계마다 새 맵과 목표", "cherry", "점", 10_000_000),
        Game("stairs", "별까지 계단", "MINI", "좌우 계단을 골라 별까지 · 동료 기록 깃발 넘기", "sparkles", "층", 100000),
        Game("crossing", "출근길 대작전", "MINI", "차·자전거·지각선을 피해 회사까지 한 칸씩", "footprints", "칸", 100000),
        Game("pairs", "아이콘 짝 잇기", "MINI", "같은 그림을 두 번 이하로 꺾어 잇기 · 콤보", "link", "점", 1_000_000),
        Game("bricks", "벽돌 깨기", "MINI", "공을 튕겨 야근·회의 벽돌 부수기", "brick-wall", "점", 10_000_000),
        Game("bubble", "비눗방울 대작전", "MINI", "비눗방울에 세균을 가두고 톡 터뜨리기", "droplets", "점", 10_000_000),
        Game("snake", "줄줄이 점심", "MINI", "비타민 먹고 길어지는 점심 줄 · 책상·벽 피하기", "utensils", "점", 1_000_000),
        Game("coffee", "커피 나르기", "MINI", "레인으로 커피를 밀어 동료에게 · 빈 잔은 받아 내기", "coffee", "점", 1_000_000),
        Game("stack", "점심 찬합 탑", "MINI", "타이밍 맞춰 찬합 쌓기 · 어긋난 만큼 잘려요", "layers", "점", 1_000_000),
        Game("sudoku", "오늘의 스도쿠", "MINI", "모두 같은 문제 · 빨리 푼 순서대로", "grid-3x3", "time", 24 * 3600, lower_better=True, daily_once=True),
        Game("mines", "칼퇴 지뢰찾기", "MINI", "야근 폭탄을 피해 칼퇴 자리 모두 열기 · 모두 같은 판", "bomb", "점", 1_000_000, daily_once=True),
        Game("promote", "승진 합치기", "MINI", "같은 직급을 밀어 합쳐 승진 · 오늘의 인사 판", "briefcase-business", "점", 1_000_000, daily_once=True),
        Game("chosung", "건강 초성 퀴즈", "QUIZ", "ㄱㅂㅁ → 거북목 · 오늘의 건강 낱말 5문제", "spell-check", "점", 100000, daily_once=True),
        Game("trivia", "오늘의 상식 퀴즈", "QUIZ", "쉬움부터 결승까지 4단계 · 매일 새 20문제", "lightbulb", "점", 100000, daily_once=True),
        Game("korean", "한국어 능력시험", "STUDY", "맞춤법·띄어쓰기·표준어 · 매일 새 20문제", "book-open-check", "점", 100000, daily_once=True),
        Game("typing", "영어 타자 레이스", "STUDY", "뜻을 보고 영어 단어 치기 · 첫 글자 힌트", "keyboard", "점", 1_000_000),
    )
}

# ── 이용 시간 — 업무 시간에는 게임을 할 수 없다 ──
# 평일(공휴일 제외) 09:00~11:30, 13:00~18:00 은 닫힘. 점심시간·퇴근 후·출근 전·주말·공휴일은 열림.
# 개발(DEBUG) 환경은 테스트를 위해 늘 열림.
CLOSED_WINDOWS = ((9 * 60, 11 * 60 + 30), (13 * 60, 18 * 60))
SUBMIT_GRACE_MIN = 10  # 점심시간 끝(13:00) 직전에 시작한 판은 10분 안에 끝내면 기록 인정


def play_window(now: datetime | None = None) -> dict:
    now = now or now_kst()
    if get_settings().debug:
        return {"open": True, "opensAt": None}
    minute = now.hour * 60 + now.minute
    workday = now.weekday() < 5 and not is_public_holiday(now.date())
    if workday:
        for start, end in CLOSED_WINDOWS:
            if start <= minute < end:
                return {"open": False, "opensAt": f"{end // 60:02d}:{end % 60:02d}"}
    return {"open": True, "opensAt": None}


def ensure_open(grace: bool = False) -> None:
    if play_window()["open"]:
        return
    if grace and play_window(now_kst() - timedelta(minutes=SUBMIT_GRACE_MIN))["open"]:
        return
    raise_app_error("GAME_CLOSED", 403)


LEADERBOARD_SIZE = 30
# 부서 순위 — 부서 상위 3명의 최고 기록 평균 (인원이 많은 부서가 무조건 이기지 않게)
DEPARTMENT_TOP_N = 3
SUBMIT_PER_MINUTE = 20


def get_game(key: str) -> Game:
    game = GAMES.get(key)
    if not game:
        raise_app_error("NOT_FOUND", 404)
    return game


def _game_payload(game: Game) -> dict:
    return {
        "key": game.key,
        "title": game.title,
        "category": game.category,
        "desc": game.desc,
        "icon": game.icon,
        "unit": game.unit,
        "lowerBetter": game.lower_better,
        "dailyOnce": game.daily_once,
    }


def _period_start(period: str, today: date) -> date | None:
    if period == "today":
        return today
    if period == "week":
        return today - timedelta(days=today.weekday())
    return None


def _best_expr(game: Game):
    return func.min(GamePlay.score) if game.lower_better else func.max(GamePlay.score)


async def _bests(db: AsyncSession, game: Game, since: date | None) -> list[tuple[int, int]]:
    """기간 안의 회원별 최고 기록 [(member_id, best)] — 좋은 순."""
    best = _best_expr(game).label("best")
    stmt = select(GamePlay.member_id, best).where(GamePlay.game == game.key)
    if since is not None:
        stmt = stmt.where(GamePlay.played_on >= since)
    stmt = stmt.group_by(GamePlay.member_id).order_by(best.asc() if game.lower_better else best.desc())
    return [(r.member_id, r.best) for r in (await db.execute(stmt)).all()]


def _ranked(rows: list[tuple[int, int]]) -> list[tuple[int, int, int]]:
    """[(rank, member_id, best)] — 같은 기록은 같은 순위."""
    out: list[tuple[int, int, int]] = []
    prev = None
    rank = 0
    for idx, (member_id, best) in enumerate(rows, start=1):
        if best != prev:
            rank, prev = idx, best
        out.append((rank, member_id, best))
    return out


async def _members(db: AsyncSession, ids: list[int]) -> dict[int, Member]:
    if not ids:
        return {}
    result = await db.execute(select(Member).where(Member.id.in_(ids)))
    return {m.id: m for m in result.scalars().all() if m.status == MemberStatus.ACTIVE}


async def list_games(db: AsyncSession, member: Member) -> list[dict]:
    """라운지 카드용 — 게임 수와 상관없이 쿼리 3번으로 모은다."""
    today = today_kst()
    # 오늘 회원별 최고·최저 기록 (게임마다 좋은 쪽을 고른다)
    today_rows = (
        await db.execute(
            select(GamePlay.game, GamePlay.member_id, func.max(GamePlay.score), func.min(GamePlay.score))
            .where(GamePlay.played_on == today)
            .group_by(GamePlay.game, GamePlay.member_id)
        )
    ).all()
    mine_rows = (
        await db.execute(
            select(GamePlay.game, func.max(GamePlay.score), func.min(GamePlay.score))
            .where(GamePlay.member_id == member.id)
            .group_by(GamePlay.game)
        )
    ).all()
    by_game: dict[str, list[tuple[int, int]]] = {}
    for game_key, member_id, hi, lo in today_rows:
        game = GAMES.get(game_key)
        if game:
            by_game.setdefault(game_key, []).append((member_id, lo if game.lower_better else hi))
    tops: dict[str, tuple[int, int]] = {}
    for game_key, rows in by_game.items():
        game = GAMES[game_key]
        tops[game_key] = (min if game.lower_better else max)(rows, key=lambda r: r[1])
    members = await _members(db, list({mid for mid, _ in tops.values()}))
    mine = {g: (lo if GAMES[g].lower_better else hi) for g, hi, lo in mine_rows if g in GAMES}

    # 업무 시간에는 오늘 1위·참가자 수도 숨긴다
    show_ranks = play_window()["open"]
    out = []
    for game in GAMES.values():
        rows = by_game.get(game.key, []) if show_ranks else []
        top = None
        if show_ranks and game.key in tops and tops[game.key][0] in members:
            m = members[tops[game.key][0]]
            top = {"name": m.name, "score": tops[game.key][1], "avatarUrl": member_avatar_url(m.id)}
        out.append(
            {
                **_game_payload(game),
                "todayTop": top,
                "todayPlayers": len(rows),
                "myBest": mine.get(game.key),
                # 내 참여 여부는 내 기록이라 업무 시간에도 알려 준다 (아케이드 '오늘의 도전' 표시)
                "playedToday": any(mid == member.id for mid, _ in by_game.get(game.key, [])),
            }
        )
    return out


async def _department_board(db: AsyncSession, game: Game, since: date | None, member: Member) -> list[dict]:
    rows = await _bests(db, game, since)
    members = await _members(db, [mid for mid, _ in rows])
    by_dept: dict[str, list[int]] = {}
    for mid, best in rows:
        m = members.get(mid)
        if not m or not m.department or m.department in DEPARTMENT_RANKING_EXCLUDED:
            continue
        by_dept.setdefault(m.department, []).append(best)  # rows가 좋은 순이라 앞쪽이 상위
    scored = [
        (dept, round(sum(v[:DEPARTMENT_TOP_N]) / len(v[:DEPARTMENT_TOP_N])), len(v))
        for dept, v in by_dept.items()
    ]
    scored.sort(key=lambda x: (x[1] if game.lower_better else -x[1], x[0]))
    out = []
    prev = None
    rank = 0
    for idx, (dept, score, players) in enumerate(scored, start=1):
        if score != prev:
            rank, prev = idx, score
        out.append({"rank": rank, "name": dept, "score": score, "players": players, "isMine": dept == member.department})
    return out


async def leaderboard(db: AsyncSession, member: Member, key: str, period: str) -> dict:
    # 업무 시간에는 순위도 닫는다 (막 끝난 판의 순위는 볼 수 있게 저장과 같은 여유를 둔다)
    ensure_open(grace=True)
    game = get_game(key)
    if period not in ("today", "week", "all"):
        period = "today"
    since = _period_start(period, today_kst())
    ranked = _ranked(await _bests(db, game, since))
    top = ranked[:LEADERBOARD_SIZE]
    me = next(((r, b) for r, mid, b in ranked if mid == member.id), None)
    members = await _members(db, [mid for _, mid, _ in top])
    rows = [
        {
            "rank": rank,
            "memberId": mid,
            "name": members[mid].name,
            "department": members[mid].department,
            "avatarUrl": member_avatar_url(mid),
            "score": best,
            "self": mid == member.id,
        }
        for rank, mid, best in top
        if mid in members
    ]
    return {
        "game": _game_payload(game),
        "period": period,
        "players": len(ranked),
        "rows": rows,
        "me": {"rank": me[0], "score": me[1]} if me else None,
        "departments": await _department_board(db, game, since, member),
    }


def _daily_key(game: Game, member: Member, day: date) -> str:
    return f"hk:game:daily:{game.key}:{member.id}:{day.isoformat()}"


async def start_daily(db: AsyncSession, redis: Redis, member: Member, key: str) -> dict:
    """오늘의 도전 시작 — 하루 첫 시작만 순위용 판으로 표시한다.

    문제를 본 뒤 새로고침해서 다시 시작하는 것을 막기 위해, 이미 시작한 날에는
    이후 판을 모두 연습(순위 미반영)으로 돌린다.
    """
    game = get_game(key)
    ensure_open()
    if not game.daily_once:
        return {"ranked": True, "token": None}
    today = today_kst()
    played = await db.scalar(
        select(func.count())
        .select_from(GamePlay)
        .where(GamePlay.game == key, GamePlay.member_id == member.id, GamePlay.played_on == today)
    )
    token = secrets.token_urlsafe(12)
    # 키가 없을 때만 저장 — 오늘 처음 시작한 판만 토큰을 받는다
    first = not played and await redis.set(_daily_key(game, member, today), token, nx=True, ex=36 * 3600)
    return {"ranked": bool(first), "token": token if first else None}


async def submit_score(
    db: AsyncSession, redis: Redis, member: Member, key: str, score: int, token: str | None = None
) -> dict:
    game = get_game(key)
    ensure_open(grace=True)
    if not isinstance(score, int) or score < 0 or score > game.max_score:
        raise_app_error("INVALID_SCORE", 400)
    rate_key = f"hk:game:rate:{member.id}"
    count = await redis.incr(rate_key)
    if count == 1:
        await redis.expire(rate_key, 60)
    if count > SUBMIT_PER_MINUTE:
        raise_app_error("TOO_MANY_REQUESTS", 429)

    today = today_kst()
    counted = True
    if game.daily_once:
        already = await db.scalar(
            select(func.count())
            .select_from(GamePlay)
            .where(GamePlay.game == key, GamePlay.member_id == member.id, GamePlay.played_on == today)
        )
        started = await redis.get(_daily_key(game, member, today))
        if isinstance(started, bytes):
            started = started.decode()
        counted = not already and bool(token) and started == token
    prev_best = await db.scalar(
        select(_best_expr(game)).where(GamePlay.game == key, GamePlay.member_id == member.id)
    )
    if counted:
        db.add(GamePlay(member_id=member.id, game=key, score=score, played_on=today))
        await db.commit()

    async def rank_in(since: date | None) -> int | None:
        ranked = _ranked(await _bests(db, game, since))
        return next((r for r, mid, _ in ranked if mid == member.id), None)

    better = prev_best is None or (score < prev_best if game.lower_better else score > prev_best)
    return {
        "counted": counted,
        "score": score,
        "newBest": counted and better,
        "best": score if counted and better else prev_best,
        "todayRank": await rank_in(today),
        "weekRank": await rank_in(_period_start("week", today)),
    }
