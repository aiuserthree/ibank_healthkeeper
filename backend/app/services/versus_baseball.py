"""숫자 야구 대전 엔진 — 서로 몰래 정한 세 자리 숫자를 스트라이크 · 볼 힌트로 먼저 맞힌다. 직원끼리 또는 컴퓨터와.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/baseball.html.

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 0~9 중 서로 다른 숫자 3개로 내 숫자를 몰래 정한다(0이 맨 앞이어도 된다). 둘 다 정하면 경기 시작.
  · 먼저 던지는 사람이 「초」, 나중 사람이 「말」 — 한 회에 한 번씩 번갈아 상대 숫자를 추측해 던진다.
  · 답: 숫자와 자리가 모두 맞으면 스트라이크(S), 숫자만 맞으면 볼(B), 하나도 없으면 아웃(OUT).
  · 3스트라이크면 맞힌 것. 「초」가 먼저 맞혀도 「말」은 그 회에 마지막 한 번을 던진다 — 둘 다 맞히면 무승부.
    (먼저 던지는 쪽이 한 번 더 던지는 일이 없게)
  · 12회까지 아무도 못 맞히면 무승부. 같은 숫자는 두 번 던질 수 없다.
  · 한 차례 기한은 24시간 — 넘기면 시간 초과로 진다. 단 「초」가 맞힌 뒤 「말」이 마지막 공을 던지지 않고 기한을 넘기면
    「초」의 3스트라이크 승으로 끝난다(on_timeout). 「초」가 맞힌 판은 「말」이 기권해도 도장 · 순위에 센다(counts).

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data)
  {"secret": "012"}             내 숫자 정하기(phase "setup") — 둘이 따로 정하므로 seq 확인은 하지 않는다(STALE_CHECK False)
  {"guess": "345", "n": 2}      던지기(phase "play") — n 은 화면이 본 내 추측 수. 다르면 MATCH_STALE(옛 화면 · 다른 탭에서 두 번 던지기 막기)

판(m.state) — 숨긴 숫자는 view 가 걸러 보낸다(끝나기 전에는 상대 숫자를 절대 보내지 않는다)
  p: [먼저 id, 나중 id](컴퓨터는 BOT_ID) · secret: {str(id): "012"}(정한 사람만) · phase: setup · play · done
  turn: 던질 자리(0 · 1) · last: 「초」가 3스트라이크 — 「말」의 마지막 한 번
  log: [{"s": 자리, "g": "345", "k": 스트라이크, "b": 볼}] — 던진 순서. 자리 0 · 1 이 번갈아 던지므로 log[i] 는 i // 2 + 1 회
"""

from __future__ import annotations

import random
from collections import Counter
from datetime import datetime
from itertools import permutations
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "baseball"
NAME = "숫자 야구"
REASONS = {"HIT": "3스트라이크", "BOTH": "같은 회에 둘 다 맞힘", "INNINGS": "12회까지 승부 없음"}
DRAWS = ("BOTH", "INNINGS")  # 컴퓨터전에서 무승부로 칠 끝
STALE_CHECK = False  # 숫자는 둘이 따로 정한다 — 던질 때는 data["n"] 으로 직접 확인
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

MAX_INNINGS = 12  # 이 회까지 아무도 못 맞히면 무승부
MIN_GUESSES = 6  # 기권 · 시간 초과로 끝난 판은 3회까지(추측 6번) 마친 판만 도장 · 순위에 센다
DIGITS = "0123456789"
ALL = tuple("".join(x) for x in permutations(DIGITS, 3))  # 나올 수 있는 숫자 720개
# 컴퓨터가 지난 단서를 기억할 확률 — 바로 앞 단서는 늘 기억한다. 어려움은 기억을 다 쓰고 가장 많이 좁히는 수를 고른다.
# 1만 판 흉내 결과 평균 던진 수: 쉬움 7.7 · 보통 6.1 · 어려움 5.0 (사람은 보통 6~8)
BOT_MEMORY = {"easy": 0.3, "normal": 0.6}

register_messages(
    {
        "BASEBALL_BAD_NUMBER": "0~9 중 서로 다른 숫자 3개를 골라 주세요.",
        "BASEBALL_REPEAT": "이미 던진 숫자예요. 다른 숫자를 골라 주세요.",
        "BASEBALL_SET_FIRST": "먼저 내 숫자를 정해 주세요.",
        "BASEBALL_ALREADY_SET": "숫자는 이미 정했어요.",
    },
    {"BASEBALL_BAD_NUMBER": 400, "BASEBALL_REPEAT": 400, "BASEBALL_SET_FIRST": 409, "BASEBALL_ALREADY_SET": 409},
)


# ---------- 숫자 ----------
def judge(guess: str, secret: str) -> tuple:
    """(스트라이크, 볼) — 숫자와 자리가 맞으면 스트라이크, 숫자만 맞으면 볼."""
    k = sum(1 for a, b in zip(guess, secret) if a == b)
    return k, len(set(guess) & set(secret)) - k


def _number(raw) -> str:
    """화면이 보낸 숫자 — 0~9 서로 다른 세 글자만. 그 밖의 글자(전각 · 다른 나라 숫자 포함)는 막는다."""
    if not isinstance(raw, str) or len(raw) != 3 or any(c not in DIGITS for c in raw) or len(set(raw)) != 3:
        raise_app_error("BASEBALL_BAD_NUMBER")
    return raw


def _seat(st: dict, member_id: int) -> int:
    if member_id not in st["p"]:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    return st["p"].index(member_id)


def _mine(st: dict, seat: int) -> list:
    return [e for e in st["log"] if e["s"] == seat]


# ---------- 판 ----------
def start(m, players: tuple, rnd) -> dict:
    p = [int(players[0]), int(players[1])]
    # 컴퓨터는 처음부터 숫자를 정해 둔다 — 사람만 정하면 바로 시작
    secret = {str(x): "".join(rnd.sample(DIGITS, 3)) for x in p if x == BOT_ID}
    return {"p": p, "secret": secret, "phase": "setup", "turn": 0, "last": False, "log": []}


def waiting_for(m) -> set:
    st = m.state
    if st["phase"] == "setup":
        return {x for x in st["p"] if not st["secret"].get(str(x))}
    if st["phase"] == "play":
        return {st["p"][st["turn"]]}
    return set()


def _pitch(st: dict, seat: int, guess: str) -> Optional[tuple]:
    """한 번 던진다 — 답을 기록하고, 회가 끝났으면 승부를 본다."""
    rival = st["p"][1 - seat]
    k, b = judge(guess, st["secret"][str(rival)])
    st["log"].append({"s": seat, "g": guess, "k": k, "b": b})
    if seat == 0:  # 초 — 맞혀도 말의 마지막 한 번을 기다린다
        if k == 3:
            st["last"] = True
        st["turn"] = 1
        return None
    # 말 — 한 회가 끝난다
    outcome = None
    if st["last"]:
        outcome = (None, "BOTH") if k == 3 else (st["p"][0], "HIT")
    elif k == 3:
        outcome = (st["p"][1], "HIT")
    elif len(st["log"]) >= MAX_INNINGS * 2:
        outcome = (None, "INNINGS")
    if outcome:
        st["phase"] = "done"
        return outcome
    st["turn"] = 0
    return None


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    seat = _seat(st, member_id)
    if st["phase"] == "setup":
        if "secret" not in data:
            raise_app_error("BASEBALL_SET_FIRST")
        if st["secret"].get(str(member_id)):
            raise_app_error("BASEBALL_ALREADY_SET")
        st["secret"][str(member_id)] = _number(data.get("secret"))
        if all(st["secret"].get(str(x)) for x in st["p"]):
            st["phase"], st["turn"] = "play", 0
        return None
    if st["phase"] != "play":
        raise_app_error("MATCH_NOT_ACTIVE")
    if "guess" not in data:
        raise_app_error("BASEBALL_ALREADY_SET" if "secret" in data else "MATCH_BAD_MOVE")
    if st["p"][st["turn"]] != member_id:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    mine = _mine(st, seat)
    n = data.get("n")
    if type(n) is not int or n != len(mine):  # bool(True == 1)도 막는다
        raise_app_error("MATCH_STALE")
    guess = _number(data.get("guess"))
    if any(e["g"] == guess for e in mine):
        raise_app_error("BASEBALL_REPEAT")
    return _pitch(st, seat, guess)


# ---------- 컴퓨터 ----------
def _fits(clues: list, x: str) -> bool:
    return all(judge(g, x) == r for g, r in clues)


def bot_guess(clues: list, level: str, rnd: random.Random) -> str:
    """지금까지의 단서 [(던진 수, (S, B)), ...] 로 다음에 던질 숫자를 고른다."""
    tried = {g for g, _ in clues}
    if level == "hard":
        if not clues:  # 첫 공은 어느 숫자나 같다
            return rnd.choice(ALL)
        left = [x for x in ALL if x not in tried and _fits(clues, x)]
        if not left:  # 단서가 서로 맞지 않을 때(생길 일은 없다) — 아무거나
            return rnd.choice([x for x in ALL if x not in tried])
        if len(left) <= 2:
            return rnd.choice(left)
        pool = set(left)
        best, best_key = [], None
        for g in ALL:
            if g in tried:
                continue
            groups = Counter(judge(g, x) for x in left)
            # 답을 듣고 남을 후보가 가장 적은 수 — 같으면 정답일 수 있는 수를 먼저
            key = (sum(v * v for v in groups.values()), g not in pool)
            if best_key is None or key < best_key:
                best, best_key = [g], key
            elif key == best_key:
                best.append(g)
        return rnd.choice(best)
    memory = BOT_MEMORY.get(level, BOT_MEMORY["normal"])
    keep = [c for i, c in enumerate(clues) if i == len(clues) - 1 or rnd.random() < memory]
    left = [x for x in ALL if x not in tried and _fits(keep, x)]
    return rnd.choice(left or [x for x in ALL if x not in tried])


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    if st["phase"] != "play" or st["p"][st["turn"]] != BOT_ID:
        return None
    seat = st["p"].index(BOT_ID)
    clues = [(e["g"], (e["k"], e["b"])) for e in _mine(st, seat)]
    return _pitch(st, seat, bot_guess(clues, level, random.Random()))


# ---------- 기한 · 도장 · 순위 ----------
def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다. 「초」가 이미 맞혔는데 「말」이 마지막 공을 던지지 않았으면 「초」의 3스트라이크 승(HIT) —
    진 쪽이 기다리기만 해서 맞힌 사람의 승을 시간 초과로 바꾸지 못하게.
    그 밖에는 기본 규칙과 같다 — 기다리던 사람이 한 명이면 그 상대가 이기고(TIMEOUT), 둘 다(아무도 숫자를 안 정함)면 무승부."""
    st = m.state or {}
    p = st.get("p") or []
    if st.get("phase") == "play" and st.get("last") and len(p) == 2:
        return p[0], "HIT"
    late = [x for x in waiting_for(m) if x != BOT_ID]
    if len(late) == 1 and late[0] in p:
        return p[1 - p.index(late[0])], "TIMEOUT"  # 상대가 컴퓨터면 BOT_ID — match.py 가 컴퓨터 승으로 적는다
    return None, "TIMEOUT_DRAW"


def counts(m) -> bool:
    """기권 · 시간 초과로 끝난 판은 3회까지 마친 판만 센다 — 바로 기권해 도장 · 승수를 얻지 못하게.
    단 「초」가 이미 맞힌 판(마지막 기회)은 승부가 난 판이라 몇 회든 센다 — 「말」이 기권해도 맞힌 사람의 승은 남는다."""
    if m.end_reason in ("RESIGN", "TIMEOUT", "TIMEOUT_DRAW"):
        st = m.state or {}
        return bool(st.get("last")) or len(st.get("log") or []) >= MIN_GUESSES
    return True


# ---------- 화면 ----------
def _inning(st: dict, done: bool) -> tuple:
    """(회, 초 · 말) — 숫자를 정하는 중(또는 던지기 전에 끝난 판)이면 0회, 끝난 판은 마지막 회."""
    n = len(st["log"])
    if done:
        return (n + 1) // 2, None
    if st["phase"] == "setup":
        return 0, None
    return n // 2 + 1, "top" if st["turn"] == 0 else "bottom"


def view(m, member_id: int, board: bool) -> dict:
    st = m.state
    done = m.status == "DONE"  # 기권 · 시간 초과로 끝난 판은 st["phase"] 가 그대로라 상태로 본다
    inning, half = _inning(st, done)
    out = {
        "phase": "done" if done else st["phase"], "inning": inning, "half": half, "maxInnings": MAX_INNINGS,
        "lastChance": bool(st.get("last")) and not done,
    }
    if not board:  # 목록 한 줄 — 숫자 · 기록은 보내지 않는다
        return out
    seat = st["p"].index(member_id) if member_id in st["p"] else None
    rival = st["p"][1 - seat] if seat is not None else None
    out.update({
        "mySeat": seat,
        "mySecret": st["secret"].get(str(member_id)),
        "mySet": bool(st["secret"].get(str(member_id))),
        "rivalSet": rival is not None and bool(st["secret"].get(str(rival))),
        # 상대 숫자는 경기가 끝난 뒤에만
        "rivalSecret": st["secret"].get(str(rival)) if done and rival is not None else None,
        "log": [
            {"mine": e["s"] == seat, "guess": e["g"], "strike": e["k"], "ball": e["b"], "inning": i // 2 + 1}
            for i, e in enumerate(st["log"])
        ],
    })
    return out
