"""부서 대항 레이드 — 한 주(월 00:00 ~ 일 24:00, KST) 동안 부서마다 이번 주 보스를 따로 상대한다.

부서원이 아케이드에서 한 일이 모두 보스 피해가 된다. 목표는 몇 사람이 오래 하는 것보다 여러 부서의 많은 사람이
조금씩 하게 만드는 것 — 그래서 하루 한도가 있고, 첫 판이 가장 세고, 다른 부서 직원과 함께하면 두 부서 모두 더 센
피해를 주고, 보스는 하루에 조금씩만 깎이고, 부서원 절반이 나서야 쓰러진다.

새 테이블은 없다. 이미 남는 기록으로 매번 계산하고 Redis 에 60초 담아 둔다.
  game_play(끝난 판) · arcade_stamp(그날 첫 판 도장) · game_match(대전) · escape_room(2인 협동)

피해 (한 사람 기준, SOURCES)
  오늘 첫 판             100   하루 1번 — 그날 처음 끝낸 게임(아케이드 · 대전 · 협동 · 도장 가운데 가장 이른 것)
                               도장 행이 없어도 받는다(도장판이 다 차서 다음 달 쿠폰을 기다리는 사람은 도장 행이 안 생긴다)
  아케이드 한 판          10   하루 5판까지
  직원과 대전             30   이기면 +20 · 하루 3판까지 · 두 사람 모두
  컴퓨터와 대전           10   하루 3판까지
  2인 협동                50   하루 3판까지 · 두 사람 모두
                               방탈출은 실패해도 25 — 1분 넘게 하고 자물쇠를 풀었거나 답을 넣어 본 판만
                               시간제 협동(분식집 · 낱말 · 주차장 …)은 점수가 난 판만 — 가만히 시간만 보낸 판은 뺀다
  다른 부서와 함께       +30   대전 · 협동 상대가 다른 부서면 두 사람 모두 자기 부서에
  하루 한도              200   한 사람이 하루에 줄 수 있는 피해 — 넘는 만큼은 버린다(시간 순으로 채운다)

보스 체력 = 부서 인원 × 200
  인원 = 그 주에 처음 계산할 때의 활성 실제 직원 수. Redis 에 담아 두고 한 주 내내 쓴다
  (주중에 누가 처음 로그인하거나 부서를 옮겨도 체력이 바뀌지 않게). 1인당 몫이 같아 큰 부서 · 작은 부서가 같은 조건이다.
  200 ≈ 부서원 10명 중 4명이 일주일에 4일, 하루 한두 판(첫 판 100 + 두세 판, 약 125)씩 하면 채우는 양.

보스가 버티는 규칙 — 몇 사람이 몰아서 하거나 자정에 몰아치는 것보다 여럿이 조금씩이 이기게
  - 보스는 하루(KST)에 체력의 1/3 까지만 깎인다. 그래서 빨라도 수요일에 쓰러진다.
    넘는 피해는 부서 판에 들어가지 않는다(내 몫 · 참여 인원에는 그대로 남는다).
  - 부서원 절반 이상(적어도 2명)이 공격해야 쓰러진다. 그 전에는 체력 1을 남기고 버틴다 — 혼자서는 못 잡는다.
  - 순위: 쓰러뜨린 날(KST)이 빠른 부서가 앞. 같은 날이면 참여율(공격한 사람 / 인원)이 높은 부서가 앞, 같으면 공동 순위.
    못 잡은 부서는 깎은 % → 참여율 순.
  - 한번 쓰러진 보스는 그 주 동안 쓰러진 채로 둔다(쓰러뜨린 시각도 Redis 에 담아 둔다).

정한 것 (단순하게)
  - 실제 직원(Teams 로그인, 시연 · 발송 계정 제외)이면서 지금 ACTIVE 인 회원만 센다.
  - 피해는 지금 회원 정보의 부서로 간다 — 주중에 부서를 옮기면 그 주 피해도 새 부서로 간다.
  - 활성 직원이 2명이 안 되는 부서 · 부서 없음 · 부서 대항전 제외 부서(fun_stats)는 레이드에 나오지 않는다.
  - 대전 · 협동의 날짜와 주는 끝난 시각(KST) 기준. 대전은 도장과 같은 기준(match._counts)으로 센 판만 —
    바로 기권한 판 · 컴퓨터전 시간 초과는 빠진다.
  - 보스는 ISO 주 번호로 8마리를 돌아가며 — 화면이 키(key)마다 그림을 그린다.
  - 지난 기록은 레이드를 연 주(RAID_START)부터만 보여 준다.
"""

from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Awaitable, Callable, Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import KST, format_kst_iso, now_kst, to_kst
from app.models import ArcadeStamp, EscapeRoom, GameMatch, GamePlay, Member, MemberStatus
from app.services.avatar import member_avatar_url
from app.services.escape_rooms import ROOMS as PUZZLE_ROOMS
from app.services.fun_stats import DEPARTMENT_MIN_MEMBERS, DEPARTMENT_RANKING_EXCLUDED
from app.services.game import GAMES, game_visible
from app.services.transfer import _TRANSFER_EXCLUDED_EMAIL_DOMAINS, _TRANSFER_EXCLUDED_EMAIL_LOCAL

logger = logging.getLogger(__name__)

DAILY_CAP = 200  # 한 사람이 하루에 줄 수 있는 피해
HP_PER_MEMBER = 200  # 보스 체력 = 부서 인원 × 이 값
BOSS_DAYS = 3  # 보스는 하루에 체력의 1/3 까지만 깎인다 — 빨라도 사흘째(수요일)에 쓰러진다
JOIN_RATE = 50  # 부서원 이 % 이상이 공격해야 쓰러진다
JOIN_MIN = 2  # 그리고 적어도 이 인원 — 혼자서는 못 잡는다
WIN_BONUS = 20  # 직원과 대전에서 이기면
CROSS_BONUS = 30  # 다른 부서 직원과 대전 · 협동하면 두 사람 모두
COOP_FAIL_DMG = 25  # 방탈출 실패(시간 초과 · 포기)
COOP_FAIL_MIN_SEC = 60  # 실패한 방탈출은 이만큼 넘게 한 판만 — 들어가자마자 포기하는 판은 빼려고
TOP_SIZE = 10  # 우리 부서 순위 인원
HISTORY_WEEKS = 4
RAID_START = date(2026, 11, 2)  # 레이드를 연 주(월요일) — 이보다 앞선 주는 지난 기록에 넣지 않는다
CACHE_TTL = 60  # 이번 주 판 (초)
HISTORY_TTL = 3600  # 지난 주들 — 끝난 주라 거의 안 바뀐다
FIX_TTL = 7 * 86400 * (HISTORY_WEEKS + 2)  # 주마다 고정한 인원 · 쓰러뜨린 시각 — 지난 기록을 그리는 동안 남겨 둔다
CACHE_PREFIX = "hk:raid:"
CROSS_LABEL = "다른 부서와 함께"
_WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


@dataclass(frozen=True)
class Source:
    key: str
    label: str
    dmg: int
    per_day: int  # 하루에 세는 횟수
    note: str


SOURCES: tuple[Source, ...] = (
    Source("stamp", "오늘 첫 판", 100, 1, "하루 1번 · 그날 처음 끝낸 게임"),
    Source("game", "아케이드 한 판", 10, 5, "하루 5판까지"),
    Source("versus", "직원과 대전", 30, 3, f"이기면 +{WIN_BONUS} · 하루 3판까지"),
    Source("bot", "컴퓨터와 대전", 10, 3, "하루 3판까지"),
    Source("coop", "2인 협동", 50, 3, f"방탈출은 실패해도 {COOP_FAIL_DMG} · 하루 3판까지"),
)
SOURCE_BY_KEY = {s.key: s for s in SOURCES}
_SOURCE_ORDER = {s.key: i for i, s in enumerate(SOURCES)}


@dataclass(frozen=True)
class Boss:
    key: str
    name: str
    title: str
    desc: str
    weakness: str


# ISO 주 번호로 돌아가며 — (주 번호 - 1) % 8. 화면(아케이드)이 key 마다 그림을 그린다
BOSSES: tuple[Boss, ...] = (
    Boss("monday_dragon", "월요병 드래곤", "한 주의 시작을 막아서는 용",
         "월요일 아침마다 깨어나 출근길을 무겁게 해요. 다 같이 한 판씩 하면 비늘이 떨어져요.", "가벼운 기지개와 웃음"),
    Boss("flu_virus", "독감 바이러스 대왕", "기침 한 번에 사무실이 흔들려요",
         "찬 바람을 타고 이 자리 저 자리 옮겨 다녀요. 여럿이 함께 막아야 물러나요.", "손 씻기와 푹 자기"),
    Boss("overtime_golem", "야근 골렘", "서류 더미로 빚은 거인",
         "퇴근 시간이 되면 일어나 발목을 붙잡아요. 쌓인 서류를 하나씩 떼어 내요.", "제때 퇴근하기"),
    Boss("turtle_neck", "거북목 거인", "모니터 쪽으로 목이 쭉 나온 거인",
         "하루 종일 화면만 보다가 목이 이만큼 길어졌어요. 고개를 들고 맞서요.", "어깨 펴고 목 돌리기"),
    Boss("deadline_storm", "마감 폭풍", "마감 전날 밤에 몰아치는 폭풍",
         "할 일을 한꺼번에 쏟아붓고 지나가요. 나눠서 막으면 금방 잦아들어요.", "미리미리 나눠 하기"),
    Boss("dust_cloud", "미세먼지 구름", "하늘을 뿌옇게 덮은 구름",
         "창밖을 흐리게 하고 숨을 답답하게 해요. 여럿이 부채질하면 흩어져요.", "환기와 물 한 잔"),
    Boss("sleepy_lord", "졸음 마왕", "점심 먹고 두 시면 찾아와요",
         "눈꺼풀 위에 앉아 무겁게 눌러요. 짧게 몸을 움직이면 달아나요.", "자리에서 일어나 걷기"),
    Boss("stress_slime", "스트레스 슬라임", "쌓일수록 커지는 끈적한 슬라임",
         "작은 짜증을 먹고 점점 불어나요. 함께 웃으면 녹아내려요.", "동료와 수다 한 판"),
)


# ── 순수 계산 (DB 없이 시험할 수 있게) ─────────────────────────────


@dataclass(frozen=True)
class Act:
    """피해가 될 활동 하나 — 하루 한도를 적용하기 전."""

    member_id: int
    at: datetime  # 시각 — 쓰러뜨린 순간을 정하는 순서
    day: date  # KST 날짜 — 하루 한도 기준
    source: str  # SOURCES 키
    dmg: int  # 기본 피해 (대전 승리 · 협동 실패 반영)
    cross: bool = False  # 다른 부서 직원과 함께한 판


@dataclass(frozen=True)
class Hit:
    """하루 한도를 적용한 뒤 실제로 들어간 피해."""

    member_id: int
    at: datetime
    day: date
    source: str
    dmg: int  # 기본 몫
    cross: int = 0  # 다른 부서 보너스 몫

    @property
    def total(self) -> int:
        return self.dmg + self.cross


@dataclass(frozen=True)
class CoopRun:
    """끝난 2인 협동 한 판."""

    host: int
    guest: int
    status: str  # CLEAR · FAILED
    started: Optional[datetime]
    finished: datetime
    puzzle: bool = True  # 방탈출(자물쇠를 푸는 방) — 아니면 시간제 협동(분식집 · 낱말 · 주차장 …)
    score: Optional[int] = None  # 시간제 협동 점수
    progressed: bool = True  # 방탈출에서 자물쇠를 풀었거나 답을 넣어 본 적이 있는지


def week_start(day: date) -> date:
    """그 날이 속한 주의 월요일."""
    return day - timedelta(days=day.weekday())


def week_info(monday: date) -> dict:
    ends = datetime.combine(monday + timedelta(days=7), time(0), tzinfo=KST)
    return {
        "start": monday.isoformat(),
        "end": (monday + timedelta(days=6)).isoformat(),
        "endsAt": ends.isoformat(timespec="seconds"),
        "no": monday.isocalendar()[1],
    }


def boss_for(monday: date) -> Boss:
    return BOSSES[(monday.isocalendar()[1] - 1) % len(BOSSES)]


def boss_hp(members: int) -> int:
    return members * HP_PER_MEMBER


def boss_day_max(hp: int) -> int:
    """보스가 하루에 깎일 수 있는 피해 — 체력의 1/BOSS_DAYS (올림)."""
    return -(-hp // BOSS_DAYS) if hp > 0 else 0


def join_need(members: int) -> int:
    """보스를 쓰러뜨리는 데 필요한 공격 인원 — 부서원 JOIN_RATE% (올림), 적어도 JOIN_MIN 명."""
    need = max(JOIN_MIN, (members * JOIN_RATE + 99) // 100)
    return min(need, members) if members > 0 else need


def is_real_person(email: Optional[str], entra_oid: Optional[str]) -> bool:
    """실제 직원 — match._real_person 과 같은 기준(Teams 로그인 · mock-* · healthkeeper 계정 제외)."""
    local, _, domain = (email or "").lower().partition("@")
    oid = (entra_oid or "").lower()
    return (
        bool(oid)
        and not oid.startswith("mock-")
        and local != _TRANSFER_EXCLUDED_EMAIL_LOCAL
        and domain not in _TRANSFER_EXCLUDED_EMAIL_DOMAINS
    )


def eligible_departments(dept_of: dict[int, str]) -> dict[str, int]:
    """레이드에 나오는 부서 → 인원. 부서 없음 · 제외 부서 · 2명이 안 되는 부서는 뺀다."""
    sizes = Counter(d for d in dept_of.values() if d and d not in DEPARTMENT_RANKING_EXCLUDED)
    return {d: n for d, n in sizes.items() if n >= DEPARTMENT_MIN_MEMBERS}


def coop_dmg(run: CoopRun) -> Optional[int]:
    """협동 한 판의 기본 피해 — 세지 않는 판이면 None."""
    if run.status == "CLEAR":
        if run.puzzle or (run.score or 0) > 0:
            return SOURCE_BY_KEY["coop"].dmg
        return None  # 시간제 협동인데 점수가 0 — 방만 열어 두고 시간을 보낸 판
    if run.status == "FAILED" and run.puzzle and run.progressed and run.started is not None:
        if (run.finished - run.started).total_seconds() > COOP_FAIL_MIN_SEC:
            return COOP_FAIL_DMG
    return None  # 시간제 협동 포기 · 방탈출을 열자마자 포기하거나 손대지 않고 둔 판


def build_acts(
    dept_of: dict[int, str],
    plays: Iterable[tuple[int, date, datetime]],
    stamps: Iterable[tuple[int, date, datetime]],
    matches: Iterable[tuple[int, Optional[int], Optional[str], Optional[int], datetime]],
    rooms: Iterable[CoopRun],
) -> list[Act]:
    """기록 → 활동. 실제 활성 직원(dept_of 에 있는 사람)의 몫만 만든다.

    plays · stamps: (회원, KST 날짜, 시각)
    matches: (건 사람, 상대 또는 None, 컴퓨터 난이도 또는 None, 이긴 사람 또는 None, 끝난 시각) — 센 판만
    rooms: 끝난 협동 판
    '오늘 첫 판'은 (회원, 날짜)마다 가장 이른 활동 시각에 하나 — 도장 행은 그 후보 가운데 하나일 뿐이다.
    """
    acts: list[Act] = []

    def cross(a: int, b: Optional[int]) -> bool:
        da, db_ = dept_of.get(a), dept_of.get(b) if b is not None else None
        return bool(da) and bool(db_) and da != db_

    for mid, day, at in plays:
        if mid in dept_of:
            acts.append(Act(mid, to_kst(at), day, "game", SOURCE_BY_KEY["game"].dmg))
    for challenger, opponent, bot, winner, at in matches:
        at = to_kst(at)
        if bot is not None or opponent is None:
            if challenger in dept_of:
                acts.append(Act(challenger, at, at.date(), "bot", SOURCE_BY_KEY["bot"].dmg))
            continue
        x = cross(challenger, opponent)
        for mid in (challenger, opponent):
            if mid in dept_of:
                dmg = SOURCE_BY_KEY["versus"].dmg + (WIN_BONUS if winner == mid else 0)
                acts.append(Act(mid, at, at.date(), "versus", dmg, x))
    for run in rooms:
        dmg = coop_dmg(run)
        if dmg is None:
            continue
        at = to_kst(run.finished)
        x = cross(run.host, run.guest)
        for mid in (run.host, run.guest):
            if mid in dept_of:
                acts.append(Act(mid, at, at.date(), "coop", dmg, x))

    # 오늘 첫 판 — 그날 처음 끝낸 게임 하나에
    first: dict[tuple[int, date], datetime] = {}
    candidates = [(a.member_id, a.day, a.at) for a in acts]
    candidates += [(mid, day, to_kst(at)) for mid, day, at in stamps if mid in dept_of]
    for mid, day, at in candidates:
        k = (mid, day)
        if k not in first or at < first[k]:
            first[k] = at
    acts += [Act(mid, at, day, "stamp", SOURCE_BY_KEY["stamp"].dmg) for (mid, day), at in first.items()]
    return acts


def _act_order(a: Act) -> tuple:
    return (a.at, a.member_id, _SOURCE_ORDER.get(a.source, 99), -a.dmg)


def apply_caps(acts: Iterable[Act]) -> list[Hit]:
    """시간 순으로 하루 횟수 한도(갈래마다)와 하루 피해 한도(DAILY_CAP)를 적용한다.

    한도에 걸린 판은 넘는 만큼만 깎는다 — 기본 몫을 먼저 채우고 남으면 다른 부서 보너스.
    """
    count: Counter = Counter()  # (회원, 날짜, 갈래) → 센 판
    used: Counter = Counter()  # (회원, 날짜) → 들어간 피해
    hits: list[Hit] = []
    for a in sorted(acts, key=_act_order):
        src = SOURCE_BY_KEY.get(a.source)
        if src is None:
            continue
        ck = (a.member_id, a.day, a.source)
        if count[ck] >= src.per_day:
            continue
        count[ck] += 1
        uk = (a.member_id, a.day)
        left = DAILY_CAP - used[uk]
        if left <= 0:
            continue
        base = min(max(a.dmg, 0), left)
        bonus = min(CROSS_BONUS if a.cross else 0, left - base)
        if base + bonus <= 0:
            continue
        used[uk] += base + bonus
        hits.append(Hit(a.member_id, a.at, a.day, a.source, base, bonus))
    return hits


def tally(
    hits: Iterable[Hit],
    people: dict[int, tuple[str, str]],
    today: Optional[date] = None,
    sizes: Optional[dict[str, int]] = None,
    fixed_down: Optional[dict[str, datetime]] = None,
) -> dict:
    """한 주의 피해 → 부서 판 · 사람별 몫. 캐시에 그대로 담을 수 있게 JSON 모양으로 돌려준다.

    people: 실제 활성 직원 {회원: (이름, 부서)}
    sizes: 그 주에 고정한 {부서: 인원} — 없으면 people 로 센다
    fixed_down: 이미 쓰러뜨렸다고 담아 둔 {부서: 시각} — 그 주 동안 그대로 둔다
    """
    dept_of = {mid: dept for mid, (_, dept) in people.items()}
    sizes = dict(sizes) if sizes is not None else eligible_departments(dept_of)
    hp = {d: boss_hp(n) for d, n in sizes.items()}
    day_max = {d: boss_day_max(v) for d, v in hp.items()}
    need = {d: join_need(n) for d, n in sizes.items()}

    raw: Counter = Counter()  # 부서 판에 들어간 피해 (보스 하루 한도 뒤)
    day_used: Counter = Counter()  # (부서, 날짜) → 그날 보스가 깎인 피해
    today_dmg: Counter = Counter()
    attackers: dict[str, set] = defaultdict(set)
    defeated: dict[str, datetime] = {}
    week_by_member: Counter = Counter()
    today_by_member: Counter = Counter()
    today_parts: dict[int, Counter] = defaultdict(Counter)

    for h in sorted(hits, key=lambda h: (h.at, h.member_id, _SOURCE_ORDER.get(h.source, 99))):
        week_by_member[h.member_id] += h.total
        if today is not None and h.day == today:
            today_by_member[h.member_id] += h.total
            if h.dmg:
                today_parts[h.member_id][h.source] += h.dmg
            if h.cross:
                today_parts[h.member_id]["cross"] += h.cross
        d = dept_of.get(h.member_id)
        if d not in hp:
            continue  # 레이드에 나오지 않는 부서 — 내 몫은 세지만 부서에는 들어가지 않는다
        attackers[d].add(h.member_id)  # 보스가 오늘 몫을 다 받았어도 공격한 사람으로는 센다
        got = min(h.total, max(day_max[d] - day_used[(d, h.day)], 0))
        day_used[(d, h.day)] += got
        raw[d] += got
        if today is not None and h.day == today:
            today_dmg[d] += got
        if d not in defeated and raw[d] >= hp[d] and len(attackers[d]) >= need[d]:
            defeated[d] = h.at
    for d, at in (fixed_down or {}).items():
        if d in hp:
            defeated[d] = at  # 한번 쓰러진 보스는 그 주 동안 그대로 — 인원 · 부서가 바뀌어도 되살아나지 않게

    def damage(d: str) -> int:
        if d in defeated:
            return hp[d]
        return max(min(raw[d], hp[d] - 1), 0)  # 아직 못 잡았으면 체력 1을 남기고 버틴다

    def pct(d: str) -> float:
        if d in defeated:
            return 100.0
        return min(round(damage(d) / hp[d] * 100, 1), 99.9) if hp[d] else 0.0

    def join_pct(d: str) -> float:
        return round(min(len(attackers[d]) / sizes[d], 1.0) * 100, 1) if sizes[d] else 0.0

    def down_at(d: str) -> datetime:
        return to_kst(defeated[d])

    def order(d: str) -> tuple:
        if d in defeated:
            return (0, down_at(d).date().toordinal(), -join_pct(d), down_at(d).timestamp(), d)
        return (1, 0, -pct(d), -join_pct(d), -raw[d], d)

    def rank_key(d: str) -> tuple:
        if d in defeated:
            return ("D", down_at(d).date().toordinal(), join_pct(d))
        return ("P", pct(d), join_pct(d))

    rows: list[dict] = []
    prev_key = None
    rank = 0
    for idx, d in enumerate(sorted(hp, key=order), start=1):
        if rank_key(d) != prev_key:
            rank, prev_key = idx, rank_key(d)
        rows.append(
            {
                "name": d,
                "members": sizes[d],
                "hp": hp[d],
                "damage": damage(d),
                "overkill": max(raw[d] - hp[d], 0) if d in defeated else 0,
                "pct": pct(d),
                "defeatedAt": format_kst_iso(defeated.get(d)),
                "rank": rank,
                "attackers": len(attackers[d]),
                "today": today_dmg[d],
                "todayMax": day_max[d],  # 보스가 오늘 깎일 수 있는 최대
                "joinPct": join_pct(d),  # 공격한 사람 / 인원
                "need": need[d],  # 쓰러뜨리는 데 필요한 공격 인원
                "needMore": max(need[d] - len(attackers[d]), 0) if d not in defeated else 0,
            }
        )

    top: dict[str, list] = {}
    for d in hp:
        ids = [mid for mid in attackers[d] if week_by_member[mid] > 0]
        ids.sort(key=lambda mid: (-week_by_member[mid], people[mid][0], mid))
        top[d] = [[mid, people[mid][0], week_by_member[mid]] for mid in ids[:TOP_SIZE]]

    return {
        "departments": rows,
        "people": {str(mid): dept for mid, dept in dept_of.items()},
        "week": {str(mid): v for mid, v in week_by_member.items()},
        "today": {str(mid): v for mid, v in today_by_member.items()},
        "todayParts": {str(mid): dict(c) for mid, c in today_parts.items()},
        "top": top,
    }


def podium(rows: list[dict], size: int = 3) -> list[str]:
    """지난 주 1~3위 부서 — 피해를 하나도 못 준 부서는 넣지 않는다."""
    return [r["name"] for r in rows if r["damage"] > 0][:size]


def mine_payload(board: dict, member_id: int, department: Optional[str]) -> dict:
    """캐시된 판에서 내 몫만 꺼낸다.

    excludedReason — 부서 판에 들어가지 않는 까닭:
      notEmployee(실제 직원 계정이 아님 · 시연 계정) · noDept(부서 없음) · excludedDept(부서 대항전 제외 부서)
      · solo(활성 직원이 2명이 안 되는 부서)
    """
    key = str(member_id)
    dept = (department or "").strip() or None
    names = {r["name"]: r for r in board["departments"]}
    if key not in board["people"]:
        reason = "notEmployee"
    elif not dept:
        reason = "noDept"
    elif dept in DEPARTMENT_RANKING_EXCLUDED:
        reason = "excludedDept"
    elif dept not in names:
        reason = "solo"
    else:
        reason = None
    counted = reason is None
    parts = board["todayParts"].get(key, {})
    today_list = [
        {"key": s.key, "label": s.label, "dmg": parts[s.key]} for s in SOURCES if parts.get(s.key)
    ]
    if parts.get("cross"):
        today_list.append({"key": "cross", "label": CROSS_LABEL, "dmg": parts["cross"]})
    today = board["today"].get(key, 0)
    return {
        "department": dept,
        "excluded": not counted,
        "excludedReason": reason,
        "todayDamage": today,
        "todayCap": DAILY_CAP,
        "todayLeft": max(DAILY_CAP - today, 0),
        "weekDamage": board["week"].get(key, 0),
        "today": today_list,
        "rank": names[dept]["rank"] if counted else None,
    }


def rules_payload() -> dict:
    join = "절반" if JOIN_RATE == 50 else f"{JOIN_RATE}%"
    return {
        "dailyCap": DAILY_CAP,
        # 협동 게임이 아직 비공개인 환경(운영)에서는 규칙 표에서 「2인 협동」 줄을 뺀다
        "sources": [{"key": s.key, "label": s.label, "dmg": s.dmg, "note": s.note} for s in SOURCES if s.key != "coop" or game_visible("escape")],
        "crossBonus": CROSS_BONUS,
        "minMembers": DEPARTMENT_MIN_MEMBERS,
        "hpPerMember": HP_PER_MEMBER,
        "winBonus": WIN_BONUS,
        "coopFail": COOP_FAIL_DMG,
        "bossDays": BOSS_DAYS,  # 보스는 하루에 체력의 1/bossDays 까지만 깎인다
        "joinRate": JOIN_RATE,  # 부서원 이 % 이상이 공격해야 쓰러진다
        "joinMin": JOIN_MIN,  # 그리고 적어도 이 인원
        # 화면에 그대로 보여 줄 수 있는 규칙 문장
        "notes": [
            f"한 사람이 하루에 넣을 수 있는 공격은 {DAILY_CAP}까지예요.",
            f"보스는 하루에 체력의 1/{BOSS_DAYS}까지만 깎여요. 빨라도 {_WEEKDAYS[min(BOSS_DAYS, 7) - 1]}요일에 쓰러져요.",
            f"부서원 {join} 이상(적어도 {JOIN_MIN}명)이 공격해야 보스가 쓰러져요.",
            "먼저 쓰러뜨린 날이 빠른 부서가 앞서요. 같은 날이면 참여한 사람 비율이 높은 부서가 앞서요.",
            "일요일 밤까지 못 쓰러뜨리면 많이 깎은 순서로 정해요.",
            "시간제 협동은 점수가 난 판만 들어가요.",
        ],
    }


def _boss_payload(boss: Boss) -> dict:
    return {"key": boss.key, "name": boss.name, "title": boss.title, "desc": boss.desc, "weakness": boss.weakness}


def _is_puzzle(room_key: str) -> bool:
    """방탈출(자물쇠를 푸는 방)인지 — 아니면 시간제 협동 게임."""
    room = PUZZLE_ROOMS.get(room_key)
    return room is not None and getattr(room, "game", "escape") == "escape"


def _filled(value) -> bool:
    """JSON 칸에서 꺼낸 값이 비어 있지 않은지 — 푼 자물쇠 목록('[]') · 틀린 횟수('0')."""
    if value is None:
        return False
    if isinstance(value, (list, dict)):
        return bool(value)
    if isinstance(value, (int, float)):
        return value > 0
    text = str(value).strip()
    try:
        parsed = json.loads(text)
    except ValueError:
        return bool(text)
    return _filled(parsed) if not isinstance(parsed, str) else bool(parsed)


# ── DB 읽기 ───────────────────────────────────────────────────────


async def _people(db: AsyncSession) -> dict[int, tuple[str, str]]:
    """실제 활성 직원 {회원: (이름, 부서)} — 부서는 앞뒤 빈칸을 뺀 지금 부서(없으면 "")."""
    rows = (
        await db.execute(
            select(Member.id, Member.name, Member.department, Member.email, Member.entra_oid).where(
                Member.status == MemberStatus.ACTIVE, Member.entra_oid.is_not(None)
            )
        )
    ).all()
    return {
        r.id: (r.name, (r.department or "").strip())
        for r in rows
        if is_real_person(r.email, r.entra_oid)
    }


def _match_counts(m: GameMatch) -> bool:
    """도장과 같은 기준으로 센 판인지 — 대전 쪽 규칙이 바뀌어도 따라가게 match._counts 를 쓴다."""
    try:
        from app.services import match as match_service

        return bool(match_service._counts(m))
    except Exception:  # noqa: BLE001 — 엔진 하나가 잘못돼도 레이드 판은 그린다
        # 남용을 막는 검사라 모르면 세지 않는다 (도장도 이때는 주지 않는다)
        logger.warning("raid: match %s counts check failed", getattr(m, "id", None), exc_info=True)
        return False


async def _load_acts(db: AsyncSession, dept_of: dict[int, str], start: date, end: date) -> list[Act]:
    """[start, end) 날짜의 활동. 아케이드 판은 DB 에서 회원 · 날짜마다 앞의 5판만 꺼낸다."""
    start_at = datetime.combine(start, time(0), tzinfo=KST)
    end_at = datetime.combine(end, time(0), tzinfo=KST)

    rn = (
        func.row_number()
        .over(partition_by=(GamePlay.member_id, GamePlay.played_on), order_by=(GamePlay.played_at, GamePlay.id))
        .label("rn")
    )
    sub = (
        select(GamePlay.member_id, GamePlay.played_on, GamePlay.played_at, rn)
        # 게임 키를 함께 걸어 (game, played_on) 색인을 타게 한다 — game_play 는 계속 쌓이는 표
        .where(GamePlay.game.in_(tuple(GAMES)), GamePlay.played_on >= start, GamePlay.played_on < end)
        .subquery()
    )
    plays = (
        await db.execute(
            select(sub.c.member_id, sub.c.played_on, sub.c.played_at).where(sub.c.rn <= SOURCE_BY_KEY["game"].per_day)
        )
    ).all()

    stamps = (
        await db.execute(
            select(ArcadeStamp.member_id, ArcadeStamp.stamp_date, ArcadeStamp.created_at).where(
                ArcadeStamp.stamp_date >= start, ArcadeStamp.stamp_date < end
            )
        )
    ).all()

    match_rows = (
        await db.execute(
            select(GameMatch).where(
                GameMatch.status == "DONE",
                GameMatch.finished_at.is_not(None),
                GameMatch.finished_at >= start_at,
                GameMatch.finished_at < end_at,
            )
        )
    ).scalars().all()
    matches = [
        (m.challenger_id, m.opponent_id, m.bot, m.winner_id, m.finished_at)
        for m in match_rows
        if _match_counts(m)
    ]

    rooms = (
        await db.execute(
            select(
                EscapeRoom.host_id,
                EscapeRoom.guest_id,
                EscapeRoom.status,
                EscapeRoom.started_at,
                EscapeRoom.finished_at,
                EscapeRoom.room,
                EscapeRoom.score,
                # state 전체는 크다 — 푼 자물쇠 · 틀린 횟수만 꺼낸다
                EscapeRoom.state["solved"].as_string().label("solved"),
                EscapeRoom.state["wrong"].as_string().label("wrong"),
            ).where(
                EscapeRoom.status.in_(("CLEAR", "FAILED")),
                EscapeRoom.finished_at.is_not(None),
                EscapeRoom.finished_at >= start_at,
                EscapeRoom.finished_at < end_at,
            )
        )
    ).all()
    runs = [
        CoopRun(
            host=r.host_id,
            guest=r.guest_id,
            status=r.status,
            started=r.started_at,
            finished=r.finished_at,
            puzzle=_is_puzzle(r.room),
            score=r.score,
            progressed=_filled(r.solved) or _filled(r.wrong),
        )
        for r in rooms
    ]

    return build_acts(
        dept_of,
        ((r[0], r[1], r[2]) for r in plays),
        ((r[0], r[1], r[2]) for r in stamps),
        matches,
        runs,
    )


def _fix_keys(monday: date) -> tuple[str, str]:
    return f"{CACHE_PREFIX}size:{monday.isoformat()}", f"{CACHE_PREFIX}down:{monday.isoformat()}"


def _text(v) -> str:
    return v.decode() if isinstance(v, bytes) else str(v)


async def _week_fixed(
    redis, monday: date, live: dict[str, int], save: bool
) -> tuple[dict[str, int], dict[str, datetime]]:
    """그 주에 고정한 {부서: 인원} · {부서: 쓰러뜨린 시각}.

    처음 보는 부서는 지금 인원으로 고정해 둔다(save) — 그 뒤로는 누가 로그인 · 탈퇴 · 부서를 옮겨도 체력이 그대로다.
    Redis 가 안 되면 지금 인원으로 계산한다.
    """
    if redis is None:
        return dict(live), {}
    size_key, down_key = _fix_keys(monday)
    try:
        stored = {_text(d): int(_text(n)) for d, n in ((await redis.hgetall(size_key)) or {}).items()}
        down = {_text(d): datetime.fromisoformat(_text(t)) for d, t in ((await redis.hgetall(down_key)) or {}).items()}
        if save:
            new = {d: n for d, n in live.items() if d not in stored}
            for d, n in new.items():
                await redis.hsetnx(size_key, d, n)
            if new:
                await redis.expire(size_key, FIX_TTL)
    except Exception:  # noqa: BLE001
        logger.warning("raid: week fixed values read failed", exc_info=True)
        return dict(live), {}
    return {**live, **stored}, down


async def _remember_down(redis, monday: date, board: dict, known: dict[str, datetime]) -> None:
    """방금 쓰러뜨린 부서의 시각을 담아 둔다 — 한번 쓰러진 보스는 그 주 동안 그대로."""
    if redis is None:
        return
    _, down_key = _fix_keys(monday)
    fresh = [r for r in board["departments"] if r["defeatedAt"] and r["name"] not in known]
    if not fresh:
        return
    try:
        for r in fresh:
            await redis.hsetnx(down_key, r["name"], r["defeatedAt"])
        await redis.expire(down_key, FIX_TTL)
    except Exception:  # noqa: BLE001
        logger.warning("raid: defeated time write failed", exc_info=True)


async def compute_week(db: AsyncSession, monday: date, today: date, redis=None) -> dict:
    """이번 주 판 — 캐시에 담는 모양."""
    people = await _people(db)
    dept_of = {mid: dept for mid, (_, dept) in people.items()}
    sizes, down = await _week_fixed(redis, monday, eligible_departments(dept_of), save=True)
    acts = await _load_acts(db, dept_of, monday, monday + timedelta(days=7))
    board = tally(apply_caps(acts), people, today, sizes=sizes, fixed_down=down)
    await _remember_down(redis, monday, board, down)
    board["updatedAt"] = now_kst().isoformat(timespec="seconds")
    board["computedAt"] = now_kst().isoformat()  # 새 활동이 있었는지 견줄 때 쓰는 정확한 계산 시각
    return board


async def compute_history(db: AsyncSession, monday: date, weeks: int = HISTORY_WEEKS, redis=None) -> list[dict]:
    """지난 몇 주의 보스와 1~3위 — 최근 주가 먼저. 레이드를 연 주(RAID_START)부터만. 한 번에 읽어 주마다 나눈다."""
    wks = [w for w in (monday - timedelta(days=7 * i) for i in range(1, weeks + 1)) if w >= RAID_START]
    if not wks:
        return []
    people = await _people(db)
    dept_of = {mid: dept for mid, (_, dept) in people.items()}
    live = eligible_departments(dept_of)
    hits = apply_caps(await _load_acts(db, dept_of, wks[-1], monday))
    by_week: dict[date, list[Hit]] = defaultdict(list)
    for h in hits:
        by_week[week_start(h.day)].append(h)
    out = []
    for wk in wks:
        sizes, down = await _week_fixed(redis, wk, live, save=False)
        boss = boss_for(wk)
        rows = tally(by_week.get(wk, []), people, sizes=sizes, fixed_down=down)["departments"]
        out.append({"week": wk.isoformat(), "boss": {"key": boss.key, "name": boss.name}, "podium": podium(rows)})
    return out


async def _cached(redis, key: str, ttl: int, make: Callable[[], Awaitable]):
    """Redis 에 담아 둔 값 — 없거나 Redis 가 안 되면 새로 계산한다."""
    if redis is not None:
        try:
            raw = await redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception:  # noqa: BLE001
            logger.warning("raid: cache read failed", exc_info=True)
    value = await make()
    if redis is not None:
        try:
            await redis.set(key, json.dumps(value, ensure_ascii=False, separators=(",", ":")), ex=ttl)
        except Exception:  # noqa: BLE001
            logger.warning("raid: cache write failed", exc_info=True)
    return value


async def _latest_today(db: AsyncSession, today: date) -> Optional[datetime]:
    """오늘(KST) 끝난 활동 가운데 가장 늦은 시각 — 아케이드 판 · 대전 · 협동 · 도장. 없으면 None.

    판을 끝내자마자 레이드를 열어도 내 피해가 바로 보이게, 담아 둔 판보다 늦은 활동이 있으면 다시 계산한다.
    오늘 것만 보므로 가볍다(아케이드 판은 (game, played_on) 색인을 탄다).
    """
    start_at = datetime.combine(today, time(0), tzinfo=KST)
    stamps = await db.execute(
        select(
            select(func.max(GamePlay.played_at)).where(GamePlay.game.in_(tuple(GAMES)), GamePlay.played_on == today).scalar_subquery(),
            select(func.max(GameMatch.finished_at)).where(GameMatch.finished_at >= start_at).scalar_subquery(),
            select(func.max(EscapeRoom.finished_at)).where(EscapeRoom.finished_at >= start_at).scalar_subquery(),
            select(func.max(ArcadeStamp.created_at)).where(ArcadeStamp.created_at >= start_at).scalar_subquery(),
        )
    )
    found = [t for t in stamps.one() if t is not None]
    return max(found) if found else None


async def raid_board(db: AsyncSession, redis, member: Member, now: Optional[datetime] = None) -> dict:
    """GET /api/play/raid — 이번 주 보스 · 부서 판 · 내 몫 · 우리 부서 순위 · 지난 4주."""
    now = to_kst(now) if now is not None else now_kst()
    today = now.date()
    monday = week_start(today)
    week_key = f"{CACHE_PREFIX}week:{monday.isoformat()}:{today.isoformat()}"
    board = await _cached(redis, week_key, CACHE_TTL, lambda: compute_week(db, monday, today, redis))
    # 담아 둔 판보다 늦게 끝난 판이 있으면(방금 한 판을 끝냈으면) 60초를 기다리지 않고 다시 계산한다
    try:
        latest = await _latest_today(db, today)
        made = datetime.fromisoformat(board.get("computedAt") or board["updatedAt"])
        if latest is not None and latest > made:
            board = await compute_week(db, monday, today, redis)
            if redis is not None:
                await redis.set(week_key, json.dumps(board, ensure_ascii=False, separators=(",", ":")), ex=CACHE_TTL)
    except Exception:  # noqa: BLE001 — 새로 계산 못 해도 담아 둔 판은 보여 준다
        logger.warning("raid: freshness check failed", exc_info=True)
    history = await _cached(
        redis, f"{CACHE_PREFIX}history:{monday.isoformat()}", HISTORY_TTL,
        lambda: compute_history(db, monday, redis=redis),
    )
    mine = mine_payload(board, member.id, member.department)
    my_dept = mine["department"] if not mine["excluded"] else None
    top = [
        {"id": mid, "name": name, "avatarUrl": member_avatar_url(mid), "damage": dmg, "me": mid == member.id}
        for mid, name, dmg in (board["top"].get(my_dept, []) if my_dept else [])
    ]
    return {
        "week": week_info(monday),
        "boss": _boss_payload(boss_for(monday)),
        "rules": rules_payload(),
        "departments": [{**r, "isMine": r["name"] == my_dept} for r in board["departments"]],
        "mine": mine,
        "myDeptTop": top,
        "history": history,
        "updatedAt": board["updatedAt"],
    }
