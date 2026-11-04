"""옥상 헤딩 축구 — 동료와 실시간 1:1 대전 엔진. 경기는 두 사람 브라우저가 실시간 통로로 하고, 서버는 결과만 받는다.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/soccer.html, 경기 엔진(물리 · 그리기 · 통신)은 web/_shared/soccer.js,
실시간 통로는 app/routers/realtime_ws.py(/api/play/rt/{판 id}) — 도전한 사람(host)이 판을 계산하고 받은 사람(guest)은 받아 그린다.

흐름
  · 수락하면 판이 열린다(phase "play"). 두 사람이 화면에 들어오면 host 가 3 · 2 · 1 을 세고 2분 경기를 한다.
  · 경기가 끝나면 두 사람이 각자 결과를 보낸다 — {"op": "result", "me": 내 골, "rival": 상대 골} (0~99).
    host 가 보낸 득점 · 끝 소식으로 두 화면이 같은 점수를 갖고 있으니, 정상이라면 두 결과는 늘 맞는다.
  · 둘 다 보냈고 서로 맞으면(내 me == 상대 rival, 내 rival == 상대 me) 끝 — 골이 많은 쪽 승("SCORE"), 같으면 무승부("DRAW").
  · 서로 다르면 다시 묻지 않고 무승부로 끝낸다("MISMATCH") — 누가 맞는지 서버는 알 수 없고, 다시 묻게 하면
    끝난 경기를 두고 서로 버티기만 길어진다. 이 판은 도장 · 순위에 세지 않는다.
  · 결과는 수락 뒤 MIN_PLAY_SEC(115초)이 지나야 받는다 — 2분 경기를 하지 않고 결과만 주고받아 승수를 쌓지 못하게.
  · 판 전체 기한은 수락 + 2시간. 한 사람이 결과를 보냈으면 그때부터 30분(더 이르면 그것)으로 줄인다
    — 상대 화면이 꺼졌어도 다시 열면 「상대가 보낸 결과로 마치기」를 누를 수 있다(view 의 rivalReport).
    기한이 지나면 한쪽만 보낸 결과라도 받지 않고 무승부(TIMEOUT_DRAW) — 한쪽 주장만으로 승패를 정하지 않는다.
  · 경기 중 기권(공통 RESIGN)은 상대 승이지만 도장 · 순위에는 세지 않는다 — 바로 기권해 승수를 주고받지 못하게.
    도장 · 순위는 서로 맞은 결과(SCORE · DRAW)만 센다(counts).

믿음의 한계(서버는 경기를 보지 않는다)
  · 판은 host 화면이 계산한다. guest 화면은 host 판의 점수를 그대로 쓰지 않고 득점 소식(goal)을 하나씩 세어 결과를 낸다
    — host 가 저장된 판(localStorage)의 점수를 고쳐 새로고침하면 두 결과가 어긋나 MISMATCH(순위 제외)가 된다.
  · 그래도 개발자 도구로 화면 코드 자체를 고치면(가짜 득점 소식을 만드는 식) 막을 수 없다. 같은 상대에게 하루 1승만 세는
    공통 규칙(match.py)과 함께, 이상한 기록은 운영자가 대전 기록을 보고 판단한다.

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 따로 보내므로 seq 는 보지 않는다(STALE_CHECK False)
  {"op": "result", "me": 내 골, "rival": 상대 골}

판(m.state)
  phase: "play" · p: [먼저 id, 나중 id] · at: 수락 시각(epoch ms) · until: 판 전체 기한(epoch ms)
  rep: {str(id): {"me": 골, "rival": 골, "at": 보낸 시각(epoch ms)}} — 결과를 보낸 사람만
  final: {str(id): 골} — 서로 맞은 결과로 끝난 판만
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "soccer"
NAME = "헤딩 축구"
REASONS = {
    "SCORE": "골 수",
    "DRAW": "같은 골 수",
    "MISMATCH": "결과가 서로 달라 무승부",
    "TIMEOUT_DRAW": "기한 · 결과 없음",
    "RESIGN": "기권",
}
DRAWS = ("DRAW", "MISMATCH")  # 컴퓨터전은 없지만 규약대로 — 승자 없는 끝
STALE_CHECK = False  # 두 사람이 따로 결과를 보낸다
SUPPORTS_BOT = False  # 컴퓨터와는 화면(soccer.js)에서 연습으로만 — 기록하지 않는다
BOT_ID = 0  # match.BOT_ID 와 같은 값

GAME_MINUTES = 2  # 동료와 경기 시간 — 화면(soccer.html ONLINE_MINUTES)과 같은 값
GAME_HOURS = 2  # 판 전체 기한 — 수락부터
AFTER_REPORT_MIN = 30  # 한 사람이 결과를 보낸 뒤 상대를 기다리는 최대 시간
MIN_PLAY_SEC = 115  # 수락 뒤 이만큼 지나야 결과를 받는다(2분 경기 + 3 · 2 · 1 — 득점 축하 동안은 시계가 멈춰 실제로는 더 길다)
MAX_GOALS = 99
AGREED = ("SCORE", "DRAW")

register_messages(
    {
        "SOCCER_BAD": "보낼 수 없는 결과예요. 화면을 새로 불러 주세요.",
        "SOCCER_TOO_EARLY": "아직 경기가 끝날 시간이 아니에요.",
        "SOCCER_ALREADY": "결과는 이미 보냈어요.",
    },
    {"SOCCER_BAD": 400, "SOCCER_TOO_EARLY": 409, "SOCCER_ALREADY": 409},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    """지금 시각(epoch ms) — start 는 now 를 받지 않으므로 여기서 잰다(시험에서 바꿔 끼울 수 있게 함수로)."""
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _goals(x) -> int:
    """골 수 — 0~99 정수만(참 · 거짓 · 소수 · 글자는 막는다)."""
    if not isinstance(x, int) or isinstance(x, bool) or not 0 <= x <= MAX_GOALS:
        raise_app_error("SOCCER_BAD")
    return x


def _players(m) -> list:
    st = m.state or {}
    p = st.get("p")
    if isinstance(p, list) and len(p) == 2:
        return [int(x) for x in p]
    return [m.challenger_id, m.opponent_id]


def _rival(m, member_id: int) -> Optional[int]:
    return next((p for p in _players(m) if p != member_id), None)


def _report(st: dict, pid) -> Optional[dict]:
    r = (st.get("rep") or {}).get(str(pid))
    return r if isinstance(r, dict) else None


def _judge(m) -> tuple:
    """두 결과가 다 왔을 때 — 서로 맞으면 골 수로, 다르면 무승부(MISMATCH)."""
    st = m.state
    a, b = _players(m)
    ra, rb = _report(st, a), _report(st, b)
    if ra["me"] != rb["rival"] or ra["rival"] != rb["me"]:
        return (None, "MISMATCH")
    st["final"] = {str(a): ra["me"], str(b): rb["me"]}
    if ra["me"] == ra["rival"]:
        return (None, "DRAW")
    return (a if ra["me"] > ra["rival"] else b, "SCORE")


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    now = _now_ms()
    return {
        "phase": "play",
        "rep": {},
        "p": [int(p) for p in players],
        "at": now,
        "until": now + GAME_HOURS * 3600 * 1000,
    }


def waiting_for(m) -> set:
    """아직 결과를 보내지 않은 사람."""
    st = m.state or {}
    return {p for p in _players(m) if p != BOT_ID and _report(st, p) is None}


def next_deadline(m, now: datetime):
    """판 전체 기한(수락 + 2시간). 한 사람이 결과를 보냈으면 그때부터 30분까지로 줄인다."""
    st = m.state or {}
    until = int(st.get("until") or _ms(now + timedelta(hours=GAME_HOURS)))
    sent = [int(r.get("at", 0)) for r in (st.get("rep") or {}).values() if isinstance(r, dict)]
    if sent:
        until = min(until, min(sent) + AFTER_REPORT_MIN * 60 * 1000)
    return datetime.fromtimestamp(until / 1000, tz=now.tzinfo)


def act(m, member_id: int, data: dict, now: datetime) -> Optional[tuple]:
    st = m.state
    if data.get("op") != "result":
        raise_app_error("SOCCER_BAD")
    me, rival = _goals(data.get("me")), _goals(data.get("rival"))
    if _report(st, member_id) is not None:
        raise_app_error("SOCCER_ALREADY")
    now_ms = _ms(now)
    if now_ms - int(st.get("at") or 0) < MIN_PLAY_SEC * 1000:
        raise_app_error("SOCCER_TOO_EARLY")
    st.setdefault("rep", {})[str(member_id)] = {"me": me, "rival": rival, "at": now_ms}
    if all(_report(st, p) is not None for p in _players(m)):
        return _judge(m)
    return None


def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다 — 한쪽만 보낸 결과는 받지 않는다(한쪽 주장으로 승패를 정하지 않게). 늘 무승부."""
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 두 사람 결과가 서로 맞은 판만(기권 · 기한 · 결과 다름은 세지 않는다)."""
    return m.end_reason in AGREED


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    rival = _rival(m, member_id)
    mine = _report(st, member_id)
    theirs = _report(st, rival) if rival is not None else None
    out = {
        "reported": {"me": mine is not None, "rival": theirs is not None},
        "myReport": {"me": mine["me"], "rival": mine["rival"]} if mine else None,
        "minutes": GAME_MINUTES,
        "until": st.get("until"),
    }
    if m.status == "ACTIVE" and mine is None and theirs is not None:
        # 상대가 먼저 보낸 결과(내 쪽에서 본 점수) — 내 화면이 꺼졌다 다시 열렸을 때 「이 결과로 마치기」에 쓴다
        out["rivalReport"] = {"me": theirs["rival"], "rival": theirs["me"]}
    if m.status == "DONE":
        final = st.get("final") or {}
        if str(member_id) in final and rival is not None and str(rival) in final:
            out["final"] = {"me": final[str(member_id)], "rival": final[str(rival)]}
    return {"soccer": out}
