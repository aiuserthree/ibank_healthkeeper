"""사내 고스톱 — 둘이 치는 고스톱(맞고) 대전 엔진. 직원끼리 또는 컴퓨터와. 점수는 판의 결과일 뿐(돈 · 내기 없음).

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/gostop.html — 패 그림 · 화면용 점수 계산이 그 안에 있고, 패 번호 · 종류는 이 파일 KINDS 와 같다.

규칙(맞고) — 화면의 「규칙 보기」와 같은 말
  · 화투 48장(조커 · 보너스피 없음). 각자 손패 10장, 바닥 8장, 나머지 20장은 더미.
    같은 달 4장이 한 사람 손이나 바닥에 오면 다시 나눈다(총통 없음).
  · 내 차례: 손패 1장을 내 같은 달 바닥 패와 짝을 짓고, 더미 맨 위 1장을 뒤집어 또 짝을 짓는다. 짝 지은 패는 내 것.
    바닥에 같은 달이 2장이면 1장을 골라 먹고(종류가 같으면 아무거나), 3장이면 4장을 다 먹는다.
  · 쪽(낸 패가 짝이 없었는데 뒤집은 패가 같은 달) · 따닥(바닥 2장 + 낸 패 + 뒤집은 패가 모두 같은 달) ·
    뻑 먹기(뻑으로 쌓인 3장을 먹음) · 쓸(바닥을 다 비움) · 폭탄 — 상대 피 1장을 가져온다. 자뻑(내가 싼 뻑을 내가 먹음)은 2장.
    가져오는 피는 한 장짜리 피부터, 없으면 쌍피. 국진(9월 열끗)은 가져오지 않는다.
  · 뻑(설사): 낸 패로 짝을 지었는데 뒤집은 패도 같은 달이면 3장이 바닥에 그대로 남는다.
  · 흔들기: 같은 달 3장을 들고 바닥에 그 달이 없으면 보여 주고 낼 수 있다 — 이기면 ×2(흔들 때마다).
    폭탄: 같은 달 3장을 들고 바닥에 나머지 1장이 있으면 3장을 한꺼번에 내 4장을 먹는다 — ×2, 피 1장,
    그 뒤 두 번은 손패를 내지 않고 더미만 뒤집어도 된다(손패가 2장 적으니 차례 수는 같다).
  · 점수: 광 3장 3점(비광이 끼면 2점) · 4장 4점 · 5장 15점 / 열끗 5장 1점부터 1장마다 +1, 고도리 5점 /
    띠 5장 1점부터 +1, 홍단 · 청단 · 초단 각 3점 / 피 10장 1점부터 +1(쌍피는 2장). 국진은 점수가 더 나는 쪽(열끗 · 쌍피)으로 센다.
  · 7점이 나면 고(계속) 또는 스톱(끝). 고를 한 뒤에는 그때보다 점수가 더 나야 다시 묻는다.
    더 칠 차례가 없을 때(손패를 다 냈고 더미만 뒤집기도 남지 않음 — 먼저 친 사람의 마지막 차례도) 나면 고를 묻지 않고 바로 스톱.
    고 1번 +1점, 2번 +2점, 3번부터는 (점수 + 2) × 2 · × 4 …
  · 스톱하면 이긴다. 피박(피로 점수가 났는데 상대 피 5장 이하) · 광박(광으로 점수가 났는데 상대 광 0장) ·
    멍박(열끗 7장 이상) · 고박(상대가 고를 했었는데 내가 스톱) · 흔들기 · 폭탄은 각각 ×2.
  · 더미가 다 떨어질 때까지 아무도 스톱하지 못하면 나가리(무승부). 첫뻑 · 연뻑 같은 보너스는 없다.

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 잘못되면 GOSTOP_BAD · GOSTOP_PICK · GOSTOP_PHASE
  phase "play"   {"card": 패, "take": 바닥 패?, "shake": true?, "bomb": true?}   손패 1장을 낸다
                   take — 바닥에 같은 달 2장의 종류가 다를 때 먹을 패(없으면 GOSTOP_PICK). 낸 뒤 따닥이 나면 쓰지 않는다
                   shake — 같은 달 3장 · 바닥에 그 달 없음 · 그 달을 처음 흔들 때만. bomb — 같은 달 3장 · 바닥에 1장일 때만
                 {"flip": true}                                                    폭탄 뒤 — 손패 없이 더미만 뒤집기(mine.bombs > 0)
  phase "pick"   {"pick": 바닥 패}        뒤집은 패로 먹을 바닥 패 고르기(gs.pick.opts 가운데)
  phase "gostop" {"go": true} · {"stop": true}
  한 차례 = play(→ pick)(→ gostop). 같은 사람이 이어서 행동하므로 seq 는 행동마다 1씩 오른다(STALE_CHECK).

판(m.state) — 숨긴 것(상대 손패 · 더미 순서)은 view 가 걸러 보낸다
  p: [먼저 하는 id, 나중 id](컴퓨터는 BOT_ID) · hands · floor(놓인 순서) · deck(맨 앞이 다음 패) · piles(먹은 패)
  turn: 차례 자리(0 · 1) · phase: play · pick · gostop · done · pick: {card, opts} · bombs: 더미만 뒤집을 수 있는 남은 횟수
  go · goAt(마지막 고 때 점수) · shake(흔들기 · 폭탄 이름 목록) · shook(흔든 달) · stack({달: 뻑 싼 자리})
  log: [{v, p, s: [[종류, 값...]...]}] — 최근 행동(공개 정보만). v = 그 행동 뒤의 seq
       종류: hand(낸 패) · bomb(폭탄으로 낸 3장) · shake(흔든 3장 — 보여 준 패) · flip(뒤집은 패) · take(먹은 패들) ·
             steal(상대에게서 가져온 피들) · ev(이름[, 달]: 쪽 · 뻑 · 자뻑 · 뻑 먹기 · 따닥 · 쓸 · 흔들기 · 폭탄 · 나가리) ·
             go(고 횟수) · stop(최종 점수)
  turns: 최근 차례가 시작될 때의 공개된 판(손패는 장수만) — 상대 차례를 처음부터 다시 보여 주는 출발점
  end: 끝난 뒤 점수 풀이 {winner, base, parts, n, go, mults, points} · 나가리면 {winner: None, nagari: True}

화면(view → payload 의 gs) — 「me」 · 「rival」은 보는 사람 기준
  목록 한 줄: {score: [내 점수, 상대 점수], points?: 스톱 점수}
  대국 화면: goal · first(먼저 친 쪽) · turn · phase · hand(내 손패) · rivalHand(상대 손패 장수) · floor · deck(남은 장수) ·
    pile · rivalPile · score · rivalScore(score() 결과) · mine · rival({go, shake, bombs}) · shook(내가 흔든 달) ·
    stack({달: me|rival}) · pick({card, opts} — 내가 고를 차례일 때도, 상대가 고르는 중일 때도 공개된 바닥 패) ·
    log([{v, me, s}]) · replay(상대의 가장 최근 차례가 시작될 때의 판 {v, floor, pile, rivalPile, rivalHand, deck, mine, rival, stack} 또는 None) ·
    end(점수 풀이, winner 는 me|rival|None) · rivalHandCards(끝난 판만 — 상대가 들고 있던 패)
"""

from __future__ import annotations

import random
from datetime import datetime
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "gostop"
NAME = "고스톱"
REASONS = {"STOP": "스톱", "NAGARI": "나가리"}
DRAWS = ("NAGARI",)  # 컴퓨터전에서 무승부로 칠 끝
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
MIN_TURNS = 10  # 기권 · 시간 초과로 끝난 판은 둘이 합쳐 이만큼 친 판(차례 수)만 도장 · 순위에 센다
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

GOAL = 7  # 맞고 — 7점부터 고 · 스톱
HAND = 10
FLOOR = 8
DECK = 48 - HAND * 2 - FLOOR  # 처음 더미 장수(20) — 차례마다 1장씩 뒤집으니 한 판의 차례 수와 같다
LOG_KEEP = 12  # 화면이 다시 보여 줄 최근 행동 수 — 상대가 한 차례에 하는 행동(패 · 고르기 · 고)보다 넉넉히
TURNS_KEEP = 3  # 다시 보기 출발점으로 남겨 둘 최근 차례 수(한 차례는 행동 3번 이하라 LOG_KEEP 안에 든다)

# 패 번호 0~47 — 달 = 번호 // 4 + 1. 종류: g 광 · y 열끗 · t 띠 · p 피 · pp 쌍피
KINDS = (
    "g", "t", "p", "p",    # 1월 송학
    "y", "t", "p", "p",    # 2월 매조
    "g", "t", "p", "p",    # 3월 벚꽃
    "y", "t", "p", "p",    # 4월 흑싸리
    "y", "t", "p", "p",    # 5월 난초
    "y", "t", "p", "p",    # 6월 모란
    "y", "t", "p", "p",    # 7월 홍싸리
    "g", "y", "p", "p",    # 8월 공산
    "y", "t", "p", "p",    # 9월 국진
    "y", "t", "p", "p",    # 10월 단풍
    "g", "pp", "p", "p",   # 11월 오동
    "g", "y", "t", "pp",   # 12월 비
)
BIRDS = frozenset({4, 12, 29})  # 고도리 — 2월 · 4월 · 8월 새
KOOKJIN = 32  # 9월 열끗(술잔) — 쌍피로도 쓸 수 있다
RAIN = 44  # 비광
HONG = frozenset({1, 5, 9})  # 홍단 1 · 2 · 3월
CHUNG = frozenset({21, 33, 37})  # 청단 6 · 9 · 10월
CHO = frozenset({13, 17, 25})  # 초단 4 · 5 · 7월
SETS = (BIRDS, HONG, CHUNG, CHO)

register_messages({
    "GOSTOP_BAD": "낼 수 없는 패예요.",
    "GOSTOP_PICK": "먹을 바닥 패를 골라 주세요.",
    "GOSTOP_PHASE": "지금은 할 수 없어요. 화면을 새로 열어 주세요.",
})


def _mon(c: int) -> int:
    return c // 4 + 1


def _card(v) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v < 48:
        raise_app_error("GOSTOP_BAD")
    return v


# ── 점수 ──────────────────────────────────────────────────────────────────────

def _parts(pile, kook_pi: bool) -> dict:
    g = [c for c in pile if KINDS[c] == "g"]
    y = {c for c in pile if KINDS[c] == "y" and not (kook_pi and c == KOOKJIN)}
    t = {c for c in pile if KINDS[c] == "t"}
    pi = sum(2 if KINDS[c] == "pp" or c == KOOKJIN else 1 for c in pile
             if KINDS[c] in ("p", "pp") or (kook_pi and c == KOOKJIN))
    ng = len(g)
    gp = 15 if ng >= 5 else 4 if ng == 4 else (2 if RAIN in g else 3) if ng == 3 else 0
    yp = max(0, len(y) - 4) + (5 if BIRDS <= y else 0)
    tp = max(0, len(t) - 4) + sum(3 for s in (HONG, CHUNG, CHO) if s <= t)
    pp = max(0, pi - 9)
    return {"g": gp, "y": yp, "t": tp, "p": pp, "total": gp + yp + tp + pp,
            "n": {"g": ng, "y": len(y), "t": len(t), "p": pi}, "kookPi": kook_pi}


def score(pile) -> dict:
    """먹은 패의 점수 — 국진은 점수가 더 나는 쪽으로(같으면 열끗)."""
    best = _parts(pile, False)
    if KOOKJIN in pile:
        alt = _parts(pile, True)
        if alt["total"] > best["total"]:
            best = alt
    return best


def _pi_count(pile) -> int:
    """피박을 볼 때의 피 장수 — 진 쪽은 국진을 피로 돌려 피박을 피할 수 있다."""
    return _parts(pile, KOOKJIN in pile)["n"]["p"]


def _settle_with(st: dict, w: int, kook_pi: bool) -> dict:
    lose = 1 - w
    s = _parts(st["piles"][w], kook_pi)
    base, go = s["total"], st["go"][w]
    pts = base + min(go, 2)
    if go >= 3:
        pts *= 2 ** (go - 2)
    mults = list(st["shake"][w])
    if s["p"] > 0 and _pi_count(st["piles"][lose]) <= 5:
        mults.append("피박")
    if s["g"] > 0 and not any(KINDS[c] == "g" for c in st["piles"][lose]):
        mults.append("광박")
    if s["n"]["y"] >= 7:
        mults.append("멍박")
    if st["go"][lose] > 0:
        mults.append("고박")
    return {"winner": w, "base": base, "parts": {k: s[k] for k in ("g", "y", "t", "p")}, "n": s["n"],
            "go": go, "mults": mults, "points": pts * 2 ** len(mults)}


def _settle(st: dict, w: int) -> dict:
    """스톱한 사람(w)이 받을 점수 — 국진은 받을 점수가 더 큰 쪽으로 세되, 그렇게 세도 7점(GOAL)이 넘는 셈만 쓴다.
    (국진을 쌍피로 쳐야 7점이 되는 판을 열끗으로 쳐서 6점 + 멍박으로 정산하지 않게.) 화면 미리 보기(gostop.html 의 H.settle)와 같은 계산."""
    cands = [_settle_with(st, w, False)]
    if KOOKJIN in st["piles"][w]:
        cands.append(_settle_with(st, w, True))
    ok = [c for c in cands if c["base"] >= GOAL] or cands  # 스톱은 7점이 났을 때만 오므로 늘 하나는 남는다
    best = ok[0]
    for c in ok[1:]:
        if c["points"] > best["points"]:
            best = c
    return best


# ── 판 차리기 ─────────────────────────────────────────────────────────────────

def _has_four(cards) -> bool:
    count: dict = {}
    for c in cards:
        count[_mon(c)] = count.get(_mon(c), 0) + 1
    return any(n >= 4 for n in count.values())


def _deal(rnd) -> tuple:
    while True:  # 같은 달 4장이 한 손이나 바닥에 오면 다시 나눈다(총통 · 바닥 4장 없음)
        deck = list(range(48))
        rnd.shuffle(deck)
        hands = [sorted(deck[:HAND]), sorted(deck[HAND:HAND * 2])]
        floor = deck[HAND * 2:HAND * 2 + FLOOR]
        if not (_has_four(hands[0]) or _has_four(hands[1]) or _has_four(floor)):
            return hands, floor, deck[HAND * 2 + FLOOR:]


def start(m, players: tuple, rnd) -> dict:
    hands, floor, deck = _deal(rnd)
    st = {
        "p": list(players), "hands": hands, "floor": floor, "deck": deck, "piles": [[], []],
        "turn": 0, "phase": "play", "pick": None, "bombs": [0, 0], "go": [0, 0], "goAt": [0, 0],
        "shake": [[], []], "shook": [[], []], "stack": {}, "log": [], "turns": [], "end": None,
    }
    _snap(st, 0, 0)
    return st


def counts(m) -> bool:
    """끝까지 친 판(스톱 · 나가리)은 도장 · 순위에 센다. 기권 · 시간 초과는 둘이 합쳐 MIN_TURNS 차례 이상 친 판만
    (차례 수 = 뒤집은 더미 장수. 화면 목록의 「10차례 이상 친 판」과 같은 기준)."""
    if m.end_reason in REASONS:
        return True
    st = m.state or {}
    return "deck" in st and DECK - len(st["deck"]) >= MIN_TURNS


def _snap(st: dict, seat: int, v: int) -> None:
    """차례가 시작될 때의 공개된 판을 남긴다(손패는 장수만) — 상대가 이 차례를 처음부터 다시 볼 수 있게."""
    st["turns"] = [*st.get("turns", []), {
        "seat": seat, "v": v, "floor": list(st["floor"]), "piles": [list(x) for x in st["piles"]],
        "hands": [len(h) for h in st["hands"]], "deck": len(st["deck"]), "go": list(st["go"]),
        "shake": [list(x) for x in st["shake"]], "bombs": list(st["bombs"]), "stack": dict(st["stack"]),
    }][-TURNS_KEEP:]


def waiting_for(m) -> set:
    st = m.state
    if st.get("phase") == "done":
        return set()
    return {st["p"][st["turn"]]}


# ── 한 번의 행동 ──────────────────────────────────────────────────────────────

def _on_floor(st: dict, mon: int, but=None) -> list:
    return [c for c in st["floor"] if _mon(c) == mon and c != but]


def _take(st: dict, me: int, cards: list, steps: list) -> None:
    for c in cards:
        st["floor"].remove(c)
    st["piles"][me].extend(cards)
    steps.append(["take", list(cards)])


def _steal(st: dict, me: int, n: int, steps: list) -> None:
    """상대 피를 n 장 가져온다 — 한 장짜리 피부터, 없으면 쌍피. 국진은 열끗이라 가져오지 않는다."""
    other = st["piles"][1 - me]
    got = []
    for _ in range(n):
        one = next((c for c in other if KINDS[c] == "p"), None)
        if one is None:
            one = next((c for c in other if KINDS[c] == "pp"), None)
        if one is None:
            break
        other.remove(one)
        st["piles"][me].append(one)
        got.append(one)
    if got:
        steps.append(["steal", got])


def _choose(before: list, take) -> int:
    """바닥에 같은 달 2장 — 종류가 같으면 아무거나, 다르면 화면이 고른 것."""
    if take in before:
        return take
    if KINDS[before[0]] == KINDS[before[1]]:
        return before[0]
    raise_app_error("GOSTOP_PICK")


def _match(st: dict, me: int, card: int, before: list, take, steps: list) -> None:
    """패 하나(낸 패 또는 뒤집은 패)를 바닥의 같은 달과 짝 짓는다. before = 그 패를 빼고 바닥에 있던 같은 달."""
    n = len(before)
    if n == 1:
        _take(st, me, [card, before[0]], steps)
    elif n == 2:
        _take(st, me, [card, _choose(before, take)], steps)
    elif n >= 3:  # 뻑 또는 처음부터 3장 — 4장을 다 가져온다
        _take(st, me, [card, *before], steps)
        owner = st["stack"].pop(str(_mon(card)), None)
        if owner is not None:
            steps.append(["ev", "자뻑" if owner == me else "뻑 먹기", _mon(card)])
            _steal(st, me, 2 if owner == me else 1, steps)


def _resolve(st: dict, me: int, hand: Optional[int], take, steps: list):
    """낸 패(없으면 더미만)를 바닥에 놓은 뒤 더미를 뒤집고 짝을 짓는다."""
    hm = _mon(hand) if hand is not None else None
    before = _on_floor(st, hm, hand) if hand is not None else []
    if not st["deck"]:  # 차례 수와 더미 장수가 늘 맞으므로 오지 않는다 — 혹시 와도 낸 패만 짝 짓는다
        if hand is not None:
            _match(st, me, hand, before, take, steps)
        return _end_turn(st, me, steps)
    flip = st["deck"].pop(0)
    st["floor"].append(flip)
    steps.append(["flip", flip])
    fm = _mon(flip)
    if hand is not None and fm == hm:
        if not before:  # 쪽
            steps.append(["ev", "쪽"])
            _take(st, me, [hand, flip], steps)
            _steal(st, me, 1, steps)
        elif len(before) == 1:  # 뻑 — 3장이 바닥에 남는다
            st["stack"][str(hm)] = me
            steps.append(["ev", "뻑", hm])
        else:  # 따닥
            steps.append(["ev", "따닥"])
            _take(st, me, [*before, hand, flip], steps)
            _steal(st, me, 1, steps)
        return _end_turn(st, me, steps)
    if hand is not None:
        _match(st, me, hand, before, take, steps)
    fb = _on_floor(st, fm, flip)
    if len(fb) == 2 and KINDS[fb[0]] != KINDS[fb[1]]:
        st["phase"] = "pick"
        st["pick"] = {"card": flip, "opts": fb}
        return None
    _match(st, me, flip, fb, None, steps)
    return _end_turn(st, me, steps)


def _end_turn(st: dict, me: int, steps: list):
    st["phase"] = "play"
    st["pick"] = None
    if not st["floor"]:
        steps.append(["ev", "쓸"])
        _steal(st, me, 1, steps)
    sc = score(st["piles"][me])["total"]
    last = not st["deck"]  # 판의 마지막 차례(나중에 친 사람의 10번째)
    # 나는 더 칠 차례가 없다 — 손패도, 더미만 뒤집기도 남지 않음(먼저 친 사람의 마지막 차례는 더미가 1장 남아도 여기)
    no_more = last or not (st["hands"][me] or st["bombs"][me])
    if sc >= GOAL and sc > st["goAt"][me]:
        if no_more:  # 고를 해도 더 칠 수 없으니(나가리나 고박만 남는다) 묻지 않고 바로 스톱
            return _stop(st, me, steps)
        st["phase"] = "gostop"
        return None
    if last:
        st["phase"] = "done"
        st["end"] = {"winner": None, "nagari": True}
        steps.append(["ev", "나가리"])
        return (None, "NAGARI")
    st["turn"] = 1 - me
    return None


def _stop(st: dict, me: int, steps: list):
    st["phase"] = "done"
    st["end"] = _settle(st, me)
    steps.append(["stop", st["end"]["points"]])
    return (st["p"][me], "STOP")


def _play(st: dict, me: int, data: dict, steps: list):
    hand = st["hands"][me]
    if data.get("flip"):
        if st["bombs"][me] <= 0:
            raise_app_error("GOSTOP_BAD")
        st["bombs"][me] -= 1
        return _resolve(st, me, None, None, steps)
    card = _card(data.get("card"))
    if card not in hand:
        raise_app_error("GOSTOP_BAD")
    mon = _mon(card)
    mine = [c for c in hand if _mon(c) == mon]
    before = _on_floor(st, mon)
    if data.get("bomb"):
        if len(mine) != 3 or len(before) != 1:
            raise_app_error("GOSTOP_BAD")
        for c in mine:
            hand.remove(c)
        st["floor"].extend(mine)
        steps.append(["bomb", mine])
        steps.append(["ev", "폭탄"])
        _take(st, me, [*before, *mine], steps)
        st["shake"][me].append("폭탄")
        st["bombs"][me] += 2
        _steal(st, me, 1, steps)
        return _resolve(st, me, None, None, steps)
    if data.get("shake"):
        if len(mine) != 3 or before or mon in st["shook"][me]:
            raise_app_error("GOSTOP_BAD")
        st["shake"][me].append("흔들기")
        st["shook"][me].append(mon)
        steps.append(["shake", mine])
        steps.append(["ev", "흔들기"])
    take = data.get("take")
    take = _card(take) if take is not None else None
    take = _choose(before, take) if len(before) == 2 else None
    hand.remove(card)
    st["floor"].append(card)
    steps.append(["hand", card])
    return _resolve(st, me, card, take, steps)


def _pick(st: dict, me: int, data: dict, steps: list):
    pk = st["pick"] or {}
    c = _card(data.get("pick"))
    if c not in pk.get("opts", ()):
        raise_app_error("GOSTOP_PICK")
    _take(st, me, [pk["card"], c], steps)
    return _end_turn(st, me, steps)


def _gostop(st: dict, me: int, data: dict, steps: list):
    if data.get("stop"):
        return _stop(st, me, steps)
    if not data.get("go"):
        raise_app_error("GOSTOP_PHASE")
    st["go"][me] += 1
    st["goAt"][me] = score(st["piles"][me])["total"]
    steps.append(["go", st["go"][me]])
    st["phase"] = "play"
    st["turn"] = 1 - me
    return None


def _act(st: dict, me: int, data: dict, v: int):
    """자리 me 의 행동 하나 — 끝나면 (승자 id, 이유)."""
    if st.get("phase") == "done" or st["turn"] != me:
        raise_app_error("GOSTOP_PHASE")
    phase = st["phase"]
    keys = {"play": ("card", "flip"), "pick": ("pick",), "gostop": ("go", "stop")}[phase]
    if not any(k in data for k in keys):
        raise_app_error("GOSTOP_PHASE")
    steps: list = []
    out = {"play": _play, "pick": _pick, "gostop": _gostop}[phase](st, me, data, steps)
    st["log"] = [*st.get("log", []), {"v": v, "p": me, "s": steps}][-LOG_KEEP:]
    if st["phase"] != "done" and st["turn"] != me:
        _snap(st, st["turn"], v)
    return out


def _seat(st: dict, member_id: int) -> int:
    return st["p"].index(member_id)


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    return _act(st, _seat(st, member_id), data, int(st.get("_v", 0)) + 1)


# ── 화면 ──────────────────────────────────────────────────────────────────────

def _side(st: dict, i: int) -> dict:
    return {"go": st["go"][i], "shake": st["shake"][i], "bombs": st["bombs"][i]}


def _replay(st: dict, me: int, who) -> Optional[dict]:
    """상대의 가장 최근 차례가 시작될 때의 판 — 그 뒤 log 를 차례로 보여 주면 지금 판이 된다. 기록이 잘렸으면 None."""
    you = 1 - me
    log = st.get("log", [])
    for t in reversed(st.get("turns", [])):
        if t["seat"] != you or not any(e["p"] == you and e["v"] > t["v"] for e in log):
            continue
        if not log or log[0]["v"] > t["v"] + 1:
            return None
        return {
            "v": t["v"], "floor": t["floor"], "pile": t["piles"][me], "rivalPile": t["piles"][you],
            "rivalHand": t["hands"][you], "deck": t["deck"],
            "mine": {"go": t["go"][me], "shake": t["shake"][me], "bombs": t["bombs"][me]},
            "rival": {"go": t["go"][you], "shake": t["shake"][you], "bombs": t["bombs"][you]},
            "stack": {k: who(x) for k, x in t["stack"].items()},
        }
    return None


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    if "p" not in st or member_id not in st["p"]:
        return {}
    me = _seat(st, member_id)
    you = 1 - me
    mine, rival = score(st["piles"][me]), score(st["piles"][you])
    end = st.get("end")
    if not board:  # 목록 한 줄 — 점수만
        out = {"score": [mine["total"], rival["total"]]}
        if end and end.get("winner") is not None:
            out["points"] = end["points"]
        return {"gs": out}
    who = lambda i: None if i is None else ("me" if i == me else "rival")  # noqa: E731
    gs = {
        "goal": GOAL,
        "first": who(0),
        "turn": who(st["turn"]),
        "phase": st["phase"],
        "hand": list(st["hands"][me]),
        "rivalHand": len(st["hands"][you]),
        "floor": list(st["floor"]),
        "deck": len(st["deck"]),
        "pile": list(st["piles"][me]),
        "rivalPile": list(st["piles"][you]),
        "score": mine,
        "rivalScore": rival,
        "mine": _side(st, me),
        "rival": _side(st, you),
        "shook": list(st["shook"][me]),
        "stack": {k: who(v) for k, v in st["stack"].items()},
        "pick": st["pick"] if st["phase"] == "pick" else None,
        "log": [{"v": e["v"], "me": e["p"] == me, "s": e["s"]} for e in st.get("log", [])],
        "replay": _replay(st, me, who),
        "end": {**end, "winner": who(end.get("winner"))} if end else None,
    }
    if m.status == "DONE":  # 끝난 판은 상대 손패도 보여 준다
        gs["rivalHandCards"] = list(st["hands"][you])
    return {"gs": gs}


# ── 컴퓨터 ────────────────────────────────────────────────────────────────────
# 컴퓨터는 자기 손패 · 바닥 · 먹은 패만 본다(상대 손패 · 더미 순서는 모른다).
# 형세 = 점수 × 4 + 모으는 중인 광 · 고도리 · 단(상대가 한 장이라도 가진 묶음은 0) + 장수.
# 쉬움: 열에 넷은 아무 패나, 나머지는 짝 맞는 값 큰 패. 고는 반쯤 운에 맡긴다.
# 보통: 짝 맞는 값 큰 패, 짝이 없으면 아깝지 않은 패를 버린다(가끔 두 번째 수). 상대가 낮을 때만 고.
# 어려움: 보통에 더해 버린 패를 상대가 가져갈 확률 · 아무도 못 먹는 패(죽은 패) · 뻑 가져오기를 따진다.
#         고는 남은 차례 · 상대 점수 · 상대가 모으는 묶음을 보고 위험이 낮을 때만(두 번까지).
# (모의 대국 1000판 — 어려움은 보통을 54%, 쉬움을 64% 이기고 점수는 쉬움의 2배쯤. 보통은 쉬움을 60% 이긴다)

SMART = {"flip": 0.3, "steal": 1.2, "bomb": 2.0, "dead": 0.4, "mate": 0.5, "expose": 1.4, "shake": 0.2, "left": 0.4}


def _potential(pile: list, theirs: list) -> float:
    s = score(pile)
    v = s["total"] * 4.0
    n = s["n"]
    if n["g"] < 3:
        v += (0, 1.3, 3.4)[n["g"]] * (0.6 if RAIN in pile and n["g"] == 2 else 1)
    for group in SETS:
        if any(x in group for x in theirs):
            continue
        v += (0, 0.8, 2.6, 0)[sum(1 for x in group if x in pile)]
    v += min(n["y"], 5) * 0.5 + min(n["t"], 5) * 0.5 + min(n["p"], 10) * 0.45
    return v


def _gain(pile: list, theirs: list, cards: list) -> float:
    """cards 를 더 먹었을 때 늘어나는 형세."""
    return _potential([*pile, *cards], theirs) - _potential(pile, theirs)


def _unknown(st: dict, me: int) -> list:
    """컴퓨터가 모르는 패 — 더미와 상대 손패(어느 쪽인지는 모른다)."""
    seen = set(st["hands"][me]) | set(st["floor"]) | set(st["piles"][0]) | set(st["piles"][1])
    return [c for c in range(48) if c not in seen]


def _p_has(k: int, unknown: int, hand: int) -> float:
    """모르는 패 unknown 장 가운데 어떤 달이 k 장일 때, 상대 손패 hand 장에 그 달이 한 장이라도 있을 확률."""
    if k <= 0 or unknown <= 0 or hand <= 0:
        return 0.0
    none = 1.0
    for i in range(min(hand, unknown)):
        none *= max(0.0, (unknown - k - i) / (unknown - i))
    return 1.0 - none


def _candidates(st: dict, me: int) -> list:
    hand = st["hands"][me]
    out = []
    if st["bombs"][me] > 0:
        out.append({"flip": True})
    for c in hand:
        mon = _mon(c)
        mine = [x for x in hand if _mon(x) == mon]
        before = _on_floor(st, mon)
        if len(mine) == 3 and len(before) == 1 and c == min(mine):
            out.append({"card": c, "bomb": True})
        shake = len(mine) == 3 and not before and mon not in st["shook"][me]
        if len(before) == 2 and KINDS[before[0]] != KINDS[before[1]]:
            out.extend({"card": c, "take": t} for t in before)
        else:
            out.append({"card": c, "shake": shake} if shake else {"card": c})
    return out


def _quick(st: dict, me: int, d: dict) -> float:
    """보통 — 짝이 맞으면 먹을 패의 값, 아니면 버리는 패가 상대에게 갈 값만큼 뺀다. 뒤집을 패는 생각하지 않는다."""
    mine, theirs = st["piles"][me], st["piles"][1 - me]
    if d.get("flip"):
        return 0.3
    c = d["card"]
    before = _on_floor(st, _mon(c))
    if d.get("bomb"):
        return _gain(mine, theirs, [*before, *[x for x in st["hands"][me] if _mon(x) == _mon(c)]]) + 3
    if not before:
        return -0.4 * _gain(theirs, mine, [c])
    if len(before) == 3:
        return _gain(mine, theirs, [c, *before]) + 2
    return _gain(mine, theirs, [c, d.get("take", before[0])])


def _smart(st: dict, me: int, d: dict, unknown: list) -> float:
    """어려움 — 버린 패를 상대가 가져갈 확률, 죽은 패, 뻑 가져오기, 남는 바닥 패까지."""
    w = SMART
    you = 1 - me
    mine, theirs = st["piles"][me], st["piles"][you]
    if d.get("flip"):
        return w["flip"]
    c = d["card"]
    mon = _mon(c)
    before = _on_floor(st, mon)
    k = sum(1 for x in unknown if _mon(x) == mon)
    p_opp = _p_has(k, len(unknown), len(st["hands"][you]))
    mates = [x for x in st["hands"][me] if _mon(x) == mon and x != c]
    if d.get("bomb"):
        return _gain(mine, theirs, [*before, c, *mates]) + w["steal"] + w["bomb"]
    if not before:
        if k == 0:  # 나머지가 다 나온 달 — 아무도 못 먹는 패라 버리기 좋다
            return w["dead"]
        expose = p_opp * _gain(theirs, mine, [c]) * (w["mate"] if mates else 1)
        return -w["expose"] * expose + (w["shake"] if d.get("shake") else 0)
    if len(before) == 3:
        owner = st["stack"].get(str(mon))
        return _gain(mine, theirs, [c, *before]) + w["steal"] * (0 if owner is None else 2 if owner == me else 1)
    take = d.get("take", before[0])
    v = _gain(mine, theirs, [c, take])
    if len(before) == 2:
        v -= w["left"] * p_opp * _gain(theirs, mine, [x for x in before if x != take])
    return v


def _bot_go(st: dict, me: int, level: str, rnd) -> bool:
    left = len(st["deck"])
    opp = score(st["piles"][1 - me])["total"]
    gone = st["go"][me]
    if level == "easy":
        return left >= 8 and gone == 0 and opp <= 4 and rnd.random() < 0.4
    if level == "normal":
        return left >= 10 and opp <= 2 and gone < 2
    # 어려움 — 남은 차례가 넉넉하고 상대가 7점과 멀 때(상대가 모으는 광 · 고도리 · 단이 무르익었으면 스톱). 고는 두 번까지
    return left >= 8 and opp <= 3 and _potential(st["piles"][1 - me], st["piles"][me]) < 16 and gone < 2


def _bot_choose(st: dict, me: int, level: str, rnd) -> dict:
    phase = st["phase"]
    you = 1 - me
    if phase == "gostop":
        return {"go": True} if _bot_go(st, me, level, rnd) else {"stop": True}
    if phase == "pick":
        opts = st["pick"]["opts"]
        if level == "easy" and rnd.random() < 0.4:
            return {"pick": rnd.choice(opts)}
        return {"pick": max(opts, key=lambda c: _gain(st["piles"][me], st["piles"][you], [c]))}
    cands = _candidates(st, me)
    if level == "easy":
        if rnd.random() < 0.4:
            return rnd.choice(cands)
        return max(cands, key=lambda d: _quick(st, me, d) + rnd.random() * 0.05)
    if level == "normal":
        ranked = sorted(cands, key=lambda d: _quick(st, me, d) + rnd.random() * 0.01, reverse=True)
        return ranked[1] if len(ranked) > 1 and rnd.random() < 0.1 else ranked[0]
    unknown = _unknown(st, me)
    return max(cands, key=lambda d: _smart(st, me, d, unknown) + rnd.random() * 0.01)


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    st = m.state
    me = _seat(st, BOT_ID)
    return _act(st, me, _bot_choose(st, me, level, random.Random()), int(st.get("_v", 0)) + 1)
