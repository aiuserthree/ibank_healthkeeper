"""점심 라운지 — 게임 목록 · 점수 저장 · 오늘/이번 주/전체 · 부서 순위."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.config import get_settings
from app.core.time import KST, now_kst, today_kst
from app.models import ArcadeStamp, Coupon, CouponSource, CouponStatus, GamePlay, GameRequest, Member, MemberStatus
from app.services.avatar import member_avatar_url
from app.services.fun_stats import DEPARTMENT_RANKING_EXCLUDED
from app.services.korean_holidays import is_public_holiday


# 상식 퀴즈 분야 — 화면(trivia.html CATS)과 같은 키
TRIVIA_VARIANTS = ("sci", "khist", "whist", "geo", "econ", "lit", "art", "sport", "lang", "life")


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
    # 갈래 — 고를 수 있는 판 종류(상식 퀴즈 분야). 갈래마다 순위와 하루 첫 판을 따로 센다. 빈 값 = 기본 판
    variants: tuple[str, ...] = ()


GAMES: dict[str, Game] = {
    g.key: g
    for g in (
        Game("blocks", "점심 블록", "MINI", "줄을 채워 지우기 · 10줄마다 도시락 블록", "blocks", "점", 10_000_000),
        Game("shooter", "세균 격파", "MINI", "9가지 무기로 세균 편대 격파 · 같은 무기 3단계", "rocket", "점", 10_000_000),
        Game("nightshift", "심야 편의점", "MINI", "손전등으로 비추며 아침 6시까지 벌레를 막아요", "flashlight", "점", 200000),
        Game("clown", "광대를 놓치지 마", "MINI", "꿀알바 시리즈 2화 · 빨간 코 광대에게서 눈을 떼지 말 것", "eye", "점", 200000),
        Game("milk", "새벽 우유 배달", "MINI", "꿀알바 시리즈 3화 · 규칙이 바뀌는 골목에 우유 넣기", "milk", "명", 200000),
        Game("theater", "심야 극장 안내", "MINI", "꿀알바 시리즈 4화 · 관객이 돌아보면 움직이지 말 것", "clapperboard", "점", 200000),
        Game("trial", "신약 시험 보조", "MINI", "꿀알바 시리즈 5화 · 병에 맞는 약을 제시간에 주기", "pill", "점", 200000),
        Game("silent", "조용한 공사장", "MINI", "꿀알바 시리즈 6화 · 소리를 내지 말고 8층까지", "hard-hat", "점", 200000),
        Game("parade", "야간 퍼레이드", "MINI", "꿀알바 시리즈 7화 · 박자에 맞춰 풍선 누르기", "music", "점", 200000),
        Game("finale", "마지막 축제", "MINI", "꿀알바 시리즈 8화 · 지금까지의 규칙을 모두 지킬 것", "tent", "점", 200000),
        Game("match3", "비타민 3매치", "MINI", "3개·네모로 맞춰 펑! · 단계마다 새 맵과 목표", "cherry", "점", 10_000_000),
        Game("stairs", "별까지 계단", "MINI", "좌우 계단을 골라 별까지 · 동료 기록 깃발 넘기", "sparkles", "층", 100000),
        Game("crossing", "출근길 대작전", "MINI", "차·자전거·지각선을 피해 회사까지 한 칸씩", "footprints", "칸", 100000),
        Game("pairs", "아이콘 짝 잇기", "MINI", "같은 그림을 두 번 이하로 꺾어 잇기 · 콤보", "link", "점", 1_000_000),
        Game("bricks", "벽돌 깨기", "MINI", "끌어서 조준해 공을 줄줄이 날려 숫자 벽돌 부수기", "brick-wall", "점", 10_000_000),
        Game("bubble", "비눗방울 대작전", "MINI", "비눗방울에 세균을 가두고 톡 터뜨리기", "droplets", "점", 10_000_000),
        Game("snake", "줄줄이 점심", "MINI", "비타민 먹고 길어지는 점심 줄 · 책상·벽 피하기", "utensils", "점", 1_000_000),
        Game("coffee", "커피 나르기", "MINI", "레인으로 커피를 밀어 동료에게 · 빈 잔은 받아 내기", "coffee", "점", 1_000_000),
        Game("stack", "점심 찬합 탑", "MINI", "타이밍 맞춰 찬합 쌓기 · 어긋난 만큼 잘려요", "layers", "점", 1_000_000),
        Game("sudoku", "오늘의 스도쿠", "MINI", "모두 같은 문제 · 빨리 푼 순서대로", "grid-3x3", "time", 24 * 3600, lower_better=True, daily_once=True),
        Game("mines", "칼퇴 지뢰찾기", "MINI", "야근 폭탄을 피해 칼퇴 자리 모두 열기 · 모두 같은 판", "bomb", "점", 1_000_000, daily_once=True),
        Game("promote", "승진 합치기", "MINI", "같은 직급을 밀어 합쳐 승진 · 오늘의 인사 판", "briefcase-business", "점", 1_000_000, daily_once=True),
        Game("chosung", "건강 초성 퀴즈", "QUIZ", "ㄱㅂㅁ → 거북목 · 오늘의 건강 낱말 20문제", "spell-check", "점", 100000, daily_once=True),
        Game("trivia", "오늘의 상식 퀴즈", "QUIZ", "전체 또는 분야별 하루 20문제 · 분야마다 순위", "lightbulb", "점", 100000, daily_once=True, variants=TRIVIA_VARIANTS),
        Game("korean", "한국어 능력시험", "STUDY", "맞춤법·띄어쓰기·표준어 · 매일 새 20문제", "book-open-check", "점", 100000, daily_once=True),
        Game("gomoku", "사내 오목", "MINI", "동료에게 도전장 · 번갈아 두는 턴제 대전", "swords", "승", 1_000_000),
        Game("chess", "사내 체스", "MINI", "동료 또는 컴퓨터와 두는 턴제 체스", "crown", "승", 1_000_000),
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


def get_variant(game: Game, variant: str | None) -> str:
    """갈래 확인 — 빈 값은 기본 판, 그 밖에는 게임이 정한 갈래만."""
    v = (variant or "").strip()
    if v and v not in game.variants:
        raise_app_error("NOT_FOUND", 404)
    return v


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


async def _bests(
    db: AsyncSession, game: Game, since: date | None, variant: str = "", until: date | None = None
) -> list[tuple[int, int]]:
    """기간 안의 회원별 최고 기록 [(member_id, best)] — 좋은 순. 갈래가 있는 게임은 그 갈래만."""
    best = _best_expr(game).label("best")
    stmt = select(GamePlay.member_id, best).where(GamePlay.game == game.key, GamePlay.variant == variant)
    if since is not None:
        stmt = stmt.where(GamePlay.played_on >= since)
    if until is not None:
        stmt = stmt.where(GamePlay.played_on <= until)
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
            .where(GamePlay.played_on == today, GamePlay.variant == "")
            .group_by(GamePlay.game, GamePlay.member_id)
        )
    ).all()
    mine_rows = (
        await db.execute(
            select(GamePlay.game, func.max(GamePlay.score), func.min(GamePlay.score))
            .where(GamePlay.member_id == member.id, GamePlay.variant == "")
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
    # 오늘 기록을 남긴 갈래 (상식 퀴즈 분야별 '오늘 완료' 표시)
    variant_rows = (
        await db.execute(
            select(GamePlay.game, GamePlay.variant)
            .where(GamePlay.member_id == member.id, GamePlay.played_on == today, GamePlay.variant != "")
            .distinct()
        )
    ).all()
    played_variants: dict[str, list[str]] = {}
    for g, v in variant_rows:
        played_variants.setdefault(g, []).append(v)

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
                **({"variants": list(game.variants), "playedVariants": played_variants.get(game.key, [])} if game.variants else {}),
            }
        )
    return out


async def _department_board(db: AsyncSession, game: Game, since: date | None, member: Member, variant: str = "") -> list[dict]:
    rows = await _bests(db, game, since, variant)
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


async def leaderboard(db: AsyncSession, member: Member, key: str, period: str, variant: str | None = None) -> dict:
    # 업무 시간에는 순위도 닫는다 (막 끝난 판의 순위는 볼 수 있게 저장과 같은 여유를 둔다)
    ensure_open(grace=True)
    game = get_game(key)
    variant = get_variant(game, variant)
    if period not in ("today", "week", "all"):
        period = "today"
    since = _period_start(period, today_kst())
    ranked = _ranked(await _bests(db, game, since, variant))
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
        "variant": variant,
        "players": len(ranked),
        "rows": rows,
        "me": {"rank": me[0], "score": me[1]} if me else None,
        "departments": await _department_board(db, game, since, member, variant),
    }


async def _week_bests(db: AsyncSession, game: Game, start: date, end: date) -> tuple[list[tuple[int, int]], dict[int, str]]:
    """명예의 전당용 회원별 최고 기록 — 갈래가 있는 게임은 전체·갈래를 통틀어 가장 좋은 기록과 그 갈래."""
    if not game.variants:
        return await _bests(db, game, start, "", end), {}
    best: dict[int, int] = {}
    where: dict[int, str] = {}
    for variant in ("", *game.variants):
        for member_id, score in await _bests(db, game, start, variant, end):
            if member_id not in best or (score < best[member_id] if game.lower_better else score > best[member_id]):
                best[member_id] = score
                where[member_id] = variant
    rows = sorted(best.items(), key=lambda r: r[1], reverse=not game.lower_better)
    return rows, where


async def last_week_board(db: AsyncSession) -> dict:
    """지난주(월~일) 게임별 1~3위 — 아케이드 '지난주 명예의 전당'. 월요일마다 저절로 바뀐다."""
    today = today_kst()
    end = today - timedelta(days=today.weekday() + 1)  # 지난주 일요일
    start = end - timedelta(days=6)
    picked: list[tuple[Game, list[tuple[int, int, int]], dict[int, str]]] = []
    for game in GAMES.values():
        rows, where = await _week_bests(db, game, start, end)
        ranked = _ranked(rows)[:3]
        if ranked:
            picked.append((game, ranked, where))
    members = await _members(db, list({mid for _, rows, _ in picked for _, mid, _ in rows}))
    games = []
    for game, rows, where in picked:
        top = [
            {
                "rank": rank,
                "name": members[mid].name,
                "department": members[mid].department,
                "avatarUrl": member_avatar_url(mid),
                "score": best,
                "variant": where.get(mid, ""),
            }
            for rank, mid, best in rows
            if mid in members
        ]
        if top:
            games.append({**_game_payload(game), "top": top})
    return {"from": start.isoformat(), "to": end.isoformat(), "games": games}


# ── 참여 도장 — 하루에 한 판이라도 끝까지 하면 도장 1개, 한 달에 STAMP_GOAL 개면 무적 쿠폰 1장(월 1장)
STAMP_GOAL = 10
# 판 길이 제한 없음 — 일찍 죽어 끝난 판도 도장. 다만 게임 화면에서 판을 시작한 기록(run)은 있어야 한다 (점수만 보내는 꼼수 막기)
STAMP_MIN_SEC = 0
ARCADE_COUPON_DAYS = 30  # 아케이드 쿠폰 사용 기한 — 받은 날부터 30일


def _run_key(member: Member, key: str) -> str:
    return f"hk:game:run:{member.id}:{key}"


async def start_run(redis: Redis, member: Member, key: str, fresh: bool = False) -> None:
    """판 시작 시각. fresh 면 새 판이라 다시 잰다, 아니면(시작 화면 준비·이어 하기) 이미 있으면 그대로 둔다."""
    get_game(key)
    await redis.set(_run_key(member, key), str(int(time.time() * 1000)), nx=not fresh, ex=3 * 3600)


async def stamp_status(db: AsyncSession, member: Member, day: date | None = None) -> dict:
    """참여 도장 — 달이 바뀌어도 이어서 모은다. 10개마다 쿠폰 1장(한 달에 1장까지).

    지금 도장판 = 전체 도장에서 쿠폰으로 바꾼 만큼(쿠폰 수 × 10)을 뺀 나머지.
    이번 달 쿠폰을 이미 받았는데 10개가 또 차면 다음 달 1일에 쿠폰이 들어온다(pending).
    """
    day = day or today_kst()
    dates = (
        await db.execute(
            select(ArcadeStamp.stamp_date).where(ArcadeStamp.member_id == member.id).order_by(ArcadeStamp.stamp_date)
        )
    ).scalars().all()
    month = f"{day.year:04d}-{day.month:02d}"
    used = await db.scalar(
        select(func.count()).select_from(Coupon).where(Coupon.member_id == member.id, Coupon.source == CouponSource.ARCADE)
    ) or 0
    this_month = await db.scalar(
        select(func.count()).select_from(Coupon).where(
            Coupon.member_id == member.id, Coupon.source == CouponSource.ARCADE, Coupon.grant_month == month
        )
    ) or 0
    card = list(dates[used * STAMP_GOAL :])
    count = min(len(card), STAMP_GOAL)
    return {
        "month": month,
        "days": [d.isoformat() for d in card[:STAMP_GOAL]],
        "count": count,
        "goal": STAMP_GOAL,
        "today": day in set(dates),
        "coupon": bool(this_month),  # 이번 달 아케이드 쿠폰을 받았는지
        "pending": count >= STAMP_GOAL and bool(this_month),  # 10개 다 찼지만 이번 달 몫은 받아서 다음 달 1일에
        "minSeconds": STAMP_MIN_SEC,
    }


async def _issue_arcade_coupon_if_due(db: AsyncSession, member: Member, day: date) -> bool:
    """도장판이 10개 찼고 이번 달 쿠폰을 아직 안 받았으면 1장 준다 (커밋은 부르는 쪽에서)."""
    st = await stamp_status(db, member, day)
    if st["count"] < STAMP_GOAL or st["coupon"]:
        return False
    now = now_kst()
    # 받은 날부터 30일 (예: 10/1 받으면 10/31 23:59까지) — 언제 받든 수요일 신청이 4번 넘게 들어간다
    until = datetime.combine(now.date() + timedelta(days=ARCADE_COUPON_DAYS + 1), datetime.min.time(), tzinfo=KST)
    db.add(
        Coupon(
            member_id=member.id,
            source=CouponSource.ARCADE,
            status=CouponStatus.AVAILABLE,
            grant_month=st["month"],
            issued_at=now,
            expires_at=until,
            note="아케이드 도장 10개",
        )
    )
    await db.flush()
    return True


async def issue_pending_arcade_coupons(db: AsyncSession) -> int:
    """매일 자정 — 지난달에 도장 10개를 또 채워 두고 기다리던 회원에게 이번 달 쿠폰을 준다."""
    today = today_kst()
    ids = (await db.execute(select(ArcadeStamp.member_id).distinct())).scalars().all()
    members = await _members(db, list(ids))
    issued = 0
    for m in members.values():
        if await _issue_arcade_coupon_if_due(db, m, today):
            issued += 1
    if issued:
        await db.commit()
    return issued


async def _give_stamp(db: AsyncSession, member: Member, key: str, today: date) -> dict:
    """오늘 첫 도장이면 찍고, 도장판 10개를 채우면 쿠폰을 준다 (한 달에 1장).

    이번 달 쿠폰을 받은 뒤 다시 10개를 채운 판은 다음 달 1일 쿠폰으로 기다린다 — 기다리는 판은 1장까지라,
    그 판이 꽉 찬 동안 찍는 도장은 쌓지 않는다 (매일 해도 받을 수 있는 쿠폰은 한 달 1장이라 손해 없음).
    """
    # 지난달에 채워 두고 기다리던 몫부터 받는다 (달이 바뀐 첫 판)
    issued = await _issue_arcade_coupon_if_due(db, member, today)
    has = await db.scalar(
        select(func.count()).select_from(ArcadeStamp).where(ArcadeStamp.member_id == member.id, ArcadeStamp.stamp_date == today)
    )
    new = False
    if not has and not (await stamp_status(db, member, today))["pending"]:
        db.add(ArcadeStamp(member_id=member.id, stamp_date=today, game=key))
        await db.flush()
        new = True
        issued = await _issue_arcade_coupon_if_due(db, member, today) or issued
    if new or issued:
        await db.commit()
    st = await stamp_status(db, member, today)
    return {"new": new, "count": st["count"], "goal": st["goal"], "coupon": issued, "today": st["today"], "pending": st["pending"]}


def _daily_key(game: Game, member: Member, day: date, variant: str = "") -> str:
    return f"hk:game:daily:{game.key}{':' + variant if variant else ''}:{member.id}:{day.isoformat()}"


async def start_daily(db: AsyncSession, redis: Redis, member: Member, key: str, variant: str | None = None) -> dict:
    """오늘의 도전 시작 — 하루 첫 시작만 순위용 판으로 표시한다.

    문제를 본 뒤 새로고침해서 다시 시작하는 것을 막기 위해, 이미 시작한 날에는
    이후 판을 모두 연습(순위 미반영)으로 돌린다.
    """
    game = get_game(key)
    variant = get_variant(game, variant)
    ensure_open()
    await start_run(redis, member, key)
    if not game.daily_once:
        return {"ranked": True, "token": None}
    today = today_kst()
    played = await db.scalar(
        select(func.count())
        .select_from(GamePlay)
        .where(GamePlay.game == key, GamePlay.variant == variant, GamePlay.member_id == member.id, GamePlay.played_on == today)
    )
    token = secrets.token_urlsafe(12)
    # 키가 없을 때만 저장 — 오늘 처음 시작한 판만 토큰을 받는다 (갈래마다 따로)
    first = not played and await redis.set(_daily_key(game, member, today, variant), token, nx=True, ex=36 * 3600)
    return {"ranked": bool(first), "token": token if first else None}


async def submit_score(
    db: AsyncSession, redis: Redis, member: Member, key: str, score: int, token: str | None = None, variant: str | None = None
) -> dict:
    game = get_game(key)
    variant = get_variant(game, variant)
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
    # 판 길이 — 시작(또는 준비) 시각부터. 쓰고 나면 지워 다음 판이 새로 잰다
    run_key = _run_key(member, key)
    started_ms = await redis.get(run_key)
    await redis.delete(run_key)
    if isinstance(started_ms, bytes):
        started_ms = started_ms.decode()
    played_sec = (time.time() * 1000 - int(started_ms)) / 1000 if started_ms and str(started_ms).isdigit() else 0
    counted = True
    if game.daily_once:
        already = await db.scalar(
            select(func.count())
            .select_from(GamePlay)
            .where(GamePlay.game == key, GamePlay.variant == variant, GamePlay.member_id == member.id, GamePlay.played_on == today)
        )
        started = await redis.get(_daily_key(game, member, today, variant))
        if isinstance(started, bytes):
            started = started.decode()
        counted = not already and bool(token) and started == token
    prev_best = await db.scalar(
        select(_best_expr(game)).where(GamePlay.game == key, GamePlay.variant == variant, GamePlay.member_id == member.id)
    )
    if counted:
        db.add(GamePlay(member_id=member.id, game=key, variant=variant, score=score, played_on=today))
        await db.commit()

    async def rank_in(since: date | None) -> int | None:
        ranked = _ranked(await _bests(db, game, since, variant))
        return next((r for r, mid, _ in ranked if mid == member.id), None)

    # 참여 도장 — 연습 판(오늘의 도전 두 번째 판부터)도 끝까지 했으면 인정
    if started_ms and played_sec >= STAMP_MIN_SEC:
        stamp = await _give_stamp(db, member, key, today)
    else:
        st = await stamp_status(db, member, today)
        stamp = {"new": False, "count": st["count"], "goal": st["goal"], "coupon": False, "today": st["today"], "short": True}

    better = prev_best is None or (score < prev_best if game.lower_better else score > prev_best)
    return {
        "stamp": stamp,
        "counted": counted,
        "score": score,
        "newBest": counted and better,
        "best": score if counted and better else prev_best,
        "todayRank": await rank_in(today),
        "weekRank": await rank_in(_period_start("week", today)),
    }


# 게임 요청 — 하루에 보낼 수 있는 개수 · 한 건 글자 수
GAME_REQUEST_PER_DAY = 5
GAME_REQUEST_MAX_LEN = 300
GAME_REQUEST_STATUSES = ("NEW", "PLANNED", "DONE", "HOLD")
GAME_REQUEST_KINDS = ("GAME", "BUG", "IDEA")  # 하고 싶은 게임 · 오류 신고 · 개선 의견


async def add_game_request(
    db: AsyncSession, member: Member, body: str, kind: str | None = None, game: str | None = None, device: str | None = None
) -> None:
    text = " ".join((body or "").split())[:GAME_REQUEST_MAX_LEN]
    if len(text) < 2:
        raise_app_error("GAME_REQUEST_EMPTY", 400)
    kind = kind if kind in GAME_REQUEST_KINDS else "GAME"
    game = game if game in GAMES else None
    device = " ".join((device or "").split())[:200] or None
    day_start = now_kst().replace(hour=0, minute=0, second=0, microsecond=0)
    sent = await db.scalar(
        select(func.count()).select_from(GameRequest).where(
            GameRequest.member_id == member.id, GameRequest.created_at >= day_start
        )
    )
    if (sent or 0) >= GAME_REQUEST_PER_DAY:
        raise_app_error("GAME_REQUEST_LIMIT")
    db.add(GameRequest(member_id=member.id, body=text, kind=kind, game=game, device=device))
    await db.commit()


async def admin_game_requests(db: AsyncSession) -> dict:
    rows = (
        await db.execute(
            select(GameRequest, Member)
            .join(Member, Member.id == GameRequest.member_id)
            .order_by(GameRequest.created_at.desc())
        )
    ).all()
    items = [
        {
            "id": r.id,
            "body": r.body,
            "status": r.status,
            "kind": r.kind,
            "game": {"key": r.game, "title": GAMES[r.game].title} if r.game in GAMES else None,
            "device": r.device,
            "createdAt": r.created_at.isoformat(),
            "member": {"id": m.id, "name": m.name, "department": m.department},
        }
        for r, m in rows
    ]
    counts = {s: sum(1 for it in items if it["status"] == s) for s in GAME_REQUEST_STATUSES}
    kinds = {k: sum(1 for it in items if it["kind"] == k) for k in GAME_REQUEST_KINDS}
    return {"items": items, "counts": counts, "kinds": kinds}


async def admin_set_game_request_status(db: AsyncSession, request_id: int, status: str) -> None:
    if status not in GAME_REQUEST_STATUSES:
        raise_app_error("INVALID_CHANGE", 400)
    row = await db.get(GameRequest, request_id)
    if not row:
        raise_app_error("NOT_FOUND", 404)
    row.status = status
    await db.commit()
