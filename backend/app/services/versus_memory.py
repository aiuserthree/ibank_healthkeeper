"""도형 짝맞추기 대전 엔진 — 엎어 둔 도형 카드 24장(12쌍)을 번갈아 두 장씩 뒤집어 같은 짝을 더 많이 모은다. 직원끼리 또는 컴퓨터와.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/memory.html — 카드 번호(0~23, 왼쪽 위부터 한 줄에 6장씩)와 도형 이름(face)이 이 파일과 같다.

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 카드 24장(6 × 4)이 엎어져 있다. 모양과 색이 모두 같은 두 장이 한 짝 — 모양만 같고 색이 다른 카드도 섞여 있다.
  · 내 차례에 카드 두 장을 한 장씩 뒤집는다. 짝이면 내 것이 되고 한 번 더, 아니면 두 장을 다시 엎고 차례가 넘어간다.
  · 12쌍 중 7쌍을 먼저 모으면 바로 이긴다(남은 짝을 상대가 다 가져가도 뒤집을 수 없다). 6 : 6 이면 무승부.
  · 한 장 뒤집는 기한은 24시간 — 넘기면 시간 초과로 진다(match.py 기본 규칙).
  · 상대가 화면을 안 보고 있어도 공평하게 — 내 차례가 오면 상대가 지난 차례에 뒤집은 카드를 그대로 다시 보여 준다
    (내가 첫 장을 뒤집기 전까지). 그보다 오래된 카드는 보여 주지 않는다 — 「최근에 본 카드」 표시도 없다. 기억력 승부.

카드(face) — "모양-색" 글자. 모양 12가지 중 8가지를 고르고, 그중 4가지는 색만 다른 카드를 한 짝 더 넣는다(헷갈리라고).
  모양: circle · triangle · square · star · hexagon · heart · diamond · cross · moon · drop · arrow · spiral
  색: red · orange · yellow · green · sky · blue · purple · navy

행동(화면이 HKApi.matchMove(id, {data: {flip: 카드 번호}}, seq) 로 보내는 data)
  {"flip": 0~23}      카드 한 장 뒤집기. 한 번에 한 장 — 첫 장을 뒤집으면 바로 두 사람 모두에게 보이고(실시간 · 기다리기),
                      둘째 장을 뒤집으면 짝 맞춤을 본다. 이미 가져간 카드 · 방금 뒤집은 카드는 막는다. seq 를 맞춰 본다(STALE_CHECK).

판(m.state) — 엎어 둔 카드의 모양(deck) · 컴퓨터의 기억(bm)은 view 가 절대 보내지 않는다
  p: [먼저 id, 나중 id](컴퓨터는 BOT_ID) · cols · rows · deck: [face] × 24(비밀) · taken: 카드마다 가져간 자리(안 가져갔으면 -1)
  turn: 차례 자리(0 · 1) · open: 이번에 뒤집어 둔 첫 장(없으면 None) · cur: [[첫 장, 둘째 장], ...] 이번 차례에 맞힌 짝
  t: 끝난 차례 수 · hist: 끝난 차례 마지막 두 개 [{"s": 자리, "t": 몇 번째 차례, "steps": [[첫 장, 둘째 장, 짝인지], ...]}]
  got: [[자리, 첫 장, 둘째 장], ...] 짝을 가져간 순서 · flips: 뒤집은 장 수 · bm: {str(카드): face} 컴퓨터가 기억하는 카드(컴퓨터전만)

화면에 보내는 것(view, board=True) — 나 · 상대 기준(me · rival)
  cols · rows · pairs(12) · goal(7) · iFirst · myPairs · rivalPairs · turnNo · flips
  cards: [None(엎어 둠) | {"f", "up": True}(지금 뒤집어 둔 첫 장) | {"f", "by": "me"|"rival"}(가져감) | {"f", "left": True}(끝난 판의 남은 카드)]
  open: 지금 뒤집어 둔 첫 장 번호 또는 None · cur: [[첫 장, 둘째 장, face], ...] 이번 차례에 맞힌 짝(이미 공개)
  myPile · rivalPile: 가져간 짝의 face(가져간 순서)
  last: 바로 앞 차례 {"by", "t", "steps": [[첫 장, 둘째 장, 첫 face, 둘째 face, 짝인지], ...]} — 이번 차례에 아직 아무것도 안 뒤집었을 때만
        (내 차례가 오면 상대가 뒤집은 카드를 다시 보여 주는 데 쓴다. 첫 장을 뒤집으면 두 사람 모두에게서 사라진다)
  prev: 컴퓨터전에서만 — 컴퓨터 차례 바로 앞의 내 차례(같은 요청 안에서 컴퓨터가 바로 이어 두니, 내가 뒤집은 둘째 장을 보여 주려고)
  끝난 판(DONE)은 숨길 것이 없다 — 모든 카드 · last · prev 를 보낸다.
"""

from __future__ import annotations

import random
from datetime import datetime
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "memory"
NAME = "도형 짝맞추기"
REASONS = {"MAJORITY": "7쌍 먼저", "DRAW": "6 : 6 무승부"}
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

COLS, ROWS = 6, 4
CARDS = COLS * ROWS  # 24장
PAIRS = CARDS // 2  # 12쌍
GOAL = PAIRS // 2 + 1  # 7쌍 — 먼저 모으면 바로 이긴다
BASE_SHAPES = 8  # 한 판에 쓰는 모양 수
TWINS = PAIRS - BASE_SHAPES  # 색만 다른 짝을 더 넣는 모양 수(4)
MIN_PAIRS = 6  # 기권 · 시간 초과로 끝난 판은 짝을 이만큼 찾은 판만 도장 · 순위에 센다

SHAPES = ("circle", "triangle", "square", "star", "hexagon", "heart", "diamond", "cross", "moon", "drop", "arrow", "spiral")
COLORS = ("red", "orange", "yellow", "green", "sky", "blue", "purple", "navy")
# 색만 다른 짝 — 밝기 · 색이 뚜렷하게 다른 색끼리만(빨강 · 초록처럼 색약이 헷갈리는 짝은 넣지 않는다)
TWIN_COLORS = {
    "red": ("blue", "sky", "navy"),
    "orange": ("blue", "purple", "navy"),
    "yellow": ("blue", "purple", "navy"),
    "green": ("purple", "navy"),
    "sky": ("red", "orange", "purple"),
    "blue": ("red", "orange", "yellow"),
    "purple": ("yellow", "orange", "green"),
    "navy": ("yellow", "orange", "red"),
}

# 컴퓨터의 기억 — 카드가 뒤집힐 때 기억할 확률 · 자기 차례가 올 때마다 기억 하나를 잊을 확률 ·
# 모양만 같은(색이 다른) 카드를 짝으로 착각할 확률. 사람이 뒤집은 카드도 같은 확률로 본다(사람도 컴퓨터가 뒤집은 카드를 본다)
# 2천 판 흉내 — 사람의 승률(쉬움 · 보통 · 어려움):
#   가볍게 하는 사람(본 카드의 50%를 기억 · 차례마다 10%를 잊음) 72% · 43% · 9%
#   꽤 잘 기억하는 사람(70% · 5%) 92% · 74% · 33% / 하나도 안 잊는 사람 99% · 96% · 75%
BOT_REMEMBER = {"easy": 0.45, "normal": 0.55, "hard": 0.8}
BOT_FORGET = {"easy": 0.2, "normal": 0.12, "hard": 0.05}
BOT_CONFUSE = {"easy": 0.35, "normal": 0.1, "hard": 0.0}
BOT_EXPLORE = {"easy": 0.6, "normal": 0.85, "hard": 1.0}  # 둘째 장으로 처음 보는 카드를 고를 확률(나머지는 아무 카드나)

register_messages(
    {
        "MEMORY_BAD_CARD": "뒤집을 수 없는 카드예요.",
        "MEMORY_TAKEN": "이미 짝을 찾은 카드예요.",
        "MEMORY_SAME": "이미 뒤집은 카드예요. 다른 카드를 골라 주세요.",
    },
    {"MEMORY_BAD_CARD": 400, "MEMORY_TAKEN": 409, "MEMORY_SAME": 409},
)


def _rnd() -> random.Random:
    """컴퓨터의 기억 · 고르기에 쓰는 난수 — 시험에서 바꿔 끼울 수 있게 함수로."""
    return random.Random()


def shape_of(face: str) -> str:
    return face.split("-", 1)[0]


def deal(rnd) -> list:
    """카드 24장을 섞어 놓는다 — 모양 8가지(색 하나씩) + 그중 4가지는 색만 다른 짝 하나 더 = 12쌍."""
    shapes = rnd.sample(SHAPES, BASE_SHAPES)
    colors = rnd.sample(COLORS, BASE_SHAPES)
    faces = [f"{s}-{c}" for s, c in zip(shapes, colors)]
    for s, c in rnd.sample(list(zip(shapes, colors)), TWINS):
        faces.append(f"{s}-{rnd.choice(TWIN_COLORS[c])}")
    deck = faces * 2
    rnd.shuffle(deck)
    return deck


def new_state(players, rnd, deck: Optional[list] = None) -> dict:
    p = [int(players[0]), int(players[1])]
    st = {
        "p": p, "cols": COLS, "rows": ROWS, "deck": list(deck) if deck else deal(rnd), "taken": [-1] * CARDS,
        "turn": 0, "open": None, "cur": [], "t": 0, "hist": [], "got": [], "flips": 0,
    }
    if BOT_ID in p:
        st["bm"] = {}
    return st


def _seat(st: dict, member_id) -> Optional[int]:
    p = st.get("p") or []
    return p.index(member_id) if member_id in p else None


def _pairs(st: dict, seat: int) -> int:
    return sum(1 for g in st["got"] if g[0] == seat)


def _observe(st: dict, idx: int, level: Optional[str], rnd) -> None:
    """컴퓨터전 — 뒤집힌 카드를 컴퓨터가 난이도만큼의 확률로 기억한다."""
    if "bm" not in st or not level:
        return
    if rnd.random() < BOT_REMEMBER.get(level, BOT_REMEMBER["normal"]):
        st["bm"][str(idx)] = st["deck"][idx]


def _close_turn(st: dict, seat: int, last_step: Optional[list]) -> None:
    """차례 하나를 마친다 — 이번 차례에 뒤집은 것을 기록(hist)에 남기고 차례를 넘긴다."""
    steps = [[a, b, True] for a, b in st["cur"]]
    if last_step:
        steps.append(last_step)
    st["hist"] = [*st["hist"], {"s": seat, "t": st["t"], "steps": steps}][-2:]
    st["t"] += 1
    st["cur"] = []
    st["open"] = None
    st["turn"] = 1 - seat


def _flip(st: dict, seat: int, idx: int, level: Optional[str], rnd) -> Optional[tuple]:
    """seat 자리가 idx 카드를 뒤집는다 — 첫 장이면 펼쳐 두고, 둘째 장이면 짝을 본다. 끝나면 (승자 id, 이유)."""
    _observe(st, idx, level, rnd)
    st["flips"] += 1
    first = st["open"]
    if first is None:
        st["open"] = idx
        return None
    st["open"] = None
    deck = st["deck"]
    if deck[first] != deck[idx]:  # 짝이 아니다 — 다시 엎고 차례가 넘어간다
        _close_turn(st, seat, [first, idx, False])
        return None
    st["taken"][first] = st["taken"][idx] = seat
    st["got"].append([seat, first, idx])
    st["cur"].append([first, idx])
    if "bm" in st:
        st["bm"].pop(str(first), None)
        st["bm"].pop(str(idx), None)
    mine, theirs = _pairs(st, seat), _pairs(st, 1 - seat)
    if mine >= GOAL:  # 과반 — 남은 짝을 다 내줘도 진다
        _close_turn(st, seat, None)
        return (st["p"][seat], "MAJORITY")
    if mine + theirs >= PAIRS:  # 다 가져갔는데 과반이 없다 — 6 : 6
        _close_turn(st, seat, None)
        return (None, "DRAW")
    return None  # 짝을 맞혔으니 한 번 더


# ---------- 규약 ----------
def start(m, players: tuple, rnd) -> dict:
    return new_state(players, rnd)


def waiting_for(m) -> set:
    st = m.state
    return {st["p"][st["turn"]]}


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, member_id)
    if seat is None or seat != st["turn"]:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    idx = data.get("flip")
    if isinstance(idx, bool) or not isinstance(idx, int) or not 0 <= idx < len(st["deck"]):
        raise_app_error("MEMORY_BAD_CARD")
    if st["taken"][idx] >= 0:
        raise_app_error("MEMORY_TAKEN")
    if st["open"] == idx:
        raise_app_error("MEMORY_SAME")
    return _flip(st, seat, idx, m.bot, _rnd())


def counts(m) -> bool:
    """기권 · 시간 초과로 끝난 판은 짝을 6쌍 이상 찾은 판만 센다 — 바로 기권해 도장 · 승수를 얻지 못하게."""
    if m.end_reason in ("RESIGN", "TIMEOUT", "TIMEOUT_DRAW"):
        return len((m.state or {}).get("got") or []) >= MIN_PAIRS
    return True


# ---------- 화면 ----------
def _turn_out(st: dict, rec: dict, who: tuple) -> dict:
    deck = st["deck"]
    return {
        "by": who[rec["s"]], "t": rec["t"],
        "steps": [[a, b, deck[a], deck[b], bool(ok)] for a, b, ok in rec["steps"]],
    }


def view(m, member_id: int, board: bool) -> dict:
    """엎어 둔 카드의 모양은 끝나기 전에는 보내지 않는다 — 지금 뒤집어 둔 첫 장, 가져간 짝, 바로 앞 차례(다시 보여 주기)만."""
    st = m.state or {}
    if not st.get("p"):
        return {}
    me = _seat(st, member_id)
    me = 0 if me is None else me
    out = {"myPairs": _pairs(st, me), "rivalPairs": _pairs(st, 1 - me)}
    if not board:  # 목록 한 줄 — 짝 수만
        return out
    done = m.status == "DONE"
    who = ("me", "rival") if me == 0 else ("rival", "me")
    deck, taken = st["deck"], st["taken"]
    cards = []
    for i, f in enumerate(deck):
        if taken[i] >= 0:
            cards.append({"f": f, "by": who[taken[i]]})
        elif done:
            cards.append({"f": f, "left": True})
        elif st["open"] == i:
            cards.append({"f": f, "up": True})
        else:
            cards.append(None)
    fresh = st["open"] is None and not st["cur"]  # 이번 차례에 아직 아무것도 안 뒤집었다
    hist = st["hist"]
    last = prev = None
    if hist and (done or fresh):
        last = _turn_out(st, hist[-1], who)
    # 컴퓨터전 — 컴퓨터가 같은 요청 안에서 바로 이어 두었으니, 그 앞의 내 차례(내가 뒤집은 둘째 장)도 보여 준다
    if len(hist) >= 2 and (done or (fresh and m.bot and hist[-2]["s"] == me and hist[-1]["s"] != me)):
        prev = _turn_out(st, hist[-2], who)
    out.update({
        "cols": st["cols"], "rows": st["rows"], "pairs": len(deck) // 2, "goal": len(deck) // 4 + 1,
        "iFirst": me == 0, "turnNo": st["t"], "flips": st["flips"],
        "cards": cards,
        "open": None if done else st["open"],
        "cur": [[a, b, deck[a]] for a, b in st["cur"]],
        "myPile": [deck[a] for s, a, _ in st["got"] if s == me],
        "rivalPile": [deck[a] for s, a, _ in st["got"] if s != me],
        "last": last,
        "prev": prev,
    })
    return out


# ---------- 컴퓨터 ----------
def _bot_memory(st: dict) -> dict:
    """컴퓨터가 기억하는 카드 중 아직 판에 남은 것 — {카드 번호: face}."""
    return {int(k): f for k, f in (st.get("bm") or {}).items() if st["taken"][int(k)] < 0}


def choose(st: dict, level: str, rnd) -> int:
    """컴퓨터가 뒤집을 카드 — 기억(bm)과 지금 펼쳐진 첫 장만 보고 고른다(엎어 둔 카드의 모양은 보지 않는다)."""
    known = _bot_memory(st)
    left = [i for i in range(len(st["deck"])) if st["taken"][i] < 0]
    o = st["open"]
    if o is None:
        by_face: dict = {}
        for i, f in known.items():
            by_face.setdefault(f, []).append(i)
        pairs = [v for v in by_face.values() if len(v) >= 2]
        if pairs:
            return rnd.choice(rnd.choice(pairs))
        unknown = [i for i in left if i not in known]
        return rnd.choice(unknown or left)
    face = st["deck"][o]  # 펼쳐 둔 첫 장 — 두 사람 모두 보고 있다
    rest = [i for i in left if i != o]
    same = [i for i, f in known.items() if f == face and i != o]
    if same:
        return same[0]
    near = [i for i, f in known.items() if i != o and shape_of(f) == shape_of(face)]
    if near and rnd.random() < BOT_CONFUSE.get(level, 0.0):
        return rnd.choice(near)  # 색이 다른 걸 짝으로 착각
    unknown = [i for i in rest if i not in known]
    if unknown and rnd.random() < BOT_EXPLORE.get(level, 1.0):
        return rnd.choice(unknown)
    return rnd.choice(rest)


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, BOT_ID)
    rnd = _rnd()
    if st["open"] is None and not st["cur"] and st.get("bm"):  # 차례가 막 왔다 — 조금 잊는다
        p = BOT_FORGET.get(level, 0.0)
        st["bm"] = {k: f for k, f in st["bm"].items() if rnd.random() >= p}
    return _flip(st, seat, choose(st, level, rnd), level, rnd)
