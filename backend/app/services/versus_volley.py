"""옥상 배구 — 동료와 실시간 1:1 대전 엔진. 경기는 두 사람 브라우저가 실시간 통로로 하고, 서버는 결과만 받는다.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/volley.html, 경기 엔진(물리 · 그리기 · 통신)은 web/_shared/volley.js,
실시간 통로는 app/routers/realtime_ws.py(/api/play/rt/{판 id}) — 도전한 사람(host)이 판을 계산하고 받은 사람(guest)은 받아 그린다.
헤딩 축구(versus_soccer.py)와 같은 흐름이고, 점수를 세계 기준([주인, 손님])으로 받는 것만 다르다.

흐름
  · 수락하면 판이 열린다. 두 사람이 화면에 들어와 둘 다 「준비」를 누르면 3초 뒤 host 가 경기를 시작한다.
    목표 점수는 경기 전 준비 화면에서 host(도전한 사람)가 7 · 15 중에 고른다(기본 TARGET = 7).
    먼저 목표 점수를 낸 쪽이 이긴다(듀스 없음) — 레퍼런스(아케이드 배구 친구 대전)와 같은 규칙.
  · 경기가 끝나면 두 사람이 각자 결과를 보낸다 — {"score": [주인 점수, 손님 점수], "target": 7|15, "rally": 가장 긴 랠리, "sec": 경기 초}.
    host 가 보낸 득점 · 목표 · 끝 소식으로 두 화면이 같은 값을 갖고 있으니, 정상이라면 두 결과는 늘 맞는다.
  · 둘 다 보냈고 점수 · 목표가 같으면 끝 — 이긴 쪽 승("SCORE"). 다르면 다시 묻지 않고 무승부("MISMATCH", 도장 · 순위에 세지 않는다).
  · 결과는 수락 뒤 MIN_PLAY_SEC 이 지나야 받는다 — 경기를 하지 않고 결과만 주고받아 승수를 쌓지 못하게.
  · 판 전체 기한은 수락 + 2시간. 한 사람이 결과를 보냈으면 그때부터 30분(더 이르면 그것)으로 줄인다.
    기한이 지나면 한쪽만 보낸 결과라도 받지 않고 무승부(TIMEOUT_DRAW) — 한쪽 주장만으로 승패를 정하지 않는다.
  · 경기 중 기권(공통 RESIGN)은 상대 승이지만 도장 · 순위에는 세지 않는다. 도장 · 순위는 서로 맞은 결과(SCORE)만 센다.

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 따로 보내므로 seq 는 보지 않는다(STALE_CHECK False)
  {"score": [주인, 손님], "target": 7|15, "rally": n, "sec": s}   (op 는 없어도 되고, 있으면 "result". target 이 없으면 판의 기본 목표)

판(m.state)
  p: [주인 id, 손님 id] · at: 수락 시각(epoch ms) · until: 판 전체 기한(epoch ms) · target: 기본 목표 점수(화면이 처음 보여 줄 값)
  rep: {str(id): {"score": [주인, 손님], "target": 7|15, "rally": n, "sec": s, "at": 보낸 시각}} — 결과를 보낸 사람만
  final: [주인, 손님] · final_target: 그 경기의 목표 점수 — 서로 맞은 결과로 끝난 판만
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "volley"
NAME = "배구"
REASONS = {
    "SCORE": "점수",
    "MISMATCH": "결과가 서로 달라 무승부",
    "TIMEOUT_DRAW": "기한 · 결과 없음",
    "RESIGN": "기권",
}
DRAWS = ("MISMATCH",)
STALE_CHECK = False  # 두 사람이 따로 결과를 보낸다
SUPPORTS_BOT = False  # 컴퓨터와는 화면(volley.js)에서 연습으로만 — 기록하지 않는다
BOT_ID = 0  # match.BOT_ID 와 같은 값

TARGET = 7  # 기본 목표 점수 — 화면이 처음 보여 줄 값. 경기 전에 host 가 TARGETS 중에 고를 수 있다
TARGETS = (7, 15)  # 고를 수 있는 목표 점수(레퍼런스와 같이 7 · 15)
GAME_HOURS = 2  # 판 전체 기한 — 수락부터
AFTER_REPORT_MIN = 30  # 한 사람이 결과를 보낸 뒤 상대를 기다리는 최대 시간
MIN_PLAY_SEC = 40  # 수락 뒤 이만큼 지나야 결과를 받는다(준비 · 3초 세기 · 점수마다 1.5초 쉼 — 7점 경기도 이보다 길다)
MAX_RALLY = 9999
MAX_SEC = 7200

register_messages(
    {
        "VOLLEY_BAD": "보낼 수 없는 결과예요. 화면을 새로 불러 주세요.",
        "VOLLEY_TOO_EARLY": "아직 경기가 끝날 시간이 아니에요.",
        "VOLLEY_ALREADY": "결과는 이미 보냈어요.",
    },
    {"VOLLEY_BAD": 400, "VOLLEY_TOO_EARLY": 409, "VOLLEY_ALREADY": 409},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _int(x, hi: int) -> int:
    if not isinstance(x, int) or isinstance(x, bool) or not 0 <= x <= hi:
        raise_app_error("VOLLEY_BAD")
    return x


def _players(m) -> list:
    """[주인(도전한 사람), 손님(받은 사람)] — 실시간 통로(realtime_ws)와 같은 자리."""
    st = m.state or {}
    p = st.get("p")
    if isinstance(p, list) and len(p) == 2:
        return [int(x) for x in p]
    return [m.challenger_id, m.opponent_id]


def _report(st: dict, pid) -> Optional[dict]:
    r = (st.get("rep") or {}).get(str(pid))
    return r if isinstance(r, dict) else None


def _target(st: dict) -> int:
    t = st.get("target")
    return t if isinstance(t, int) and not isinstance(t, bool) and t > 0 else TARGET


def _rep_target(st: dict, r: dict) -> int:
    t = r.get("target")
    return t if isinstance(t, int) and not isinstance(t, bool) and t in TARGETS else _target(st)


def _judge(m) -> tuple:
    st = m.state
    host, guest = _players(m)
    ra, rb = _report(st, host), _report(st, guest)
    a, b = ra["score"], rb["score"]
    if list(a) != list(b) or _rep_target(st, ra) != _rep_target(st, rb):
        return (None, "MISMATCH")
    st["final"] = list(a)
    st["final_target"] = _rep_target(st, ra)
    return (host if a[0] > a[1] else guest, "SCORE")


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    now = _now_ms()
    return {
        "rep": {},
        "p": [int(m.challenger_id), int(m.opponent_id)],
        "target": TARGET,
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
    if data.get("op", "result") != "result":
        raise_app_error("VOLLEY_BAD")
    # 목표 점수 — 경기 전에 host 가 고른 값(7 · 15). 보내지 않으면 판의 기본 목표
    target = data.get("target", None)
    if target is None:
        target = _target(st)
    if not isinstance(target, int) or isinstance(target, bool) or target not in TARGETS:
        raise_app_error("VOLLEY_BAD")
    score = data.get("score")
    if not isinstance(score, list) or len(score) != 2:
        raise_app_error("VOLLEY_BAD")
    s = [_int(score[0], target), _int(score[1], target)]
    # 먼저 target 점을 낸 쪽이 이긴다(듀스 없음) — 한쪽만 정확히 target
    if max(s) != target or min(s) >= target:
        raise_app_error("VOLLEY_BAD")
    rally = data.get("rally", 0)
    rally = _int(rally, MAX_RALLY) if rally is not None else 0
    sec = data.get("sec", 0)
    if not isinstance(sec, (int, float)) or isinstance(sec, bool) or not 0 <= sec <= MAX_SEC:
        raise_app_error("VOLLEY_BAD")
    if _report(st, member_id) is not None:
        raise_app_error("VOLLEY_ALREADY")
    now_ms = _ms(now)
    if now_ms - int(st.get("at") or 0) < MIN_PLAY_SEC * 1000:
        raise_app_error("VOLLEY_TOO_EARLY")
    st.setdefault("rep", {})[str(member_id)] = {"score": s, "target": target, "rally": rally, "sec": round(float(sec), 1), "at": now_ms}
    if all(_report(st, p) is not None for p in _players(m)):
        return _judge(m)
    return None


def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다 — 한쪽만 보낸 결과는 받지 않는다. 늘 무승부."""
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 두 사람 결과가 서로 맞은 판만."""
    return m.end_reason == "SCORE"


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    host, guest = _players(m)
    me_host = member_id == host
    out = {"target": _target(st), "role": "host" if me_host else "guest"}
    if board:
        out["reported"] = {
            "me": _report(st, member_id) is not None,
            "rival": _report(st, guest if me_host else host) is not None,
        }
        out["until"] = st.get("until")
    final = st.get("final")
    if m.status == "DONE" and isinstance(final, list) and len(final) == 2:
        out["score"] = [final[0], final[1]] if me_host else [final[1], final[0]]  # [내 점수, 상대 점수]
        if st.get("final_target") in TARGETS:
            out["target"] = st["final_target"]
    return out
