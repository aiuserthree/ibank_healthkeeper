"""칸 따먹기 대전 엔진 — 점 6×6(칸 5×5) 판에 번갈아 선을 하나씩 긋고, 네 변을 닫으면 그 칸을 갖는다. 직원끼리 또는 컴퓨터와.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/boxes.html — 선 · 칸 번호 매기는 법이 이 파일과 같다.

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 차례마다 이웃한 두 점 사이에 선을 하나 긋는다(가로나 세로).
  · 그 선으로 칸의 네 변이 닫히면 그 칸은 내 것이고 한 번 더 긋는다. 한 선이 두 칸을 닫으면 두 칸 모두 내 것.
  · 25칸 가운데 과반(13칸)을 먼저 차지하면 바로 이긴다 — 남은 칸을 상대가 다 가져가도 뒤집을 수 없으니,
    한 번에 24시간씩 걸리는 대전에서 결과가 정해진 뒤 의미 없는 선을 더 긋지 않게 한다.
    (칸 수가 짝수인 판이면 반반으로 끝날 수 있다 — 그때는 무승부)
  · 한 번 긋는 기한은 24시간 — 넘기면 시간 초과로 진다(match.py 기본 규칙).

번호(판 한 줄의 칸 수 n — 지금은 5)
  가로선 h(r, c) = r*n + c                 (r 0..n, c 0..n-1) — 칸 (r, c) 의 윗변이자 칸 (r-1, c) 의 아랫변
  세로선 v(r, c) = (n+1)*n + r*(n+1) + c   (r 0..n-1, c 0..n) — 칸 (r, c) 의 왼변이자 칸 (r, c-1) 의 오른변
  칸 b = r*n + c

행동(화면이 HKApi.matchMove(id, {data: {line: 선 번호}}, seq) 로 보내는 data)
  {"line": 선 번호(정수)}

판(m.state) — 숨긴 것이 없다(선 · 칸 모두 두 사람이 다 본다)
  n: 한 줄 칸 수 · p: [먼저 하는 id, 나중 id](컴퓨터는 BOT_ID) · turn: 차례 자리(0 · 1)
  lines: 선마다 그은 자리(안 그었으면 -1) · boxes: 칸마다 차지한 자리(-1)
  log: [[자리, 선, [닫은 칸...]], ...] — 그은 순서. 화면은 이것으로 판을 다시 그리고 새로 그은 선만 움직여 보여 준다
"""

from __future__ import annotations

import random
from datetime import datetime
from functools import lru_cache
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "boxes"
NAME = "칸 따먹기"
REASONS = {"MAJORITY": "과반 차지"}  # 무승부(DRAW)는 match.py 공통 문구
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
MIN_ACTS = 10  # 기권 · 시간 초과로 끝난 판은 선을 이만큼 그은 판만 도장 · 순위에 센다
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터
N = 5  # 칸 5×5 (점 6×6)
SEARCH_SAFE = 10  # 어려움 — 안전한 선이 이만큼 남으면 끝까지 따져 본다(누가 먼저 사슬을 열어 주게 되는지)

register_messages(
    {"BOXES_BAD_LINE": "그을 수 없는 선이에요.", "BOXES_LINE_TAKEN": "이미 그은 선이에요. 다른 선을 골라 주세요."},
    {"BOXES_BAD_LINE": 400, "BOXES_LINE_TAKEN": 409},
)


# ---------- 판 모양 ----------
@lru_cache(maxsize=8)
def _geo(n: int) -> tuple:
    """(선 수, 칸마다 네 변(위 · 아래 · 왼 · 오른), 선마다 맞닿은 칸) — 가장자리 선은 칸이 하나."""
    h = (n + 1) * n
    total = 2 * n * (n + 1)
    box_lines = tuple(
        (r * n + c, (r + 1) * n + c, h + r * (n + 1) + c, h + r * (n + 1) + c + 1) for r in range(n) for c in range(n)
    )
    line_boxes: list = [[] for _ in range(total)]
    for b, ls in enumerate(box_lines):
        for ln in ls:
            line_boxes[ln].append(b)
    return total, box_lines, tuple(tuple(x) for x in line_boxes)


def new_state(players, n: int = N) -> dict:
    total = _geo(n)[0]
    return {"n": n, "p": list(players), "turn": 0, "lines": [-1] * total, "boxes": [-1] * (n * n), "log": []}


def _seat(st: dict, member_id) -> Optional[int]:
    p = st.get("p") or []
    return p.index(member_id) if member_id in p else None


def _draw(st: dict, seat: int, line: int) -> Optional[tuple]:
    """seat 자리가 line 을 긋는다 — 닫힌 칸을 갖고, 못 닫았으면 차례를 넘긴다. 끝나면 (승자 id, 이유)."""
    n = st["n"]
    _, box_lines, line_boxes = _geo(n)
    lines, boxes = st["lines"], st["boxes"]
    lines[line] = seat
    got = [b for b in line_boxes[line] if boxes[b] < 0 and all(lines[x] >= 0 for x in box_lines[b])]
    for b in got:
        boxes[b] = seat
    st["log"].append([seat, line, got])
    if not got:
        st["turn"] = 1 - seat
    mine, theirs = boxes.count(seat), boxes.count(1 - seat)
    if 2 * mine > n * n:  # 과반 — 남은 칸을 다 내줘도 진다
        return (st["p"][seat], "MAJORITY")
    if min(lines) >= 0:  # 모든 선을 그었는데 과반이 없다 — 칸 수가 짝수인 판에서 반반
        return (None, "DRAW")
    return None


# ---------- 규약 ----------
def start(m, players: tuple, rnd) -> dict:
    return new_state(players)


def waiting_for(m) -> set:
    st = m.state
    return {st["p"][st["turn"]]}


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, member_id)
    if seat is None or seat != st["turn"]:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    line = data.get("line")
    if isinstance(line, bool) or not isinstance(line, int) or not 0 <= line < len(st["lines"]):
        raise_app_error("BOXES_BAD_LINE")
    if st["lines"][line] >= 0:
        raise_app_error("BOXES_LINE_TAKEN")
    return _draw(st, seat, line)


def view(m, member_id: int, board: bool) -> dict:
    """숨긴 것이 없는 게임 — 자리 번호 대신 나(me) · 상대(rival)로 바꿔 보낸다. 목록 한 줄은 칸 수만."""
    st = m.state or {}
    if not st.get("p"):
        return {}
    me = _seat(st, member_id)
    me = 0 if me is None else me
    boxes = st["boxes"]
    out = {"myBoxes": boxes.count(me), "rivalBoxes": boxes.count(1 - me)}
    if board:
        n = st["n"]
        who = ("me", "rival") if me == 0 else ("rival", "me")
        out.update({
            "size": n,
            "goal": n * n // 2 + 1,
            "iFirst": me == 0,
            "log": [[who[s], ln, list(got)] for s, ln, got in st["log"]],
        })
    return out


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, BOT_ID)
    return _draw(st, seat, choose(st, seat, level, random.Random()))


# ---------- 컴퓨터 ----------
# 판을 비트(선 번호 = 자리)로 들고 빠르게 따진다. 칸은 네 변이 다 그어졌으면 이미 누군가 가진 칸이다.
class _Board:
    def __init__(self, n: int):
        self.n = n
        self.total, self.box_lines, self.line_boxes = _geo(n)

    def sides(self, d: int, b: int) -> int:
        return sum((d >> x) & 1 for x in self.box_lines[b])

    def missing(self, d: int, b: int) -> list:
        return [x for x in self.box_lines[b] if not (d >> x) & 1]

    def free(self, d: int) -> list:
        return [x for x in range(self.total) if not (d >> x) & 1]

    def caps(self, d: int) -> list:
        """그으면 칸이 닫히는 선 — 세 변이 그어진 칸의 남은 변."""
        out = []
        for b in range(self.n * self.n):
            if self.sides(d, b) == 3:
                x = self.missing(d, b)[0]
                if x not in out:
                    out.append(x)
        return out

    def safe(self, d: int) -> list:
        """그어도 상대에게 칸을 내주지 않는 선 — 맞닿은 칸이 모두 한 변 이하로 그어져 있다."""
        return [x for x in self.free(d) if all(self.sides(d, b) <= 1 for b in self.line_boxes[x])]

    def take_all(self, d: int) -> tuple:
        """닫을 수 있는 칸을 계속 닫는다 — (닫은 칸 수, 그 뒤 판)."""
        got = 0
        while True:
            caps = self.caps(d)
            if not caps:
                return got, d
            x = caps[0]
            d |= 1 << x
            got += sum(1 for b in self.line_boxes[x] if self.sides(d, b) == 4)

    def chains(self, d: int) -> Optional[list]:
        """남은 칸이 모두 두 변씩 그어져 있으면(더 둘 안전한 선이 없는 끝판) 사슬 · 고리로 나눈다. 아니면 None.
        [{"loop": bool, "boxes": [...], "lines": [...]}] — 사슬은 양 끝이 판 가장자리로 열려 있고, 고리는 닫혀 있다."""
        left = [b for b in range(self.n * self.n) if self.sides(d, b) < 4]
        if any(self.sides(d, b) != 2 for b in left):
            return None
        seen: set = set()
        comps = []
        for b in left:
            if b in seen:
                continue
            seen.add(b)
            stack, members, lines, edge = [b], [], set(), False
            while stack:
                x = stack.pop()
                members.append(x)
                for ln in self.missing(d, x):
                    lines.add(ln)
                    other = [y for y in self.line_boxes[ln] if y != x]
                    if not other:
                        edge = True
                    elif other[0] not in seen:
                        seen.add(other[0])
                        stack.append(other[0])
            comps.append({"loop": not edge, "boxes": members, "lines": sorted(lines)})
        return comps


def _key(comps: list) -> tuple:
    return tuple(sorted((c["loop"], len(c["boxes"])) for c in comps))


def _give(loop: bool, size: int, rest_value: int) -> int:
    """사슬(고리) 하나를 열어 줬을 때 받는 쪽이 얻는 (내 칸 − 상대 칸) — 다 먹고 다음을 열지, 끝 2칸(고리는 4칸)을 남겨 차례를 지킬지."""
    take = size + rest_value
    if loop:
        return max(take, size - 8 - rest_value)
    if size >= 3:
        return max(take, size - 4 - rest_value)
    return take  # 1 · 2칸 사슬은 여는 쪽이 가운데를 그어 남기기를 막는다


@lru_cache(maxsize=20000)
def _endgame(comps: tuple) -> int:
    """남은 게 사슬 · 고리뿐일 때 하나를 열어 줘야 하는 쪽의 (내 칸 − 상대 칸) — 둘 다 가장 잘 둘 때."""
    if not comps:
        return 0
    best = None
    for i, (loop, size) in enumerate(comps):
        if i and comps[i - 1] == (loop, size):
            continue
        val = -_give(loop, size, _endgame(comps[:i] + comps[i + 1:]))
        if best is None or val > best:
            best = val
    return best


def _deals(bd: _Board, d: int) -> list:
    """잡을 칸의 마지막 몫을 상대에게 넘기고 차례를 지키는 수 — [(넘길 칸 수, 그을 선, 그 몫을 잡는 선들)].
    사슬 끝 두 칸: 세 변 칸 A — 두 변 칸 B — 가장자리 → B 의 가장자리 선을 그어 A · B 를 넘긴다.
    열린 고리 마지막 네 칸: A(3) — B(2) — C(2) — D(3) → B · C 사이 선을 그어 두 쌍을 넘긴다."""
    out, seen = [], set()
    for a in range(bd.n * bd.n):
        if bd.sides(d, a) != 3:
            continue
        s = bd.missing(d, a)[0]
        nb = [y for y in bd.line_boxes[s] if y != a]
        if not nb or bd.sides(d, nb[0]) != 2:
            continue
        b = nb[0]
        t = next(x for x in bd.missing(d, b) if x != s)
        nt = [y for y in bd.line_boxes[t] if y != b]
        if not nt:
            if t not in seen:
                seen.add(t)
                out.append((2, t, {s}))
            continue
        c = nt[0]
        if bd.sides(d, c) != 2:
            continue
        u = next(x for x in bd.missing(d, c) if x != t)
        nu = [y for y in bd.line_boxes[u] if y != c]
        if len(nu) == 1 and nu[0] != a and bd.sides(d, nu[0]) == 3 and t not in seen:
            seen.add(t)
            out.append((4, t, {s, u}))
    return out


def _least_given(bd: _Board, d: int, rnd) -> int:
    """어쩔 수 없이 칸을 내줘야 할 때 — 상대가 가장 적게 가져가는 선."""
    best, picks = None, []
    for x in bd.free(d):
        g = bd.take_all(d | (1 << x))[0]
        if best is None or g < best:
            best, picks = g, [x]
        elif g == best:
            picks.append(x)
    return rnd.choice(picks)


def _open_line(bd: _Board, d: int, comp: dict, rnd) -> int:
    """사슬 · 고리를 열어 줄 선 — 2칸 사슬은 가운데(상대가 남기기를 못 하게), 긴 사슬은 끝, 고리는 아무 데나."""
    lines = comp["lines"]
    if comp["loop"] or len(comp["boxes"]) == 1:
        return rnd.choice(lines)
    inner = [x for x in lines if len(bd.line_boxes[x]) == 2 and all(y in comp["boxes"] for y in bd.line_boxes[x])]
    outer = [x for x in lines if x not in inner]
    if len(comp["boxes"]) == 2 and inner:
        return inner[0]
    return rnd.choice(outer or lines)


def _safe_search(bd: _Board, d: int, rnd) -> int:
    """안전한 선이 몇 개 안 남았을 때 — 끝판에 상대가 먼저 사슬을 열게 되는 선을 고른다(끝판 값까지 따져서)."""
    memo: dict = {}

    def value(x: int) -> int:  # 지금 둘 사람의 (내 칸 − 상대 칸) — 앞으로 얻을 것만
        if x in memo:
            return memo[x]
        safe = bd.safe(x)
        if safe:
            v = max(-value(x | (1 << ln)) for ln in safe)
        else:
            comps = bd.chains(x)
            v = _endgame(_key(comps)) if comps is not None else 0  # 모양이 복잡하면 모른다 — 0
        memo[x] = v
        return v

    scored = [(-value(d | (1 << ln)), ln) for ln in bd.safe(d)]
    top = max(v for v, _ in scored)
    return rnd.choice([ln for v, ln in scored if v == top])


def choose(st: dict, seat: int, level: str, rnd) -> int:
    """컴퓨터가 그을 선. 쉬움은 가끔 칸을 놓치고 아무 선이나 긋는다. 보통은 칸을 다 먹고, 내줄 때는 가장 적게.
    어려움은 끝판에 사슬 끝을 넘겨 차례를 지키고(남기기), 어떤 사슬부터 열지 · 남은 안전한 선을 끝까지 따진다."""
    bd = _Board(st["n"])
    d = sum(1 << i for i, s in enumerate(st["lines"]) if s >= 0)
    free = bd.free(d)
    caps = bd.caps(d)
    safe = bd.safe(d)
    if level == "easy":
        if caps and rnd.random() < 0.85:  # 평범한 사람 흉내 봇에게 거의 늘 지던 것(9할 이상)을 조금 버티게
            return rnd.choice(caps)
        if safe and rnd.random() < 0.92:
            return rnd.choice(safe)
        return rnd.choice(free)
    if caps:
        if level != "hard":
            return caps[0]
        return _hard_take(bd, d, st, seat, caps)
    if safe:
        if level == "hard" and len(safe) <= SEARCH_SAFE:
            return _safe_search(bd, d, rnd)
        return rnd.choice(safe)
    if level == "hard":
        comps = bd.chains(d)
        if comps:
            rest = [_key([c for c in comps if c is not x]) for x in comps]
            vals = [-_give(c["loop"], len(c["boxes"]), _endgame(r)) for c, r in zip(comps, rest)]
            top = max(vals)
            pick = rnd.choice([c for c, v in zip(comps, vals) if v == top])
            return _open_line(bd, d, pick, rnd)
    return _least_given(bd, d, rnd)


def _hard_take(bd: _Board, d: int, st: dict, seat: int, caps: list) -> int:
    """닫을 칸이 있을 때(어려움) — 대개는 먹는다. 끝판에 마지막 몫만 남았으면 넘겨서 다음 사슬도 상대가 열게 할지 따진다."""
    _, after = bd.take_all(d)
    if bd.safe(after):
        return caps[0]  # 아직 안전한 선이 남는다 — 다 먹고 안전한 선을 긋는다
    deals = _deals(bd, d)
    if not deals:
        return caps[0]
    k, deal_line, keep = deals[0]
    others = [x for x in caps if x not in keep]
    if others:
        return others[0]  # 넘길 몫이 아닌 칸부터 먹는다
    comps = bd.chains(after)
    if not comps:
        return caps[0]  # 이 몫이 마지막이거나 모양이 복잡하다 — 다 먹는다
    goal = st["n"] ** 2 // 2 + 1
    mine, theirs = st["boxes"].count(seat), st["boxes"].count(1 - seat)
    if mine + k >= goal or theirs + k >= goal:
        return caps[0]  # 먹으면 이기거나, 넘기면 상대가 이긴다
    # 다 먹고 내가 다음을 연다: k + 끝판값 / 넘기고 상대가 다음을 연다: -k - 끝판값
    rest = _endgame(_key(comps))
    return deal_line if -k - rest > k + rest else caps[0]
