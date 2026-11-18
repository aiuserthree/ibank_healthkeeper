"""선다운 범퍼스 대전 — 동료와 실시간 1:1 범퍼카 경주 엔진. 경주는 두 사람 브라우저가 실시간 통로로 하고, 서버는 결과만 받는다.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/bumpervs.html, 3D 경주 본체는 혼자 하기와 같은 web/games/embed/sundown.html(?vs=1 — 대전 모드),
실시간 통로는 app/routers/realtime_ws.py(/api/play/rt/{판 id}) — 도전한 사람(host)이 경주를 계산하고 받은 사람(guest)은 받아 그린다.
옥상 배구(versus_volley.py)와 같은 흐름이고, 결과 모양만 경주에 맞게 다르다.

경주 규칙
  · 두 사람이 같은 트랙을 나란히 달린다. 트랙은 경주 전 준비 화면에서 host 가 고른다(1 ~ 13, 기본 1 — 대전에서는 모든 트랙).
    컴퓨터 레이서는 없다. 레이서는 모양만 고르고 성능은 둘 다 같은 기본값(해금 · 업그레이드 효과 없음).
  · 서로 부딪히면 튕겨 나가고, 아이템 · 드리프트 부스트 · 장애물은 혼자 하기와 같다.
  · 먼저 결승선을 지난 사람이 이긴다. 한 사람이 들어온 뒤 화면이 정한 시간(RETIRE_SEC ~ GRACE_SEC — 지금 화면 12초, 뒤 단계 10초) 안에
    상대가 못 들어오면 상대 기록은 없음(null)으로 끝난다.
    LIMIT_SEC(5분) 안에 둘 다 못 들어오면 더 멀리 간 사람이 이긴다(거리가 똑같으면 무승부).
  · 트랙은 모두 닫힌 고리이고 3바퀴를 돈다(기본 3바퀴 — 한 바퀴 약 45~50초, 한 판 보통 2분 10초 ~ 2분 40초).

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 따로 보내므로 seq 는 보지 않는다(STALE_CHECK False)
  {"winner": "host"|"guest"|null, "order": [주인 기록 초 | null, 손님 기록 초 | null], "track": 1~13, "sec": 경주 초,
   "dist": [주인 진행, 손님 진행](0~1, 둘 다 못 들어왔을 때 꼭)}       (op 는 없어도 되고, 있으면 "result")
  host 가 경주를 계산해 끝 소식(같은 값)을 guest 에게 보내니, 정상이라면 두 결과는 늘 같다.

판 정리
  · 둘 다 보냈고 winner · order · track 이 같으면 끝 — 들어온 사람이 있으면 「FINISH」, 시간이 다 돼 거리로 가렸으면 「FARTHER」,
    거리까지 같으면 무승부(「DRAW」). 다르면 다시 묻지 않고 무승부(「MISMATCH」, 도장 · 순위에 세지 않는다).
  · 결과는 수락 뒤 MIN_PLAY_SEC 이 지나야 받는다 — 경주를 하지 않고 결과만 주고받아 승수를 쌓지 못하게.
    결승 기록은 트랙마다 MIN_FINISH 초보다 빠를 수 없다(부스트를 내내 받아도 못 내는 기록).
  · 판 전체 기한은 수락 + 2시간. 한 사람이 결과를 보냈으면 그때부터 30분(더 이르면 그것)으로 줄인다.
    기한이 지나면 한쪽만 보낸 결과라도 받지 않고 무승부(TIMEOUT_DRAW).
  · 경주 중 기권(공통 RESIGN)은 상대 승이지만 도장 · 순위에는 세지 않는다. 도장 · 순위는 서로 맞은 결과(FINISH · FARTHER)만 센다.

판(m.state)
  p: [주인 id, 손님 id] · at: 수락 시각(epoch ms) · until: 판 전체 기한(epoch ms) · track: 기본 트랙(화면이 처음 보여 줄 값)
  rep: {str(id): {"winner", "order", "track", "sec", "dist", "at"}} — 결과를 보낸 사람만
  final: {"winner": "host"|"guest"|None, "order": [..], "track": n, "sec": s} — 서로 맞은 결과로 끝난 판만
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "bumpervs"
NAME = "범퍼카 대전"
REASONS = {
    "FINISH": "결승선",
    "FARTHER": "시간 끝 · 더 멀리 감",
    "DRAW": "같은 거리 · 무승부",
    "MISMATCH": "결과가 서로 달라 무승부",
    "TIMEOUT_DRAW": "기한 · 결과 없음",
    "RESIGN": "기권",
}
DRAWS = ("MISMATCH", "DRAW")
STALE_CHECK = False  # 두 사람이 따로 결과를 보낸다
SUPPORTS_BOT = False  # 컴퓨터와는 화면에서 연습으로만 — 기록하지 않는다
BOT_ID = 0  # match.BOT_ID 와 같은 값

TRACKS = 13  # 트랙 1 ~ 13 (혼자 하기 sundown 과 같은 트랙)
TRACK = 1  # 기본 트랙
LIMIT_SEC = 300  # 경주 시간 상한(5분 — 3바퀴 보통 2분 남짓의 2배 넘는 여유) — 이 안에 둘 다 못 들어오면 더 멀리 간 사람 승
GRACE_SEC = 12  # 한 사람이 들어온 뒤 상대를 기다리는 가장 긴 시간(지금 화면 값) — 늦게 들어온 사람의 기록은 이 안이어야 한다
# 한 사람만 들어온 판이 끝날 수 있는 가장 이른 때 = 첫 결승 + RETIRE_SEC. 화면이 기다리는 시간을 10초로 줄이는 단계(첫 결승 + 10초에 끝)보다
# 서버가 먼저 받도록 넓혀 둔 값 — 지금 화면(12초)이 보내는 결과도 그대로 받는다. 좁히면(값을 올리면) 진행 중인 옛 판 결과가 거절된다
RETIRE_SEC = 10
# 트랙마다 이보다 빠른 결승 기록은 받지 않는다 — 출발선 ~ 결승선 거리(3바퀴) ÷ 65(부스트를 내내 받아도 못 넘는 속도)
# 화면 sundown.html buildTrack 의 한 바퀴 길이 L 로 (36 + 3L − 31) ÷ 65. 보통 실력(자동 운전) 실측 결승은 130 ~ 155초
MIN_FINISH = (99, 103, 99, 99, 100, 99, 99, 99, 106, 99, 99, 99, 102)
GAME_HOURS = 2  # 판 전체 기한 — 수락부터
AFTER_REPORT_MIN = 30  # 한 사람이 결과를 보낸 뒤 상대를 기다리는 최대 시간
MIN_PLAY_SEC = 30  # 수락 뒤 이만큼 지나야 결과를 받는다(준비 · 3초 세기 · 가장 짧은 트랙도 3바퀴에 99초 넘게 걸린다)
WINNERS = ("host", "guest")

register_messages(
    {
        "BUMPERVS_BAD": "보낼 수 없는 결과예요. 화면을 새로 불러 주세요.",
        "BUMPERVS_TOO_EARLY": "아직 경주가 끝날 시간이 아니에요.",
        "BUMPERVS_ALREADY": "결과는 이미 보냈어요.",
    },
    {"BUMPERVS_BAD": 400, "BUMPERVS_TOO_EARLY": 409, "BUMPERVS_ALREADY": 409},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _bad():
    raise_app_error("BUMPERVS_BAD")


def _num(x) -> float:
    if not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(x):
        _bad()
    return float(x)


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


def _track(st: dict) -> int:
    t = st.get("track")
    return t if isinstance(t, int) and not isinstance(t, bool) and 1 <= t <= TRACKS else TRACK


def _clean(data: dict) -> dict:
    """화면이 보낸 결과를 검사해 저장할 모양으로 — 앞뒤가 맞지 않으면 BUMPERVS_BAD."""
    if not isinstance(data, dict) or data.get("op", "result") != "result":
        _bad()
    track = data.get("track")
    if not isinstance(track, int) or isinstance(track, bool) or not 1 <= track <= TRACKS:
        _bad()
    order = data.get("order")
    if not isinstance(order, list) or len(order) != 2:
        _bad()
    times: list = []
    for t in order:
        if t is None:
            times.append(None)
            continue
        v = round(_num(t), 2)
        if not MIN_FINISH[track - 1] <= v <= LIMIT_SEC:
            _bad()
        times.append(v)
    sec = round(_num(data.get("sec")), 2)
    if not 0 < sec <= LIMIT_SEC + 1:
        _bad()
    done = [t for t in times if t is not None]
    if done and sec + 0.05 < max(done):
        _bad()  # 경주가 결승 기록보다 먼저 끝날 수 없다
    dist = data.get("dist")
    if dist is not None:
        if not isinstance(dist, list) or len(dist) != 2:
            _bad()
        dist = [round(_num(d), 3) for d in dist]
        if not all(0 <= d <= 1 for d in dist):
            _bad()
    winner = data.get("winner")
    if winner is not None and winner not in WINNERS:
        _bad()
    h, g = times
    if h is not None and g is not None:
        # 둘 다 들어왔다 — 더 빠른 쪽(같으면 어느 쪽이든 — 화면은 먼저 지난 쪽을 적는다)
        if winner is None or (winner == "host" and h > g) or (winner == "guest" and g > h):
            _bad()
        if abs(h - g) > GRACE_SEC + 0.5:
            _bad()  # 늦은 쪽은 GRACE_SEC 안에 들어와야 기록이 있다
    elif h is not None or g is not None:
        first = h if h is not None else g
        if winner != ("host" if h is not None else "guest"):
            _bad()
        if sec + 0.5 < min(first + RETIRE_SEC, LIMIT_SEC):
            _bad()  # 상대를 기다리는 시간(가장 짧게 RETIRE_SEC)이 끝나기 전에 끝날 수 없다
    else:
        # 둘 다 못 들어왔다 — LIMIT_SEC(5분)이 다 됐고, 더 멀리 간 쪽(거리가 꼭 있어야 한다)
        if dist is None or sec + 0.5 < LIMIT_SEC:
            _bad()
        if dist[0] == dist[1]:
            if winner is not None:
                _bad()
        elif winner != ("host" if dist[0] > dist[1] else "guest"):
            _bad()
    if winner is None and (h is not None or g is not None or dist is None or dist[0] != dist[1]):
        _bad()
    return {"winner": winner, "order": times, "track": track, "sec": sec, "dist": dist}


def _judge(m) -> tuple:
    st = m.state
    host, guest = _players(m)
    a, b = _report(st, host), _report(st, guest)
    if a["winner"] != b["winner"] or list(a["order"]) != list(b["order"]) or a["track"] != b["track"]:
        return (None, "MISMATCH")
    st["final"] = {"winner": a["winner"], "order": list(a["order"]), "track": a["track"], "sec": a["sec"]}
    if a["winner"] is None:
        return (None, "DRAW")
    reason = "FINISH" if any(t is not None for t in a["order"]) else "FARTHER"
    return (host if a["winner"] == "host" else guest, reason)


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    now = _now_ms()
    return {
        "rep": {},
        "p": [int(m.challenger_id), int(m.opponent_id)],
        "track": TRACK,
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
    r = _clean(data)
    if _report(st, member_id) is not None:
        raise_app_error("BUMPERVS_ALREADY")
    now_ms = _ms(now)
    if now_ms - int(st.get("at") or 0) < MIN_PLAY_SEC * 1000:
        raise_app_error("BUMPERVS_TOO_EARLY")
    r["at"] = now_ms
    st.setdefault("rep", {})[str(member_id)] = r
    if all(_report(st, p) is not None for p in _players(m)):
        return _judge(m)
    return None


def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다 — 한쪽만 보낸 결과는 받지 않는다. 늘 무승부."""
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 두 사람 결과가 서로 맞아 승부가 난 판만."""
    return m.end_reason in ("FINISH", "FARTHER")


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    host, guest = _players(m)
    me_host = member_id == host
    out = {"track": _track(st), "role": "host" if me_host else "guest"}
    if board:
        out["reported"] = {
            "me": _report(st, member_id) is not None,
            "rival": _report(st, guest if me_host else host) is not None,
        }
        out["until"] = st.get("until")
    final = st.get("final")
    if m.status == "DONE" and isinstance(final, dict):
        order = final.get("order") or [None, None]
        mine, theirs = (order[0], order[1]) if me_host else (order[1], order[0])
        out["race"] = {"me": mine, "rival": theirs, "sec": final.get("sec")}  # 내 기록 · 상대 기록(초, 못 들어왔으면 None)
        if isinstance(final.get("track"), int):
            out["track"] = final["track"]
    return out
