"""방탈출 방 내용 — 단서 · 자물쇠 · 물건 · 인터폰·방송. 정답은 판마다 새로 정해 서버 상태(state["p"])에만 둔다.

방마다 두 쪽(side)이 있고 두 사람이 한 쪽씩 맡는다. 자물쇠의 단서는 늘 반대쪽에 있어서
서로 본 것을 말해 줘야만 풀린다. 유리 벽 가운데 서류 투입구로 물건을 건너편에 넘길 수 있고,
어떤 자물쇠는 건너편에서 넘겨받은 물건을 먼저 써야 열린다. 마지막 문은 두 사람이 동시에 사원증을 대야 열린다.

화면에는 내 쪽에서 보이는 것만 보낸다 — 내 자물쇠의 정답이나 그 단서가 되는 값(params)은 내 쪽에 보내지 않는다.
판마다 정답이 바뀌므로(make_params) 같은 두 사람이 여러 번 해도 기록을 겨룰 수 있다.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional

from app.core.errors import register_messages

# 방탈출에서 새로 쓰는 오류 문구 — errors.py 를 고치지 않고 여기서 등록한다
register_messages({
    "ESCAPE_NO_ITEM": "가방에 없는 물건이에요.",
    "ESCAPE_ITEM_STUCK": "이 물건은 서류 투입구로 넘길 수 없어요.",
    "ESCAPE_ITEM_HERE": "지금 여기서는 쓸 수 없는 물건이에요.",
    "ESCAPE_BAD_HINT": "그 힌트는 아직 볼 수 없어요.",
    "ESCAPE_FULL": "배불러요. 남은 김밥은 퇴근하고 먹어요.",
})

# 정답 재료(make_params) 판 번호 — 순위 · 둘의 최고 기록은 이 판끼리만 비교한다(정답이 고정이던 예전 판은 더 짧아서 빼요)
PARAMS_VERSION = 2


@dataclass(frozen=True)
class Puzzle:
    key: str
    side: Optional[str]  # 푸는 쪽 — None 이면 둘이 함께(사원증)
    title: str
    kind: str  # digits · colors · switches · counts · cards
    length: int = 0
    options: tuple = ()
    requires: tuple = ()  # 먼저 풀려야 하는 자물쇠
    needs: tuple = ()  # 먼저 해 둬야 하는 일(물건을 쓴 표시 — 끼운 퓨즈 · 연 덮개)
    hints: tuple = ()  # (1단계 살짝, 2단계 확실하게) — 정답 값은 넣지 않는다(두 사람 모두에게 보인다)
    gives: tuple = ()  # 풀리면 생기는 물건 ((물건, 쪽), …)
    why: str = ""  # 아직 못 여는 까닭(requires · needs 가 안 됐을 때 자물쇠 칸에 보인다)
    whys: tuple = ()  # ((조건, …), 글) — 조건이 모두 맞는 첫 글이 why 대신 보인다. 조건은 Thing.variants 와 같고 "@쪽" 이면 그 쪽 화면만
    max: int = 0  # counts 칸 하나의 최댓값
    hint_cost: tuple = ()  # 힌트 단계별 벌점(초) — 비어 있으면 Room.hint_penalties


@dataclass(frozen=True)
class Item:
    key: str
    title: str
    text: str
    passable: bool = True  # 서류 투입구로 넘길 수 있는지
    use_at: Optional[str] = None  # 이 물건을 쓰는 곳(Thing key)
    flag: Optional[str] = None  # 쓰면 남는 표시(Puzzle.needs 가 본다)
    use_label: str = ""  # 쓰기 버튼 글자
    use_log: str = ""  # 쓰면 남기는 기록 — {name}
    edible: bool = False  # 먹을 수 있는지(김밥)
    bites: int = 0  # 한 조각씩 먹는 물건 — 먹어도 가방에 남고, 한 쪽에서 이만큼까지(0 이면 통째로 먹어 없어진다)


@dataclass(frozen=True)
class Task:
    """물건을 넘겨 쓰는 일 — 진행 칸에 자물쇠 사이사이 보여 준다."""

    flag: str
    side: str
    title: str
    after: tuple = ()  # 이 자물쇠가 풀리면 할 수 있다


@dataclass(frozen=True)
class Thing:
    key: str
    side: str
    title: str
    icon: str
    text: str
    requires: tuple = ()  # 이 자물쇠들이 풀려야 보인다(또는 켜진다)
    text_locked: str = ""  # requires 가 안 풀렸을 때 — 비어 있으면 아예 안 보인다
    variants: tuple = ()  # ((조건, …), 글) — 조건이 모두 맞는 첫 글로 바뀐다. 조건: 자물쇠 key · "+표시" · 앞에 "!" 면 아님
    art: Optional[str] = None  # 단서 그림 종류 — 판마다 정한 값(params)으로 그린다
    lock: Optional[str] = None  # 여기 걸린 자물쇠
    slot: bool = False  # 서류 투입구


@dataclass(frozen=True)
class Beat:
    """인터폰(등장인물) · 안내 방송 — 시작할 때와 자물쇠가 풀릴 때 두 사람 화면 위에 뜬다."""

    key: str
    after: Optional[str]  # 이 자물쇠가 풀리면 — None 이면 시작할 때
    who: str  # system(안내 방송) · npc(등장인물)
    name: str
    text: str


@dataclass(frozen=True)
class Room:
    key: str
    title: str
    intro: str
    sides: dict
    puzzles: tuple
    things: tuple
    items: tuple = ()
    tasks: tuple = ()
    beats: tuple = ()
    start_items: tuple = ()  # 시작할 때 가방 ((쪽, (물건, …)), …)
    limit_sec: int = 20 * 60
    hint_penalties: tuple = (30, 60)  # 힌트 1단계 · 2단계 벌점(초)
    wrong_penalty: int = 15
    card_window: int = 5  # 두 사람이 사원증을 대야 하는 간격(초)
    label: str = "방탈출"
    page: str = "escape"
    game: str = "escape"
    blurb: str = "둘이 단서를 나눠 20분 안에 탈출하는 협동 게임이에요."
    outro: str = ""

    @property
    def hint_penalty(self) -> int:  # 예전 이름 — 1단계 벌점
        return self.hint_penalties[0]

    def puzzle(self, key: str) -> Optional[Puzzle]:
        return next((p for p in self.puzzles if p.key == key), None)

    def thing(self, key: str) -> Optional[Thing]:
        return next((t for t in self.things if t.key == key), None)

    def item(self, key: str) -> Optional[Item]:
        return next((i for i in self.items if i.key == key), None)


# ── 판마다 바뀌는 값 ─────────────────────────────────────────────

COLORS = ("red", "yellow", "green", "blue", "purple")
FOLDER_NAMES = (
    "기획안_최종", "최종_진짜", "최종_진짜_수정", "제출용(최종)", "최종_마지막", "이게진짜최종",
    "최종2_확인", "보고서_찐최종", "최종_팀장님확인", "수정본_최종본",
)
COFFEE = (("shot", "샷"), ("milk", "우유"), ("syrup", "시럽"), ("ice", "얼음"))  # 커피머신 버튼 순서
COFFEE_MAX = 3
MEETING_ROOMS = ("A", "B", "C", "D")
MEETING_TIMES = ("09:30", "10:00", "11:00", "13:30", "14:00", "15:00", "16:30", "17:00")
MEETING_NAMES = ("주간 회의", "고객 미팅", "디자인 리뷰", "회고", "예산 회의", "신입 교육", "보고서 점검", "워크숍 준비")


def make_params(rng: random.Random) -> dict:
    """한 판의 정답 재료 — 생일 · 폴더 색 · 차단기 모양 · 관리자 메뉴 · 회의 순서 · 멈춘 시계."""
    switch = [0] * 5
    while sum(switch) in (0, 5):  # 처음 모양(모두 내림) · 모두 올림은 피한다
        switch = [rng.randint(0, 1) for _ in range(5)]
    coffee = {}
    while sum(coffee.values() or [0]) < 3 or sum(1 for v in coffee.values() if v) < 2:
        coffee = {k: rng.randint(0, COFFEE_MAX) for k, _ in COFFEE}
    order = [k for k, _ in COFFEE]
    rng.shuffle(order)  # 안내문 그림 순서는 버튼 순서와 다르게
    times = sorted(rng.sample(MEETING_TIMES, 4))
    rooms = rng.sample(MEETING_ROOMS, 4)
    whats = rng.sample(MEETING_NAMES, 4)
    hours = rng.sample(range(1, 10), 4)
    return {
        "v": PARAMS_VERSION,
        "bday": [rng.randint(1, 12), rng.randint(1, 28)],
        "folders": [{"color": c, "label": n} for c, n in zip(rng.sample(COLORS, 4), rng.sample(FOLDER_NAMES, 4))],
        "switch": switch,
        "coffee": coffee,
        "coffee_order": order,
        "booking": [{"time": t, "room": rm, "what": w} for t, rm, w in zip(times, rooms, whats)],  # 시간 순
        "clocks": dict(zip(MEETING_ROOMS, hours)),
    }


def answer(params: dict, key: str) -> tuple:
    """자물쇠 정답 — 서버에서만 맞춰 본다."""
    if key == "drawer":
        m, d = params["bday"]
        return (f"{m:02d}{d:02d}",)
    if key == "locker":
        return tuple(f["color"] for f in params["folders"])
    if key == "breaker":
        return tuple(int(v) for v in params["switch"])
    if key == "coffee":
        return tuple(int(params["coffee"][k]) for k, _ in COFFEE)
    if key == "panel":
        order = sorted(params["booking"], key=lambda b: b["time"])
        return ("".join(str(params["clocks"][b["room"]]) for b in order),)
    return ()


def answer_text(params: dict, key: str) -> str:
    """끝난 뒤 「이번 판 정답」에 보이는 글."""
    names = {"red": "빨강", "yellow": "노랑", "green": "초록", "blue": "파랑", "purple": "보라"}
    a = answer(params, key)
    if key in ("drawer", "panel"):
        return a[0]
    if key == "locker":
        return " → ".join(names.get(c, c) for c in a)
    if key == "breaker":
        return " ".join("위" if v else "아래" for v in a)
    if key == "coffee":
        return " · ".join(f"{label} {n}" for (_, label), n in zip(COFFEE, a))
    return ""


def art(params: dict, kind: Optional[str]) -> Optional[dict]:
    """단서 그림 — 이 그림이 보이는 쪽에만 보낸다."""
    if kind == "folders":
        return {"kind": "folders", "items": [dict(f) for f in params["folders"]]}
    if kind == "cake":
        m, d = params["bday"]
        return {"kind": "cake", "lines": ["팀장님 생신 축하드려요!", f"{m}월 {d}일", "— 팀원 일동"]}
    if kind == "switches":
        return {"kind": "switches", "items": list(params["switch"])}
    if kind == "booking":
        rows = sorted(params["booking"], key=lambda b: b["room"])  # 예약표는 회의실 이름 순 — 시간 순서는 직접 맞춘다
        return {"kind": "booking", "items": [{"time": b["time"], "room": f"{b['room']} 회의실", "what": b["what"]} for b in rows]}
    if kind == "clocks":
        return {"kind": "clocks", "items": [{"room": f"{rm} 회의실", "hour": params["clocks"][rm], "minute": 0} for rm in MEETING_ROOMS]}
    if kind == "notice":
        return {"kind": "notice", "items": [{"key": k, "count": int(params["coffee"][k])} for k in params["coffee_order"]]}
    return None


# ── 야근 사무실 탈출 (협동 시리즈 「오늘도 둘이서」 3화) ──────────────────

OVERTIME = Room(
    key="overtime",
    title="야근 사무실 탈출",
    intro=(
        "밤 10시, 보고서를 끝낸 순간 새 보안 시스템이 사무실을 잠갔어요. 한 사람은 사무실 쪽, 한 사람은 탕비실·회의실 쪽에 갇혔어요. "
        "본 것을 말로 알려 주고 서류 투입구로 물건을 넘겨 20분 안에 탈출해요."
    ),
    outro="출입문이 스르륵 열렸어요! 둘이 함께 사무실을 빠져나왔어요.",
    blurb="유리 벽을 사이에 두고 단서를 말로 나누고 물건을 넘겨 20분 안에 탈출하는 협동 게임이에요.",
    sides={"office": "사무실 쪽", "pantry": "탕비실·회의실 쪽"},
    puzzles=(
        Puzzle(
            "drawer", "office", "팀장님 서랍", "digits", length=4,
            hints=(
                "포스트잇에 '내 생일'이라고 적혀 있어요. 생일을 알려 주는 단서는 탕비실 쪽에 있어요.",
                "탕비실 쪽 냉장고 속 케이크 메모에 날짜가 있어요. 월 두 자리 + 일 두 자리로 눌러요(3월 5일 → 0305).",
            ),
            gives=(("fuse", "office"),),
        ),
        Puzzle(
            "locker", "pantry", "탕비실 사물함", "colors", length=4, options=COLORS,
            hints=(
                "색 순서 단서는 사무실 쪽에 있어요. 사물함 옆 메모를 다시 읽어 보세요.",
                "사무실 쪽 '내 노트북' 바탕화면 폴더 색을 왼쪽부터 차례로 불러 달라고 하세요.",
            ),
            gives=(("panelkey", "pantry"),),
        ),
        Puzzle(
            "breaker", "pantry", "차단기", "switches", length=5, requires=("locker",), needs=("fuse",),
            why="퓨즈 자리가 비어 있어요. 퓨즈부터 끼워야 스위치가 먹혀요.",
            hints=(
                "퓨즈와 스위치 모양이 모두 필요해요. 둘 다 사무실 쪽 팀장님 서랍에서 나와요.",
                "사무실 쪽에서 서랍 속 쪽지의 스위치를 1번부터 '위·아래'로 불러 주세요. 퓨즈는 서류 투입구로 넘겨받아 차단기에 끼워요.",
            ),
        ),
        Puzzle(
            "coffee", "pantry", "커피머신", "counts", length=len(COFFEE), options=tuple(k for k, _ in COFFEE),
            max=COFFEE_MAX, requires=("breaker",), why="전기가 나가서 커피머신이 꺼져 있어요.",
            hints=(
                "커피머신이 원하는 '관리자 메뉴'는 사무실 쪽 게시판 안내문에 그림으로 그려져 있어요.",
                "안내문 그림 순서는 버튼 순서와 달라요. 샷 · 우유 · 시럽 · 얼음이 각각 몇 개 그려졌는지 세어 달라고 하세요. 엑스(✕)가 쳐진 건 0개예요.",
            ),
            gives=(("card", "pantry"),),
        ),
        Puzzle(
            "panel", "office", "출입문 보안 패널", "digits", length=4, requires=("breaker",), needs=("cover",),
            why="화면이 꺼져 있고 숫자 버튼이 덮개에 잠겨 있어요. 전기와 파란 고리 열쇠가 필요해요.",
            whys=(
                (("!breaker", "!+cover"), "화면이 꺼져 있고 숫자 버튼이 덮개에 잠겨 있어요. 전기와 파란 고리 열쇠가 필요해요."),
                (("!breaker",), "덮개는 열었어요. 이제 전기만 들어오면 화면이 켜져요."),
                (("!+cover",), "화면은 켜졌는데 숫자 버튼이 파란 덮개에 잠겨 있어요. 파란 고리 열쇠로 덮개를 열어요."),
            ),
            hints=(
                "회의 순서는 사무실 쪽 예약표에, 멈춘 시계는 탕비실 쪽 회의실 복도에 있어요.",
                "예약표는 회의실 이름 순이에요. 시간이 이른 회의부터 회의실을 차례로 고르고, 그 회의실 시계의 짧은 바늘 숫자를 이어 붙이세요(예: 7·3·9·5 → 7395).",
            ),
        ),
        Puzzle(
            "door", None, "출입문", "cards", requires=("panel", "coffee"),
            why="보안 패널이 풀리고 두 사람 모두 사원증이 있어야 해요.",
            whys=(
                (("@pantry", "!coffee"), "커피머신이 삼킨 내 사원증부터 되찾아야 해요."),
                (("@office", "!coffee"), "탕비실 쪽 동료가 커피머신에서 사원증을 되찾아야 해요."),
            ),
            # 리더기 칸에 이미 보이는 규칙(5초 안에 같이)은 되풀이하지 않는다 — 맞추는 요령 하나만, 벌점 없이
            hints=(
                "한 사람이 먼저 대면 5초가 세어지고 건너편 화면에 바로 떠요. 대화창 아래 「셋, 둘, 하나!」를 보내고 '하나'에 같이 눌러요.",
            ),
            hint_cost=(0,),
        ),
    ),
    items=(
        Item(
            "fuse", "예비 퓨즈", "유리관 퓨즈예요. 띠지에 '탕비실 차단기용'이라고 적혀 있어요.",
            use_at="breaker", flag="fuse", use_label="차단기에 퓨즈 끼우기", use_log="{name}님이 차단기에 퓨즈를 끼웠어요.",
        ),
        Item(
            "panelkey", "파란 고리 열쇠", "고리에 '7층 보안 패널 덮개'라고 적힌 작은 열쇠예요.",
            use_at="panel", flag="cover", use_label="열쇠로 패널 덮개 열기", use_log="{name}님이 열쇠로 보안 패널 덮개를 열었어요.",
        ),
        Item(
            "card", "내 사원증", "각자 자기 쪽 리더기에 대는 사원증이에요. 투입구로는 넘기지 않아요.", passable=False,
        ),
        Item(
            "kimbap", "김밥 한 줄", "점심에 복순 사장님이 싸 준 김밥이에요. 출출하면 한 조각 먹거나 동기에게 넘겨줄 수 있어요. 나머지는 퇴근길에 먹어요.",
            edible=True, bites=3,
        ),
    ),
    tasks=(
        Task("fuse", "pantry", "차단기에 퓨즈 끼우기", after=("drawer", "locker")),  # 퓨즈(서랍) + 차단기 상자 열쇠(사물함)
        Task("cover", "office", "보안 패널 덮개 열기", after=("locker",)),
    ),
    start_items=(("office", ("card", "kimbap")), ("pantry", ("kimbap",))),
    beats=(
        Beat("start", None, "system", "보안 시스템", "새 보안 시스템 시험 중입니다. 모든 출입문을 잠급니다."),
        Beat("mun", None, "npc", "문 반장님",
             "참, 유리 벽 가운데 서류 투입구로는 물건을 넘길 수 있어요. 필요한 건 서로 건네줘요!"),
        Beat("drawer", "drawer", "npc", "문 반장님", "서랍에 퓨즈 있죠? 그거 탕비실 차단기 거예요. 투입구로 넘겨 줘요!"),
        Beat("locker", "locker", "npc", "문 반장님", "사물함 열쇠 꾸러미 중 파란 고리는 사무실 보안 패널 덮개 열쇠예요."),
        Beat("breaker", "breaker", "system", "보안 시스템", "전원이 복구되었습니다. 보안 패널과 커피머신을 다시 켭니다."),
        Beat("coffee", "coffee", "system", "커피머신", "결제가 끝났어요. 사원증을 돌려드려요. 맛있게 드세요!"),
        Beat("panel", "panel", "system", "보안 시스템", "출입 인증 대기 중. 두 분이 5초 안에 사원증을 대 주세요."),
    ),
    things=(
        # ── 사무실 쪽 ──
        Thing(
            "monitor", "office", "내 노트북", "laptop",
            "배터리로 아직 켜져 있는 노트북이에요. 바탕화면에 폴더 네 개가 나란히 있어요. 이름은 다 '최종'이에요.",
            art="folders",
        ),
        Thing(
            "drawer", "office", "팀장님 서랍", "archive",
            "숫자 자물쇠가 걸린 서랍이에요. 포스트잇에 '비밀번호는 내 생일, 월일 네 자리 — 팀장'이라고 적혀 있어요.",
            variants=((("drawer",), "서랍이 열렸어요! 예비 퓨즈와 시설팀 쪽지가 들어 있었어요. 퓨즈는 가방에 넣었어요."),),
            lock="drawer",
        ),
        Thing(
            "memo", "office", "서랍 속 쪽지", "sticky-note",
            "시설팀 쪽지예요. '정전되면 탕비실 차단기를 이 모양으로 맞추세요.' 스위치 다섯 개가 1번부터 그려져 있어요.",
            requires=("drawer",), art="switches",
        ),
        Thing(
            "notice", "office", "게시판 안내문", "clipboard-list",
            "관리실 문 반장님이 붙인 안내문이에요. '오늘 밤 새 보안 시스템 시험 — 커피머신이 멈추면 관리자 메뉴를 누르세요.' 아래에 그림만 있어요.",
            art="notice",
        ),
        Thing(
            "booking", "office", "회의실 예약표", "calendar-days",
            "벽에 붙은 오늘 회의실 예약표예요. 회의실 이름 순으로 적혀 있어요.",
            art="booking",
        ),
        Thing(
            "panel", "office", "출입문 보안 패널", "shield",
            "보안 패널이에요. 화면은 꺼져 있고, 숫자 버튼은 파란 덮개로 잠겨 있어요.",
            variants=(
                (("panel",), "패널에 초록 불이 들어왔어요. 화면: '출입 인증 대기 중'"),
                (("breaker", "+cover"), "패널 화면: '오늘 회의 순서대로, 멈춘 시계가 가리키는 시(時)를 누르세요.'"),
                (("breaker",), "패널 화면이 켜졌어요: '오늘 회의 순서대로, 멈춘 시계가 가리키는 시(時)를 누르세요.' 그런데 숫자 버튼이 파란 덮개로 잠겨 있어요."),
                (("+cover",), "덮개를 열어 숫자 버튼이 보여요. 그런데 화면이 꺼져 있어요. 전기부터 들어와야 해요."),
            ),
            lock="panel",
        ),
        Thing(
            "door", "office", "출입문 카드 리더기", "door-closed",
            "리더기에 초록 불이 들어왔어요. 양쪽 리더기에 5초 안에 같이 사원증을 대야 열려요.",
            requires=("panel",),
            text_locked="출입문이 잠겨 있어요. 리더기에 빨간 불이 켜져 있어요. 보안 패널부터 풀어야 해요.",
            variants=((("!coffee",), "리더기에 초록 불이 들어왔어요. 그런데 탕비실 쪽 동료가 아직 사원증이 없대요."),),
            lock="door",
        ),
        Thing(
            "mug", "office", "머그컵", "coffee",
            "'월요병 극복'이라고 적힌 머그컵이에요. 식은 커피가 반쯤 남아 있어요. 별 쓸모는 없어 보여요.",
        ),
        Thing(
            "slot", "office", "서류 투입구", "mail",
            "유리 벽 가운데 낮은 곳에 납작한 서류 투입구가 있어요. 가방에 든 물건을 건너편으로 넘길 수 있어요.",
            slot=True,
        ),
        # ── 탕비실·회의실 쪽 ──
        Thing(
            "fridge", "pantry", "냉장고", "refrigerator",
            "냉장고 안에 케이크 상자가 있어요. 상자에 메모가 붙어 있어요.",
            art="cake",
        ),
        Thing(
            "locker", "pantry", "탕비실 사물함", "lock",
            "색깔 버튼 다섯 개가 달린 사물함이에요. 옆 메모: '열쇠는 여기! 순서는 사무실 내 노트북 폴더 색 — 막내'",
            variants=((("locker",), "사물함이 열렸어요! 열쇠 꾸러미가 있었어요. 빨간 고리로 차단기 상자를 열었고, 파란 고리 열쇠는 가방에 넣었어요."),),
            lock="locker",
        ),
        Thing(
            "breaker", "pantry", "차단기", "zap",
            "차단기 상자를 열었어요. 스위치 다섯 개가 있는데, 퓨즈 자리 하나가 비어 있어요.",
            requires=("locker",),
            text_locked="벽에 차단기 상자가 있어요. 빨간 자물쇠로 잠겨 있어요. 열쇠가 필요해요.",
            variants=(
                (("breaker",), "딸깍! 전기가 다시 들어왔어요."),
                (("+fuse",), "퓨즈를 끼웠어요. 이제 스위치 다섯 개를 쪽지 모양대로 맞춰요."),
            ),
            lock="breaker",
        ),
        Thing(
            "coffee", "pantry", "커피머신", "coffee",
            "사원증으로 결제하는 커피머신이에요. 정전되면서 내 사원증을 삼킨 채 꺼져 버렸어요.",
            variants=(
                (("coffee",), "삑! 커피 한 잔과 함께 사원증이 나왔어요. 사원증은 가방에 넣었어요."),
                (("breaker",), "커피머신이 켜졌어요. 화면: '보안 시험 중 — 관리자 메뉴를 고르면 사원증을 돌려드려요.'"),
            ),
            lock="coffee",
        ),
        Thing(
            "clocks", "pantry", "회의실 복도", "clock",
            "불이 켜지니 회의실 문마다 시계가 보여요. 건전지가 다 됐는지 전부 멈춰 있어요.",
            requires=("breaker",),
            text_locked="회의실 복도가 깜깜해서 아무것도 안 보여요.",
            art="clocks",
        ),
        Thing(
            "water", "pantry", "정수기", "glass-water",
            "'온수 주의' 스티커가 붙은 정수기예요. 물 한 잔 마시니 정신이 좀 들어요. 별 쓸모는 없어 보여요.",
        ),
        Thing(
            "exit", "pantry", "비상구 카드 리더기", "door-closed",
            "이쪽 리더기에도 초록 불이 들어왔어요. 양쪽에서 5초 안에 같이 사원증을 대야 문이 열려요.",
            requires=("panel",),
            text_locked="비상구 리더기에 빨간 불이 켜져 있어요. 사무실 쪽 보안 패널이 풀려야 해요.",
            variants=((("!coffee",), "리더기에 초록 불이 들어왔어요. 그런데 사원증이 커피머신 안에 있어요!"),),
            lock="door",
        ),
        Thing(
            "slot", "pantry", "서류 투입구", "mail",
            "유리 벽 가운데 낮은 곳에 납작한 서류 투입구가 있어요. 가방에 든 물건을 건너편으로 넘길 수 있어요.",
            slot=True,
        ),
    ),
)

ROOMS = {OVERTIME.key: OVERTIME}
DEFAULT_ROOM = OVERTIME.key
