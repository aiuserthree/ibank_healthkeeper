"""2인 협동 「깜깜한 주차장」 — 협동 시리즈 「오늘도 둘이서」 4화 (23:30 지하주차장).

정전된 지하주차장. 한 사람은 관리실 CCTV 로 주차장 전체를 보고, 한 사람은 야광 손전등 키링을 들고 걷는다.

- 손전등 쪽은 불빛 둘레만 보인다(한 번 비춘 곳은 기억한다). 걸을수록 건전지가 닳아 불빛이 작아지고(가장 작아도 둘레 3×3 칸),
  바닥에 떨어진 🔋 건전지를 주우면 다시 밝아진다. 건전지는 사람마다 따로(각자 자기 키링) — 층마다 걷는 사람이 바뀐다.
  건전지는 한 번 비춘 곳에 있어야 손전등 쪽에 보인다.
- 물웅덩이는 밟기 전엔 손전등 쪽에 안 보인다(밟으면 미끄러져 잠깐 못 움직인다). 웅덩이를 모두 피하는 마른 길이 늘 있다.
- CCTV 쪽은 지도를 눌러 「표시」(📍 핑)를 보낼 수 있다 — 걷는 사람 지도에 PING_SEC 초 동안 뜬다(연타 막음 · 한꺼번에 PING_MAX 개).
- B3 부터 순찰 로봇이 정해진 길을 왔다 갔다 한다. 위치는 시각만으로 정해진다(층에 들어온 시각 levelAt 부터
  ROBOT_STEP 초마다 한 칸 — 서버가 따로 돌지 않는다). 닿으면 승강기 앞(출발점)으로 돌아가 잠깐 못 움직인다.
  가만히 서 있다가 로봇이 다가와 닿는 것도 잡는다 — advance 가 지난 시각부터 지금까지를 거슬러 확인하고,
  next_event 가 다음에 닿을 시각을 알려 화면이 그때 tick 을 부른다.
  CCTV 는 늘 보고, 손전등 쪽은 불빛 안에 들어오는 칸에서만 본다(불빛 안에서 보일 차례만 보낸다).
  손전등 쪽 nextAt 에는 로봇이 한 걸음 안에 닿을 때만 닿는 시각을 넣는다(그 밖엔 끝 시각) — 닿음은 CCTV 쪽 tick,
  손전등 쪽 화면이 내 칸의 vis 차례로 셈한 tick, 다음 동작의 advance 가 잡는다.
  로봇이 유일한 길을 막아 버리지 않게 — 시간을 펼친 길 찾기(_fair)로, 로봇을 피해 마른 길로 출발 → 차 키 → 내 차까지
  갈 수 있는 순찰 길만 쓴다(걷는 사람이 로봇 한 걸음에 한 칸만 움직인다고 쳐도).
- 차 키를 주운 뒤 내 차에 닿으면 그 층 탈출 → 다음 층(더 넓다)으로 내려가며 역할이 바뀐다. 3분 동안 몇 층이나.

지도 좌표 — 바깥 벽은 빼고 센다. 열은 왼쪽부터 A, B, C …, 행은 위부터 1, 2, 3 … (칸 (x, y) 는 「chr(64 + x)」열 「y」번).
기둥은 (짝수, 짝수) 칸에 늘 서 있고 같은 이름표(예: D4)를 단다 — 「D열 4번 기둥」처럼 부를 수 있다.

화면 모양(tiles) — '.' 길 · '#' 바깥 벽 · 'P' 기둥 · '0'~'7' 주차된 차(색) · 'W' 콘크리트 벽 · 'X' 공사 중 표지 · '?' 아직 못 본 곳(손전등 쪽).
"""

from __future__ import annotations

import math
import random
from collections import deque
from typing import Optional

from app.core.errors import raise_app_error, register_messages

ROUND_SEC = 180
SIZES = (7, 9, 11, 13)  # 층마다 커진다(홀수 — 벽과 길이 번갈아). 4층부터는 13
STUN_SEC = 2.5  # 물웅덩이에 미끄러지면 잠깐 못 움직인다
HOLD_SEC = 2.0  # 순찰 로봇에 닿으면 승강기 앞에서 잠깐 못 움직인다
MOVE_GAP = 0.08
DIRS = {"U": (0, -1), "D": (0, 1), "L": (-1, 0), "R": (1, 0)}

BAT_FULL = 100
BAT_STEP = 2  # 한 걸음에 닳는 건전지
BAT_PICK = 45  # 건전지 하나로 채우는 양
BAT_LOW = 25

PING_SEC = 6.0  # CCTV 표시가 떠 있는 시간
PING_GAP = 0.7  # 표시 연타 막기(초)
PING_MAX = 3  # 한꺼번에 떠 있는 표시

ROBOT_STEP = 0.6  # 순찰 로봇이 한 칸 가는 데 걸리는 시간(초)
ROBOT_FROM = 2  # 이 층(0 부터 — 2 = B3)부터 순찰 로봇

register_messages({
    "PARKING_NOT_CCTV": "표시는 CCTV를 보는 사람만 보낼 수 있어요.",
    "PARKING_BAD_PING": "주차장 안의 칸을 눌러 표시해 주세요.",
})


class MazeRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "parking"
    title = "깜깜한 주차장"
    label = "협동 게임"
    page = "maze"
    game = "maze"
    blurb = "정전된 지하주차장에서 한 사람은 CCTV로 길을 알려 주고, 한 사람은 손전등 키링을 들고 걸어 차까지 가는 협동 게임이에요."
    intro = (
        "한 사람은 관리실 CCTV로 주차장 전체를 보며 길을 알려 주고, 한 사람은 손전등 키링으로 불빛 둘레만 보며 걸어요. "
        "차 키를 주워 내 차에 닿으면 한 층 탈출! 층마다 역할을 바꿔요. 3분 동안 몇 층이나 빠져나갈까요?"
    )
    outro = "손전등 키링과 CCTV 덕분에 무사히 퇴근했어요!"
    sides = {"first": "먼저 걷기", "second": "먼저 CCTV"}
    limit_sec = ROUND_SEC


ROOM = MazeRoom()
START_TEXT = f"정전! {ROUND_SEC // 60}분 안에 최대한 많은 층을 빠져나가요."

# 관리실 문 반장님 무전 — 층에 들어설 때와 처음 겪는 일마다 한 번
RADIO = {
    "floor0": "치직… 관리실 문 반장이에요. CCTV는 비상 전원으로 켜져 있어요. 차 키부터 찾아요!",
    "floor1": "B2예요. 역할 바꿨죠? 아래층으로 갈수록 넓어져요.",
    "floor2": "B3부터는 시험 중인 순찰 로봇이 돌아다녀요. 닿으면 승강기 앞으로 돌려보내요!",
    "floor3": "B4에도 순찰 로봇이 있어요. CCTV 쪽이 로봇 움직임을 잘 봐 줘요.",
    "floor4": "B5엔 순찰 로봇이 두 대예요. 로봇이 지나간 다음에 가요.",
    "floor5": "{floor}까지 왔네요! 이렇게 깊이 내려온 건 오랜만이에요.",
    "floor6": "{floor}예요. 무전이 지직거려요… 조금만 더 힘내요!",
    "floorN": "{floor}! 거의 바닥이에요. 끝까지 같이 가요.",
    "slip": "바닥에 물이 샜나 봐요. 웅덩이는 CCTV에만 보이니 안내를 꼭 들어요.",
    "robot": "어이쿠, 로봇이 승강기 앞으로 데려다 놨네요. 제 시스템 탓이에요, 미안해요!",
    "low": "손전등 키링이 깜빡여요! 바닥에 떨어진 건전지를 주워요.",
    "battery": "건전지 찾았네요! 손전등이 다시 환해졌어요.",
    "key": "차 키 찾았네요! 이제 내 차까지 가요.",
}


def _floor(level: int) -> str:
    return f"B{level + 1}"


def _label(x: int, y: int) -> str:
    return f"{chr(64 + x)}{y}"


# ── 주차장 만들기 ─────────────────────────────────────────────

def _maze(n: int, rnd: random.Random) -> list:
    """n×n (홀수) — '#' 막힘, '.' 길. (홀, 홀) 칸은 늘 길, (짝, 짝) 칸은 늘 기둥.
    그 사이 칸(통로 자리)을 터서 미로를 만들고, 몇 군데 더 터서 갈림길(고리)을 만든다 — 기둥은 터지 않는다."""
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
    walls = [(x, y) for y in range(1, n - 1) for x in range(1, n - 1) if (x + y) % 2 == 1 and g[y][x] == "#"]
    rnd.shuffle(walls)
    for x, y in walls[:max(1, (n - 3) // 2)]:  # 고리 — 갈림길을 몇 개 더
        g[y][x] = "."
    return ["".join(r) for r in g]


def _tiles(grid: list, rnd: random.Random) -> list:
    """화면 모양 — 막힌 통로 자리는 대부분 주차된 차, 가끔 콘크리트 벽 · 공사 중 표지."""
    n = len(grid)
    out = []
    for y in range(n):
        row = []
        for x in range(n):
            if x in (0, n - 1) or y in (0, n - 1):
                row.append("#")
            elif grid[y][x] == ".":
                row.append(".")
            elif x % 2 == 0 and y % 2 == 0:
                row.append("P")
            else:
                r = rnd.random()
                row.append("W" if r < 0.1 else "X" if r < 0.17 else str(rnd.randrange(8)))
        out.append("".join(row))
    return out


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


def _block(grid: list, cells) -> list:
    """cells 를 막힌 칸으로 친 지도."""
    g = [list(r) for r in grid]
    for x, y in cells:
        g[y][x] = "#"
    return ["".join(r) for r in g]


def _route(grid: list, a: tuple, b: tuple) -> list:
    """a → b 가장 짧은 길(칸 목록). 못 가면 []."""
    prev = {a: None}
    q = deque([a])
    while q:
        c = q.popleft()
        if c == b:
            out = []
            while c is not None:
                out.append(c)
                c = prev[c]
            return out[::-1]
        for dx, dy in DIRS.values():
            p = (c[0] + dx, c[1] + dy)
            if grid[p[1]][p[0]] == "." and p not in prev:
                prev[p] = c
                q.append(p)
    return []


def _ridx(s: int, length: int) -> int:
    """순찰 로봇이 s 걸음째에 있는 길 칸 번호 — 끝까지 갔다가 돌아오기를 되풀이(왕복 주기 2(L-1))."""
    if length <= 1:
        return 0
    period = 2 * (length - 1)
    ph = s % period
    return ph if ph < length else period - ph


def _robot_count(level: int) -> int:
    return 0 if level < ROBOT_FROM else 1 if level < 4 else 2


def _corridor(c: tuple, ok: set, length: int, rnd: random.Random) -> Optional[list]:
    """c 를 지나는 순찰 길 — 양 끝을 번갈아 늘린다(되도록 곧게, 제 몸에 붙지 않게)."""
    path = [c]
    for _ in range(length * 6):
        if len(path) >= length:
            break
        tail = rnd.random() < 0.5
        end = path[-1] if tail else path[0]
        prev = (path[-2] if tail else path[1]) if len(path) > 1 else None
        opts = []
        for dx, dy in DIRS.values():
            q = (end[0] + dx, end[1] + dy)
            if q not in ok or q in path:
                continue
            if any((q[0] + ex, q[1] + ey) in path and (q[0] + ex, q[1] + ey) != end for ex, ey in DIRS.values()):
                continue
            straight = prev is not None and (q[0] - end[0], q[1] - end[1]) == (end[0] - prev[0], end[1] - prev[1])
            opts.append((straight, q))
        if not opts:
            continue
        line = [q for s, q in opts if s]
        q = line[0] if line and rnd.random() < 0.7 else rnd.choice([q for _, q in opts])
        if tail:
            path.append(q)
        else:
            path.insert(0, q)
    return path if len(path) >= length else None


def _fair(dry: list, start: tuple, key: tuple, car: tuple, paths: list, offs: list) -> bool:
    """로봇을 피해서 마른 길로 출발 → 차 키 → 내 차까지 갈 수 있는지 — (칸, 로봇 차례)를 펼친 길 찾기.

    걷는 사람은 로봇 한 걸음(ROBOT_STEP 초) 동안 한 칸만 가거나 멈춘다고 친다(실제로는 더 빠르다 — 넉넉한 확인).
    한 칸 옮길 때는 들어갈 칸이 이번 차례와 다음 차례 모두 비어 있어야 한다 — 그 한 걸음 동안 아무 때나 눌러도
    닿지 않는다는 뜻(사람 손이 칼같이 맞출 필요가 없다). 로봇과 칸을 맞바꾸며 스치는 것도 여기서 걸러진다.
    출발점 · 차 키 · 내 차는 순찰 길에 넣지 않으므로 거기서는 얼마든지 기다릴 수 있다 — 어느 차례에서 출발해도 된다.
    """
    if not paths:
        return bool(_route(dry, start, key)) and bool(_route(dry, key, car))
    length = len(paths[0])
    period = 2 * (length - 1)
    at = [[tuple(p[_ridx(ph + o, length)]) for p, o in zip(paths, offs)] for ph in range(period)]
    occ = [set(a) for a in at]
    moves = ((0, 0), *DIRS.values())

    def leg(a: tuple, b: tuple) -> bool:
        seen = set()
        q = deque()
        for ph in range(period):
            if a not in occ[ph]:
                seen.add((a, ph))
                q.append((a, ph))
        while q:
            c, ph = q.popleft()
            nph = (ph + 1) % period
            for dx, dy in moves:
                nc = (c[0] + dx, c[1] + dy)
                if dry[nc[1]][nc[0]] != "." or nc in occ[nph] or (nc != c and nc in occ[ph]):
                    continue
                if nc == b:
                    return True
                s = (nc, nph)
                if s not in seen:
                    seen.add(s)
                    q.append(s)
        return False

    return leg(start, key) and leg(key, car)


def _patrols(level: int, grid: list, dry: list, start: tuple, key: tuple, car: tuple, puddles: list, rnd: random.Random) -> list:
    """순찰 로봇 길 — 되도록 출발 → 키 → 차 길목을 지나되, 공정한지(_fair) 확인한 것만."""
    count = _robot_count(level)
    if not count:
        return []
    length = 6 if level < 3 else 7
    n = len(grid)
    road = {(x, y) for y in range(n) for x in range(n) if grid[y][x] == "."}
    ban = {key, car, *map(tuple, puddles)}
    ban |= {p for p in road if abs(p[0] - start[0]) + abs(p[1] - start[1]) <= 2}  # 승강기 앞은 늘 안전
    route = set(_route(dry, start, key) + _route(dry, key, car))
    paths, offs = [], []
    for i in range(count):
        taken = {(p[0] + dx, p[1] + dy) for path in paths for p in path for dx, dy in ((0, 0), *DIRS.values())}
        ok = road - ban - taken
        off = i * (length - 1)  # 두 대면 반 바퀴 어긋나게
        for attempt in range(40):
            pool = sorted((route if attempt < 25 else road) & ok)
            if not pool:
                continue
            path = _corridor(rnd.choice(pool), ok, length, rnd)
            if path and _fair(dry, start, key, car, paths + [path], offs + [off]):
                paths.append(path)
                offs.append(off)
                break
    return [{"path": [list(p) for p in path], "off": off} for path, off in zip(paths, offs)]


def _batteries(level: int, dry: list, start: tuple, key: tuple, car: tuple, puddles: list, robots: list, rnd: random.Random) -> list:
    """바닥에 떨어진 건전지 — 길에서 조금(1~4칸) 벗어난 곳을 좋아한다(주우러 가면 시간이 조금 든다). 순찰 길 · 웅덩이 위엔 두지 않는다."""
    want = (1, 1, 2, 2)[level] if level < 4 else 3
    ds = _dist(dry, start)
    route = _route(dry, start, key) + _route(dry, key, car)
    dr = {p: 0 for p in route}
    q = deque(route)
    while q:
        c = q.popleft()
        for dx, dy in DIRS.values():
            p = (c[0] + dx, c[1] + dy)
            if dry[p[1]][p[0]] == "." and p not in dr:
                dr[p] = dr[c] + 1
                q.append(p)
    on_path = {tuple(p) for rb in robots for p in rb["path"]}
    wet = {tuple(p) for p in puddles}
    cand = [p for p in sorted(ds) if p not in (start, key, car) and p not in wet and p not in on_path and ds[p] >= 3]
    rnd.shuffle(cand)
    cand.sort(key=lambda p: 0 if 1 <= dr.get(p, 99) <= 4 else 1 if dr.get(p) == 0 else 2)
    out: list = []
    for p in cand:
        if len(out) >= want:
            break
        if all(abs(p[0] - o[0]) + abs(p[1] - o[1]) >= 4 for o in out):
            out.append(p)
    return [list(p) for p in out]


def _signs(n: int, rnd: random.Random) -> list:
    """바깥 벽의 비상구 표시등 두 개 — 정전에도 초록 불이 켜져 있어 손전등 쪽에도 늘 보인다(길잡이). 승강기(왼쪽 위) 가까이는 피한다."""
    spots = ([(n - 1, y) for y in range(3, n - 1, 2)] + [(x, n - 1) for x in range(3, n - 1, 2)]
             + [(0, y) for y in range(5, n - 1, 2)] + [(x, 0) for x in range(5, n - 1, 2)])
    rnd.shuffle(spots)
    out = [spots[0]]
    for p in spots[1:]:
        if abs(p[0] - out[0][0]) + abs(p[1] - out[0][1]) >= n - 1:
            out.append(p)
            break
    return [list(p) for p in out]


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
    want = min(2 + level * 2, 10)
    for p in free:
        if len(puddles) >= want:
            break
        dry = _block(grid, (*puddles, p))
        reach = _dist(dry, start)
        if key in reach and car in reach:
            puddles.append(p)
    dry = _block(grid, puddles)
    robots = _patrols(level, grid, dry, start, key, car, puddles, rnd)
    bats = _batteries(level, dry, start, key, car, puddles, robots, rnd)
    return {
        "n": n, "grid": grid, "tiles": _tiles(grid, rnd), "start": list(start), "car": list(car), "key": list(key),
        "puddles": [list(p) for p in puddles], "robots": robots, "bats": bats, "signs": _signs(n, rnd),
    }


# ── 진행 ──────────────────────────────────────────────────────

def _walker(k: dict) -> str:
    return "first" if k["level"] % 2 == 0 else "second"


def _radius(bat: float) -> float:
    """손전등 불빛 반지름(칸) — 건전지가 닳을수록 작아진다. 가장 작아도 1.5(둘레 3×3 칸 — 대각선 옆도 보인다)."""
    return 2.5 if bat > 60 else 2.0 if bat > BAT_LOW else 1.5


def _lit(pos, r: float, n: int) -> list:
    x, y = pos
    rr = int(r)
    return [(x + dx, y + dy) for dy in range(-rr, rr + 1) for dx in range(-rr, rr + 1)
            if dx * dx + dy * dy <= r * r and 0 <= x + dx < n and 0 <= y + dy < n]


def _look(k: dict) -> None:
    """손전등 — 지금 불빛이 닿는 칸을 본 것으로 남긴다."""
    seen = {tuple(p) for p in k["seen"]}
    seen.update(_lit(k["pos"], _radius(k["bat"][_walker(k)]), k["lv"]["n"]))
    k["seen"] = [list(p) for p in sorted(seen)]


def _note(k: dict, now: float, kind: str, text: str, at=None) -> None:
    """화면에 띄울 일 — id 가 바뀌면 화면이 효과(흔들림 · 물보라 · 반짝임)를 낸다."""
    k["ev"] = k.get("ev", 0) + 1
    k["note"] = {"id": k["ev"], "t": now, "kind": kind, "text": text, "at": list(at) if at else None}


def _radio(k: dict, now: float, kind: str, once: Optional[str] = None) -> None:
    told = k.setdefault("told", [])
    if once:
        if once in told:
            return
        told.append(once)
    text = RADIO.get(kind, RADIO["floorN"]).format(floor=_floor(k["level"]))
    k["ev"] = k.get("ev", 0) + 1
    k["radio"] = {"id": k["ev"], "t": now, "text": text}


def _enter(k: dict, now: float) -> None:
    lv = _level(k["level"], random.Random(k["seed"] * 31 + k["level"]))
    k.update({"lv": lv, "pos": list(lv["start"]), "hasKey": False, "stunUntil": 0, "stunBy": None, "seen": [], "wet": [],
              "got": [], "fsteps": 0, "fslips": 0, "fcatch": 0, "levelAt": now, "chk": now, "pings": []})
    _look(k)
    _radio(k, now, f"floor{k['level']}" if f"floor{k['level']}" in RADIO else "floorN")


def _robot_at(k: dict, t: float) -> list:
    """시각 t 에 순찰 로봇들이 있는 칸."""
    lv = k["lv"]
    if not lv["robots"]:
        return []
    s = math.floor((t - k["levelAt"]) / ROBOT_STEP + 1e-9)
    return [tuple(rb["path"][_ridx(s + rb["off"], len(rb["path"]))]) for rb in lv["robots"]]


def _next_catch(k: dict, t_from: float, t_to: float) -> Optional[float]:
    """걷는 사람이 지금 칸에 그대로 있을 때, (t_from, t_to] 사이에 로봇이 그 칸으로 들어오는 첫 시각."""
    pos = tuple(k["pos"])
    best = None
    for rb in k["lv"]["robots"]:
        path = [tuple(p) for p in rb["path"]]
        if pos not in path:
            continue
        length = len(path)
        j = math.floor((t_from - k["levelAt"]) / ROBOT_STEP + 1e-9) + 1
        for _ in range(2 * (length - 1) + 1):
            tb = k["levelAt"] + j * ROBOT_STEP
            if tb > t_to + 1e-9:
                break
            if path[_ridx(j + rb["off"], length)] == pos:
                best = tb if best is None else min(best, tb)
                break
            j += 1
    return best


def _caught(k: dict, t: float) -> None:
    at = list(k["pos"])
    k["pos"] = list(k["lv"]["start"])
    k["stunUntil"] = t + HOLD_SEC
    k["stunBy"] = "robot"
    k["catches"] = k.get("catches", 0) + 1
    k["fcatch"] = k.get("fcatch", 0) + 1
    k["chk"] = max(k.get("chk", t), t)
    _look(k)
    _note(k, t, "robot", "삐빅! 순찰 로봇에 닿았어요. 승강기 앞으로 돌아가요", at)
    _radio(k, t, "robot", once="robot")


def _fix(k: dict) -> None:
    """예전 판(건전지 · 로봇 · 표시가 생기기 전에 시작한 판)도 끝까지 돌게 빠진 값을 채운다."""
    lv = k["lv"]
    if "tiles" not in lv:
        lv["tiles"] = _tiles(lv["grid"], random.Random(k.get("seed", 0) * 7 + k.get("level", 0)))
    for name in ("robots", "bats", "signs"):
        lv.setdefault(name, [])
    k.setdefault("bat", {"first": BAT_FULL, "second": BAT_FULL})
    k.setdefault("chk", k.get("levelAt", k["start"]))
    for name in ("got", "pings", "told"):
        k.setdefault(name, [])
    for name in ("fsteps", "fslips", "fcatch"):  # 예전 판은 이 층의 걸음 · 미끄덩 · 닿음을 따로 세지 않았다
        k.setdefault(name, 0)
    k.setdefault("stunBy", "puddle" if k.get("stunUntil") else None)


def start(st: dict, now: float) -> None:
    st["k"] = {"start": now, "end": now + ROUND_SEC, "seed": random.randrange(1 << 30), "level": 0, "cleared": 0,
               "slips": 0, "catches": 0, "bumps": 0, "pingN": 0, "batN": 0, "steps": 0,
               "bat": {"first": BAT_FULL, "second": BAT_FULL}, "face": "D", "pid": 0, "ev": 0, "told": [],
               "over": False, "reason": None, "done": [], "gap": {}, "note": None, "radio": None}
    _enter(st["k"], now)


def advance(st: dict, now: float) -> bool:
    """지금까지의 흐름을 맞춘다 — 가만히 서 있는 동안 로봇이 와서 닿았는지, 시간이 다 됐는지."""
    k = st["k"]
    if k["over"]:
        return False
    _fix(k)
    changed = False
    t_to = min(now, k["end"])
    if k["lv"]["robots"] and t_to > k["chk"]:
        tc = _next_catch(k, k["chk"], t_to)
        if tc is not None:
            _caught(k, tc)
            changed = True
        k["chk"] = max(k["chk"], t_to)
    if now >= k["end"]:
        k["over"], k["reason"] = True, "time"
        changed = True
    return changed


def next_event(st: dict) -> Optional[float]:
    """다음에 화면이 서버에 물어볼 시각 — 로봇이 걷는 사람 칸에 닿을 때, 아니면 끝날 때."""
    k = st["k"]
    if k["over"]:
        return None
    _fix(k)
    t = k["end"]
    if k["lv"]["robots"]:
        tc = _next_catch(k, k["chk"], k["end"])
        if tc is not None:
            t = min(t, tc)
    return t


def _gap(k: dict, key: str, now: float, sec: float) -> None:
    gap = k.setdefault("gap", {})
    if now - gap.get(key, 0) < sec:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[key] = now


def _ping_arg(arg, n: int) -> tuple:
    x = y = None
    if isinstance(arg, dict):
        x, y = arg.get("x"), arg.get("y")
    elif isinstance(arg, str) and arg.count(",") == 1:
        a, b = arg.split(",")
        if a.strip().lstrip("-").isdigit() and b.strip().lstrip("-").isdigit():
            x, y = int(a), int(b)
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in (x, y)):
        raise_app_error("PARKING_BAD_PING")
    if not (1 <= x <= n - 2 and 1 <= y <= n - 2):
        raise_app_error("PARKING_BAD_PING")
    return x, y


def _ping(k: dict, side: str, member_id: int, arg, now: float) -> None:
    if side not in ROOM.sides or side == _walker(k):
        raise_app_error("PARKING_NOT_CCTV")
    x, y = _ping_arg(arg, k["lv"]["n"])
    _gap(k, f"p{member_id}", now, PING_GAP)
    k["pid"] = k.get("pid", 0) + 1
    live = [p for p in k.get("pings", []) if now - p["t"] < PING_SEC]
    k["pings"] = [*live[-(PING_MAX - 1):], {"id": k["pid"], "x": x, "y": y, "t": now}]
    k["pingN"] = k.get("pingN", 0) + 1


def _move(k: dict, side: str, member_id: int, arg, now: float) -> None:
    if side != _walker(k):
        raise_app_error("MAZE_NOT_WALKER")
    if not isinstance(arg, str) or arg not in DIRS:
        raise_app_error("KITCHEN_BAD_ACTION")
    _gap(k, str(member_id), now, MOVE_GAP)
    if now < k["stunUntil"]:
        return  # 미끄러졌거나 로봇에 붙잡혀 잠깐 못 움직인다 — 걸음은 버리고 지금 모습을 돌려준다
    lv = k["lv"]
    dx, dy = DIRS[arg]
    x, y = k["pos"][0] + dx, k["pos"][1] + dy
    k["face"] = arg
    if lv["grid"][y][x] == "#":
        t = lv["tiles"][y][x]
        k["bumps"] = k.get("bumps", 0) + 1
        if t == "P":
            _note(k, now, "pillar", f"쿵! {_label(x, y)} 기둥이에요", (x, y))
        elif t.isdigit():
            _note(k, now, "car", "삐뽀삐뽀! 주차된 차예요", (x, y))
        elif t == "X":
            _note(k, now, "wall", "덜컹! 공사 중 표지예요", (x, y))
        else:
            _note(k, now, "wall", "쿵! 벽이에요", (x, y))
        return
    walker = _walker(k)
    k["pos"] = [x, y]
    k["steps"] = k.get("steps", 0) + 1
    k["fsteps"] = k.get("fsteps", 0) + 1
    k["chk"] = max(k["chk"], now)
    before = k["bat"][walker]
    k["bat"][walker] = max(0, before - BAT_STEP)
    k["note"] = None
    if (x, y) in _robot_at(k, now):
        _look(k)
        _caught(k, now)
        return
    for i, b in enumerate(lv["bats"]):
        if b == [x, y] and i not in k["got"]:
            k["got"].append(i)
            k["bat"][walker] = min(BAT_FULL, k["bat"][walker] + BAT_PICK)
            k["batN"] = k.get("batN", 0) + 1
            _note(k, now, "battery", "건전지를 주웠어요! 손전등이 환해져요", (x, y))
            _radio(k, now, "battery", once="battery")
    _look(k)
    if before > BAT_LOW >= k["bat"][walker]:
        _radio(k, now, "low", once=f"low:{walker}")
    if [x, y] in lv["puddles"]:
        k["stunUntil"] = now + STUN_SEC
        k["stunBy"] = "puddle"
        k["slips"] = k.get("slips", 0) + 1
        k["fslips"] = k.get("fslips", 0) + 1
        if [x, y] not in k["wet"]:
            k["wet"].append([x, y])
        _note(k, now, "puddle", "미끄덩! 물웅덩이예요", (x, y))
        _radio(k, now, "slip", once="slip")
    if [x, y] == lv["key"] and not k["hasKey"]:
        k["hasKey"] = True
        _note(k, now, "key", "차 키를 주웠어요! 이제 내 차로", (x, y))
        _radio(k, now, "key", once="key")
    if [x, y] == lv["car"]:
        if not k["hasKey"]:
            _note(k, now, "locked", "차 문이 잠겨 있어요. 차 키부터!", (x, y))
            return
        k["cleared"] += 1
        k["done"].append({"floor": _floor(k["level"]), "sec": round(now - k["levelAt"], 1), "by": walker,
                          "steps": k.get("fsteps", 0), "slips": k.get("fslips", 0), "catches": k.get("fcatch", 0)})
        k["level"] += 1
        _enter(k, now)
        _note(k, now, "clear", f"{k['done'][-1]['floor']} 탈출! 역할을 바꿔 {_floor(k['level'])}로", (x, y))


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    k = st["k"]
    if k["over"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    _fix(k)
    if action == "move":
        _move(k, side, member_id, arg, now)
    elif action == "ping":
        _ping(k, side, member_id, arg, now)
    else:
        raise_app_error("KITCHEN_BAD_ACTION")


def score(st: dict) -> int:
    return st["k"]["cleared"]


def end_code(st: dict) -> str:
    return "TIME"


def summary(st: dict) -> str:
    k = st["k"]
    return f"시간 끝! {k['cleared']}층을 빠져나왔어요." if k["cleared"] else "시간 끝! 아쉽게 한 층도 못 빠져나왔어요."


def _stats(k: dict) -> dict:
    secs = [d["sec"] for d in k["done"]]
    return {"cleared": k["cleared"], "steps": k.get("steps", 0), "slips": k.get("slips", 0), "catches": k.get("catches", 0),
            "pings": k.get("pingN", 0), "bats": k.get("batN", 0), "bumps": k.get("bumps", 0), "best": min(secs) if secs else None}


def view(st: dict, side: Optional[str], now: float) -> dict:
    """side 가 볼 화면. 손전등 쪽(걷는 사람)에게는 본 칸 · 밟은 웅덩이 · 불빛 안의 로봇만 보낸다."""
    k = st["k"]
    _fix(k)
    lv = k["lv"]
    n = lv["n"]
    walker = _walker(k)
    walking = side == walker
    full = not walking or k["over"]
    r = _radius(k["bat"][walker])
    got = set(k["got"])
    bats = [b for i, b in enumerate(lv["bats"]) if i not in got]
    robots = []
    if full:
        tiles = lv["tiles"]
        puddles, key, car = lv["puddles"], (None if k["hasKey"] else lv["key"]), lv["car"]
        robots = [{"path": rb["path"], "off": rb["off"], "P": 2 * (len(rb["path"]) - 1)} for rb in lv["robots"]]
    else:  # 손전등 — 본 칸만, 웅덩이는 밟은 것만, 로봇은 지금 불빛 안에 들어오는 차례만
        seen = {tuple(p) for p in k["seen"]}
        tiles = ["".join(lv["tiles"][y][x] if (x, y) in seen else "?" for x in range(n)) for y in range(n)]
        puddles = k["wet"]
        key = lv["key"] if (not k["hasKey"] and tuple(lv["key"]) in seen) else None
        car = lv["car"] if tuple(lv["car"]) in seen else None
        bats = [b for b in bats if tuple(b) in seen]
        lit = set(_lit(k["pos"], r, n))
        for rb in lv["robots"]:
            length = len(rb["path"])
            period = 2 * (length - 1)
            vis = [[ph, *rb["path"][_ridx(ph, length)]] for ph in range(period) if tuple(rb["path"][_ridx(ph, length)]) in lit]
            robots.append({"off": rb["off"], "P": period, "vis": vis})
    nxt = next_event(st)
    if walking and not k["over"] and nxt is not None and nxt < k["end"] and nxt - now > ROBOT_STEP + 1e-6:
        nxt = k["end"]  # 손전등 쪽엔 로봇이 아직 멀면 닿을 시각을 미리 알려 주지 않는다(CCTV 쪽 tick · 다음 동작이 잡는다)
    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": nxt, "over": k["over"],
        "role": "walk" if walking else "cctv", "side": side, "walker": walker,
        "floor": _floor(k["level"]), "level": k["level"], "cleared": k["cleared"], "slips": k.get("slips", 0),
        "n": n, "tiles": tiles, "pos": k["pos"], "startCell": lv["start"], "signs": lv["signs"],
        "puddles": puddles, "key": key, "car": car, "bats": bats,
        "hasKey": k["hasKey"], "stunUntil": k["stunUntil"], "stunBy": k.get("stunBy"), "stunSec": STUN_SEC, "holdSec": HOLD_SEC,
        "bat": k["bat"][walker], "batMine": k["bat"].get(side) if side in k["bat"] else None, "light": r, "face": k.get("face", "D"),
        "pings": [p for p in k.get("pings", []) if now - p["t"] < PING_SEC], "pingSec": PING_SEC,
        "robots": robots, "robotStep": ROBOT_STEP, "levelAt": k["levelAt"],
        "steps": k.get("fsteps", 0), "note": k["note"], "radio": k.get("radio"), "done": k["done"][-12:], "stats": _stats(k),
    }
