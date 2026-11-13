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
from app.services import leave as leave_service
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
    # 받을 수 있는 가장 작은 점수 — 낮을수록 좋은 게임에서 말이 안 되게 작은 기록(0점 등)을 막는다
    min_score: int = 0
    # 명예의 전당에서 갈래 기록을 함께 겨룰지 — 코스마다 길이 · 난이도가 다른 게임(통통 짐볼)은 기본 판(1코스)만 센다
    hall_mix_variants: bool = True
    # 판 중간 도장 — 한 판이 긴 게임(통통 짐볼 · 코스 10스테이지)은 스테이지 하나를 통과해도 그날 도장(stage_stamp)
    stage_stamp: bool = False
    # 아케이드에 들어온 날(한국 날짜 YYYY-MM-DD) — 아케이드 「이번 주 새 게임」에 쓴다. 새 게임을 넣을 때 꼭 적는다(비우면 새 게임으로 안 보임)
    added: str = ""


# 게임 순서 = 아케이드 · 순위 · 명예의 전당에 보이는 순서. 최근에 만든 게임이 맨 위 — 새 게임은 맨 위에 넣는다
GAMES: dict[str, Game] = {
    g.key: g
    for g in (
        Game("bumpervs", "선다운 범퍼스 대전", "MINI", "동료와 실시간 1:1 · 같은 트랙을 나란히 달리며 부딪히고 먼저 결승선 들어오기", "car-front", "승", 1_000_000, added="2026-11-13"),
        Game("jellyvs", "꿀꺽 젤리 숲 대전", "MINI", "동료와 실시간 1:1 · 같은 숲에서 먹고 자라 상대를 삼키거나 더 커지기", "candy", "승", 1_000_000, added="2026-11-13"),
        Game("vinyl", "빙글빙글 레코드 파티 3D", "MINI", "돌아가는 레코드판 위에서 노란 바는 뛰고 하늘색 바는 숙이며 한 곡 버티기 · 봉제 인형 넷의 리듬 서바이벌", "disc-3", "점", 1_000_000, added="2026-11-13"),
        Game("nightsquad", "야간 분대 작전 3D", "MINI", "좌우로 조준해 폭주 로봇을 쏘고 숫자 게이트 · 바리케이드로 분대를 불려 검문소 돌파 · 3D 분대 슈팅", "crosshair", "점", 1_000_000, added="2026-11-13"),
        Game("frostcamp", "눈꽃 야영지 3D", "MINI", "소나무를 베어 통나무집 · 작업장 · 제재소 · 썰매를 짓고 눈보라를 버텨 얼음 문 열기 · 겨울 야영지 경영 · 한 판 8분", "tent-tree", "점", 1_000_000, added="2026-11-13"),
        Game("sundown", "선다운 범퍼스 3D", "MINI", "노을 카니발에서 범퍼카로 달리는 3D 레이싱 · 드리프트 부스트 · 3위 안에 들어 다음 트랙", "car-front", "점", 1_000_000, added="2026-11-13"),
        Game("jelly", "꿀꺽 젤리 숲 3D", "MINI", "열매 · 버섯 · 작은 친구를 먹고 자라 가시대왕 삼키기 · 큰 녀석은 피하고 별빛 구슬로 대시 · 2분 30초", "candy", "점", 1_000_000, added="2026-11-13"),
        Game("kitsune", "여우 신사 정원", "MINI", "몰려오는 요괴를 피하고 물리치며 신사 정원 지키기 · 3D 액션 서바이벌", "flower-2", "점", 10_000_000, added="2026-11-13"),
        Game("eggfarm", "햇살 농장 3D", "MINI", "달걀을 모아 팔고 일꾼 · 닭장을 늘리는 농장 경영 · 3분 동안 얼마나 벌까", "egg", "점", 10_000_000, added="2026-11-13"),
        Game("herorush", "영웅 돌격 다리 3D", "MINI", "좌우로 끌어 파란 관문으로 영웅을 불리고 함정을 피해 적 군대 · 보스 돌파 · 8단계", "swords", "점", 1_000_000, added="2026-11-13"),
        Game("traffic", "차 빼기 대작전 3D", "MINI", "화살표 방향으로 차를 빼서 꽉 막힌 길 비우기 · 부딪히지 않고 연속으로 빼면 콤보 · 3분 동안 몇 단계나", "car", "점", 1_000_000, added="2026-11-13"),
        Game("screwout", "나사 풀기", "MINI", "겹친 판을 붙든 나사를 빈 구멍으로 옮겨 판을 모두 떨어뜨리기 · 3분 동안 몇 단계나", "drill", "점", 1_000_000, added="2026-11-12"),
        Game("boltup", "볼트 업", "MINI", "너트를 옮겨 볼트마다 한 색으로 끝까지 쌓기 · 3분 동안 몇 단계나", "bolt", "점", 1_000_000, added="2026-11-12"),
        Game("paperjet", "종이비행기 편대", "MINI", "종이비행기로 사무실 하늘을 날며 드론 편대 격추 · 고전 횡스크롤 비행 슈팅", "send", "점", 10_000_000, added="2026-11-09"),
        Game("fighter", "스트레스 파이터", "MINI", "몰려오는 스트레스 괴물을 주먹 · 발차기로 물리치며 전진 · 고전 횡스크롤 격투", "joystick", "점", 10_000_000, added="2026-11-09"),
        Game("vitamin", "비타민 특공대", "MINI", "달리며 쏘고 뛰어 피하며 바이러스 기지로 · 고전 런앤건 슈팅", "crosshair", "점", 10_000_000, added="2026-11-09"),
        Game("jumper", "점심 원정대", "MINI", "발판을 뛰어넘고 괴물을 밟으며 구내식당 깃발까지 · 고전 점프 액션", "footprints", "점", 10_000_000, added="2026-11-09"),
        Game("rummy", "타일 러미", "MINI", "숫자 타일로 같은 수 · 이어지는 수 묶어 내려놓기 · 먼저 다 내면 승 · 턴제 대전", "rows-3", "승", 1_000_000, added="2026-11-09"),
        Game("alkkagi", "사내 알까기", "MINI", "내 알을 튕겨 상대 알을 판 밖으로 · 턴제 대전", "disc", "승", 1_000_000, added="2026-11-09"),
        Game("watersort", "물병 색 맞추기", "MINI", "같은 색끼리 한 병에 모으기 · 3분 동안 몇 단계나", "flask-conical", "점", 1_000_000, added="2026-11-09"),
        Game("dodge", "업무 폭탄 피하기", "MINI", "사방에서 날아오는 메일·회의 초대 피하기 · 1분 버티면 칼퇴", "mail-warning", "time", 3600),
        Game("bounce", "통통 짐볼", "MINI", "저절로 튀는 짐볼을 좌우로만 굴려 헬스키퍼실까지 · 3코스 30스테이지", "circle-dot", "점", 100_000, lower_better=True, min_score=100, variants=("c2", "c3"), hall_mix_variants=False, stage_stamp=True),
        Game("spotdiff", "틀린 그림 찾기", "MINI", "사진 한 장씩 나눠 보고 말로 맞춰 다른 곳 찾기 · 3분 · 협동", "scan-search", "곳", 1000),
        Game("sync", "통하는 사이", "QUIZ", "같은 질문에 몰래 답하고 서로의 답 예상하기 · 10문제 · 협동", "heart-handshake", "점", 100),
        Game("sketch", "화이트보드 그림 퀴즈", "QUIZ", "한 명은 그리고 한 명은 맞히기 · 3분 동안 몇 점이나 · 협동", "pencil", "점", 1000),
        Game("volley", "옥상 배구", "MINI", "동료와 실시간 1:1 · 먼저 7점(긴 경기 15점) 내면 승리하는 배구 대전", "volleyball", "승", 1_000_000),
        Game("soccer", "헤딩 축구", "MINI", "동료와 실시간 1:1 · 2분 동안 머리로 골 넣기 대전", "goal", "승", 1_000_000),
        Game("memory", "도형 짝맞추기", "MINI", "번갈아 카드 두 장을 뒤집어 같은 도형 짝을 더 많이 · 턴제 대전", "shapes", "승", 1_000_000),
        Game("gostop", "고스톱", "MINI", "동료와 1:1 맞고 · 점수만으로 겨루는 턴제 대전", "layers", "승", 1_000_000),
        Game("quizduel", "1:1 퀴즈 대결", "MINI", "동료와 같은 문제를 각자 풀고 더 많이 맞히면 승 · 대전", "brain", "승", 1_000_000),
        Game("boxes", "칸 따먹기", "MINI", "점 사이에 선을 번갈아 긋고 네 변을 닫으면 내 칸 · 턴제 대전", "grid-2x2", "승", 1_000_000),
        Game("baseball", "숫자 야구", "MINI", "서로 숨긴 숫자를 스트라이크 · 볼 힌트로 먼저 맞히기 · 턴제 대전", "hash", "승", 1_000_000),
        Game("maze", "깜깜한 주차장", "MINI", "한 명은 CCTV로 안내, 한 명은 손전등으로 걷기 · 3분 동안 몇 층이나 · 협동", "flashlight", "층", 100),
        Game("words", "말해 봐 맞혀 봐", "QUIZ", "동료와 번갈아 설명하고 맞히기 · 3분 동안 몇 개나 · 협동", "message-circle", "개", 1000),
        Game("kitchen", "점심 분식집", "MINI", "동료와 홀·주방을 나눠 3분 동안 분식집 운영 · 협동", "chef-hat", "원", 10_000_000),
        Game("escape", "야근 사무실 탈출", "MINI", "동료와 둘이 단서를 나눠 20분 안에 탈출하는 협동 방탈출", "door-open", "time", 3600, lower_better=True),
        Game("chess", "사내 체스", "MINI", "동료 또는 컴퓨터와 두는 턴제 체스", "crown", "승", 1_000_000),
        Game("gomoku", "사내 오목", "MINI", "동료에게 도전장 · 번갈아 두는 턴제 대전", "swords", "승", 1_000_000),
        Game("finale", "마지막 축제", "MINI", "꿀알바 시리즈 8화 · 지금까지의 규칙을 모두 지킬 것", "tent", "점", 200000),
        Game("parade", "야간 퍼레이드", "MINI", "꿀알바 시리즈 7화 · 박자에 맞춰 풍선 누르기", "music", "점", 200000),
        Game("silent", "조용한 공사장", "MINI", "꿀알바 시리즈 6화 · 소리를 내지 말고 20층까지", "hard-hat", "점", 200000),
        Game("trial", "신약 시험 보조", "MINI", "꿀알바 시리즈 5화 · 병에 맞는 약을 제시간에 주기", "pill", "점", 200000),
        Game("theater", "심야 극장 안내", "MINI", "꿀알바 시리즈 4화 · 관객이 돌아보면 움직이지 말 것", "clapperboard", "점", 200000),
        Game("milk", "새벽 우유 배달", "MINI", "꿀알바 시리즈 3화 · 규칙이 바뀌는 골목에 우유 넣기", "milk", "명", 200000),
        Game("clown", "광대를 놓치지 마", "MINI", "꿀알바 시리즈 2화 · 빨간 코 광대에게서 눈을 떼지 말 것", "eye", "점", 200000),
        Game("nightshift", "심야 편의점", "MINI", "손전등으로 비추며 아침 6시까지 벌레를 막아요", "flashlight", "점", 200000),
        Game("coffee", "커피 나르기", "MINI", "레인으로 커피를 밀어 동료에게 · 빈 잔은 받아 내기", "coffee", "점", 1_000_000),
        Game("promote", "승진 합치기", "MINI", "같은 직급을 밀어 합쳐 승진 · 오늘의 인사 판", "briefcase-business", "점", 1_000_000, daily_once=True),
        Game("mines", "칼퇴 지뢰찾기", "MINI", "야근 폭탄을 피해 칼퇴 자리 모두 열기 · 모두 같은 판", "bomb", "점", 1_000_000, daily_once=True),
        Game("stack", "점심 찬합 탑", "MINI", "타이밍 맞춰 찬합 쌓기 · 어긋난 만큼 잘려요", "layers", "점", 1_000_000),
        Game("snake", "줄줄이 점심", "MINI", "비타민 먹고 길어지는 점심 줄 · 책상·벽 피하기", "utensils", "점", 1_000_000),
        Game("korean", "한국어 능력시험", "STUDY", "맞춤법·띄어쓰기·표준어 · 매일 새 20문제", "book-open-check", "점", 100000, daily_once=True),
        Game("trivia", "오늘의 상식 퀴즈", "QUIZ", "전체 또는 분야별 하루 20문제 · 분야마다 순위", "lightbulb", "점", 100000, daily_once=True, variants=TRIVIA_VARIANTS),
        Game("typing", "영어 타자 레이스", "STUDY", "뜻을 보고 영어 단어 치기 · 첫 글자 힌트", "keyboard", "점", 1_000_000),
        Game("chosung", "건강 초성 퀴즈", "QUIZ", "ㄱㅂㅁ → 거북목 · 오늘의 건강 낱말 20문제", "spell-check", "점", 100000, daily_once=True),
        Game("sudoku", "오늘의 스도쿠", "MINI", "모두 같은 문제 · 빨리 푼 순서대로", "grid-3x3", "time", 24 * 3600, lower_better=True, daily_once=True),
        Game("bubble", "비눗방울 대작전", "MINI", "비눗방울에 세균을 가두고 톡 터뜨리기", "droplets", "점", 10_000_000),
        Game("bricks", "벽돌 깨기", "MINI", "끌어서 조준해 공을 줄줄이 날려 숫자 벽돌 부수기", "brick-wall", "점", 10_000_000),
        Game("pairs", "아이콘 짝 잇기", "MINI", "같은 그림을 두 번 이하로 꺾어 잇기 · 콤보", "link", "점", 1_000_000),
        Game("crossing", "출근길 대작전", "MINI", "차·자전거·지각선을 피해 회사까지 한 칸씩", "footprints", "칸", 100000),
        Game("stairs", "별까지 계단", "MINI", "좌우 계단을 골라 별까지 · 동료 기록 깃발 넘기", "sparkles", "층", 100000),
        Game("match3", "비타민 3매치", "MINI", "3개·네모로 맞춰 펑! · 단계마다 새 맵과 목표", "cherry", "점", 10_000_000),
        Game("shooter", "세균 격파", "MINI", "9가지 무기로 세균 편대 격파 · 같은 무기 3단계", "rocket", "점", 10_000_000),
        Game("blocks", "점심 블록", "MINI", "줄을 채워 지우기 · 10줄마다 도시락 블록", "blocks", "점", 10_000_000),
    )
}

# ── 이용 시간 — 업무 시간에는 게임을 할 수 없다 ──
# 평일(공휴일 제외) 09:00~11:30, 13:00~18:00 은 닫힘. 점심시간·퇴근 후·출근 전·주말·공휴일은 열림.
# 휴가 · 반차 · 반반차 · 특별휴가인 사람은 그 쉬는 시간대에 업무 시간이어도 열림(services/leave.py — 회원마다 다르다).
# 개발(DEBUG) 환경은 테스트를 위해 늘 열림.
CLOSED_WINDOWS = ((9 * 60, 11 * 60 + 30), (13 * 60, 18 * 60))
SUBMIT_GRACE_MIN = 10  # 점심시간 끝(13:00) 직전에 시작한 판은 10분 안에 끝내면 기록 인정 (휴가 시간대 끝도 같다)


def workday(d: date) -> bool:
    return d.weekday() < 5 and not is_public_holiday(d)


def _closed_end(minute: int, is_workday: bool):
    """업무 시간(닫힘) 안이면 그 닫힘이 끝나는 분, 아니면 None — 휴가는 보지 않는다."""
    if is_workday:
        for start, end in CLOSED_WINDOWS:
            if start <= minute < end:
                return end
    return None


def _open_minute(minute: int, is_workday: bool, leaves) -> bool:
    return _closed_end(minute, is_workday) is None or leave_service.leave_at(minute, leaves) is not None


def leave_opens_closed_hours(leaves) -> bool:
    """이 쉬는 시간대가 평일 업무 시간(닫힘)과 겹치는지 — 겹쳐야 「휴가로 열린」 것."""
    return any(s < end and start < e for s, e, _ in leaves for start, end in CLOSED_WINDOWS)


def window_at(minute: int, is_workday: bool, leaves=()) -> dict:
    """그 분에 열려 있는지 (순수 함수). leaves = 그 회원의 그날 쉬는 시간대 [(시작 분, 끝 분, 종류)].

    휴가로 열렸으면 reason "leave" 와 leave {kind, label, until} — until 은 실제로 닫히는 시각(오늘 안 닫히면 "24:00").
    닫혀 있으면 opensAt — 닫힘이 끝나는 시각, 그 전에 휴가 시간대가 시작하면 그 시각."""
    end = _closed_end(minute, is_workday)
    if end is None:
        return {"open": True, "opensAt": None}
    hit = leave_service.leave_at(minute, leaves)
    if hit is not None:
        until = next((m for m in range(minute + 1, leave_service.DAY_END) if not _open_minute(m, is_workday, leaves)), leave_service.DAY_END)
        return {
            "open": True,
            "opensAt": None,
            "reason": "leave",
            "leave": {"kind": hit[2], "label": leave_service.leave_label(hit[2], hit[0], hit[1]), "until": leave_service.hhmm(until)},
        }
    opens = min([end] + [w[0] for w in leaves if minute < w[0] < end])
    return {"open": False, "opensAt": leave_service.hhmm(opens)}


def play_window(now: datetime | None = None, member=None) -> dict:
    """지금(now) 게임을 할 수 있는지 — member(Member 또는 회원 번호)를 주면 그 사람의 휴가 시간대도 본다."""
    now = now or now_kst()
    if get_settings().debug:
        return {"open": True, "opensAt": None}
    return window_at(now.hour * 60 + now.minute, workday(now.date()), leave_service.windows_for(member, now.date()))


def ensure_open(grace: bool = False, member=None) -> None:
    """닫혀 있으면 GAME_CLOSED(403). member 를 주면 그 사람 기준(휴가면 열림). grace — 닫힌 지 10분 안이면 통과(막 끝난 판 저장)."""
    if play_window(member=member)["open"]:
        return
    if grace and play_window(now_kst() - timedelta(minutes=SUBMIT_GRACE_MIN), member=member)["open"]:
        return
    raise_app_error("GAME_CLOSED", 403)


def minutes_to_close(now: datetime, member=None):
    """오늘 이 사람에게 아케이드가 닫히기까지 남은 분 — 오늘 안 닫히면 None (지금 닫혀 있으면 0)."""
    if get_settings().debug:
        return None
    is_workday = workday(now.date())
    leaves = leave_service.windows_for(member, now.date())
    minute = now.hour * 60 + now.minute
    return next((m - minute for m in range(minute, leave_service.DAY_END) if not _open_minute(m, is_workday, leaves)), None)


LEADERBOARD_SIZE = 30
# 부서 순위 — 부서 상위 3명의 최고 기록 평균 (인원이 많은 부서가 무조건 이기지 않게)
DEPARTMENT_TOP_N = 3
SUBMIT_PER_MINUTE = 20


# 아직 비공개인 게임 — 로컬(DEBUG=true)에서만 보이고, 운영(DEBUG=false)에서는 아케이드 목록 · 순위 · 도전 · 초대에서 빠진다.
# 지금은 모두 공개(빈 목록). 다시 가릴 게임이 생기면 여기에 키를 넣고, 화면 주소는 deploy/nginx/app-locations.inc 에서 /arcade 로 보낸다.
LOCAL_ONLY_GAMES: frozenset[str] = frozenset()


def game_visible(key: str) -> bool:
    """이 환경에서 보이는 게임인지 — 비공개 게임은 로컬(DEBUG)에서만."""
    return key not in LOCAL_ONLY_GAMES or get_settings().debug


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
        "addedOn": game.added or None,
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
    show_ranks = play_window(member=member)["open"]
    out = []
    for game in GAMES.values():
        if not game_visible(game.key):
            continue
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
    ensure_open(grace=True, member=member)
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
    """명예의 전당용 회원별 최고 기록 — 갈래가 있는 게임은 전체·갈래를 통틀어 가장 좋은 기록과 그 갈래(hall_mix_variants=False 면 기본 판만)."""
    if not game.variants or not game.hall_mix_variants:
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


HALL_PERIODS = ("week", "month", "all")


async def hall_of_fame(db: AsyncSession, period: str = "week") -> dict:
    """게임별 1~3위 — 아케이드 '명예의 전당'.

    week 는 지난주(월~일, 월요일마다 바뀜), month 는 이번 달(1일~오늘), all 은 오늘까지 전체 기록.
    """
    if period not in HALL_PERIODS:
        period = "week"
    today = today_kst()
    if period == "month":
        start, end = today.replace(day=1), today  # 이번 달 1일 ~ 오늘
    elif period == "all":
        start, end = None, today
    else:
        end = today - timedelta(days=today.weekday() + 1)  # 지난주 일요일
        start = end - timedelta(days=6)
    picked: list[tuple[Game, list[tuple[int, int, int]], dict[int, str]]] = []
    for game in GAMES.values():
        if not game_visible(game.key):
            continue
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
    return {"period": period, "from": start.isoformat() if start else None, "to": end.isoformat(), "games": games}


async def last_week_board(db: AsyncSession) -> dict:
    """지난주(월~일) 게임별 1~3위."""
    return await hall_of_fame(db, "week")


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
    오늘 10번째 도장을 찍어 쿠폰으로 바꾼 사람은 오늘 하루는 다 찬 판(10/10 · done)을 보여 주고, 다음 날부터 새 판(0개)을 보여 준다.
    filled 는 보여 주는 값과 상관없이 지금 모으는 판에 실제로 찍힌 수(쿠폰 · 기다림 판정용).
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
    filled = min(len(card), STAMP_GOAL)
    # 오늘 판을 다 채워 쿠폰으로 바꿨으면(새 판에 아직 하나도 없고, 바꾼 판의 10번째가 오늘) 오늘은 그 판을 그대로 보여 준다
    done = used > 0 and not card and len(dates) >= used * STAMP_GOAL and dates[used * STAMP_GOAL - 1] == day
    shown = list(dates[(used - 1) * STAMP_GOAL : used * STAMP_GOAL]) if done else card[:STAMP_GOAL]
    return {
        "month": month,
        "days": [d.isoformat() for d in shown],
        "count": STAMP_GOAL if done else filled,
        "filled": filled,
        "goal": STAMP_GOAL,
        "today": day in set(dates),
        "done": done,  # 오늘 10개를 채워 쿠폰을 받았다 — 내일부터 새 판
        "coupon": bool(this_month),  # 이번 달 아케이드 쿠폰을 받았는지
        "pending": filled >= STAMP_GOAL and bool(this_month),  # 10개 다 찼지만 이번 달 몫은 받아서 다음 달 1일에
        "minSeconds": STAMP_MIN_SEC,
    }


async def _issue_arcade_coupon_if_due(db: AsyncSession, member: Member, day: date) -> bool:
    """도장판이 10개 찼고 이번 달 쿠폰을 아직 안 받았으면 1장 준다 (커밋은 부르는 쪽에서)."""
    st = await stamp_status(db, member, day)
    if st["filled"] < STAMP_GOAL or st["coupon"]:
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
    return {"new": new, "count": st["count"], "goal": st["goal"], "coupon": issued, "today": st["today"], "pending": st["pending"], "done": st["done"]}


async def stage_stamp(db: AsyncSession, redis: Redis, member: Member, key: str) -> dict:
    """판 중간 도장 — stage_stamp 게임(통통 짐볼)은 스테이지 하나를 통과하면 그날 도장을 찍는다.

    점수 제출과 같은 꼼수 막기: 게임 화면에서 판을 시작한 기록(run)이 있어야 한다. 그 기록은 지우지 않는다(마지막 완주 제출이 쓴다).
    """
    game = get_game(key)
    if not game.stage_stamp:
        raise_app_error("NOT_FOUND", 404)
    ensure_open(grace=True, member=member)
    rate_key = f"hk:game:rate:{member.id}"
    count = await redis.incr(rate_key)
    if count == 1:
        await redis.expire(rate_key, 60)
    if count > SUBMIT_PER_MINUTE:
        raise_app_error("TOO_MANY_REQUESTS", 429)
    today = today_kst()
    if not await redis.get(_run_key(member, key)):
        st = await stamp_status(db, member, today)
        return {"new": False, "count": st["count"], "goal": st["goal"], "coupon": False, "today": st["today"], "short": True}
    return await _give_stamp(db, member, key, today)


def _daily_key(game: Game, member: Member, day: date, variant: str = "") -> str:
    return f"hk:game:daily:{game.key}{':' + variant if variant else ''}:{member.id}:{day.isoformat()}"


async def start_daily(db: AsyncSession, redis: Redis, member: Member, key: str, variant: str | None = None) -> dict:
    """오늘의 도전 시작 — 하루 첫 시작만 순위용 판으로 표시한다.

    문제를 본 뒤 새로고침해서 다시 시작하는 것을 막기 위해, 이미 시작한 날에는
    이후 판을 모두 연습(순위 미반영)으로 돌린다.
    """
    game = get_game(key)
    variant = get_variant(game, variant)
    ensure_open(member=member)
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
    ensure_open(grace=True, member=member)
    if not isinstance(score, int) or score < game.min_score or score > game.max_score:
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
