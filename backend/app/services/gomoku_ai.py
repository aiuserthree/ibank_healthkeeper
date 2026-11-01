"""오목 컴퓨터 상대 — 다섯 칸 묶음마다 돌 수를 세어 자리 점수를 매긴다.

쉬움은 실수를 하고, 보통은 공격과 수비를 함께 보고, 어려움은 내 수 뒤 상대의 최선까지 내다본다.
"""

from __future__ import annotations

import random
from typing import Optional

SIZE = 15
LEVELS = ("easy", "normal", "hard")
DIRS = ((1, 0), (0, 1), (1, 1), (1, -1))
WEIGHT = (0, 1, 12, 120, 1500, 200_000)  # 다섯 칸 안에 내 돌이 n개 — 5는 승리
WIN = WEIGHT[5]


def _grid(moves: list) -> dict:
    return {(p[0], p[1]): i % 2 for i, p in enumerate(moves)}


def _gain(grid: dict, x: int, y: int, color: int) -> int:
    """(x, y)에 color를 두면 얻는 점수."""
    total = 0
    for dx, dy in DIRS:
        for back in range(5):
            mine, ok = 1, True
            for k in range(5):
                cx, cy = x + dx * (k - back), y + dy * (k - back)
                if not (0 <= cx < SIZE and 0 <= cy < SIZE):
                    ok = False
                    break
                if k == back:
                    continue
                stone = grid.get((cx, cy))
                if stone is None:
                    continue
                if stone != color:
                    ok = False
                    break
                mine += 1
            if ok:
                total += WEIGHT[mine]
    return total


def _near(grid: dict) -> list:
    """돌 주변 두 칸 안의 빈자리만 후보로 본다."""
    cells = set()
    for x, y in grid:
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                c = (x + dx, y + dy)
                if 0 <= c[0] < SIZE and 0 <= c[1] < SIZE and c not in grid:
                    cells.add(c)
    return sorted(cells)


def _ranked(grid: dict, color: int, cells: list) -> list:
    rows = []
    for x, y in cells:
        attack, block = _gain(grid, x, y, color), _gain(grid, x, y, 1 - color)
        rows.append((attack + block * 0.9, attack, block, x, y))
    rows.sort(reverse=True)
    return rows


def _winning(grid: dict, color: int) -> list:
    """지금 두면 바로 이기는 자리."""
    return [c for c in _near(grid) if _gain(grid, c[0], c[1], color) >= WIN]


def _forced_win(grid: dict, color: int, depth: int) -> Optional[tuple]:
    """넉 수를 이어 가며 상대를 막게 만들어 이기는 첫 수를 찾는다."""
    fours = [c for c in _near(grid) if _gain(grid, c[0], c[1], color) >= WEIGHT[4]]
    fours.sort(key=lambda c: -_gain(grid, c[0], c[1], color))
    for c in fours[:10]:
        grid[c] = color
        wins = _winning(grid, color)
        found = False
        if len(wins) >= 2:
            found = True                   # 두 곳을 한 번에 막을 수 없다
        elif len(wins) == 1 and depth > 0 and not _winning(grid, 1 - color):
            grid[wins[0]] = 1 - color      # 상대는 여기를 막을 수밖에 없다
            found = _forced_win(grid, color, depth - 1) is not None
            grid.pop(wins[0])
        grid.pop(c)
        if found:
            return c
    return None


def choose(moves: list, level: str) -> Optional[list]:
    """다음 수 [x, y]. 둘 곳이 없으면 None."""
    if not moves:
        return [7 + random.randint(-1, 1), 7 + random.randint(-1, 1)]
    color = len(moves) % 2
    grid = _grid(moves)
    cells = _near(grid)
    if not cells:
        cells = [(x, y) for x in range(SIZE) for y in range(SIZE) if (x, y) not in grid]
    if not cells:
        return None
    rows = _ranked(grid, color, cells)
    for row in rows:                       # 이기는 수는 어느 단계든 둔다
        if row[1] >= WIN:
            return [row[3], row[4]]
    must_block = [r for r in rows if r[2] >= WIN]
    if level == "easy":
        if must_block and random.random() < 0.6:
            return [must_block[0][3], must_block[0][4]]
        top = rows[: 6]
        pick = random.choice(top)
        return [pick[3], pick[4]]
    if must_block:
        return [must_block[0][3], must_block[0][4]]
    if level == "normal":
        best = rows[0][0]
        pool = [r for r in rows[:4] if r[0] >= best * 0.85]
        pick = random.choice(pool)
        return [pick[3], pick[4]]
    # 어려움 — 필승 수가 있으면 두고, 없으면 상위 후보마다 상대의 최선과 필승 수를 살펴 고른다
    win = _forced_win(grid, color, 3)
    if win:
        return [win[0], win[1]]
    best_score, best_move = None, None
    for score, _, _, x, y in rows[:10]:
        grid[(x, y)] = color
        follow = _ranked(grid, 1 - color, _near(grid))
        doomed = _forced_win(grid, 1 - color, 2) is not None
        grid.pop((x, y))
        reply = follow[0][1] if follow else 0
        value = score - reply * 0.7 - (WIN if doomed else 0)
        if best_score is None or value > best_score:
            best_score, best_move = value, [x, y]
    return best_move
