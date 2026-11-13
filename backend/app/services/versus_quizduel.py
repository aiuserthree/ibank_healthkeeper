"""1:1 퀴즈 대결 — 같은 10문제를 두 사람이 각자 편한 때 풀고, 더 많이 맞힌 사람이 이긴다. 대전 엔진.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/quizduel.html, 문제는 app/services/quiz_bank.py(서버에만 있는 대결 전용 은행 — 화면 파일에 정답이 실린
오늘의 상식 퀴즈 은행은 쓰지 않는다).

규칙 — 화면의 「이렇게 해요」와 같은 말
  · 수락하면 10문제가 정해진다(분야 10개에서 하나씩, 쉬운 문제부터). 두 사람 모두 같은 문제 · 같은 보기 순서.
  · 수락부터 24시간 안에 각자 아무 때나 푼다. 문제는 하나씩 열고, 연 순간부터 15초 — 늦으면 오답.
  · 맞힌 개수가 많은 쪽이 이긴다. 같으면 10문제에 걸린 시간 합(0.1초 단위)이 짧은 쪽. 그것도 같으면 무승부.
  · 기한이 지났을 때 한 사람만 다 풀었으면 그 사람이 이기고, 아무도 다 못 풀었으면 무승부.
  · 상대가 고른 답 · 점수는 둘 다 끝나야 보인다. 그 전에는 몇 문제 풀었는지와 지금 푸는 중인지만.
  · 컴퓨터와도 겨룰 수 있다 — 컴퓨터는 내가 한 문제를 풀 때마다 같은 문제를 하나 푼다(답은 끝나야 보인다).

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 동시에 풀므로 seq 대신 문제 번호 q 로 맞춰 본다
  {"op": "next", "q": k}                      k번(0부터) 문제를 연다. 서버가 연 시각을 적는다(q 를 빼면 다음 문제).
                                              이미 열린 문제면 QUIZ_OPEN(판은 그대로 — 새로 불러오면 처음 연 때부터의 시간으로 이어 푼다).
                                              판 기한(until)이 15초 + 여유 2초 안에 끝나면 QUIZ_DUE(답할 시간이 없는 문제는 열지 않는다)
  {"op": "answer", "q": k, "choice": i|None}  열린 k번 문제에 답한다(q 를 빼면 열린 문제). None 은 화면 시계가 다 돼 보내는 「시간 초과」.
                                              15초 + 통신 여유 2초가 지나 온 답은 시간 초과 오답으로 적는다 — 고른 칸은 남기지 않는다
                                              (그사이 판을 다시 불러 정답을 본 뒤 고른 칸을 바꿔 적지 못하게).
                                              이미 시간 초과로 적힌 문제에 온 답은 QUIZ_STALE

판(m.state) — 숨긴 것(정답 · 해설 · 아직 안 연 문제 · 상대 답)은 view 가 걸러 보낸다
  p: [먼저 id, 나중 id](컴퓨터는 BOT_ID) · seed: 컴퓨터 답을 정하는 씨앗 · until: 판 전체 기한(epoch ms, 수락 + 24시간)
  qs: [{q 문제, o 보기 4개, a 정답 칸, c 분야, l 난이도, e 해설}] × 10 — 수락할 때 은행에서 옮겨 둔다(은행이 바뀌어도 판은 그대로)
  ans: {str(id): [{c 고른 칸|None, ok 맞음, ms 걸린 시간(0.1초 단위 · 최대 15초), late 시간 초과}]} — k번째 = k번 문제
  open: {str(id): {k 문제 번호, at 연 시각(epoch ms)}} — 열고 아직 답하지 않은 문제(사람마다 하나)

기한(m.deadline_at)은 보통 until 이다. 다만 남은 사람이 모두 마지막 문제를 열어 둔 채(창을 닫는 등) 15초가 지나면
결과가 이미 정해진 것이니, 그때를 기한으로 잡아 기한 정리(match._sweep → on_timeout)가 바로 판을 끝내게 한다
— 먼저 다 푼 사람이 24시간을 기다리지 않게. 화면의 「남은 시간」은 until 로 보여 준다.
"""

from __future__ import annotations

import random
import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages
from app.services import quiz_bank

KEY = "quizduel"
NAME = "1:1 퀴즈"
REASONS = {
    "SCORE": "맞힌 수",
    "SPEED": "같은 점수 · 시간 차",
    "DRAW": "점수 · 시간 같음",
    "TIMEOUT": "기한 · 다 푼 쪽 승",
    "TIMEOUT_DRAW": "기한 · 둘 다 못 끝냄",
}
STALE_CHECK = False  # 둘이 동시에 푸니 상대가 움직여도 내 행동은 막지 않는다 — 문제 번호(q)로 확인
SUPPORTS_BOT = True
BOT_LEVELS = ("easy", "normal", "hard")
BOT_NAMES = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
BOT_ID = 0  # match.BOT_ID 와 같은 값 — 컴퓨터

COUNT = len(quiz_bank.PLAN)  # 한 판 문제 수(10)
LIMIT_MS = 15_000  # 문제 하나에 15초
GRACE_MS = 2_000  # 통신 여유 — 화면 시계가 0이 된 뒤 이만큼 안에 온 답은 받아 준다(걸린 시간은 15초로)
GAME_HOURS = 24  # 판 전체 기한 — 수락부터(풀어도 늘지 않는다)
PLAYED_OUT = ("SCORE", "SPEED", "DRAW")

# 컴퓨터 — 난이도별로 맞힐 확률 · 생각하는 시간(초), 문제 난이도에 따라 확률을 더하고 뺀다
BOT_SKILL = {"easy": 0.45, "normal": 0.65, "hard": 0.82}
BOT_SPEED = {"easy": (6.0, 12.5), "normal": (4.5, 10.5), "hard": (3.0, 8.5)}
LEVEL_EDGE = {1: 0.15, 2: 0.05, 3: -0.05, 4: -0.15}

register_messages(
    {
        "QUIZ_BAD": "보낼 수 없는 답이에요. 화면을 새로 불러 주세요.",
        "QUIZ_STALE": "이미 지나간 문제예요. 화면을 새로 불러올게요.",
        "QUIZ_CLOSING": "곧 아케이드가 닫혀요. 다음에 열릴 때 이어서 풀어 주세요.",
        "QUIZ_OPEN": "이미 열어 둔 문제예요. 화면을 새로 불러올게요.",
        "QUIZ_DUE": "대결 기한이 곧 끝나서 새 문제를 열 수 없어요.",
    },
    {"QUIZ_BAD": 400, "QUIZ_STALE": 409, "QUIZ_CLOSING": 403, "QUIZ_OPEN": 409, "QUIZ_DUE": 403},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    """지금 시각(epoch ms) — view 는 now 를 받지 않으므로 여기서 잰다(시험에서 바꿔 끼울 수 있게 함수로)."""
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _tenth(ms: float) -> int:
    """0.1초 단위로 반올림한 ms — 화면에 보이는 시간과 승부를 가르는 시간을 같게."""
    return int((max(0, ms) + 50) // 100) * 100


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _rival(st: dict, member_id: int) -> Optional[int]:
    return next((p for p in st["p"] if p != member_id), None)


def _timed_out(opened: Optional[dict], now_ms: int) -> bool:
    return bool(opened) and now_ms - int(opened["at"]) > LIMIT_MS + GRACE_MS


TIMEOUT_MARK = {"c": None, "ok": False, "ms": LIMIT_MS, "late": True}


def _answers(st: dict, pid: int, now_ms: int) -> list:
    """pid 의 답 — 열어 둔 채 시간이 다 지난 문제는 시간 초과 오답으로 친다(저장하지 않고 보기만)."""
    ans = list(st["ans"].get(str(pid), []))
    opened = st["open"].get(str(pid))
    if _timed_out(opened, now_ms) and int(opened["k"]) == len(ans):
        ans.append(dict(TIMEOUT_MARK))
    return ans


def _settle(st: dict, now_ms: int) -> None:
    """열어 둔 채 시간이 다 지난 문제를 시간 초과 오답으로 적는다(두 사람 모두)."""
    for pid in st["p"]:
        key = str(pid)
        opened = st["open"].get(key)
        if _timed_out(opened, now_ms):
            if int(opened["k"]) == len(st["ans"][key]):
                st["ans"][key].append(dict(TIMEOUT_MARK))
            del st["open"][key]


def _score(ans: list) -> int:
    return sum(1 for x in ans if x.get("ok"))


def _time(ans: list) -> int:
    return sum(int(x.get("ms", LIMIT_MS)) for x in ans)


def _judge(st: dict) -> tuple:
    """둘 다 10문제를 끝낸 판 — 맞힌 수, 같으면 걸린 시간 합, 그것도 같으면 무승부."""
    a, b = st["p"]
    xa, xb = st["ans"][str(a)], st["ans"][str(b)]
    sa, sb = _score(xa), _score(xb)
    if sa != sb:
        return (a if sa > sb else b, "SCORE")
    ta, tb = _time(xa), _time(xb)
    if ta != tb:
        return (a if ta < tb else b, "SPEED")
    return (None, "DRAW")


def _all_done(st: dict) -> bool:
    return all(len(st["ans"][str(p)]) >= COUNT for p in st["p"])


def _closing_soon(now: datetime, member_id: Optional[int] = None) -> bool:
    """15초(+여유) 안에 아케이드가 닫히는지 — 문을 닫는 순간 답을 못 보내 억울하게 틀리지 않게 새 문제를 열지 않는다.
    문제를 여는 사람 기준(휴가인 사람은 그 쉬는 시간대가 끝날 때 닫힌다)."""
    try:
        from app.services.game import play_window

        return not play_window(now + timedelta(milliseconds=LIMIT_MS + GRACE_MS), member=member_id)["open"]
    except Exception:  # noqa: BLE001 — 시간 확인이 안 되면 막지 않는다(답할 때 ensure_open 이 다시 본다)
        return False


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    return {
        "p": list(players),
        "qs": quiz_bank.pick(rnd),
        "ans": {str(p): [] for p in players},
        "open": {},
        "seed": rnd.randrange(1 << 30),
        "until": _now_ms() + GAME_HOURS * 3600 * 1000,
    }


def waiting_for(m) -> set:
    """아직 10문제를 다 풀지 않은 사람. 컴퓨터는 사람이 푼 만큼만 따라 푼다."""
    st = m.state
    done = {p: len(st["ans"][str(p)]) for p in st["p"]}
    human = max((n for p, n in done.items() if p != BOT_ID), default=0)
    out = set()
    for p, n in done.items():
        if n >= COUNT:
            continue
        if p == BOT_ID and n >= human:
            continue
        out.add(p)
    return out


def next_deadline(m, now: datetime):
    """판 전체 기한(until). 남은 사람이 모두 마지막 문제만 열어 둔 채면 그 문제 시간이 다 되는 때(결과가 정해지는 때)."""
    st = m.state
    until = int(st.get("until") or _ms(now + timedelta(hours=GAME_HOURS)))
    left = [p for p in st["p"] if p != BOT_ID and len(st["ans"][str(p)]) < COUNT]
    opened = [st["open"].get(str(p)) for p in left]
    if left and all(o and int(o["k"]) == COUNT - 1 == len(st["ans"][str(p)]) for p, o in zip(left, opened)):
        until = min(until, max(int(o["at"]) for o in opened) + LIMIT_MS + GRACE_MS + 1000)
    return datetime.fromtimestamp(until / 1000, tz=now.tzinfo)


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    now_ms = _ms(now)
    me = str(member_id)
    was = st["open"].get(me)
    lapsed = int(was["k"]) if _timed_out(was, now_ms) else None  # 이 요청이 처음 알아챈 내 시간 초과 문제
    _settle(st, now_ms)
    ans = st["ans"][me]
    opened = st["open"].get(me)
    op, k = data.get("op"), data.get("q")
    if k is None:  # 문제 번호를 빼면 지금 문제로 — 화면은 늘 q 를 보내 엇갈린 요청을 막는다
        k = len(ans) if op == "next" or opened is None else int(opened["k"])
        if op == "answer" and opened is None and lapsed is not None:
            k = lapsed
    if op not in ("next", "answer") or not _is_int(k) or not 0 <= k < COUNT:
        raise_app_error("QUIZ_BAD")
    if op == "next":
        if k != len(ans):  # 이미 푼 문제거나 건너뛴 번호
            raise_app_error("QUIZ_STALE")
        if opened is not None and int(opened["k"]) == k:
            # 이미 열린 문제 — 판을 바꾸지 않는다(시간은 처음 연 때부터). 오류로 돌려 _v 가 오르지 않고 상대도 깨우지 않는다
            raise_app_error("QUIZ_OPEN")
        if _closing_soon(now, member_id):
            raise_app_error("QUIZ_CLOSING")
        until = st.get("until")
        if until and int(until) - now_ms < LIMIT_MS + GRACE_MS:  # 판 기한 전에 답할 시간이 없는 문제는 열지 않는다
            raise_app_error("QUIZ_DUE")
        st["open"][me] = {"k": k, "at": now_ms}
        return None
    choice = data.get("choice")
    if choice is not None and (not _is_int(choice) or not 0 <= choice < len(st["qs"][k]["o"])):
        raise_app_error("QUIZ_BAD")
    if opened is not None and int(opened["k"]) == k:
        del st["open"][me]
        spent = min(LIMIT_MS, now_ms - int(opened["at"]))
        ok = choice is not None and choice == st["qs"][k]["a"]
        ans.append({"c": choice, "ok": ok, "ms": _tenth(spent) if choice is not None else LIMIT_MS, "late": choice is None})
    elif k != lapsed:
        raise_app_error("QUIZ_STALE")
    # k == lapsed: 늦게 온 답 — 위 _settle 이 이 요청에서 시간 초과(고른 칸 없음)로 적었다. 그대로 받아 판만 마무리한다
    return _judge(st) if _all_done(st) else None


def bot_act(m, level: str, now: datetime) -> Optional[tuple]:
    """컴퓨터가 다음 문제를 하나 푼다 — 같은 판이면 늘 같은 답(씨앗 + 문제 번호)."""
    st = m.state
    key = str(BOT_ID)
    k = len(st["ans"][key])
    q = st["qs"][k]
    rng = random.Random(f"{st.get('seed', 0)}:{k}")
    p = min(0.97, max(0.1, BOT_SKILL.get(level, BOT_SKILL["normal"]) + LEVEL_EDGE.get(int(q["l"]), 0)))
    ok = rng.random() < p
    choice = q["a"] if ok else rng.choice([i for i in range(len(q["o"])) if i != q["a"]])
    lo, hi = BOT_SPEED.get(level, BOT_SPEED["normal"])
    spent = min(LIMIT_MS, rng.uniform(lo, hi) * 1000 + (int(q["l"]) - 1) * 600)
    st["ans"][key].append({"c": choice, "ok": ok, "ms": _tenth(spent), "late": False})
    return _judge(st) if _all_done(st) else None


def on_timeout(m, now: datetime) -> tuple:
    """판 전체 기한이 지났다 — 시간이 다 된 문제를 정리하고, 다 푼 사람이 한 명이면 그 사람이 이긴다."""
    st = m.state
    _settle(st, _ms(now))
    if BOT_ID in st["p"]:  # 컴퓨터는 사람이 푼 만큼 따라 푼다
        for _ in range(COUNT):
            if BOT_ID not in waiting_for(m):
                break
            bot_act(m, m.bot or "normal", now)
    if _all_done(st):
        return _judge(st)
    done = [p for p in st["p"] if len(st["ans"][str(p)]) >= COUNT]
    if len(done) == 1:
        return (done[0], "TIMEOUT")
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 끝까지 푼 판, 기한까지 한 사람만 다 푼 판(다 푼 쪽 승),
    기권은 두 사람이 합쳐 10문제 이상 푼 판만(바로 기권해 승수를 주고받지 못하게)."""
    if m.end_reason in PLAYED_OUT or m.end_reason == "TIMEOUT":
        return True
    if m.end_reason == "RESIGN":
        st = m.state or {}
        return sum(len(v) for v in st.get("ans", {}).values()) >= COUNT
    return False


def _item(q: dict, k: int) -> dict:
    """문제 한 개(정답 · 해설 포함) — 내가 답한 문제와 끝난 판에서만."""
    return {"k": k, "text": q["q"], "choices": list(q["o"]), "answer": q["a"], "note": q.get("e") or "", "cat": q["c"], "level": q["l"]}


def _mark(x: Optional[dict]) -> Optional[dict]:
    if not x:
        return None
    return {"choice": x.get("c"), "ok": bool(x.get("ok")), "ms": int(x.get("ms", LIMIT_MS)), "late": bool(x.get("late"))}


def view(m, member_id: int, board: bool) -> dict:
    st = m.state
    if not st or str(member_id) not in st.get("ans", {}):
        return {}
    now = _now_ms()
    done = m.status == "DONE"
    rival = _rival(st, member_id)
    mine = _answers(st, member_id, now)
    theirs = _answers(st, rival, now) if rival is not None else []
    quiz = {"count": COUNT, "mine": len(mine), "rival": len(theirs), "until": st.get("until")}
    if done:  # 끝난 판 — 점수 · 시간은 둘 다 보여 줘도 된다
        quiz.update(myScore=_score(mine), rivalScore=_score(theirs), myTime=_time(mine), rivalTime=_time(theirs))
    if not board:
        return {"quiz": quiz}
    opened = st["open"].get(str(member_id))
    live = st["open"].get(str(rival)) if rival is not None else None
    items = []
    for k, q in enumerate(st["qs"]):
        if done:
            items.append({**_item(q, k), "me": _mark(mine[k] if k < len(mine) else None), "rival": _mark(theirs[k] if k < len(theirs) else None)})
        elif k < len(mine):  # 내가 답한 문제 — 정답 · 해설을 보여 줘도 된다(상대 답은 끝나야)
            items.append({**_item(q, k), "me": _mark(mine[k])})
        elif opened and int(opened["k"]) == k and not _timed_out(opened, now):  # 지금 푸는 문제 — 정답은 빼고
            items.append({
                "k": k, "text": q["q"], "choices": list(q["o"]), "cat": q["c"], "level": q["l"], "open": True,
                "leftMs": max(0, LIMIT_MS - (now - int(opened["at"]))),
            })
            break
        else:
            break  # 아직 열지 않은 문제는 보내지 않는다
    quiz.update(
        items=items,
        limitMs=LIMIT_MS,
        myScore=_score(mine),
        myTime=_time(mine),
        rivalLive=(not done) and bool(live) and not _timed_out(live, now),
    )
    return {"quiz": quiz}
