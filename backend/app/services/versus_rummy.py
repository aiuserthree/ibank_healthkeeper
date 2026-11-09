"""타일 러미 — 숫자 타일을 같은 수끼리 · 이어지는 수끼리 묶어 내려놓는 1:1 대전 엔진. 직원끼리 또는 컴퓨터와.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/rummy.html — 화면의 묶음 검사(meld · order)는 이 파일 _meld · _order 와 같은 규칙이다.

타일(106장) — 번호 0~105 로 고정
  · 0~103: 색 4가지 × 숫자 1~13 × 2벌. 색 = (번호 % 52) // 13 (0 빨강 · 1 파랑 · 2 주황 · 3 검정), 숫자 = 번호 % 13 + 1
  · 104 · 105: 조커(아무 타일 대신)

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 둘 다 14장씩 받고 나머지는 더미(섞인 순서는 비밀). 먼저 하는 사람은 start 의 players[0].
  · 묶음: ① 같은 숫자 · 서로 다른 색 3~4장 ② 같은 색 · 이어지는 숫자 3장 이상(13 다음 1로 넘어가지 않음). 조커는 아무 타일 대신.
  · 내 차례: 판을 새로 짜서 내기 — 판에 있던 타일은 모두 판에 남고(다시 짜 맞춰도 됨), 내 손 타일을 1장 이상 더해,
    판 전체가 올바른 묶음으로만 이뤄져야 한다. 또는 더미에서 1장 가져오기(차례 끝). 더미가 비었으면 가져오기 대신 넘기기.
  · 첫 등록: 아직 처음 내려놓기를 안 한 사람은 판에 있던 묶음을 건드릴 수 없고, 내 손 타일만으로 만든 새 묶음들의
    숫자 합이 30 이상이어야 한다(조커는 대신하는 숫자로 센다). 등록 뒤부터 자유롭게 다시 짜기.
  · 손 타일을 다 내면 바로 승리(OUT). 더미가 빈 뒤 둘이 연달아 넘기면 손에 남은 숫자 합이 적은 쪽이 승리(LOWEST,
    조커는 30점), 같으면 무승부(DRAW).
  · 조커의 숫자: 이어지는 수 묶음에서 자리가 둘 이상 가능하면(예: 5 · 6 · 조커 → 4 또는 7) 숫자 합이 더 큰 쪽으로 센다.
    같은 수로도 이어지는 수로도 읽히는 묶음(예: 빨강 5 · 조커 · 조커)도 합이 더 큰 쪽.

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data)
  {"type": "play", "table": [[타일 번호...], ...]}   판 전체(묶음 목록) — 서버가 다시 검사해 받아들인다
  {"type": "draw"}                                  더미에서 1장(더미가 비었으면 RUMMY_POOL_EMPTY)
  {"type": "pass"}                                  더미가 비었을 때만(남아 있으면 RUMMY_MUST_DRAW)

판(m.state) — 숨긴 것(상대 손패 · 더미 순서)은 view 가 걸러 보낸다
  p: [먼저 하는 id, 나중 id](컴퓨터는 BOT_ID) · hands · pool(맨 앞이 다음 타일) · table(묶음 목록, 묶음 안은 보기 좋은 순서)
  opened: [bool, bool] 첫 등록 여부 · turn: 차례 자리(0 · 1) · passes: 연달아 넘긴 수 · phase: play | done
  log: [{v, p, t: play|draw|pass, new?: 손에서 판으로 낸 타일, open?: 첫 등록, got?: 가져온 타일(본인에게만 보임)}]

화면(view → payload 의 rm) — 「me」 · 「rival」은 보는 사람 기준
  목록 한 줄: {hand: 내 장수, rivalHand: 상대 장수, pool: 더미 장수}
  대국 화면: first · turn · hand · table · rivalHand · pool · opened · rivalOpened · passes · openGoal(30) ·
    log([{v, me, t, new?, open?, got?(내 기록만)}]) · end({left: 내 남은 합, rivalLeft: 상대 남은 합} — 끝난 판만) ·
    rivalHandCards(끝난 판만 — 상대가 들고 있던 타일)
"""

from __future__ import annotations

import random
import time
from datetime import datetime
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "rummy"
NAME = "타일 러미"
REASONS = {"OUT": "타일 모두 내려놓기", "LOWEST": "남은 숫자 합이 더 적음"}
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
MIN_ACTS = 6  # 기권 · 시간 초과로 끝난 판은 둘이 합쳐 이만큼 행동한 판만 도장 · 순위에 센다
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

TILES = 106
JOKERS = (104, 105)
HAND = 14
OPEN_GOAL = 30  # 첫 등록에 필요한 숫자 합
JOKER_LEFT = 30  # 끝날 때 손에 남은 조커의 점수
LOG_KEEP = 6  # 화면이 순서대로 보여 줄 최근 행동 수

register_messages({
    "RUMMY_BAD": "놓을 수 없는 판이에요. 화면을 새로 열어 주세요.",
    "RUMMY_SET": "올바르지 않은 묶음이 있어요. 같은 수 다른 색 3~4장이나, 같은 색 이어지는 수 3장 이상으로 맞춰 주세요.",
    "RUMMY_DUP": "같은 타일이 두 번 들어갔어요.",
    "RUMMY_NOT_IN_HAND": "손에 없는 타일이 들어갔어요.",
    "RUMMY_TABLE_LOST": "판에 있던 타일은 모두 판에 남아야 해요.",
    "RUMMY_NONE_PLAYED": "손에서 타일을 1장 이상 내려놓아야 해요.",
    "RUMMY_OPEN_TOUCH": "처음 내려놓을 때는 판에 있던 묶음을 건드릴 수 없어요.",
    "RUMMY_OPEN_SUM": "처음 내려놓는 묶음은 숫자 합이 30 이상이어야 해요.",
    "RUMMY_POOL_EMPTY": "더미가 비었어요. 넘기기를 눌러 주세요.",
    "RUMMY_MUST_DRAW": "더미가 남아 있으면 넘길 수 없어요. 한 장 가져와 주세요.",
    "RUMMY_PHASE": "지금은 할 수 없어요. 화면을 새로 열어 주세요.",
})


# ── 타일 · 묶음 ───────────────────────────────────────────────────────────────

def is_joker(t: int) -> bool:
    return t >= 104


def color(t: int) -> int:
    return (t % 52) // 13


def number(t: int) -> int:
    return t % 13 + 1


def _shape(tiles) -> Optional[tuple]:
    """묶음으로 읽는 방법 — ("group", 숫자) 또는 ("run", 시작 숫자). 둘 다 되면 숫자 합이 큰 쪽. 안 되면 None."""
    n = len(tiles)
    if n < 3 or n > 13:
        return None
    reals = [t for t in tiles if not is_joker(t)]
    if not reals or n - len(reals) > len(JOKERS):
        return None
    best = None
    nums = [number(t) for t in reals]
    cols = [color(t) for t in reals]
    if n <= 4 and len(set(nums)) == 1 and len(set(cols)) == len(cols):
        best = (nums[0] * n, ("group", nums[0]))
    if len(set(cols)) == 1 and len(set(nums)) == len(nums):
        lo, hi = min(nums), max(nums)
        s = min(lo, 14 - n)  # 조커가 자리를 고를 수 있으면 높은 쪽으로
        if s >= max(1, hi - n + 1):
            v = n * s + n * (n - 1) // 2
            if best is None or v > best[0]:
                best = (v, ("run", s))
    return best[1] if best else None


def _meld(tiles) -> Optional[int]:
    """올바른 묶음이면 숫자 합(조커는 대신하는 숫자), 아니면 None."""
    sh = _shape(tiles)
    if sh is None:
        return None
    n = len(tiles)
    if sh[0] == "group":
        return sh[1] * n
    return n * sh[1] + n * (n - 1) // 2


def _order(tiles) -> list:
    """보기 좋은 순서 — 이어지는 수는 숫자 차례대로(조커는 대신하는 자리에), 같은 수는 색 차례 뒤에 조커."""
    sh = _shape(tiles)
    jokers = sorted(t for t in tiles if is_joker(t))
    reals = [t for t in tiles if not is_joker(t)]
    if sh is None:
        return sorted(reals, key=lambda t: (color(t), number(t), t)) + jokers
    if sh[0] == "group":
        return sorted(reals, key=lambda t: (color(t), t)) + jokers
    at = {number(t): t for t in reals}
    out = []
    for k in range(sh[1], sh[1] + len(tiles)):
        out.append(at[k] if k in at else jokers.pop(0))
    return out


def _left(hand) -> int:
    """손에 남은 타일의 점수 — 조커는 30."""
    return sum(JOKER_LEFT if is_joker(t) else number(t) for t in hand)


# ── 판 차리기 ─────────────────────────────────────────────────────────────────

def start(m, players: tuple, rnd) -> dict:
    pool = list(range(TILES))
    rnd.shuffle(pool)
    hands = [sorted(pool[:HAND]), sorted(pool[HAND:HAND * 2])]
    return {
        "p": list(players), "hands": hands, "pool": pool[HAND * 2:], "table": [],
        "opened": [False, False], "turn": 0, "passes": 0, "phase": "play", "log": [], "end": None,
    }


def waiting_for(m) -> set:
    st = m.state
    if st.get("phase") == "done":
        return set()
    return {st["p"][st["turn"]]}


# ── 한 번의 행동 ──────────────────────────────────────────────────────────────

def _read_table(raw) -> list:
    """화면이 보낸 판 — 묶음(타일 번호 목록)의 목록. 모양이 틀리면 RUMMY_BAD."""
    if not isinstance(raw, list) or len(raw) > 60:
        raise_app_error("RUMMY_BAD")
    out = []
    for s in raw:
        if not isinstance(s, list) or not s or len(s) > 13:
            raise_app_error("RUMMY_BAD")
        one = []
        for t in s:
            if isinstance(t, bool) or not isinstance(t, int) or not 0 <= t < TILES:
                raise_app_error("RUMMY_BAD")
            one.append(t)
        out.append(one)
    return out


def check_play(st: dict, seat: int, raw) -> tuple:
    """내려놓기 검사 — (새 판(보기 좋은 순서), 손에서 낸 타일, 첫 등록인지). 잘못되면 raise_app_error."""
    table = _read_table(raw)
    flat = [t for s in table for t in s]
    if len(set(flat)) != len(flat):
        raise_app_error("RUMMY_DUP")
    old = {t for s in st["table"] for t in s}
    now = set(flat)
    if not old <= now:
        raise_app_error("RUMMY_TABLE_LOST")
    hand = set(st["hands"][seat])
    played = now - old
    if not played <= hand:
        raise_app_error("RUMMY_NOT_IN_HAND")
    if not played:
        raise_app_error("RUMMY_NONE_PLAYED")
    opening = not st["opened"][seat]
    rest = []
    if opening:
        # 판에 있던 묶음은 그대로 — 남는 묶음(새로 만든 것)은 모두 손 타일이고, 그 합이 30 이상
        rest = [sorted(s) for s in table]
        for s in st["table"]:
            key = sorted(s)
            if key not in rest:
                raise_app_error("RUMMY_OPEN_TOUCH")
            rest.remove(key)
    if any(_meld(s) is None for s in table):
        raise_app_error("RUMMY_SET")
    if opening and sum(_meld(s) for s in rest) < OPEN_GOAL:
        raise_app_error("RUMMY_OPEN_SUM")
    return [_order(s) for s in table], played, opening


def _play(st: dict, me: int, data: dict, entry: dict):
    table, played, opening = check_play(st, me, data.get("table"))
    st["table"] = table
    st["hands"][me] = [t for t in st["hands"][me] if t not in played]
    st["opened"][me] = True
    st["passes"] = 0
    entry["new"] = sorted(played)
    if opening:
        entry["open"] = True
    if not st["hands"][me]:
        st["phase"] = "done"
        st["end"] = {"reason": "OUT"}
        return (st["p"][me], "OUT")
    st["turn"] = 1 - me
    return None


def _draw(st: dict, me: int, entry: dict):
    if not st["pool"]:
        raise_app_error("RUMMY_POOL_EMPTY")
    t = st["pool"].pop(0)
    st["hands"][me] = sorted([*st["hands"][me], t])
    st["passes"] = 0
    entry["got"] = t  # 본인 화면에만 보낸다(view)
    st["turn"] = 1 - me
    return None


def _pass(st: dict, me: int, entry: dict):
    if st["pool"]:
        raise_app_error("RUMMY_MUST_DRAW")
    st["passes"] = int(st.get("passes", 0)) + 1
    if st["passes"] >= 2:  # 더미가 빈 뒤 둘이 연달아 넘겼다 — 남은 숫자 합이 적은 쪽이 이긴다
        st["phase"] = "done"
        a, b = _left(st["hands"][0]), _left(st["hands"][1])
        st["end"] = {"reason": "LOWEST" if a != b else "DRAW"}
        if a == b:
            return (None, "DRAW")
        return (st["p"][0 if a < b else 1], "LOWEST")
    st["turn"] = 1 - me
    return None


def _act(st: dict, me: int, data: dict, v: int):
    """자리 me 의 행동 하나 — 끝나면 (승자 id, 이유)."""
    if st.get("phase") == "done" or st["turn"] != me or not isinstance(data, dict):
        raise_app_error("RUMMY_PHASE")
    kind = data.get("type")
    fn = {"play": _play, "draw": _draw, "pass": _pass}.get(kind)
    if fn is None:
        raise_app_error("RUMMY_PHASE")
    entry = {"v": v, "p": me, "t": kind}
    out = fn(st, me, data, entry) if kind == "play" else fn(st, me, entry)
    st["log"] = [*st.get("log", []), entry][-LOG_KEEP:]
    return out


def _seat(st: dict, member_id: int) -> int:
    return st["p"].index(member_id)


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    return _act(st, _seat(st, member_id), data, int(st.get("_v", 0)) + 1)


# ── 화면 ──────────────────────────────────────────────────────────────────────

def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    if "p" not in st or member_id not in st["p"]:
        return {}
    me = _seat(st, member_id)
    you = 1 - me
    if not board:  # 목록 한 줄 — 장수만
        return {"rm": {"hand": len(st["hands"][me]), "rivalHand": len(st["hands"][you]), "pool": len(st["pool"])}}
    who = lambda i: None if i is None else ("me" if i == me else "rival")  # noqa: E731
    log = []
    for e in st.get("log", []):
        one = {"v": e["v"], "me": e["p"] == me, "t": e["t"]}
        if "new" in e:
            one["new"] = list(e["new"])
        if e.get("open"):
            one["open"] = True
        if "got" in e and e["p"] == me:  # 상대가 가져온 타일은 비밀
            one["got"] = e["got"]
        log.append(one)
    rm = {
        "first": who(0),
        "turn": who(st["turn"]) if st.get("phase") != "done" else None,
        "hand": list(st["hands"][me]),
        "table": [list(s) for s in st["table"]],
        "rivalHand": len(st["hands"][you]),
        "pool": len(st["pool"]),
        "opened": bool(st["opened"][me]),
        "rivalOpened": bool(st["opened"][you]),
        "passes": int(st.get("passes", 0)),
        "openGoal": OPEN_GOAL,
        "log": log,
    }
    if m.status == "DONE":  # 끝난 판은 상대 손패도 보여 준다
        rm["rivalHandCards"] = list(st["hands"][you])
        rm["end"] = {"left": _left(st["hands"][me]), "rivalLeft": _left(st["hands"][you])}
    return {"rm": rm}


# ── 컴퓨터 ────────────────────────────────────────────────────────────────────
# 컴퓨터는 자기 손패와 판만 본다(상대 손패 · 더미 순서는 모른다). 고른 수는 사람과 같은 check_play 를 거친다.
# 쉬움: 손패만으로 만든 묶음 가운데 일부만 낸다(가끔은 낼 수 있어도 가져오기). 판 묶음은 건드리지 않는다.
# 보통: 손패로 만들 수 있는 묶음을 최대한 많이 내고, 등록 뒤에는 판 묶음 끝에 붙이기(이어지는 수 앞뒤 · 같은 수 4번째 색)도.
# 어려움: 보통 + 판 타일 + 손패 전체를 묶음으로 다시 나누는 탐색(판 타일은 모두 써야 함 — 손패를 가장 많이 쓰는 해).
#         HARD_SECONDS 안에 보통보다 나은 해를 못 찾으면 보통처럼.

HARD_SECONDS = 0.5
NORMAL_SECONDS = 0.15
EASY_SECONDS = 0.08
J = 52  # 탐색에서 조커를 가리키는 칸


class _Timeout(Exception):
    pass


def _kind(t: int) -> int:
    """탐색용 종류 번호 — 숫자 차례 다음 색 차례((숫자-1) × 4 + 색), 조커는 J."""
    return J if is_joker(t) else (number(t) - 1) * 4 + color(t)


def _rep(k: int) -> int:
    """종류의 대표 타일 번호(첫 벌) — 묶음 검사 · 합 계산용."""
    return 104 if k == J else (k % 4) * 13 + k // 4


def _solve(must_ids, opt_ids, seconds: float, min_value: int = 0, floor: int = 0) -> Optional[list]:
    """must 타일은 모두, opt 타일은 되도록 많이 써서 묶음으로 나눈다 — opt 를 floor 장보다 많이 쓰는 해만.
    min_value: 해의 숫자 합 하한(첫 등록). 시간 안에 찾은 가장 좋은 해(묶음마다 타일 번호 목록) 또는 None."""
    must = [0] * 53
    opt = [0] * 53
    for t in must_ids:
        must[_kind(t)] += 1
    for t in opt_ids:
        opt[_kind(t)] += 1
    deadline = time.monotonic() + seconds
    sets: list = []
    best = {"thr": floor, "sets": None}
    cnt = {"used": 0, "rem": len(opt_ids), "steps": 0}

    def avail(k):
        return must[k] + opt[k]

    def take(k, log):
        if must[k] > 0:
            must[k] -= 1
            log.append((k, True))
        else:
            opt[k] -= 1
            cnt["used"] += 1
            cnt["rem"] -= 1
            log.append((k, False))

    def undo(log):
        for k, was_must in reversed(log):
            if was_must:
                must[k] += 1
            else:
                opt[k] += 1
                cnt["used"] -= 1
                cnt["rem"] += 1

    def candidates(k):
        n, c = k // 4 + 1, k % 4
        jn = min(avail(J), 2)
        seen = set()
        out = []

        def add(s):
            key = tuple(sorted(s))
            if key not in seen:
                seen.add(key)
                out.append(s)

        others = [(n - 1) * 4 + c2 for c2 in range(c + 1, 4) if avail((n - 1) * 4 + c2) > 0]
        for mask in range(1 << len(others)):
            pick = [others[i] for i in range(len(others)) if mask >> i & 1]
            for j in range(jn + 1):
                if 3 <= 1 + len(pick) + j <= 4:
                    add([k, *pick, *[J] * j])

        def ext(seq, nxt, jleft):
            if len(seq) >= 3:
                add(list(seq))
            if nxt > 13:
                return
            kk = (nxt - 1) * 4 + c
            if avail(kk) > 0:
                seq.append(kk)
                ext(seq, nxt + 1, jleft)
                seq.pop()
            if jleft > 0:
                seq.append(J)
                ext(seq, nxt + 1, jleft - 1)
                seq.pop()

        for jl in range(min(jn, n - 1) + 1):
            ext([J] * jl + [k], n + 1, jn - jl)
        out.sort(key=lambda s: (-len(s), s.count(J)))
        return out

    def leaf():
        if must[J] > 0:
            return
        value = sum(_meld([_rep(x) for x in s]) for s in sets)
        if value < min_value:
            return
        if cnt["used"] > best["thr"]:
            best["thr"] = cnt["used"]
            best["sets"] = [list(s) for s in sets]

    def dfs(k):
        cnt["steps"] += 1
        if cnt["steps"] & 255 == 0 and time.monotonic() > deadline:
            raise _Timeout
        while k < J and avail(k) == 0:
            k += 1
        if cnt["used"] + cnt["rem"] <= best["thr"]:  # 남은 타일을 다 써도 지금까지의 해보다 많이 쓰지 못한다
            return
        if k == J:
            leaf()
            return
        for cand in candidates(k):
            log: list = []
            for x in cand:
                take(x, log)
            sets.append(cand)
            dfs(k)
            sets.pop()
            undo(log)
        if must[k] == 0:  # 이 타일 한 장은 쓰지 않는다
            opt[k] -= 1
            cnt["rem"] -= 1
            dfs(k)
            opt[k] += 1
            cnt["rem"] += 1

    try:
        dfs(0)
    except _Timeout:
        pass
    if best["sets"] is None:
        return None
    # 종류 → 실제 타일 번호(판 타일 먼저 — 그래야 판 타일이 모두 들어간다)
    pools: dict = {}
    for t in [*must_ids, *opt_ids]:
        pools.setdefault(_kind(t), []).append(t)
    return [[pools[x].pop(0) for x in s] for s in best["sets"]]


def _attach(table: list, hand: list, jokers_ok: bool) -> int:
    """손 타일을 판 묶음 끝에 하나씩 붙인다(묶음이 올바르게 남을 때만). 붙인 장수."""
    n = 0
    changed = True
    while changed:
        changed = False
        for t in sorted(hand, key=lambda x: (is_joker(x), x)):
            if is_joker(t) and not (jokers_ok and len(hand) == 1):
                continue
            for s in table:
                if _meld([*s, t]) is not None:
                    s.append(t)
                    hand.remove(t)
                    n += 1
                    changed = True
                    break
    return n


def _plan_open(hand: list, seconds: float) -> Optional[list]:
    """첫 등록 — 손패만으로 숫자 합 30 이상이 되는 묶음들(손패를 가장 많이 쓰는 쪽)."""
    return _solve([], hand, seconds, min_value=OPEN_GOAL)


def _plan_normal(st: dict, me: int, seconds: float) -> Optional[list]:
    """보통 — 손패로 만든 묶음을 모두 내고, 등록 뒤면 판 묶음 끝에 붙이기까지. 새 판 또는 None."""
    hand = list(st["hands"][me])
    table = [list(s) for s in st["table"]]
    if not st["opened"][me]:
        sets = _plan_open(hand, seconds)
        return None if not sets else table + sets
    sets = _solve([], hand, seconds) or []
    used = {t for s in sets for t in s}
    rest = [t for t in hand if t not in used]
    table = table + sets
    _attach(table, rest, jokers_ok=True)
    return table if len(rest) < len(hand) else None


def _plan_easy(st: dict, me: int, rnd) -> Optional[list]:
    hand = list(st["hands"][me])
    table = [list(s) for s in st["table"]]
    sets = _solve([], hand, EASY_SECONDS) or []
    if not sets or rnd.random() < 0.25:  # 가끔은 낼 수 있어도 그냥 가져온다
        return None
    rnd.shuffle(sets)
    if not st["opened"][me]:
        out, total = [], 0
        for s in sets:
            out.append(s)
            total += _meld(s)
            if total >= OPEN_GOAL:
                return table + out
        return None
    return table + sets[:rnd.randint(1, len(sets))]


def _played(st: dict, table: Optional[list]) -> int:
    if not table:
        return 0
    old = {t for s in st["table"] for t in s}
    return sum(1 for s in table for t in s if t not in old)


def _plan_hard(st: dict, me: int) -> Optional[list]:
    t0 = time.monotonic()
    normal = _plan_normal(st, me, NORMAL_SECONDS)
    if not st["opened"][me]:
        return normal
    base = _played(st, normal)
    left = HARD_SECONDS - (time.monotonic() - t0)
    if left <= 0.05:
        return normal
    old = [t for s in st["table"] for t in s]
    sets = _solve(old, list(st["hands"][me]), left, floor=base)
    if sets and _played(st, sets) > base:
        return sets
    return normal


def choose(st: dict, me: int, level: str, rnd) -> dict:
    """컴퓨터가 고른 행동 — 낼 판이 검사를 통과하지 못하면(탐색 실수) 가져오기 · 넘기기로."""
    if level == "easy":
        table = _plan_easy(st, me, rnd)
    elif level == "normal":
        table = _plan_normal(st, me, NORMAL_SECONDS)
    else:
        table = _plan_hard(st, me)
    if table:
        try:
            check_play(st, me, table)
            return {"type": "play", "table": table}
        except Exception:  # noqa: BLE001 — 검사에 걸린 수는 내지 않는다
            pass
    return {"type": "draw"} if st["pool"] else {"type": "pass"}


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    me = _seat(st, BOT_ID)
    return _act(st, me, choose(st, me, level, random.Random()), int(st.get("_v", 0)) + 1)
