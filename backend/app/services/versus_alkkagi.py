"""사내 알까기 대전 엔진 — 바둑판 위에 각자 알 7개를 놓고, 차례마다 내 알 하나를 튕겨 상대 알을 판 밖으로 밀어낸다.
직원끼리 또는 컴퓨터와.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/alkkagi.html — 좌표 · 알 번호 · 샷 기록 모양이 이 파일과 같다.

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 판은 정사각형, 좌표 0..1000(x 오른쪽, y 아래쪽). 알 반지름 RADIUS.
  · 먼저 하는 사람(흑, 자리 0)은 아래쪽 한 줄, 나중 사람(백, 자리 1)은 위쪽 한 줄에 7알씩.
  · 차례마다 내 알 하나를 골라 방향(angle, 라디안)과 세기(power, 0~1)로 튕긴다. 튕긴 뒤 차례는 늘 상대에게.
  · 알의 중심이 판(0..1000) 밖으로 나가면 떨어진 것 — 판에서 빠진다.
  · 쏜 뒤 상대 알 0개 · 내 알 1개 이상 → 내가 승(CLEAR). 내 알 0개 · 상대 1개 이상 → 상대 승(CLEAR).
    둘 다 0개 → 무승부(DRAW). 합계 MAX_SHOTS 번 튕기면 남은 알이 많은 쪽 승(COUNT), 같으면 무승부(DRAW).

물리(서버만 판정 — 화면은 기록된 프레임을 다시 보여 줄 뿐)
  · 고정 간격(1/120초) 결정적 시뮬레이션. 속도 단위는 「좌표 / 틱」.
  · 마찰은 일정한 감속(DECEL / 틱). 세기 1 의 첫 속도 VMAX 는 막힘 없이 약 1400 을 간다(판 끝에서 끝까지 넉넉히).
    세기 p 의 첫 속도는 VMAX × p — 가는 거리는 p² 에 비례해서 작은 세기는 살짝 밀린다.
  · 같은 질량 원판 사이 탄성 충돌(반발 계수 RESTITUTION, 마찰 · 회전 없음), 겹치면 반씩 밀어 떼어 낸다.
  · 판 위 알이 모두 멈추거나 MAX_TICKS 에 이르면 끝(그때 움직이던 알은 그 자리에 멈춘다).

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data)
  {"stone": 알 번호(0..13 정수), "angle": 라디안(실수), "power": 0 초과 1 이하}

판(m.state) — 숨긴 것이 없다
  p: [먼저 하는 id, 나중 id](컴퓨터는 BOT_ID) · turn: 차례 자리(0 · 1) · shots: 지금까지 튕긴 횟수
  stones: 알마다 [x, y, 판 위 1 · 떨어짐 0] — 번호 0..6 은 자리 0(흑), 7..13 은 자리 1(백). 떨어진 알은 떨어진 자리 그대로
  log: 최근 샷 LOG_KEEP 개 — {seq(몇 번째 샷, 1부터), seat, stone, angle, power,
        before(샷 전 알마다 [x, y] 정수 또는 null), ids(이 샷에서 움직인 알 번호),
        frames(FRAME_TICKS 틱마다 [ids 순서로 x, y, x, y, ...] 정수 — 첫 칸은 샷 직전),
        out([[떨어진 알, 프레임 번호], ...]), hits(부딪힌 프레임 번호들)}
  seed: 컴퓨터 흔들림 씨앗
"""

from __future__ import annotations

import math
import random
from datetime import datetime
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "alkkagi"
NAME = "사내 알까기"
REASONS = {"CLEAR": "상대 알 모두 떨어뜨림", "COUNT": "남은 알이 더 많음"}  # 무승부(DRAW)는 match.py 공통 문구
DRAWS = ("DRAW",)
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
MIN_ACTS = 6  # 기권 · 시간 초과로 끝난 판은 이만큼 튕긴 판만 도장 · 순위에 센다
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

# ---------- 판 · 물리 상수 (화면 alkkagi.html 과 같은 값: SIZE · RADIUS · MAX_SHOTS · FPS) ----------
SIZE = 1000
RADIUS = 36
PER_SIDE = 7
ROW_Y = (850, 150)  # 자리 0(흑) 아래 줄 · 자리 1(백) 위 줄
MAX_SHOTS = 60
TICKS_PER_SEC = 120
DECEL = 0.03  # 틱마다 줄어드는 속도(좌표 / 틱)
VMAX = math.sqrt(2 * DECEL * 1400)  # 세기 1 — 막힘 없이 약 1400 을 간다(약 2.5초)
RESTITUTION = 0.9
FRAME_TICKS = 4  # 4틱(1/30초)마다 프레임 하나
MAX_FRAMES = 150
MAX_TICKS = FRAME_TICKS * (MAX_FRAMES - 1)  # 첫 프레임 + 149 프레임 = 약 5초
TAIL_FRAMES = 8  # 떨어진 알이 작아지며 사라지는 모습을 보여 줄 만큼은 프레임을 더 남긴다
LOG_KEEP = 4
MIN_POWER = 0.02  # 이보다 약한 세기는 받지 않는다(화면도 너무 짧게 끌면 취소)
EPS = 1e-6

register_messages(
    {
        "ALKKAGI_BAD_SHOT": "튕길 수 없는 값이에요. 화면을 새로 불러 주세요.",
        "ALKKAGI_NOT_MINE": "내 알만 튕길 수 있어요.",
        "ALKKAGI_STONE_OUT": "이미 판 밖으로 떨어진 알이에요. 다른 알을 골라 주세요.",
    },
    {"ALKKAGI_BAD_SHOT": 400, "ALKKAGI_NOT_MINE": 400, "ALKKAGI_STONE_OUT": 409},
)


# ---------- 판 ----------
def owner(i: int) -> int:
    return 0 if i < PER_SIDE else 1


def new_state(players, seed: int = 0) -> dict:
    stones = []
    for seat in (0, 1):
        for k in range(PER_SIDE):
            stones.append([float(SIZE * (k + 1) / (PER_SIDE + 1)), float(ROW_Y[seat]), 1])
    return {"p": list(players), "turn": 0, "shots": 0, "stones": stones, "log": [], "seed": int(seed)}


def _seat(st: dict, member_id) -> Optional[int]:
    p = st.get("p") or []
    return p.index(member_id) if member_id in p else None


def left(st: dict, seat: int) -> int:
    return sum(1 for i, s in enumerate(st["stones"]) if s[2] and owner(i) == seat)


# ---------- 물리 ----------
def simulate(stones: list, stone: int, angle: float, power: float, record: bool = True) -> dict:
    """stones([x, y, on] 목록)에서 stone 을 angle · power 로 튕긴다. 넘겨받은 목록은 고치지 않는다.
    돌려주는 것: {"stones": 끝난 뒤 [x, y, on], "out": [떨어진 알...]} — record 면 frames · ids · outAt · hits 도.
    record=False 는 컴퓨터가 후보를 따져 볼 때 — 판 위 알의 결과는 record=True 와 똑같다(떨어진 알은 더 움직이지 않을 뿐)."""
    n = len(stones)
    xs = [float(s[0]) for s in stones]
    ys = [float(s[1]) for s in stones]
    on = [bool(s[2]) for s in stones]
    vx = [0.0] * n
    vy = [0.0] * n
    speed0 = VMAX * power
    vx[stone] = math.cos(angle) * speed0
    vy[stone] = math.sin(angle) * speed0
    moving = {stone}  # 판 위에서 움직이는 알
    falling: set = set()  # 떨어진 뒤 미끄러지는 알(그리기용 — 아무와도 부딪히지 않는다)
    out: list = []
    out_tick: dict = {}
    touched = {stone}
    hit_ticks: list = []
    frames: list = []
    rr = (2 * RADIUS) ** 2
    two_r = 2 * RADIUS
    half_e = (1 + RESTITUTION) / 2
    last_drop = -10**9
    tick = 0
    if record:
        frames.append((tick, xs[:], ys[:]))
    while tick < MAX_TICKS:
        if not moving and (not record or tick >= last_drop + TAIL_FRAMES * FRAME_TICKS):
            break
        tick += 1
        # 1) 움직이기
        for i in moving:
            xs[i] += vx[i]
            ys[i] += vy[i]
        for i in falling:
            xs[i] += vx[i]
            ys[i] += vy[i]
        # 2) 떨어짐 — 중심이 판 밖
        dropped = [i for i in moving if not (0.0 <= xs[i] <= SIZE and 0.0 <= ys[i] <= SIZE)]
        if dropped:
            for i in sorted(dropped):
                on[i] = False
                moving.discard(i)
                out.append(i)
                out_tick[i] = tick
                if record:
                    falling.add(i)
            last_drop = tick
        # 3) 부딪힘 — 움직이는 알마다 판 위 다른 알과(번호 순서로 늘 같게)
        if moving:
            hit = False
            for i in sorted(moving):
                for j in range(n):
                    if j == i or not on[j] or (j in moving and j < i):
                        continue
                    dx = xs[j] - xs[i]
                    dy = ys[j] - ys[i]
                    d2 = dx * dx + dy * dy
                    if d2 >= rr:
                        continue
                    d = math.sqrt(d2)
                    if d < EPS:
                        nx, ny, d = 1.0, 0.0, 0.0
                    else:
                        nx, ny = dx / d, dy / d
                    vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny
                    if vn < 0:
                        jn = -half_e * vn
                        vx[i] -= jn * nx
                        vy[i] -= jn * ny
                        vx[j] += jn * nx
                        vy[j] += jn * ny
                        hit = True
                    push = (two_r - d) / 2
                    xs[i] -= nx * push
                    ys[i] -= ny * push
                    xs[j] += nx * push
                    ys[j] += ny * push
                    if j not in moving:
                        moving.add(j)  # 이번 틱 남은 계산은 다음 틱부터 — 집합을 도는 중이라 sorted 복사본으로 돈다
                    touched.add(j)
            if hit:
                hit_ticks.append(tick)
        # 4) 마찰
        for group in (moving, falling):
            stopped = []
            for i in group:
                s2 = vx[i] * vx[i] + vy[i] * vy[i]
                if s2 <= DECEL * DECEL:
                    vx[i] = vy[i] = 0.0
                    stopped.append(i)
                else:
                    s = math.sqrt(s2)
                    k = (s - DECEL) / s
                    vx[i] *= k
                    vy[i] *= k
            for i in stopped:
                group.discard(i)
        if record and tick % FRAME_TICKS == 0:
            frames.append((tick, xs[:], ys[:]))
    if record and frames[-1][0] != tick:
        frames.append((tick, xs[:], ys[:]))
    res = {
        "stones": [[round(xs[i], 2), round(ys[i], 2), 1 if on[i] else 0] for i in range(n)],
        "out": out,
    }
    if record:
        ids = sorted(touched)
        fr_index = lambda t: min(len(frames) - 1, (t + FRAME_TICKS - 1) // FRAME_TICKS)  # noqa: E731
        res["ids"] = ids
        res["frames"] = [[v for i in ids for v in (int(round(fx[i])), int(round(fy[i])))] for _, fx, fy in frames]
        res["outAt"] = [[i, fr_index(out_tick[i])] for i in out]
        hits: list = []
        for t in hit_ticks:
            f = fr_index(t)
            if not hits or hits[-1] != f:
                hits.append(f)
        res["hits"] = hits[:24]
    return res


def _outcome(st: dict, seat: int) -> Optional[tuple]:
    mine, theirs = left(st, seat), left(st, 1 - seat)
    p = st["p"]
    if mine == 0 and theirs == 0:
        return (None, "DRAW")
    if theirs == 0:
        return (p[seat], "CLEAR")
    if mine == 0:
        return (p[1 - seat], "CLEAR")
    if st["shots"] >= MAX_SHOTS:
        if mine == theirs:
            return (None, "DRAW")
        return (p[seat] if mine > theirs else p[1 - seat], "COUNT")
    return None


def _shoot(st: dict, seat: int, stone: int, angle: float, power: float) -> Optional[tuple]:
    before = [[int(round(s[0])), int(round(s[1]))] if s[2] else None for s in st["stones"]]
    res = simulate(st["stones"], stone, angle, power, record=True)
    st["stones"] = res["stones"]
    st["shots"] = int(st.get("shots", 0)) + 1
    st["log"] = (st.get("log") or [])[-(LOG_KEEP - 1):] + [{
        "seq": st["shots"], "seat": seat, "stone": stone, "angle": round(angle, 5), "power": round(power, 4),
        "before": before, "ids": res["ids"], "frames": res["frames"], "out": res["outAt"], "hits": res["hits"],
    }]
    st["turn"] = 1 - seat
    return _outcome(st, seat)


def _num(v) -> Optional[float]:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    v = float(v)
    return v if math.isfinite(v) else None


# ---------- 규약 ----------
def start(m, players: tuple, rnd) -> dict:
    return new_state(players, rnd.randrange(1 << 30))


def waiting_for(m) -> set:
    st = m.state
    return {st["p"][st["turn"]]}


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, member_id)
    if seat is None or seat != st["turn"]:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    if not isinstance(data, dict):
        raise_app_error("ALKKAGI_BAD_SHOT")
    stone = data.get("stone")
    angle = _num(data.get("angle"))
    power = _num(data.get("power"))
    if isinstance(stone, bool) or not isinstance(stone, int) or not 0 <= stone < len(st["stones"]):
        raise_app_error("ALKKAGI_BAD_SHOT")
    if angle is None or abs(angle) > 100 or power is None or not MIN_POWER <= power <= 1:
        raise_app_error("ALKKAGI_BAD_SHOT")
    if owner(stone) != seat:
        raise_app_error("ALKKAGI_NOT_MINE")
    if not st["stones"][stone][2]:
        raise_app_error("ALKKAGI_STONE_OUT")
    return _shoot(st, seat, stone, angle, power)


def view(m, member_id: int, board: bool) -> dict:
    """숨긴 것이 없는 게임. 목록 한 줄은 남은 알 수만, 대국 화면은 알 위치 · 최근 샷 기록까지."""
    st = m.state or {}
    if not st.get("p"):
        return {}
    me = _seat(st, member_id)
    me = 0 if me is None else me
    out = {"myLeft": left(st, me), "rivalLeft": left(st, 1 - me), "shotCount": int(st.get("shots", 0))}
    if board:
        who = lambda s: "me" if s == me else "rival"  # noqa: E731
        out.update({
            "myColor": "black" if me == 0 else "white",
            "mySeat": me,
            "size": SIZE,
            "radius": RADIUS,
            "perSide": PER_SIDE,
            "maxShots": MAX_SHOTS,
            "fps": TICKS_PER_SEC // FRAME_TICKS,
            "stones": [[i, owner(i), int(round(s[0])), int(round(s[1])), 1 if s[2] else 0] for i, s in enumerate(st["stones"])],
            "shots": [{**{k: v for k, v in x.items()}, "by": who(x["seat"])} for x in st.get("log") or []],
        })
    return out


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, BOT_ID)
    rng = random.Random(int(st.get("seed", 0)) * 1009 + int(st.get("shots", 0)) * 7919 + 17)
    stone, angle, power = choose(st, seat, level, rng)
    return _shoot(st, seat, stone, angle, power)


# ---------- 컴퓨터 ----------
# 같은 시뮬레이션(프레임 기록 없이)으로 후보 샷을 돌려 보고 가장 점수가 좋은 샷을 고른다. 고른 뒤 난이도만큼 손이 떨린다.
LEVEL = {
    #          (겨냥할 알 쌍 수, 겨냥 방법, 세기들, 각도 흔들림(표준편차), 세기 흔들림(비율))
    "easy": (3, ("direct",), (0.75, 1.0), 0.15, 0.25),
    "normal": (8, ("direct", "edge"), (0.65, 0.85, 1.0), 0.045, 0.08),
    "hard": (49, ("direct", "edge", "edge2"), (0.5, 0.65, 0.8, 0.9, 1.0), 0.006, 0.015),
}
HARD_MAX_SIMS = 800  # 어려움 한 수에 돌려 보는 최대 후보 — 한 수 계산이 1.5초를 넘지 않게


def _edge_dist(x: float, y: float) -> float:
    return min(x, y, SIZE - x, SIZE - y)


def _edges(x: float, y: float) -> list:
    """가까운 가장자리 쪽 방향 — 가까운 순서."""
    return [d for _, d in sorted([(y, (0.0, -1.0)), (SIZE - y, (0.0, 1.0)), (x, (-1.0, 0.0)), (SIZE - x, (1.0, 0.0))])]


def _score(stones: list, before: list, seat: int, shots_after: int) -> float:
    mine = sum(1 for i, s in enumerate(stones) if s[2] and owner(i) == seat)
    theirs = sum(1 for i, s in enumerate(stones) if s[2] and owner(i) != seat)
    mine0 = sum(1 for i, s in enumerate(before) if s[2] and owner(i) == seat)
    theirs0 = sum(1 for i, s in enumerate(before) if s[2] and owner(i) != seat)
    if theirs == 0 and mine > 0:
        return 1e6
    if mine == 0:
        return -1e6 if theirs > 0 else -5e5
    if shots_after >= MAX_SHOTS:
        return 1e6 if mine > theirs else (-1e6 if mine < theirs else -5e5)
    score = 1000.0 * (theirs0 - theirs) - 1150.0 * (mine0 - mine)
    for i, s in enumerate(stones):
        if not s[2]:
            continue
        e = min(_edge_dist(s[0], s[1]), 220.0)
        if owner(i) == seat:
            score += e * 0.35  # 내 알은 가장자리에서 멀수록 안전
        else:
            score += (220.0 - e) * 0.12  # 상대 알이 가장자리에 붙어 있으면 다음에 떨어뜨리기 쉽다
    return score


def _candidates(st: dict, seat: int, level: str) -> list:
    pairs_n, aims, powers, _, _ = LEVEL.get(level, LEVEL["normal"])
    stones = st["stones"]
    mine = [i for i, s in enumerate(stones) if s[2] and owner(i) == seat]
    theirs = [i for i, s in enumerate(stones) if s[2] and owner(i) != seat]
    pairs = sorted(
        ((stones[s][0] - stones[t][0]) ** 2 + (stones[s][1] - stones[t][1]) ** 2, s, t) for s in mine for t in theirs
    )[:pairs_n]
    out = []
    seen = set()
    for _, s, t in pairs:
        sx, sy = stones[s][0], stones[s][1]
        tx, ty = stones[t][0], stones[t][1]
        angles = []
        if "direct" in aims:
            angles.append(math.atan2(ty - sy, tx - sx))
        edges = _edges(tx, ty)
        for k, name in ((0, "edge"), (1, "edge2")):
            if name not in aims:
                continue
            ex, ey = edges[k]
            gx, gy = tx - ex * 2 * RADIUS * 0.98, ty - ey * 2 * RADIUS * 0.98  # 맞힐 때 내 알 중심이 있어야 할 곳
            dx, dy = gx - sx, gy - sy
            d = math.hypot(dx, dy)
            if d < RADIUS or (dx * ex + dy * ey) / d < 0.25:  # 너무 비스듬하면 그 쪽으로 못 민다
                continue
            angles.append(math.atan2(dy, dx))
        for a in angles:
            for pw in powers:
                key = (s, round(a, 3), pw)
                if key not in seen:
                    seen.add(key)
                    out.append((s, a, pw))
    return out


def choose(st: dict, seat: int, level: str, rng) -> tuple:
    """컴퓨터가 튕길 (알, 각도, 세기)."""
    _, _, _, jitter_a, jitter_p = LEVEL.get(level, LEVEL["normal"])
    stones = st["stones"]
    shots_after = int(st.get("shots", 0)) + 1
    cands = _candidates(st, seat, level)
    if level == "hard":
        cands = cands[:HARD_MAX_SIMS]
    best, best_score = None, -math.inf
    for s, a, pw in cands:
        res = simulate(stones, s, a, pw, record=False)
        sc = _score(res["stones"], stones, seat, shots_after)
        if sc > best_score + 1e-9:
            best, best_score = (s, a, pw), sc
    if best is None:  # 후보가 없을 일은 없지만(판이 끝나지 않았으면 서로 알이 있다) — 아무 내 알이나 살짝
        mine = [i for i, x in enumerate(stones) if x[2] and owner(i) == seat]
        best = (mine[0], -math.pi / 2 if seat == 0 else math.pi / 2, 0.3)
    s, a, pw = best
    a += rng.gauss(0.0, jitter_a)
    pw = min(1.0, max(0.15, pw * (1.0 + rng.gauss(0.0, jitter_p))))
    return s, a, pw
