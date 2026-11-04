"""2인 협동 「틀린 그림 찾기」 — 같은 곳을 찍은 사진 두 장을 한 장씩 나눠 보고, 말로 맞춰 보며 다른 곳 5개를 찾는다.

사진 가(a)와 사진 나(b)는 같은 장면(내 자리 · 탕비실 · 회의실)이지만 5곳이 다르다.
화면에는 내 사진만 보낸다 — 상대 사진도, 다른 곳 목록도 보내지 않는다. 찾은 곳만 둘 다에게 보인다.
내 사진에서 다른 곳을 누르면 찾음. 다른 곳이 아닌 데를 누르면 틀림 — 남은 시간이 5초 줄고 1초 동안 못 누른다.
5곳을 다 찾으면 잠깐 두 사진을 맞대 보여 주고 다음 장면으로 넘어간다(장면이 갈수록 물건이 많아진다). 3분 동안 몇 곳이나.

장면은 방마다 seed 로 만든다. 물건은 겹치지 않게 놓고, 다른 곳은 눈에 띄게 만든다
(크기 하한 · 색 거리 하한 · 옮긴 거리 하한 · 다른 곳끼리 누르는 영역이 겹치지 않게).
바뀐 물건도 처음 놓일 때 나올 수 있는 값만 쓴다(크기는 작은 것 · 큰 것 두 가지, 기울기는 반듯함 · 기울어짐 반쯤씩) —
내 사진 하나만 보고는 어느 물건이 다른 곳인지 알 수 없게.
사진 좌표는 가로세로 0~1000. 물건 하나 = {t 종류, x · y 가운데, w · h 크기, c 색, r 기울기(도), f 좌우 뒤집기, v 개수 · 그림 번호, z 놓인 곳}.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Optional

from app.core.errors import raise_app_error, register_messages

ROUND_SEC = 180
W = H = 1000  # 사진 좌표 — 누른 자리도 이 좌표로 받는다
DIFFS = 5  # 장면마다 다른 곳
CLEAR_BONUS = 3  # 한 장면을 다 찾으면 더 주는 점수
MISS_SEC = 5  # 틀리면 남은 시간이 이만큼 준다
MISS_LOCK = 1.0  # 틀린 사람은 이만큼 못 누른다
TAP_GAP = 0.25  # 같은 사람 연타 막기(초)
PING_GAP = 0.8
PING_SEC = 4.0  # 「여기 봐요」 표시가 떠 있는 시간
TAP_SEC = 3.0  # 누른 자리 표시가 떠 있는 시간
NOTE_SEC = 4.0
CLEAR_SEC = 3.0  # 다 찾은 뒤 두 사진을 맞대 보여 주는 시간 — 그동안은 못 누른다
KEEP_TAPS, KEEP_PINGS, KEEP_DONE = 8, 6, 12
GAP = 16  # 물건 사이 최소 틈
MIN_DIFF = 70  # 다른 곳이 될 물건의 최소 크기(가로 · 세로 중 큰 쪽)
MIN_FINE = 80  # 개수 · 그림 · 기울기 · 방향처럼 작은 차이는 이보다 큰 물건에만
MIN_COUNT = 90
COLOR_DIST = 150  # 색 차이 하한(RGB 거리)
GROW = 1.4  # 크기 다른 곳 — 큰 것은 작은 것의 이만큼
TILT_SPAN = 6  # 기운 물건은 tilt ~ tilt+이만큼(도)
# 처음 놓을 때 큰 것 · 기운 것을 고를 확률. 크고 기운 것은 자리를 못 찾아 빠지는 일이 조금 더 많아서 반보다 살짝 높게 —
# 놓인 물건 중 큰 것 · 기운 것이 반쯤 되어야 「크다 · 기울었다」만 보고 다른 곳을 고르는 일이 없다
BIG_P, TILT_P = 0.53, 0.56
HIT_PAD, HIT_MIN = 24, 52  # 누르는 영역(타원) — 물건 둘레보다 이만큼 넉넉하게, 반지름은 이보다 크게
BOX_PAD = 12  # 누르는 영역(상자) — 물건 상자를 이만큼 넓힌다. 물건 사이 틈(GAP)보다 작아서 옆 물건에 닿지 않는다
SEP = 6  # 다른 곳끼리 누르는 영역 사이를 이만큼 더 띄운다(겹침 검사의 촘촘함도 이 값)

register_messages(
    {
        "SPOT_BAD_POINT": "사진 안을 눌러 주세요.",
        "SPOT_MISS_WAIT": "틀려서 잠깐 쉬어요. 1초 뒤에 다시 눌러 주세요.",
        "SPOT_NEXT_WAIT": "다음 사진을 펼치는 중이에요. 잠깐만요.",
        "SPOT_OLD_SCENE": "사진이 바뀌었어요. 새 사진에서 다시 찾아 주세요.",
    },
    {"SPOT_BAD_POINT": 400, "SPOT_MISS_WAIT": 429, "SPOT_NEXT_WAIT": 409, "SPOT_OLD_SCENE": 409},
)


class SpotRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "spotdiff"
    title = "틀린 그림 찾기"
    label = "협동 게임"
    page = "spotdiff"
    game = "spotdiff"
    blurb = "같은 곳을 찍은 사진 두 장을 하나씩 나눠 보고, 말로 맞춰 다른 곳을 찾는 협동 게임이에요."
    intro = (
        "둘에게 같은 곳을 찍은 사진이 한 장씩 가요. 그런데 두 사진은 5곳이 달라요. 서로 화면은 볼 수 없으니 "
        "「시계 몇 시예요?」처럼 말로 맞춰 보며 다른 곳을 내 사진에서 눌러요. 잘못 누르면 5초가 줄어요. "
        "3분 동안 둘이 함께 최대한 많이 찾아보세요."
    )
    outro = "눈썰미도 말솜씨도 척척 맞았어요!"
    sides = {"a": "사진 가", "b": "사진 나"}  # 순서 없는 이름 — 각자 한 장만 본다
    limit_sec = ROUND_SEC


ROOM = SpotRoom()
START_TEXT = f"시작! {ROUND_SEC // 60}분 동안 다른 곳을 최대한 많이 찾아요. 잘못 누르면 {MISS_SEC}초가 줄어요."

# 대기실에서 고르는 장소 — 「섞어서」를 고르면 장면마다 내 자리 → 탕비실 → 회의실 순서로 돈다(시작 장소는 방마다 다르다)
PLACES = {"mix": "섞어서", "desk": "내 자리", "pantry": "탕비실", "meeting": "회의실"}


# ── 색 · 물건 종류 ─────────────────────────────────────────────

COLORS = {
    "red": (220, 38, 38), "orange": (249, 115, 22), "yellow": (250, 204, 21), "green": (22, 163, 74),
    "sky": (56, 189, 248), "blue": (37, 99, 235), "navy": (30, 58, 138),
    "purple": (147, 51, 234), "pink": (236, 72, 153), "brown": (146, 64, 14), "black": (31, 41, 55),
    "gray": (148, 163, 184), "white": (248, 250, 252),
}
BRIGHT = ("red", "orange", "yellow", "green", "sky", "blue", "purple", "pink")
DEVICE = ("black", "gray", "white", "navy")
FRAME = ("brown", "black", "white", "red", "blue", "yellow")
POT = ("brown", "orange", "white", "blue", "pink", "yellow")
SCREENS = ("막대그래프", "글줄", "표", "산 바탕화면")


@dataclass(frozen=True)
class Kind:
    key: str
    name: str  # 화면에 쓰는 이름
    zones: tuple  # 놓일 수 있는 곳 — wall(벽) · top(책상 · 조리대 · 탁자 위) · floor(바닥)
    size: tuple  # 너비 범위(사진 1000 기준). grow 면 이 안에서 작은 것 · 큰 것 두 가지로만 나온다
    aspect: float  # 높이 / 너비
    colors: tuple
    flip: bool = False  # 좌우가 다르게 생겼다 — 뒤집기가 다른 곳이 될 수 있다
    tilt: int = 0  # 기울기가 다른 곳이 될 수 있으면 최소 차이(도). spin 이 없으면 반쯤은 반듯, 반쯤은 ±tilt~tilt+TILT_SPAN
    spin: int = 0  # 처음 놓일 때 -spin ~ spin-1 도로 아무렇게나 돌려 놓는다(휴대폰처럼). 다른 곳이면 spin 만큼 반대쪽으로
    var: Optional[tuple] = None  # ("pic", 그림 이름들) · ("count", 최소, 최대, 단위, 바꿀 때 차이) · ("hour",) · ("day",) · ("num", 최소, 최대)
    vlabel: str = ""  # 그림이 다를 때 문구 앞부분 — 「시곗바늘」이 달라요
    vsay: str = ""  # 그림이 다를 때 문구 전체(「달라요」가 어색할 때)
    most: int = 2  # 한 장면에 최대 몇 개
    rear: bool = False  # 키가 커서 책상 안쪽(뒤)에만 — 앞에 놓으면 다른 물건을 가린 것처럼 보인다
    grow: bool = False  # 크기가 다른 곳이 될 수 있다(작은 것 · 큰 것)
    paint: bool = True  # 색 c 가 물건의 넓은 부분에 칠해진다 — 아니면(틀 · 뚜껑 · 접시만) 색 다른 곳으로 쓰지 않는다


CATALOG = {
    k.key: k
    for k in (
        # 책상 위
        Kind("monitor", "모니터", ("top",), (210, 270), 0.88, DEVICE, var=("pic", SCREENS), vlabel="모니터 화면", most=1, rear=True),
        Kind("laptop", "노트북", ("top",), (160, 205), 0.68, ("gray", "black", "white", "pink", "sky"), var=("pic", SCREENS), vlabel="노트북 화면", most=1),
        Kind("keyboard", "키보드", ("top",), (190, 250), 0.32, DEVICE, most=1),
        Kind("mouse", "마우스", ("top",), (60, 78), 0.62, (*DEVICE, "red", "sky"), most=1),
        Kind("mug", "머그컵", ("top",), (72, 108), 1.0, (*BRIGHT, "white", "black"), flip=True,
             var=("pic", ("민무늬", "줄무늬", "물방울", "별")), vlabel="머그컵 무늬", grow=True),
        Kind("plant", "화분", ("top",), (86, 136), 1.45, POT, var=("count", 3, 7, "잎 개수", 2), grow=True),
        Kind("books", "책", ("top",), (106, 168), 0.9, (*BRIGHT, "navy", "brown"), var=("count", 2, 6, "권 수", 1), grow=True),
        Kind("lamp", "스탠드", ("top",), (88, 138), 1.55, ("black", "white", "yellow", "green", "red", "sky"), flip=True, most=1, rear=True, grow=True),
        Kind("penholder", "연필꽂이", ("top",), (74, 116), 1.25, (*BRIGHT, "black"), var=("count", 2, 5, "펜 개수", 1), most=1, grow=True),
        Kind("phone", "휴대폰", ("top",), (70, 92), 0.52, (*DEVICE, "pink", "sky"), tilt=30, spin=35, most=1),
        Kind("tissue", "휴지 상자", ("top",), (92, 144), 0.62, ("white", "sky", "pink", "yellow", "green", "blue"), most=1, grow=True),
        Kind("headphones", "헤드폰", ("top",), (100, 130), 0.92, (*BRIGHT, *DEVICE), tilt=25, spin=25, most=1),
        Kind("stapler", "스테이플러", ("top",), (88, 138), 0.45, ("black", "red", "blue", "gray", "green"), flip=True, most=1, grow=True),
        Kind("bottle", "물병", ("top",), (48, 76), 2.4, ("sky", "blue", "green", "pink", "white", "orange"),
             var=("pic", ("가득", "반쯤", "조금")), vlabel="물병 물 높이", grow=True, paint=False),
        # 벽
        Kind("clock", "벽시계", ("wall",), (96, 150), 1.0, ("white", "black", "red", "blue", "yellow", "green"), var=("hour",), vlabel="시곗바늘", most=1, grow=True),
        Kind("calendar", "달력", ("wall", "top"), (98, 154), 1.1, ("red", "blue", "green", "orange", "purple", "black"),
             tilt=20, var=("day",), vlabel="달력 숫자", most=1, grow=True),
        Kind("sticky", "메모지", ("wall",), (104, 162), 0.72, ("yellow", "pink", "green", "sky", "orange"), var=("count", 1, 6, "장 수", 1), grow=True),
        Kind("frame", "액자", ("wall", "top"), (90, 140), 0.82, FRAME, tilt=20, var=("pic", ("산", "해", "나무", "고양이")), vlabel="액자 사진", grow=True),
        Kind("window", "창문", ("wall",), (200, 260), 0.8, ("white", "brown", "black", "blue"), var=("pic", ("해", "구름", "비", "노을")), vlabel="창밖 날씨", most=1, paint=False),
        Kind("poster", "포스터", ("wall",), (104, 162), 1.35, (*BRIGHT, "navy"), tilt=20, var=("pic", ("별", "동그라미", "세모", "번개")), vlabel="포스터 그림", grow=True),
        Kind("whiteboard", "화이트보드", ("wall",), (240, 310), 0.66, ("gray", "black", "blue", "red", "brown"),
             var=("pic", ("막대그래프", "화살표", "동그라미", "체크 목록")), vlabel="화이트보드 그림", most=1, paint=False),
        # 바닥
        Kind("trashcan", "휴지통", ("floor",), (80, 125), 1.15, ("gray", "black", "blue", "green", "white", "red"), var=("count", 0, 3, "종이 뭉치 개수", 1), most=1, grow=True),
        Kind("chair", "의자", ("floor",), (150, 195), 1.25, ("black", "blue", "red", "green", "gray", "orange"), flip=True, most=3),
        Kind("bigplant", "큰 화분", ("floor",), (130, 204), 1.6, POT, var=("count", 4, 8, "잎 개수", 2), most=1, grow=True),
        Kind("fridge", "냉장고", ("floor",), (160, 200), 1.9, ("white", "gray", "sky", "red", "black", "green"), flip=True, var=("count", 1, 4, "자석 개수", 1), most=1),
        Kind("dispenser", "정수기", ("floor",), (105, 135), 2.2, ("white", "sky", "gray", "black", "blue"), most=1),
        # 탕비실 조리대 위
        Kind("coffee", "커피 머신", ("top",), (120, 155), 1.25, ("black", "red", "white", "gray", "navy"), flip=True,
             var=("pic", ("컵 없음", "컵 있음")), vsay="한쪽에만 커피 머신 아래 컵이 있어요", most=1, rear=True),
        Kind("kettle", "전기 주전자", ("top",), (84, 132), 1.05, ("white", "black", "red", "sky", "green"), flip=True, most=1, grow=True),
        Kind("microwave", "전자레인지", ("top",), (160, 200), 0.6, ("white", "black", "gray", "red"), flip=True, var=("num", 1, 9), vlabel="전자레인지 숫자", most=1, rear=True),
        Kind("cups", "종이컵", ("top",), (110, 172), 0.55, ("white", "yellow", "sky", "pink", "green"), var=("count", 1, 5, "컵 개수", 1), most=1, grow=True),
        Kind("snack", "과자 바구니", ("top",), (110, 172), 0.75, ("brown", "red", "blue", "yellow", "green"), var=("count", 1, 5, "과자 개수", 1), most=1, grow=True),
        Kind("fruit", "과일 접시", ("top",), (110, 172), 0.55, ("white", "sky", "yellow", "pink", "green"), var=("count", 1, 5, "과일 개수", 1), most=1, grow=True, paint=False),
    )
}


def _bands(kd: Kind) -> tuple:
    """grow 종류의 너비 — (작은 것들, 큰 것들). 같은 자리끼리 짝(큰 것 = 작은 것 × GROW)."""
    lo, hi = kd.size
    small = [w for w in range(lo, hi + 1) if round(w * GROW) <= hi]  # 큰 것도 size 범위 안에
    return small, [round(w * GROW) for w in small]


# 크기 다른 곳은 작은 것 ↔ 큰 것(같은 자리 짝)으로만 바꾼다. 처음 놓을 때도 반쯤씩(BIG_P) 골라서,
# 한쪽 사진에 보이는 크기는 바뀐 물건이든 아니든 같은 분포가 된다.
SIZES = {t: _bands(kd) for t, kd in CATALOG.items() if kd.grow}

# 장면 — 이름 · 꼭 놓는 물건(놓일 곳) · 놓일 곳마다 고를 물건
THEMES = {
    "desk": {
        "name": "내 자리",
        "anchors": (("monitor", "top"), ("keyboard", "top"), ("clock", "wall")),
        "pool": {
            "wall": ("calendar", "window", "poster", "frame", "sticky", "sticky"),
            "top": ("mouse", "mug", "plant", "books", "lamp", "penholder", "phone", "tissue", "headphones", "stapler", "bottle", "frame", "calendar"),
            "floor": ("trashcan", "bigplant", "chair"),
        },
    },
    "pantry": {
        "name": "탕비실",
        "anchors": (("coffee", "top"), ("fridge", "floor"), ("clock", "wall")),
        "pool": {
            "wall": ("calendar", "window", "poster", "frame", "sticky"),
            "top": ("kettle", "microwave", "cups", "snack", "fruit", "mug", "mug", "tissue", "bottle", "plant"),
            "floor": ("dispenser", "trashcan", "bigplant"),
        },
    },
    "meeting": {
        "name": "회의실",
        "anchors": (("whiteboard", "wall"), ("chair", "floor"), ("laptop", "top")),
        "pool": {
            "wall": ("clock", "window", "poster", "frame", "calendar", "sticky"),
            "top": ("mug", "mug", "bottle", "bottle", "books", "phone", "penholder", "plant", "tissue", "headphones"),
            "floor": ("chair", "chair", "bigplant", "trashcan"),
        },
    },
}
THEME_ORDER = ("desk", "pantry", "meeting")

# 놓일 곳 — 가로 범위, 위 끝 최소, 아래 끝 범위. 그림 배경: 벽 0~560, 책상(조리대 · 탁자) 윗면 560~900, 그 아래 바닥
ZONES = {
    "wall": (30, 970, 30, 120, 500),
    "top": (30, 970, 220, 620, 880),
    "floor": (30, 970, 330, 950, 995),
}
LAYER = {"wall": 0, "top": 1, "floor": 2}  # 그리는 순서 — 벽 → 책상 위 → 바닥(앞)
ZONE_SHARE = {"wall": 0.42, "floor": 0.12}  # 나머지는 책상 위

# 장면 번호별 다른 곳 종류 가중치 — 처음엔 눈에 확 띄는 것, 갈수록 개수 · 그림 · 방향처럼 잘 봐야 하는 것
WEIGHTS = (
    {"color": 3, "missing": 3, "extra": 2, "moved": 2, "size": 2, "count": 1, "variant": 1, "rotate": 1, "flip": 1},
    {"color": 2, "missing": 2, "extra": 2, "moved": 2, "size": 2, "count": 2, "variant": 2, "rotate": 1, "flip": 1},
    {"color": 2, "missing": 1, "extra": 1, "moved": 2, "size": 1, "count": 3, "variant": 3, "rotate": 2, "flip": 2},
)
VIEW_KIND = {"missing": "only", "extra": "only"}  # 화면에는 「한쪽에만 있어요」 하나로


def clean_options(opts: dict) -> dict:
    """대기실 설정 — place(장소)만. 모르는 값은 버리고 기본값(섞어서)으로."""
    place = opts.get("place") if isinstance(opts, dict) else None
    return {"place": place if isinstance(place, str) and place in PLACES else "mix"}


# ── 작은 도구 ─────────────────────────────────────────────────

def _josa(word: str, pair: str) -> str:
    """받침이 있으면 pair[0], 없으면 pair[1] — 「화분이」 · 「모니터가」."""
    code = ord(word[-1]) - 0xAC00 if word else -1
    return word + (pair[0] if 0 <= code <= 11171 and code % 28 else pair[1])


def _cdist(c1: str, c2: str) -> float:
    return math.dist(COLORS[c1], COLORS[c2])


def _turned(w: float, h: float, r: float) -> tuple:
    """r 도 돌린 상자를 감싸는 가로 · 세로."""
    if not r:
        return w, h
    a = math.radians(r)
    c, s = abs(math.cos(a)), abs(math.sin(a))
    return w * c + h * s, w * s + h * c


def _box(o: dict) -> tuple:
    bw, bh = _turned(o["w"], o["h"], o["r"])
    return (o["x"] - bw / 2, o["y"] - bh / 2, o["x"] + bw / 2, o["y"] + bh / 2)


def _big(o: dict) -> int:
    return max(o["w"], o["h"])


def _zone(t: str, zone: str) -> tuple:
    """t 가 zone 에 놓일 때 범위 — 키 큰 물건은 책상 안쪽(아래 끝이 앞쪽 110 안)."""
    x0, x1, top, b0, b1 = ZONES[zone]
    return (x0, x1, top, b0, min(b1, b0 + 110)) if zone == "top" and CATALOG[t].rear else (x0, x1, top, b0, b1)


def _in_zone(o: dict) -> bool:
    x0, x1, top, b0, b1 = _zone(o["t"], o["z"])
    bx0, by0, bx1, by1 = _box(o)
    return bx0 >= x0 and bx1 <= x1 and by0 >= top and b0 <= by1 <= b1


def _overlap(p: tuple, q: tuple, gap: float = 0) -> bool:
    return p[0] < q[2] + gap and q[0] < p[2] + gap and p[1] < q[3] + gap and q[1] < p[3] + gap


def _free(o: dict, others: list) -> bool:
    """놓일 곳 안이고, 다른 물건과 GAP 넘게 떨어져 있다(겹쳐서 가려지는 일이 없게)."""
    if not _in_zone(o):
        return False
    b = _box(o)
    return not any(_overlap(b, _box(p), GAP) for p in others if p is not o)


def _ell(box: tuple) -> list:
    """누르는 영역(그리는 모양) — 상자를 넉넉하게 감싸는 타원 [가운데 x, 가운데 y, 가로 반지름, 세로 반지름]."""
    bx0, by0, bx1, by1 = box
    return [round((bx0 + bx1) / 2), round((by0 + by1) / 2),
            round(max(HIT_MIN, (bx1 - bx0) / 2 + HIT_PAD)), round(max(HIT_MIN, (by1 - by0) / 2 + HIT_PAD))]


def _pad(box: tuple) -> list:
    """누르는 영역(상자) — 물건 상자를 BOX_PAD 만큼 넓힌 것. 타원이 못 덮는 큰 네모 물건의 모서리까지 찾음으로 친다."""
    return [math.floor(box[0] - BOX_PAD), math.floor(box[1] - BOX_PAD), math.ceil(box[2] + BOX_PAD), math.ceil(box[3] + BOX_PAD)]


def _union(p: tuple, q: tuple) -> tuple:
    return (min(p[0], q[0]), min(p[1], q[1]), max(p[2], q[2]), max(p[3], q[3]))


def _inside(e: list, x: float, y: float) -> float:
    """타원 안이면 0~1(가운데일수록 작다), 밖이면 1 보다 크다."""
    return ((x - e[0]) / e[2]) ** 2 + ((y - e[1]) / e[3]) ** 2


def _score(d: dict, x: float, y: float) -> float:
    """다른 곳 d 를 (x, y)에서 눌렀나 — 1 이하면 찾음(타원 가운데일수록 작다). 타원 밖이어도 상자 안이면 1."""
    s = min(_inside(e, x, y) for e in d["hit"])
    if s > 1 and any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in d.get("box", ())):
        return 1.0
    return s


def _shapes(ells: list, boxes: list) -> list:
    return [("e", e) for e in ells] + [("b", b) for b in boxes]


def _around(s: tuple, m: float) -> tuple:
    """모양을 m 만큼 넓혀 감싸는 상자."""
    k, v = s
    if k == "e":
        return (v[0] - v[2] - m, v[1] - v[3] - m, v[0] + v[2] + m, v[1] + v[3] + m)
    return (v[0] - m, v[1] - m, v[2] + m, v[3] + m)


def _holds(s: tuple, x: float, y: float, m: float) -> bool:
    k, v = s
    if k == "e":
        return ((x - v[0]) / (v[2] + m)) ** 2 + ((y - v[1]) / (v[3] + m)) ** 2 <= 1
    return v[0] - m <= x <= v[2] + m and v[1] - m <= y <= v[3] + m


def _touch(p: tuple, q: tuple) -> bool:
    """두 모양(타원 · 상자)이 겹치거나 SEP 남짓 안으로 붙어 있나 — 넉넉하게(겹치는데 아니라고 하는 일은 없게).

    둘을 SEP 만큼 넓혀 감싸는 상자가 만나는 곳을 SEP 간격 점으로 훑는다. 실제로 겹치는 점이 있으면
    그 둘레 반지름 0.85·SEP 안이 넓힌 두 모양에 다 들어가고, 훑는 점 간격의 반 대각선(0.71·SEP)보다 넓어서 꼭 걸린다.
    """
    a, b = _around(p, SEP), _around(q, SEP)
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if x0 > x1 or y0 > y1:
        return False
    if p[0] == "b" and q[0] == "b":
        return True  # 상자끼리는 감싸는 상자가 곧 모양
    nx, ny = int((x1 - x0) // SEP) + 1, int((y1 - y0) // SEP) + 1
    for i in range(ny + 1):
        y = min(y0 + i * SEP, y1)
        for j in range(nx + 1):
            x = min(x0 + j * SEP, x1)
            if _holds(p, x, y, SEP) and _holds(q, x, y, SEP):
                return True
    return False


def _clash(s1: list, s2: list) -> bool:
    return any(_touch(p, q) for p in s1 for q in s2)


def _pick(rnd: random.Random, weights: dict) -> Optional[str]:
    keys = [k for k, w in weights.items() if w > 0]
    return rnd.choices(keys, [weights[k] for k in keys])[0] if keys else None


# ── 장면 만들기 ────────────────────────────────────────────────

def _first_v(rnd: random.Random, kd: Kind) -> int:
    if not kd.var:
        return 0
    kind = kd.var[0]
    if kind == "pic":
        return rnd.randrange(len(kd.var[1]))
    if kind in ("count", "num"):
        return rnd.randint(kd.var[1], kd.var[2])
    if kind == "hour":
        return rnd.randint(1, 12)
    return rnd.randint(1, 31)  # day


def _first_r(rnd: random.Random, kd: Kind) -> int:
    """처음 놓을 때 기울기 — 휴대폰처럼 아무렇게나(spin), 액자처럼 반쯤은 반듯 · 반쯤은 기울게(tilt), 나머지는 0."""
    if kd.spin:
        return rnd.randint(-kd.spin, kd.spin - 1)
    if kd.tilt and rnd.random() < TILT_P:
        return rnd.choice((-1, 1)) * rnd.randint(kd.tilt, kd.tilt + TILT_SPAN)
    return 0


def _other_r(rnd: random.Random, kd: Kind, r: int) -> int:
    """기울기 다른 곳 — 바뀐 값도 처음 놓일 때 나오는 값 중에서.

    spin: spin 만큼 반대쪽으로(-spin~-1 ↔ 0~spin-1, 짝이 하나씩이라 보이는 기울기 분포가 그대로).
    tilt: 반듯 ↔ 기울어짐(±tilt~tilt+TILT_SPAN). 놓인 물건이 반쯤씩이라(TILT_P) 어느 쪽 사진에서 봐도 반쯤씩.
    """
    if kd.spin:
        return r + kd.spin if r < 0 else r - kd.spin
    if r:
        return 0
    return rnd.choice((-1, 1)) * rnd.randint(kd.tilt, kd.tilt + TILT_SPAN)


def _other_w(t: str, w: int) -> Optional[int]:
    """크기 다른 곳 — 작은 것 ↔ 큰 것(같은 자리 짝). 표에 없는 값이면 None."""
    small, big = SIZES[t]
    if w in small:
        return big[small.index(w)]
    if w in big:
        return small[big.index(w)]
    return None


def _put(rnd: random.Random, others: list, t: str, zone: str, tries: int = 60, near: Optional[tuple] = None) -> Optional[dict]:
    """t 를 zone 의 빈자리에 놓는다. near=(가운데 x, 아래 끝 최소, 최대)면 처음엔 그 근처부터. 못 놓으면 None."""
    kd = CATALOG[t]
    x0, x1, top, b0, b1 = _zone(t, zone)
    # 작은 것 · 큰 것, 기울기는 처음에 한 번만 고른다 — 자리를 못 찾을 때마다 다시 고르면 작은 것 · 반듯한 것이 늘어서
    # 「큰 것 · 기운 것은 다른 곳일 때가 많다」는 티가 난다
    band = SIZES[t][rnd.random() < BIG_P] if t in SIZES else None
    r = _first_r(rnd, kd)
    for i in range(tries):
        w = rnd.choice(band) if band else rnd.randint(*kd.size)
        h = round(w * kd.aspect)
        bw, bh = _turned(w, h, r)
        lo = max(b0, top + bh)
        if bw > x1 - x0 or lo > b1:
            continue
        bottom, x = rnd.uniform(lo, b1), rnd.uniform(x0 + bw / 2, x1 - bw / 2)
        if near and i < tries // 2:
            x, bottom = near[0] + rnd.uniform(-40, 40), rnd.uniform(max(lo, near[1]), max(lo, min(b1, near[2])))
        o = {"t": t, "x": round(x), "y": round(bottom - bh / 2), "w": w, "h": h,
             "c": rnd.choice(kd.colors), "r": r, "f": int(kd.flip and rnd.random() < 0.5), "v": _first_v(rnd, kd), "z": zone}
        if _free(o, others):
            return o
    return None


def _count(objs: list, t: str) -> int:
    return sum(1 for o in objs if o["t"] == t)


def _near(objs: list, t: str) -> Optional[tuple]:
    """키보드는 모니터 바로 앞, 마우스는 키보드 오른쪽 — 책상다운 자리."""
    pair = {"keyboard": "monitor", "mouse": "keyboard"}.get(t)
    host = next((o for o in objs if o["t"] == pair), None) if pair else None
    if host is None:
        return None
    bottom = _box(host)[3]
    if t == "keyboard":
        return host["x"], bottom + 60, bottom + 170
    return host["x"] + host["w"] / 2 + 70, bottom - 20, bottom + 40


def _layout(rnd: random.Random, theme: str, n: int) -> Optional[list]:
    """물건 n 개를 놓는다 — 꼭 놓을 물건 먼저, 그다음 큰 것부터."""
    th = THEMES[theme]
    plan = list(th["anchors"])
    want = {"wall": round(n * ZONE_SHARE["wall"]), "floor": max(1, round(n * ZONE_SHARE["floor"]))}
    want["top"] = n - want["wall"] - want["floor"]
    for zone, k in want.items():
        have = sum(1 for _, z in plan if z == zone)
        for _ in range(k - have):
            plan.append((rnd.choice(th["pool"][zone]), zone))
    head, rest = plan[: len(th["anchors"])], plan[len(th["anchors"]):]
    rest.sort(key=lambda p: -(CATALOG[p[0]].size[1] ** 2 * CATALOG[p[0]].aspect))
    objs: list = []
    for i, (t, zone) in enumerate([*head, *rest]):
        if _count(objs, t) >= CATALOG[t].most:
            pool = [x for x in th["pool"][zone] if _count(objs, x) < CATALOG[x].most]
            if not pool:
                continue
            t = rnd.choice(pool)
        o = _put(rnd, objs, t, zone, near=_near(objs, t))
        if o is None:
            if i < len(head):
                return None  # 꼭 놓을 물건을 못 놓으면 처음부터
            continue
        objs.append(o)
    return objs if len(objs) >= n - 2 else None


def _label(kind: str, o: dict) -> str:
    kd = CATALOG[o["t"]]
    if kind == "color":
        return f"{_josa(kd.name + ' 색', '이가')} 달라요"
    if kind in ("missing", "extra"):
        return f"한쪽에만 {_josa(kd.name, '이가')} 있어요"
    if kind == "moved":
        return f"{kd.name} 자리가 달라요"
    if kind == "count":
        return f"{kd.name} {_josa(kd.var[3], '이가')} 달라요"
    if kind == "rotate":
        return f"{kd.name} 기울기가 달라요"
    if kind == "flip":
        return f"{kd.name} 방향이 달라요"
    if kind == "size":
        return f"{kd.name} 크기가 달라요"
    return kd.vsay or f"{_josa(kd.vlabel, '이가')} 달라요"  # variant


def _fits(kind: str, o: dict) -> bool:
    """이 물건이 이 종류의 다른 곳이 될 수 있나 — 작아서 안 보이는 차이는 만들지 않는다."""
    kd, big = CATALOG[o["t"]], _big(o)
    if kind == "color":
        return kd.paint and big >= MIN_DIFF and any(_cdist(c, o["c"]) >= COLOR_DIST for c in kd.colors)
    if kind in ("missing", "moved"):
        return big >= MIN_DIFF
    if kind == "size":
        w2 = _other_w(o["t"], o["w"]) if kd.grow else None
        return w2 is not None and max(o["w"], w2) * max(1.0, kd.aspect) >= MIN_DIFF
    if kind == "count":
        return bool(kd.var) and kd.var[0] == "count" and big >= MIN_COUNT
    if kind == "rotate":
        return kd.tilt > 0 and big >= MIN_FINE
    if kind == "flip":
        return kd.flip and big >= MIN_FINE
    if kind == "variant":
        return bool(kd.var) and kd.var[0] != "count" and big >= MIN_FINE
    return False


def _new_v(rnd: random.Random, kd: Kind, v: int) -> Optional[int]:
    kind = kd.var[0]
    if kind == "pic":
        opts = [i for i in range(len(kd.var[1])) if i != v]
    elif kind == "count":
        lo, hi, _, step = kd.var[1:]
        opts = [x for x in (v - step, v + step) if lo <= x <= hi]
    elif kind == "hour":  # 시곗바늘이 3시간 넘게 달라야 한눈에 보인다
        opts = [(v - 1 + d) % 12 + 1 for d in range(3, 10)]
    elif kind == "day":
        opts = [x for x in range(1, 32) if abs(x - v) >= 5]
    else:  # num
        opts = [x for x in range(kd.var[1], kd.var[2] + 1) if abs(x - v) >= 2]
    return rnd.choice(opts) if opts else None


def _one(o: dict) -> tuple:
    """물건 하나 자리의 누르는 영역 — (타원들, 상자들)."""
    b = _box(o)
    return [_ell(b)], [_pad(b)]


def _change(rnd: random.Random, kind: str, o: dict, mine: list) -> Optional[tuple]:
    """o 를 바꾼 물건과 누르는 영역 (바뀐 물건, 타원들, 상자들). mine 은 바꾼 물건이 들어갈 사진의 물건들(겹침 검사용)."""
    kd = CATALOG[o["t"]]
    if kind == "color":
        return ({**o, "c": rnd.choice([c for c in kd.colors if _cdist(c, o["c"]) >= COLOR_DIST])}, *_one(o))
    if kind == "count" or kind == "variant":
        v = _new_v(rnd, kd, o["v"])
        return None if v is None else ({**o, "v": v}, *_one(o))
    if kind == "flip":
        return ({**o, "f": 1 - o["f"]}, *_one(o))
    if kind == "rotate":
        for _ in range(6):
            o2 = {**o, "r": _other_r(rnd, kd, o["r"])}
            b1 = _box(o)
            if o["z"] != "wall":  # 책상 위 물건은 바닥을 맞춘다
                o2["y"] = round(o["y"] + (b1[3] - _box(o2)[3]))
            if _free(o2, mine):
                b2 = _box(o2)
                return o2, [_ell(_union(b1, b2))], [_pad(b1), _pad(b2)]
            if kd.spin or o["r"]:
                break  # 바꿀 값이 하나뿐
        return None
    if kind == "size":
        w = _other_w(o["t"], o["w"])
        if w is None:
            return None
        h = round(w * kd.aspect)
        o2 = {**o, "w": w, "h": h}
        if o["z"] != "wall":
            o2["y"] = round(_box(o)[3] - _turned(w, h, o["r"])[1] / 2)
        if not _free(o2, mine):
            return None
        return (o2, *_one(o2 if w > o["w"] else o))
    if kind == "moved":
        x0, x1, top, b0, b1 = _zone(o["t"], o["z"])
        bw, bh = _turned(o["w"], o["h"], o["r"])
        lo = max(b0, top + bh)
        if lo > b1:
            return None
        e1, p1 = _one(o)
        s1 = _shapes(e1, p1)
        for _ in range(40):
            o2 = {**o, "x": round(rnd.uniform(x0 + bw / 2, x1 - bw / 2)), "y": round(rnd.uniform(lo, b1) - bh / 2)}
            if math.hypot(o2["x"] - o["x"], o2["y"] - o["y"]) < max(_big(o), 120) or not _free(o2, mine):
                continue
            e2, p2 = _one(o2)
            if _clash(s1, _shapes(e2, p2)):  # 옛 자리 · 새 자리 영역도 서로 떨어지게
                continue
            return o2, e1 + e2, p1 + p2
        return None
    return None


def _diffs(rnd: random.Random, base: list, theme: str, no: int) -> Optional[tuple]:
    """다른 곳 5개를 만든다. (두 사진에 똑같이 있는 물건들, 다른 곳들) — 못 만들면 None.

    물건 종류(t)마다 다른 곳은 장면에 하나뿐 — 같은 문구가 두 번 나오지 않고, 한쪽에서 빠진 벽시계가
    다른 자리에 「한쪽에만」으로 또 생겨 사실상 옮긴 것을 두 곳으로 세는 일도 없다.
    """
    th = THEMES[theme]
    A, B = list(base), list(base)
    used: set = set()
    used_t: set = set()
    taken: list = []  # 지금까지 만든 다른 곳들의 누르는 영역
    out: list = []
    per: dict = {}
    weights = WEIGHTS[min(no, len(WEIGHTS)) - 1]
    for _ in range(150):
        if len(out) == DIFFS:
            break
        kind = _pick(rnd, {k: w for k, w in weights.items() if per.get(VIEW_KIND.get(k, k), 0) < 2})
        side = rnd.choice("ab")
        mine = A if side == "a" else B
        if kind == "extra":  # 새 물건을 한쪽 사진에만 — 아직 손대지 않은 종류라 두 사진의 그 종류 개수가 같다
            zone = rnd.choices(("wall", "top", "floor"), (4, 5, 1))[0]
            pool = [t for t in th["pool"][zone] if t not in used_t and _count(mine, t) < CATALOG[t].most]
            if not pool:
                continue
            o2 = _put(rnd, mine, rnd.choice(pool), zone, tries=30)
            if o2 is None or _big(o2) < MIN_DIFF:
                continue
            o = None
            ells, boxes = _one(o2)
            pair = (o2, None) if side == "a" else (None, o2)
        else:
            cands = [p for p in base if id(p) not in used and p["t"] not in used_t and _fits(kind, p)]
            if not cands:
                continue
            o = rnd.choice(cands)
            if kind == "missing":
                ells, boxes = _one(o)
                pair = (o, None) if side == "a" else (None, o)
            else:
                got = _change(rnd, kind, o, [p for p in mine if p is not o])
                if got is None:
                    continue
                new, ells, boxes = got
                pair = (new, o) if side == "a" else (o, new)
        shapes = _shapes(ells, boxes)
        if _clash(shapes, taken):
            continue
        if o is not None:
            used.add(id(o))
            A[:] = [p for p in A if p is not o]
            B[:] = [p for p in B if p is not o]
        if pair[0] is not None:
            A.append(pair[0])
        if pair[1] is not None:
            B.append(pair[1])
        taken += shapes
        thing = pair[0] or pair[1]
        used_t.add(thing["t"])
        vk = VIEW_KIND.get(kind, kind)
        per[vk] = per.get(vk, 0) + 1
        out.append({"k": vk, "a": pair[0], "b": pair[1], "hit": ells, "box": boxes, "label": _label(kind, thing),
                    "has": ("a" if pair[0] else "b") if vk == "only" else None, "by": None, "at": None})
    if len(out) < DIFFS:
        return None
    rnd.shuffle(out)  # 만든 순서(종류 순서)가 드러나지 않게
    return [p for p in base if id(p) not in used], out


def _scene(seed: int, no: int, theme: str) -> tuple:
    """방 seed · 장면 번호로 장면을 만든다(같은 값이면 같은 장면). 장면이 갈수록 물건이 많아진다."""
    n = min(12 + 2 * (no - 1), 17)
    for attempt in range(40):
        rnd = random.Random(seed * 1_000_003 + no * 7_919 + attempt)
        base = _layout(rnd, theme, n - attempt // 10 * 2)  # 잘 안 되면 물건을 조금 줄인다
        if base is None:
            continue
        got = _diffs(rnd, base, theme, no)
        if got is not None:
            return got
    raise RuntimeError("spotdiff scene")  # 시험에서 수만 장을 만들어 봐도 여기까지 오지 않는다


def _theme(k: dict) -> str:
    if k["place"] in THEMES:
        return k["place"]
    return THEME_ORDER[(k["seed"] + k["no"] - 1) % len(THEME_ORDER)]


def _enter(k: dict, now: float) -> None:
    """다음 장면을 펼친다."""
    k["no"] += 1
    k["theme"] = _theme(k)
    k["base"], k["diffs"] = _scene(k["seed"], k["no"], k["theme"])
    k["sceneAt"], k["pause"] = now, None


def _version(k: dict, side: str) -> list:
    """side 쪽 사진 — 두 사진에 같은 물건 + 그쪽 다른 곳. 그리는 순서(벽 → 책상 위 → 바닥, 뒤 → 앞)로."""
    objs = [*k["base"], *(d[side] for d in k["diffs"] if d[side] is not None)]
    return sorted(objs, key=lambda o: (LAYER[o["z"]], _box(o)[3], o["x"]))


# ── 시작 · 흐름 ────────────────────────────────────────────────

def start(st: dict, now: float) -> None:
    opts = clean_options(st.get("opts", {}))
    seed = random.randrange(1 << 30)
    k = {
        "start": now, "end": now + ROUND_SEC, "seed": seed, "place": opts["place"], "no": 0,
        "found": 0, "cleared": 0, "misses": 0, "foundBy": {"a": 0, "b": 0}, "lock": {"a": 0, "b": 0},
        "taps": [], "pings": [], "note": None, "done": [], "over": False, "reason": None, "gap": {},
    }
    _enter(k, now)
    st["k"] = k


def advance(st: dict, now: float) -> bool:
    """시간이 다 됐거나, 다 찾고 맞대 보는 시간이 끝났으면 바꾼다. 바뀐 게 있으면 True."""
    k = st["k"]
    if k["over"]:
        return False
    if now >= k["end"]:
        k["over"], k["reason"] = True, "time"
        return True
    if k["pause"] is not None and now >= k["pause"]:
        _enter(k, now)
        return True
    return False


def next_event(st: dict) -> Optional[float]:
    """다음에 저절로 바뀌는 시각 — 다음 장면이 펼쳐질 때 · 끝."""
    k = st["k"]
    if k["over"]:
        return None
    return min(k["pause"], k["end"]) if k["pause"] is not None else k["end"]


# ── 할 일 ─────────────────────────────────────────────────────

def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _point(k: dict, arg) -> tuple:
    """{x, y, n} — 사진 좌표 0~1000, n 은 화면이 보고 있던 장면 번호(바뀐 뒤 옛 사진을 누른 건 틀림으로 치지 않는다)."""
    if not isinstance(arg, dict):
        raise_app_error("KITCHEN_BAD_ACTION")
    x, y, n = arg.get("x"), arg.get("y"), arg.get("n")
    if not _num(x) or not _num(y):
        raise_app_error("KITCHEN_BAD_ACTION")
    if not (0 <= x <= W and 0 <= y <= H):  # NaN · 무한대도 여기서 걸린다
        raise_app_error("SPOT_BAD_POINT")
    if n is not None:
        if not _num(n):
            raise_app_error("KITCHEN_BAD_ACTION")
        if n != k["no"]:
            raise_app_error("SPOT_OLD_SCENE")
    return round(x), round(y)


def _note(k: dict, side: str, text: str, now: float) -> None:
    k["note"] = {"t": now, "s": side, "text": text}


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    """tap — 내 사진에서 다른 곳 누르기 · ping — 「여기 봐요」 표시(상대 사진의 같은 자리에 뜬다)."""
    k = st["k"]
    if k["over"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    if side not in ROOM.sides or action not in ("tap", "ping"):
        raise_app_error("KITCHEN_BAD_ACTION")
    x, y = _point(k, arg)
    if k["pause"] is not None:
        raise_app_error("SPOT_NEXT_WAIT")
    gap = k.setdefault("gap", {})
    key = f"{member_id}:{action}"
    if now - gap.get(key, 0) < (TAP_GAP if action == "tap" else PING_GAP):
        raise_app_error("ESCAPE_TOO_FAST", 429)

    if action == "ping":
        gap[key] = now
        k["pings"] = [*k["pings"], {"s": side, "x": x, "y": y, "t": now}][-KEEP_PINGS:]
        return

    if now < k["lock"].get(side, 0):
        raise_app_error("SPOT_MISS_WAIT", 429)
    gap[key] = now
    best, near = None, 1.0
    for d in k["diffs"]:
        if d["by"] is None:
            s = _score(d, x, y)
            if s <= near:
                best, near = d, s
    if best is not None:  # 찾았다
        best["by"], best["at"] = side, now
        k["found"] += 1
        k["foundBy"][side] = k["foundBy"].get(side, 0) + 1
        k["taps"] = [*k["taps"], {"s": side, "x": x, "y": y, "ok": 1, "t": now}][-KEEP_TAPS:]
        if all(d["by"] for d in k["diffs"]):
            k["cleared"] += 1
            k["done"] = [*k["done"], {"no": k["no"], "theme": k["theme"], "sec": round(now - k["sceneAt"], 1)}][-KEEP_DONE:]
            k["pause"] = now + CLEAR_SEC
            _note(k, side, f"{DIFFS}곳을 다 찾았어요! 다음 사진으로 넘어가요", now)
        else:
            _note(k, side, f"찾았어요! {best['label']}", now)
        return
    if any(d["by"] and _score(d, x, y) <= 1 for d in k["diffs"]):
        k["taps"] = [*k["taps"], {"s": side, "x": x, "y": y, "ok": 2, "t": now}][-KEEP_TAPS:]
        _note(k, side, "이미 찾은 곳이에요", now)  # 틀림으로 치지 않는다
        return
    # 틀렸다 — 둘이 함께 쓰는 시간이 준다
    k["misses"] += 1
    k["end"] = max(now, k["end"] - MISS_SEC)
    k["lock"][side] = now + MISS_LOCK
    k["taps"] = [*k["taps"], {"s": side, "x": x, "y": y, "ok": 0, "t": now}][-KEEP_TAPS:]
    _note(k, side, f"여긴 같아요. {MISS_SEC}초가 줄었어요", now)
    if now >= k["end"]:
        k["over"], k["reason"] = True, "time"


# ── 협동 방 공용 코드가 부르는 결과 ─────────────────────────────

def score(st: dict) -> int:
    k = st["k"]
    return k["found"] + k["cleared"] * CLEAR_BONUS


def end_code(st: dict) -> str:
    return "TIME"


def summary(st: dict) -> str:
    k = st["k"]
    if not k["found"]:
        return "시간 끝! 아쉽게 다른 곳을 하나도 못 찾았어요."
    tail = f" 사진 {k['cleared']}장은 {DIFFS}곳을 다 찾았어요." if k["cleared"] else ""
    return f"시간 끝! 다른 곳 {k['found']}개를 찾았어요.{tail} ({score(st)}점)"


# ── 화면 ──────────────────────────────────────────────────────

def _found(d: dict, i: int) -> dict:
    return {"n": i, "kind": d["k"], "label": d["label"], "hit": d["hit"], "box": d.get("box", []),
            "has": d["has"], "by": d["by"], "at": d["at"]}


def view(st: dict, side: Optional[str], now: float) -> dict:
    """side 쪽에게만 보내는 화면. 내 사진만 — 상대 사진은 장면을 다 찾았거나(맞대 보기) 끝났을 때만."""
    k = st["k"]
    me = side if side in ROOM.sides else None
    mate = None if me is None else ("b" if me == "a" else "a")
    reveal = k["over"] or k["pause"] is not None
    diffs = k["diffs"]
    note = k["note"]
    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st), "over": k["over"], "reason": k["reason"],
        "w": W, "h": H, "side": me, "sideName": ROOM.sides.get(me),
        "no": k["no"], "theme": k["theme"], "themeName": THEMES[k["theme"]]["name"], "place": k["place"],
        "objs": _version(k, me) if me else [],
        "other": _version(k, mate) if me and reveal else None,
        "total": DIFFS,
        "found": [_found(d, i) for i, d in enumerate(diffs) if d["by"]],
        "unfound": [_found(d, i) for i, d in enumerate(diffs) if not d["by"]] if k["over"] else None,
        "score": score(st), "foundTotal": k["found"], "cleared": k["cleared"], "misses": k["misses"],
        "foundBy": {"me": k["foundBy"].get(me, 0), "partner": k["foundBy"].get(mate, 0)} if me else {"me": 0, "partner": 0},
        "lockUntil": k["lock"].get(me, 0) if me else 0, "pause": k["pause"], "sceneAt": k["sceneAt"],
        "taps": [{"me": t["s"] == me, "x": t["x"], "y": t["y"], "ok": t["ok"], "t": t["t"]} for t in k["taps"] if now - t["t"] <= TAP_SEC],
        "pings": [{"me": p["s"] == me, "x": p["x"], "y": p["y"], "t": p["t"]} for p in k["pings"] if now - p["t"] <= PING_SEC],
        "note": {"me": note["s"] == me, "text": note["text"], "t": note["t"]} if note and now - note["t"] <= NOTE_SEC else None,
        "done": k["done"],
        "missSec": MISS_SEC, "missLock": MISS_LOCK, "clearSec": CLEAR_SEC, "clearBonus": CLEAR_BONUS, "pingSec": PING_SEC,
    }
