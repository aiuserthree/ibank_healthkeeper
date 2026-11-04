"""2인 협동 「깜깜한 주차장」 — 정전된 지하주차장에서 한 사람은 CCTV 로 지도를 보고, 한 사람은 손전등으로 걷는다.

손전등 쪽은 바로 옆 칸까지만 보인다(지나온 길은 기억한다). 물웅덩이는 밟기 전엔 안 보인다.
CCTV 쪽은 주차장 전체 · 웅덩이 · 차 키 · 내 차를 보고 말로 길을 알려 준다.
차 키를 주운 뒤 내 차에 닿으면 그 층 탈출 — 다음 층(더 넓다)으로 내려가며 역할이 바뀐다. 3분 동안 몇 층이나.
"""

from __future__ import annotations

import random
from collections import deque
from typing import Optional

from app.core.errors import raise_app_error

ROUND_SEC = 180
SIZES = (7, 9, 11, 13)  # 층마다 커진다(홀수 — 벽과 길이 번갈아). 4층부터는 13
STUN_SEC = 2.5  # 물웅덩이에 미끄러지면 잠깐 못 움직인다
MOVE_GAP = 0.08
DIRS = {"U": (0, -1), "D": (0, 1), "L": (-1, 0), "R": (1, 0)}
FLOORS = ("B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9")


class MazeRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "parking"
    title = "깜깜한 주차장"
    label = "협동 게임"
    page = "maze"
    game = "maze"
    blurb = "정전된 지하주차장에서 한 사람은 CCTV로 길을 알려 주고, 한 사람은 손전등으로 걸어 차까지 가는 협동 게임이에요."
    intro = (
        "퇴근길, 지하주차장에 정전이 났어요. 한 사람은 관리실 CCTV로 주차장 전체를 보고, 다른 한 사람은 손전등을 들고 "
        "바로 옆 칸만 보며 걸어요. 차 키를 주워 내 차에 닿으면 한 층 탈출! 층마다 역할이 바뀌어요. 3분 동안 몇 층이나 빠져나갈까요?"
    )
    outro = "무사히 퇴근했어요. 다음엔 손전등을 꼭 챙겨요!"
    sides = {"first": "먼저 걷기", "second": "먼저 CCTV"}
    limit_sec = ROUND_SEC


ROOM = MazeRoom()
START_TEXT = f"정전! {ROUND_SEC // 60}분 안에 최대한 많은 층을 빠져나가요."


# ── 주차장 만들기 ─────────────────────────────────────────────

def _maze(n: int, rnd: random.Random) -> list:
    """n×n (홀수) — '#' 벽, '.' 길. 길이 하나로만 이어지지 않게 벽을 몇 군데 더 튼다."""
    g = [["#"] * n for _ in range(n)]
    stack = [(1, 1)]
    g[1][1] = "."
    while stack:
        x, y = stack[-1]
        nxt = [(x + dx * 2, y + dy * 2, dx, dy) for dx, dy in DIRS.values()
               if 0 < x + dx * 2 < n - 1 and 0 < y + dy * 2 < n - 1 and g[y + dy * 2][x + dx * 2] == "#"]
        if not nxt:
            stack.pop()
            continue
        nx, ny, dx, dy = rnd.choice(nxt)
        g[y + dy][x + dx] = "."
        g[ny][nx] = "."
        stack.append((nx, ny))
    for _ in range(n // 3):  # 고리 — 갈림길을 몇 개 더
        x, y = rnd.randrange(1, n - 1), rnd.randrange(1, n - 1)
        if g[y][x] == "#" and ((g[y][x - 1] == "." and g[y][x + 1] == ".") or (g[y - 1][x] == "." and g[y + 1][x] == ".")):
            g[y][x] = "."
    return ["".join(r) for r in g]


def _dist(grid: list, start: tuple) -> dict:
    seen = {start: 0}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS.values():
            p = (x + dx, y + dy)
            if grid[p[1]][p[0]] == "." and p not in seen:
                seen[p] = seen[(x, y)] + 1
                q.append(p)
    return seen


def _level(level: int, rnd: random.Random) -> dict:
    n = SIZES[min(level, len(SIZES) - 1)]
    grid = _maze(n, rnd)
    start = (1, 1)
    d = _dist(grid, start)
    cells = sorted(d, key=lambda p: d[p])
    car = cells[-1]  # 가장 먼 곳에 내 차
    dc = _dist(grid, car)
    # 차 키는 출발점과 차 양쪽에서 꽤 떨어진 곳
    key = max((p for p in cells if p not in (start, car)), key=lambda p: min(d[p], dc[p]) + rnd.random())
    # 물웅덩이 — 안내만 잘 받으면 피해 갈 수 있는 곳에만 둔다(웅덩이를 벽으로 쳐도 출발 → 키 → 차가 이어져야 함)
    free = [p for p in cells if p not in (start, car, key) and d[p] > 1]
    rnd.shuffle(free)
    puddles: list = []
    want = 2 + level * 2
    for p in free:
        if len(puddles) >= want:
            break
        dry = [list(r) for r in grid]
        for q in (*puddles, p):
            dry[q[1]][q[0]] = "#"
        dry = ["".join(r) for r in dry]
        reach = _dist(dry, start)
        if key in reach and car in reach:
            puddles.append(p)
    return {"n": n, "grid": grid, "start": list(start), "car": list(car), "key": list(key), "puddles": [list(p) for p in puddles]}


def _enter(k: dict, now: float) -> None:
    lv = _level(k["level"], random.Random(k["seed"] * 31 + k["level"]))
    k.update({"lv": lv, "pos": list(lv["start"]), "hasKey": False, "stunUntil": 0, "seen": [], "wet": [], "steps": 0, "levelAt": now})
    _look(k)


def _look(k: dict) -> None:
    """손전등 — 지금 칸과 바로 옆(대각선 포함) 칸을 본 것으로 남긴다."""
    x, y = k["pos"]
    n = k["lv"]["n"]
    seen = {tuple(p) for p in k["seen"]}
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if 0 <= x + dx < n and 0 <= y + dy < n:
                seen.add((x + dx, y + dy))
    k["seen"] = [list(p) for p in seen]


def start(st: dict, now: float) -> None:
    st["k"] = {"start": now, "end": now + ROUND_SEC, "seed": random.randrange(1 << 30), "level": 0, "cleared": 0,
               "slips": 0, "over": False, "reason": None, "done": [], "gap": {}, "note": None}
    _enter(st["k"], now)


def advance(st: dict, now: float) -> bool:
    k = st["k"]
    if k["over"] or now < k["end"]:
        return False
    k["over"], k["reason"] = True, "time"
    return True


def next_event(st: dict) -> Optional[float]:
    k = st["k"]
    return None if k["over"] else k["end"]


def _walker(k: dict) -> str:
    return "first" if k["level"] % 2 == 0 else "second"


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    k = st["k"]
    if k["over"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    if action != "move":
        raise_app_error("KITCHEN_BAD_ACTION")
    if side != _walker(k):
        raise_app_error("MAZE_NOT_WALKER")
    if arg not in DIRS:
        raise_app_error("KITCHEN_BAD_ACTION")
    if now < k["stunUntil"]:
        raise_app_error("MAZE_STUNNED")
    gap = k.setdefault("gap", {})
    if now - gap.get(str(member_id), 0) < MOVE_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[str(member_id)] = now
    lv = k["lv"]
    dx, dy = DIRS[arg]
    x, y = k["pos"][0] + dx, k["pos"][1] + dy
    if lv["grid"][y][x] == "#":
        k["note"] = {"t": now, "text": "쿵! 벽이에요"}
        return
    k["pos"] = [x, y]
    k["steps"] += 1
    k["note"] = None
    _look(k)
    if [x, y] in lv["puddles"]:
        k["stunUntil"] = now + STUN_SEC
        k["slips"] += 1
        if [x, y] not in k["wet"]:
            k["wet"].append([x, y])
        k["note"] = {"t": now, "text": "미끄덩! 물웅덩이예요"}
    if [x, y] == lv["key"] and not k["hasKey"]:
        k["hasKey"] = True
        k["note"] = {"t": now, "text": "차 키를 주웠어요! 이제 내 차로"}
    if [x, y] == lv["car"]:
        if not k["hasKey"]:
            k["note"] = {"t": now, "text": "차 문이 잠겨 있어요. 차 키부터!"}
            return
        k["cleared"] += 1
        k["done"].append({"floor": FLOORS[min(k["level"], len(FLOORS) - 1)], "sec": round(now - k["levelAt"], 1), "by": _walker(k)})
        k["level"] += 1
        _enter(k, now)
        k["note"] = {"t": now, "text": f"{k['done'][-1]['floor']} 탈출! 역할을 바꿔 다음 층으로"}


def score(st: dict) -> int:
    return st["k"]["cleared"]


def end_code(st: dict) -> str:
    return "TIME"


def summary(st: dict) -> str:
    k = st["k"]
    return f"시간 끝! {k['cleared']}층을 탈출했어요." if k["cleared"] else "시간 끝! 아쉽게 한 층도 못 빠져나갔어요."


def view(st: dict, side: Optional[str], now: float) -> dict:
    k = st["k"]
    lv = k["lv"]
    walking = side == _walker(k)
    full = not walking or k["over"]
    seen = {tuple(p) for p in k["seen"]}
    if full:
        grid = lv["grid"]
        puddles, key, car = lv["puddles"], (None if k["hasKey"] else lv["key"]), lv["car"]
    else:  # 손전등 — 본 칸만, 웅덩이는 밟은 것만
        grid = ["".join(lv["grid"][y][x] if (x, y) in seen else "?" for x in range(lv["n"])) for y in range(lv["n"])]
        puddles = k["wet"]
        key = lv["key"] if (not k["hasKey"] and tuple(lv["key"]) in seen) else None
        car = lv["car"] if tuple(lv["car"]) in seen else None
    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st), "over": k["over"],
        "role": "walk" if walking else "cctv",
        "floor": FLOORS[min(k["level"], len(FLOORS) - 1)], "level": k["level"], "cleared": k["cleared"], "slips": k["slips"],
        "n": lv["n"], "grid": grid, "pos": k["pos"], "puddles": puddles, "key": key, "car": car,
        "hasKey": k["hasKey"], "stunUntil": k["stunUntil"], "steps": k["steps"],
        "note": k["note"], "done": k["done"][-10:], "stunSec": STUN_SEC,
    }
