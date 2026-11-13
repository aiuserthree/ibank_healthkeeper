"""꿀꺽 젤리 숲 대전 — 동료와 실시간 1:1 대전 엔진. 경기는 두 사람 브라우저가 실시간 통로로 하고, 서버는 결과만 받는다.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/jellyvs.html, 3D 숲 · 젤리 · 통신은 web/_shared/jellyvs-vs.js(three.js 는 web/_shared/jellyvs-three.js),
실시간 통로는 app/routers/realtime_ws.py(/api/play/rt/{판 id}) — 도전한 사람(host)이 판을 계산하고 받은 사람(guest)은 받아 그린다.
옥상 배구(versus_volley.py)와 같은 흐름이고, 결과 모양 · 검증만 이 게임에 맞췄다.

규칙(한 판 2분)
  · 두 젤리가 같은 숲(host 가 정한 시드 — 열매 · 버섯 · 별빛 구슬 · 숲 친구 배치가 같다)에서 먹고 자란다.
  · 상대보다 1.2배 넘게 크면 부딪혀 상대를 삼킨다 → 바로 승("EATEN"). 처음 15초(SAFE_SEC)는 서로 삼킬 수 없다.
    대시하는 동안 · 물린 직후 잠깐은 삼켜지지 않는다(화면이 판단 — 서버는 결과만 본다).
  · 2분이 끝나면 더 큰 쪽 승("SIZE"). 큰 쪽이 작은 쪽의 1.02배보다 작으면(크기 차이가 아주 작으면) 무승부("EVEN").
  · 가시대왕은 둘 다에게 위협인 중립 큰 녀석 — 물리면 몸이 줄고, 더 커지면 삼켜 크게 자랄 수 있다(화면 몫).

흐름
  · 수락하면 판이 열린다. 두 사람이 화면에 들어와 둘 다 「준비」를 누르면 3초 뒤 host 가 시작한다.
  · 경기가 끝나면 두 사람이 각자 결과를 보낸다 —
      {"winner": "host" | "guest" | "draw", "size": [주인 크기, 손님 크기], "eaten": true | false, "sec": 경기 초}
    크기는 100배한 정수(3.42 → 342). 결과는 host 계산이 기준 — guest 는 host 가 보낸 끝 소식을 그대로 보낸다.
  · 둘 다 보냈고 winner · size · eaten 이 같으면 끝. 다르면 다시 묻지 않고 무승부("MISMATCH", 도장 · 순위에 세지 않는다).
  · 결과는 수락 뒤 MIN_PLAY_SEC 이 지나야 받는다 — 경기를 하지 않고 결과만 주고받아 승수를 쌓지 못하게.
  · 판 전체 기한은 수락 + 2시간. 한 사람이 결과를 보냈으면 그때부터 30분(더 이르면 그것)으로 줄인다.
    기한이 지나면 한쪽만 보낸 결과라도 받지 않고 무승부(TIMEOUT_DRAW) — 한쪽 주장만으로 승패를 정하지 않는다.
  · 경기 중 기권(공통 RESIGN)은 상대 승이지만 도장 · 순위에는 세지 않는다. 도장 · 순위는 서로 맞은 결과(EATEN · SIZE · EVEN)만 센다.

결과 검증(act)
  · size 는 두 칸 정수 MIN_SIZE~MAX_SIZE, eaten 은 참/거짓, sec 는 0~MAX_SEC 숫자.
  · eaten 이면: winner 는 host · guest 중 하나, 이긴 쪽이 진 쪽의 1.2배 이상(반올림 여유 1.18배), SAFE_SEC 이후.
  · eaten 이 아니면: 2분을 다 채운 경기(sec ≥ ROUND_SEC - 5)이고, winner 는 크기 규칙(1.02배 미만이면 draw, 아니면 큰 쪽)과 같아야 한다.

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 따로 보내므로 seq 는 보지 않는다(STALE_CHECK False)
  {"winner": ..., "size": [h, g], "eaten": bool, "sec": s}   (op 는 없어도 되고, 있으면 "result")

판(m.state)
  p: [주인 id, 손님 id] · at: 수락 시각(epoch ms) · until: 판 전체 기한(epoch ms)
  rep: {str(id): {"winner", "size", "eaten", "sec", "at": 보낸 시각}} — 결과를 보낸 사람만
  final: {"winner", "size": [주인, 손님], "eaten", "sec"} — 서로 맞은 결과로 끝난 판만
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "jellyvs"
NAME = "젤리 숲 대전"
REASONS = {
    "EATEN": "꿀꺽 삼킴",
    "SIZE": "2분 뒤 크기",
    "EVEN": "크기가 같아 무승부",
    "MISMATCH": "결과가 서로 달라 무승부",
    "TIMEOUT_DRAW": "기한 · 결과 없음",
    "RESIGN": "기권",
}
DRAWS = ("EVEN", "MISMATCH")
STALE_CHECK = False  # 두 사람이 따로 결과를 보낸다
SUPPORTS_BOT = False  # 컴퓨터와는 화면(jellyvs-vs.js)에서 연습으로만 — 기록하지 않는다
BOT_ID = 0  # match.BOT_ID 와 같은 값

ROUND_SEC = 120  # 한 판 2분 (화면 jellyvs-vs.js ROUND 와 같은 값)
SAFE_SEC = 15  # 시작 뒤 이만큼은 서로 삼킬 수 없다 (화면 SAFE 와 같은 값)
EAT_RATIO = 1.2  # 이만큼 더 커야 상대를 삼킨다 (화면 PVP 와 같은 값)
EVEN_RATIO = 1.02  # 2분 뒤 큰 쪽이 이것보다 작은 배율이면 무승부 (화면 EVEN 과 같은 값)
MIN_SIZE = 50  # 크기 × 100 — 젤리는 0.75 밑으로 줄지 않지만 여유를 둔다
MAX_SIZE = 9999
GAME_HOURS = 2  # 판 전체 기한 — 수락부터
AFTER_REPORT_MIN = 30  # 한 사람이 결과를 보낸 뒤 상대를 기다리는 최대 시간
MIN_PLAY_SEC = 30  # 수락 뒤 이만큼 지나야 결과를 받는다(준비 · 3초 세기 · 서로 삼킬 수 없는 15초 — 가장 빨리 끝나는 판도 이보다 길다)
MAX_SEC = 7200
WINNERS = ("host", "guest", "draw")

register_messages(
    {
        "JELLYVS_BAD": "보낼 수 없는 결과예요. 화면을 새로 불러 주세요.",
        "JELLYVS_TOO_EARLY": "아직 경기가 끝날 시간이 아니에요.",
        "JELLYVS_ALREADY": "결과는 이미 보냈어요.",
    },
    {"JELLYVS_BAD": 400, "JELLYVS_TOO_EARLY": 409, "JELLYVS_ALREADY": 409},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


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


def size_winner(h: int, g: int) -> str:
    """2분이 끝났을 때 — 큰 쪽이 작은 쪽의 1.02배보다 작으면 무승부, 아니면 큰 쪽 (화면 jellyvs-vs.js sizeWinner 와 같은 셈)."""
    big, small = max(h, g), min(h, g)
    if big * 100 < small * round(EVEN_RATIO * 100):
        return "draw"
    return "host" if h > g else "guest"


def _check(data: dict) -> dict:
    """보낸 결과가 규칙에 맞는지 — 맞으면 저장할 모양으로 돌려준다."""
    if data.get("op", "result") != "result":
        raise_app_error("JELLYVS_BAD")
    winner = data.get("winner")
    if winner not in WINNERS:
        raise_app_error("JELLYVS_BAD")
    size = data.get("size")
    if not isinstance(size, list) or len(size) != 2 or not all(_is_int(x) and MIN_SIZE <= x <= MAX_SIZE for x in size):
        raise_app_error("JELLYVS_BAD")
    h, g = size
    eaten = data.get("eaten")
    if not isinstance(eaten, bool):
        raise_app_error("JELLYVS_BAD")
    sec = data.get("sec")
    if not isinstance(sec, (int, float)) or isinstance(sec, bool) or not 0 <= sec <= MAX_SEC:
        raise_app_error("JELLYVS_BAD")
    if eaten:
        # 삼킨 판 — 이긴 쪽이 1.2배 이상 컸다(크기를 100배해 반올림했으니 1.18배까지 봐준다), 처음 15초 뒤
        if winner == "draw":
            raise_app_error("JELLYVS_BAD")
        w, l = (h, g) if winner == "host" else (g, h)
        if w * 100 < l * round((EAT_RATIO - 0.02) * 100) or sec < SAFE_SEC - 0.5 or sec > ROUND_SEC + 1:
            raise_app_error("JELLYVS_BAD")
    else:
        # 2분을 다 채운 판 — 크기 규칙과 같은 승자
        if sec < ROUND_SEC - 5 or winner != size_winner(h, g):
            raise_app_error("JELLYVS_BAD")
    return {"winner": winner, "size": [h, g], "eaten": eaten, "sec": round(float(sec), 1)}


def _judge(m) -> tuple:
    st = m.state
    host, guest = _players(m)
    ra, rb = _report(st, host), _report(st, guest)
    keys = ("winner", "size", "eaten")
    if any(ra.get(k) != rb.get(k) for k in keys):
        return (None, "MISMATCH")
    st["final"] = {"winner": ra["winner"], "size": list(ra["size"]), "eaten": ra["eaten"], "sec": ra.get("sec", 0)}
    if ra["winner"] == "draw":
        return (None, "EVEN")
    return (host if ra["winner"] == "host" else guest, "EATEN" if ra["eaten"] else "SIZE")


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    now = _now_ms()
    return {
        "rep": {},
        "p": [int(m.challenger_id), int(m.opponent_id)],
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
    if not isinstance(data, dict):
        raise_app_error("JELLYVS_BAD")
    rep = _check(data)
    if member_id not in _players(m):
        raise_app_error("JELLYVS_BAD")
    if _report(st, member_id) is not None:
        raise_app_error("JELLYVS_ALREADY")
    now_ms = _ms(now)
    if now_ms - int(st.get("at") or 0) < MIN_PLAY_SEC * 1000:
        raise_app_error("JELLYVS_TOO_EARLY")
    st.setdefault("rep", {})[str(member_id)] = {**rep, "at": now_ms}
    if all(_report(st, p) is not None for p in _players(m)):
        return _judge(m)
    return None


def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다 — 한쪽만 보낸 결과는 받지 않는다. 늘 무승부."""
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 두 사람 결과가 서로 맞은 판만(삼킴 · 크기 · 같은 크기 무승부)."""
    return m.end_reason in ("EATEN", "SIZE", "EVEN")


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    host, guest = _players(m)
    me_host = member_id == host
    out = {"role": "host" if me_host else "guest", "round": ROUND_SEC}
    if board:
        out["reported"] = {
            "me": _report(st, member_id) is not None,
            "rival": _report(st, guest if me_host else host) is not None,
        }
        out["until"] = st.get("until")
    final = st.get("final")
    if m.status == "DONE" and isinstance(final, dict) and isinstance(final.get("size"), list) and len(final["size"]) == 2:
        h, g = final["size"]
        out["size"] = [h, g] if me_host else [g, h]  # [내 크기, 상대 크기] × 100
        out["eaten"] = bool(final.get("eaten"))
    return out
