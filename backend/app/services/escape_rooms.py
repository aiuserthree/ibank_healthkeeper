"""방탈출 방 내용 — 단서 · 자물쇠 · 정답. 정답은 서버에만 두고 화면에는 내 쪽에서 보이는 것만 보낸다.

방마다 두 쪽(side)이 있고 두 사람이 한 쪽씩 맡는다. 자물쇠의 단서는 늘 반대쪽에 있어서
서로 본 것을 말해 줘야만 풀린다. 마지막 문은 두 사람이 동시에 사원증을 대야 열린다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Puzzle:
    key: str
    side: Optional[str]  # 푸는 쪽 — None 이면 둘이 함께(사원증)
    title: str
    kind: str  # digits · colors · switches · cards
    answer: tuple = ()
    length: int = 0
    options: tuple = ()
    requires: tuple = ()
    hint: str = ""


@dataclass(frozen=True)
class Thing:
    key: str
    side: str
    title: str
    icon: str
    text: str
    requires: tuple = ()  # 이 자물쇠들이 풀려야 보인다(또는 켜진다)
    text_locked: str = ""  # requires 가 안 풀렸을 때 — 비어 있으면 아예 안 보인다
    art: Optional[dict] = None  # 화면이 그리는 그림 — 단서
    lock: Optional[str] = None  # 여기 걸린 자물쇠


@dataclass(frozen=True)
class Room:
    key: str
    title: str
    intro: str
    sides: dict
    puzzles: tuple
    things: tuple
    limit_sec: int = 20 * 60
    hint_penalty: int = 60
    wrong_penalty: int = 15
    card_window: int = 5  # 두 사람이 사원증을 대야 하는 간격(초)
    outro: str = ""

    def puzzle(self, key: str) -> Optional[Puzzle]:
        return next((p for p in self.puzzles if p.key == key), None)


OVERTIME = Room(
    key="overtime",
    title="야근 사무실 탈출",
    intro=(
        "금요일 밤 10시, 둘만 남아 야근하던 중 보안 시스템이 고장 나 사무실이 잠겼어요. "
        "한 사람은 사무실 쪽에, 다른 한 사람은 탕비실·회의실 쪽에 갇혔어요. "
        "유리 벽 너머로 서로 본 것을 알려 주며 20분 안에 출입문을 열어 주세요."
    ),
    outro="출입문이 열렸어요! 둘이 함께 무사히 퇴근했어요.",
    sides={"office": "사무실 쪽", "pantry": "탕비실·회의실 쪽"},
    puzzles=(
        Puzzle(
            "drawer", "office", "팀장님 서랍", "digits", answer=("0314",), length=4,
            hint="팀장님 생일은 탕비실 쪽 냉장고에 있어요. 동료에게 날짜를 물어보세요. 3월 5일이면 0305처럼 눌러요.",
        ),
        Puzzle(
            "locker", "pantry", "탕비실 사물함", "colors", answer=("green", "red", "yellow", "blue"), length=4,
            options=("red", "yellow", "green", "blue"),
            hint="색 순서는 사무실 쪽 모니터 바탕화면에 있어요. 폴더 색을 왼쪽부터 차례로 물어보세요.",
        ),
        Puzzle(
            "breaker", "pantry", "차단기", "switches", answer=(1, 0, 0, 1, 1), length=5, requires=("locker",),
            hint="차단기 모양은 사무실 쪽 팀장님 서랍 속 쪽지에 그려져 있어요. 서랍이 먼저 열려야 해요.",
        ),
        Puzzle(
            "panel", "office", "출입문 보안 패널", "digits", answer=("9753",), length=4, requires=("breaker",),
            hint="회의 순서는 사무실 쪽 예약표에, 시계는 탕비실 쪽 복도에 있어요. 예약표의 회의 순서대로 그 회의실 시계가 가리키는 시(時)를 이어 붙이세요.",
        ),
        Puzzle(
            "door", None, "출입문", "cards", requires=("panel",),
            hint="두 사람이 5초 안에 각자 쪽 리더기에 사원증을 대야 해요. '셋, 둘, 하나' 하고 같이 눌러 보세요.",
        ),
    ),
    things=(
        # ── 사무실 쪽 ──
        Thing(
            "monitor", "office", "내 자리 모니터", "monitor",
            "모니터 바탕화면에 폴더 네 개가 나란히 있어요. 이름은 다 '최종'이에요.",
            art={"kind": "folders", "items": [
                {"color": "green", "label": "기획안_최종"},
                {"color": "red", "label": "최종_진짜"},
                {"color": "yellow", "label": "최종_진짜_수정"},
                {"color": "blue", "label": "제출용(최종)"},
            ]},
        ),
        Thing(
            "drawer", "office", "팀장님 서랍", "archive",
            "서랍에 숫자 자물쇠가 걸려 있어요. 포스트잇에 '비밀번호는 내 생일, 월일 네 자리 — 팀장'이라고 적혀 있어요.",
            lock="drawer",
        ),
        Thing(
            "memo", "office", "서랍 속 쪽지", "sticky-note",
            "시설팀 쪽지예요. '정전되면 탕비실 차단기를 이 모양으로 맞추세요.' 스위치 다섯 개가 왼쪽부터 그려져 있어요.",
            requires=("drawer",),
            art={"kind": "switches", "items": [1, 0, 0, 1, 1]},
        ),
        Thing(
            "booking", "office", "회의실 예약표", "calendar-days",
            "벽에 오늘 회의실 예약표가 붙어 있어요.",
            art={"kind": "booking", "items": [
                {"time": "10:00", "room": "C 회의실", "what": "주간 회의"},
                {"time": "13:30", "room": "A 회의실", "what": "고객 미팅"},
                {"time": "15:00", "room": "D 회의실", "what": "디자인 리뷰"},
                {"time": "17:00", "room": "B 회의실", "what": "회고"},
            ]},
        ),
        Thing(
            "panel", "office", "출입문 보안 패널", "shield",
            "패널이 켜졌어요. 화면에 '오늘 회의 순서대로, 멈춘 시계가 가리키는 시(時)를 누르세요.'라고 떠 있어요.",
            requires=("breaker",),
            text_locked="패널 화면이 꺼져 있어요. 건물 전기가 나간 것 같아요.",
            lock="panel",
        ),
        Thing(
            "mug", "office", "머그컵", "coffee",
            "'월요병 극복'이라고 적힌 머그컵이에요. 식은 커피가 반쯤 남아 있어요. 별 쓸모는 없어 보여요.",
        ),
        Thing(
            "door", "office", "출입문 카드 리더기", "door-closed",
            "리더기에 초록 불이 들어왔어요. 문은 양쪽 리더기에 동시에 사원증을 대야 열려요.",
            requires=("panel",),
            text_locked="출입문이 잠겨 있어요. 보안 패널부터 풀어야 해요.",
            lock="door",
        ),
        # ── 탕비실·회의실 쪽 ──
        Thing(
            "fridge", "pantry", "냉장고", "refrigerator",
            "냉장고 안에 케이크 상자가 있어요. 상자에 메모가 붙어 있어요.",
            art={"kind": "cake", "lines": ["팀장님 생신 축하드려요!", "3월 14일", "— 팀원 일동"]},
        ),
        Thing(
            "locker", "pantry", "탕비실 사물함", "lock",
            "색깔 버튼 네 개가 달린 사물함이에요. 옆에 '사무실 내 자리 모니터의 폴더 색 순서 — 막내'라고 적혀 있어요.",
            lock="locker",
        ),
        Thing(
            "breaker", "pantry", "차단기", "zap",
            "사물함 안에 차단기 열쇠가 있었어요. 차단기 상자를 여니 스위치가 다섯 개 있어요.",
            requires=("locker",),
            lock="breaker",
        ),
        Thing(
            "clocks", "pantry", "회의실 복도", "clock",
            "불이 켜지니 회의실 문마다 시계가 보여요. 건전지가 다 됐는지 전부 멈춰 있어요.",
            requires=("breaker",),
            text_locked="복도가 깜깜해서 아무것도 안 보여요.",
            art={"kind": "clocks", "items": [
                {"room": "A 회의실", "hour": 7, "minute": 0},
                {"room": "B 회의실", "hour": 3, "minute": 0},
                {"room": "C 회의실", "hour": 9, "minute": 0},
                {"room": "D 회의실", "hour": 5, "minute": 0},
            ]},
        ),
        Thing(
            "coffee", "pantry", "커피머신", "coffee",
            "'세척 중' 불이 깜빡여요. 오늘따라 유난히 시끄러웠던 커피머신이에요. 별 쓸모는 없어 보여요.",
        ),
        Thing(
            "exit", "pantry", "비상구 카드 리더기", "door-closed",
            "이쪽 리더기에도 초록 불이 들어왔어요. 양쪽에서 동시에 사원증을 대야 문이 열려요.",
            requires=("panel",),
            text_locked="비상구 리더기에 빨간 불이 켜져 있어요. 사무실 쪽 보안 패널이 풀려야 해요.",
            lock="door",
        ),
    ),
)

ROOMS = {OVERTIME.key: OVERTIME}
DEFAULT_ROOM = OVERTIME.key
