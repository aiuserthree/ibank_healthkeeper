"""뿅뿅 달나라 대포 대전 — 동료와 실시간 1:1 대전 엔진. 두 사람 브라우저가 같은 결정적 엔진을 돌리고, 서버는 결과만 맞춰 본다.

규약은 app/services/match.py 맨 위 「대전 엔진 규약」. 이 파일은 match.py 를 import 하지 않는다.
화면은 web/games/moonshotvs.html(로비 · 연결 · 결과) + 전장 본체 web/games/embed/moonshot.html?vs=1(엔진 · 조준 · 그리기),
실시간 통로는 app/routers/realtime_ws.py(/api/play/rt/{판 id}). 꿀꺽 젤리 숲 대전(versus_jellyvs.py)과 같은 「결과 보고형」 흐름이고,
다른 점은 판 계산을 host 혼자가 아니라 두 화면이 같이 한다는 것(잠금 걸음):
  · 두 화면이 같은 엔진(판본 ver = 엔진 글자 전체의 해시)을 돌린다. 행동 한 줄(이동 + 각도 · 힘 · 무기 · 방향 · 아이템, 또는 넘김)만 통로로 오간다.
  · 도전한 사람(host) 화면이 행동 순서(번호)와 차례 시계(20초)를 정한다. 두 화면은 번호 순서대로 같은 행동을 적용한다.
  · 차례마다 두 화면이 엔진 상태 해시를 주고받아 맞춰 본다(화면 몫). 끝내 어긋나면 화면이 「무효」를 보내 판을 결과 없이 끝낸다.

흐름
  · 수락하면 판이 열린다 — 씨앗(seed, 32비트)은 서버가 정한다(host 가 좋은 맵이 나올 때까지 씨앗을 돌리지 못하게). 맵은 host 가 고른다.
  · 끝나면 두 사람이 각자 결과를 보낸다 —
      {"winner": "host" | "guest" | "draw", "how": 끝난 꼴, "hash": 끝 상태 해시(16진 8자), "turns": 차례 수, "sec": 경기 초,
       "map": 맵 번호 1~6, "ver": 엔진 판본, "log": [행동 한 줄 글자, …]}
    how ∈ hp(체력을 다 깎음) · sea(별바다에 빠뜨림) · more(같이 쓰러졌지만 체력이 많음) · both(같이 쓰러져 비김) · cap(너무 길어 비김).
  · 둘 다 보냈고 winner · how · hash · turns · map · ver 가 같으면 끝. 다르면 다시 묻지 않고 무승부("MISMATCH", 도장 · 순위에 세지 않는다).
  · 결과는 수락 뒤 MIN_PLAY_SEC 이 지나야 받는다 — 경기를 하지 않고 결과만 주고받아 승수를 쌓지 못하게(화면은 받아 줄 때까지 다시 보낸다).
  · 판 전체 기한은 수락 + 2시간. 한 사람이 결과를 보냈으면 그때부터 30분(더 이르면 그것)으로 줄인다.
    기한이 지나면 한쪽만 보낸 결과라도 받지 않고 무승부(TIMEOUT_DRAW) — 한쪽 주장만으로 승패를 정하지 않는다.
  · 「무효」 {"op": "void"} — 화면끼리 판이 어긋났을 때(다시 맞춰 봐도 해시가 다름) 화면이 보낸다. 한 사람만 보내도 바로 끝(VOID, 승자 없음, 세지 않음).
    한 사람이 틀린 결과를 보내 MISMATCH 로 만드는 것과 효과가 같다(어느 쪽도 승을 얻지 못함) — 그래서 한쪽 말로 끝내도 된다.
  · 경기 중 기권(공통 RESIGN)은 상대 승이지만 도장 · 순위에는 세지 않는다. 도장 · 순위는 서로 맞은 결과(HP · SEA · MORE · DRAW)만 센다.

결과 검증(act) — 화면 엔진의 encodeAct / decodeAct 와 같은 잣대
  · winner 와 how 가 어긋나지 않음(hp · sea · more 는 승자가 있고, both · cap 은 draw). hash 는 16진 8자, ver 는 "m1-" + 16진 8자.
  · turns 1~TURN_CAP, map 1~MAP_COUNT, sec 0~MAX_SEC.
  · log 는 글자 목록 — 줄 수 turns-2 ~ turns+4 · LOG_MAX 줄 이하 · 모두 합쳐 LOG_CHARS 자 이하. 한 줄은 엔진이 만드는 꼴 그대로(키 순서까지 —
    {"m":[[±1,걸음],…],"a":각도,"p":힘,"w":무기,"f":±1,"i":아이템?} 또는 {"m":[…],"pass":1}, 각도 −900~900 · 힘 0~1000 · 이동 합 3000 이하).
  · log 는 승패 비교에 넣지 않는다(끝 해시가 판 전체를 담는다) — host 것을 final 에 적어 둔다(나중에 다툰 판을 다시 돌려 볼 수 있게).

행동(화면이 HKApi.matchMove(id, {data}, seq) 로 보내는 data) — 둘이 따로 보내므로 seq 는 보지 않는다(STALE_CHECK False)
  결과: {"op": "result"(없어도 됨), …위 키…}   무효: {"op": "void"}

판(m.state)
  p: [주인 id, 손님 id] · seed: 씨앗 · at: 수락 시각(epoch ms) · until: 판 전체 기한(epoch ms)
  rep: {str(id): {"winner", "how", "hash", "turns", "sec", "map", "ver", "at"}} — 결과를 보낸 사람만(log 는 rep 에 두지 않고 logs 에)
  logs: {str(id): [행동 한 줄, …]} · final: {"winner", "how", "hash", "turns", "sec", "map", "ver", "log"} — 서로 맞은 결과로 끝난 판만
"""

from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from app.core.errors import raise_app_error, register_messages

KEY = "moonshotvs"
NAME = "달나라 대포 대전"
REASONS = {
    "HP": "체력을 다 깎음",
    "SEA": "별바다에 빠뜨림",
    "MORE": "같이 쓰러졌지만 체력이 더 많음",
    "DRAW": "비김",
    "MISMATCH": "결과가 서로 달라 무승부",
    "VOID": "화면끼리 판이 어긋나 무효",
    "TIMEOUT_DRAW": "기한 · 결과 없음",
    "RESIGN": "기권",
}
DRAWS = ("DRAW", "MISMATCH", "VOID")
STALE_CHECK = False  # 두 사람이 따로 결과를 보낸다
SUPPORTS_BOT = False  # 컴퓨터와는 혼자 하기(/games/moonshot)에서 — 기록하지 않는다
BOT_ID = 0  # match.BOT_ID 와 같은 값

TURN_SEC = 20  # 차례 시간(화면 엔진 AIM_TICKS 와 같은 값 — 보여 주기용, 시계는 host 화면이 잰다)
TURN_CAP = 120  # 엔진 TURN_CAP — 이 차례에 이르면 남은 체력으로 끝(1:1 은 비김)
MAP_COUNT = 6  # 맵 가짓수 — 엔진 MAP_KEYS(calm · canyon · ice · mushroom · ring · valley) 순서로 1~6
GAME_HOURS = 2  # 판 전체 기한 — 수락부터
AFTER_REPORT_MIN = 30  # 한 사람이 결과를 보낸 뒤 상대를 기다리는 최대 시간
MIN_PLAY_SEC = 45  # 수락 뒤 이만큼 지나야 결과를 받는다(연결 · 고르기 · 3초 세기 · 가장 빠른 판 3차례 — versus/WHERE-WE-STOPPED.md)
MAX_SEC = 7200
LOG_MAX = 260  # 행동 줄 수 상한(120차례 + 「한 번 더」 둘째 발)
LOG_CHARS = 64000  # 행동 글자 합 상한
LINE_CHARS = 4000  # 한 줄 상한(엔진 decodeAct 와 같은 값)
MOVE_MAX = 3000  # 한 줄의 이동 걸음 합 상한(엔진 cleanAct 와 같은 값)
MOVE_PARTS = 400  # 한 줄의 이동 조각 수 상한(엔진 cleanAct 와 같은 값)
WINNERS = ("host", "guest", "draw")
WIN_HOW = ("hp", "sea", "more")  # 승자가 있는 끝
HOW_REASON = {"hp": "HP", "sea": "SEA", "more": "MORE", "both": "DRAW", "cap": "DRAW"}
# 엔진 무기 · 아이템 key — src/sim.js WEAPONS · ITEMS 와 같아야 한다(시험 test_moonshotvs.py 가 본체 파일과 맞춰 본다)
WEAPONS = ("mochi", "sticky", "meteor", "shell", "acorn3", "rain", "drill", "tunnel", "icebolt", "icicle", "starsplit", "firefly")
ITEMS = ("again", "band", "bubble", "hole", "calm", "king", "scope")
SAME_KEYS = ("winner", "how", "hash", "turns", "map", "ver")  # 두 결과가 같아야 하는 칸
_HASH = re.compile(r"[0-9a-f]{8}")
_VER = re.compile(r"m1-[0-9a-f]{8}")

register_messages(
    {
        "MOONSHOTVS_BAD": "보낼 수 없는 결과예요. 화면을 새로 불러 주세요.",
        "MOONSHOTVS_TOO_EARLY": "아직 경기가 끝날 시간이 아니에요.",
        "MOONSHOTVS_ALREADY": "결과는 이미 보냈어요.",
    },
    {"MOONSHOTVS_BAD": 400, "MOONSHOTVS_TOO_EARLY": 409, "MOONSHOTVS_ALREADY": 409},
)


# ── 작은 도구 ──
def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(now: datetime) -> int:
    return int(now.timestamp() * 1000)


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _players(m) -> list:
    """[주인(도전한 사람), 손님(받은 사람)] — 실시간 통로(realtime_ws)와 같은 자리. 엔진 자리 0 = 주인, 1 = 손님."""
    st = m.state or {}
    p = st.get("p")
    if isinstance(p, list) and len(p) == 2:
        return [int(x) for x in p]
    return [m.challenger_id, m.opponent_id]


def _report(st: dict, pid) -> Optional[dict]:
    r = (st.get("rep") or {}).get(str(pid))
    return r if isinstance(r, dict) else None


def clean_line(s) -> Optional[str]:
    """행동 한 줄이 엔진(encodeAct)이 만드는 꼴 그대로인지 — 맞으면 그 글자, 아니면 None."""
    if not isinstance(s, str) or not s or len(s) > LINE_CHARS:
        return None
    try:
        o = json.loads(s)
    except (ValueError, RecursionError):
        return None
    if not isinstance(o, dict):
        return None
    ms = o.get("m", [])
    if not isinstance(ms, list) or len(ms) > MOVE_PARTS:
        return None
    moves, tot = [], 0
    for e in ms:
        if not isinstance(e, list) or len(e) != 2:
            return None
        d, k = e
        if not _is_int(d) or d not in (1, -1) or not _is_int(k) or not 1 <= k <= MOVE_MAX:
            return None
        tot += k
        if tot > MOVE_MAX:
            return None
        moves.append([d, k])
    if o.get("pass"):
        out = {"m": moves, "pass": 1}
    else:
        a, p, w, f = o.get("a"), o.get("p"), o.get("w"), o.get("f")
        if not _is_int(a) or not -900 <= a <= 900 or not _is_int(p) or not 0 <= p <= 1000:
            return None
        if w not in WEAPONS or not _is_int(f) or f not in (1, -1):
            return None
        out = {"m": moves, "a": a, "p": p, "w": w, "f": f}
        if o.get("i") is not None:
            if o["i"] not in ITEMS:
                return None
            out["i"] = o["i"]
    canon = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    return canon if canon == s else None


def _check(data: dict) -> dict:
    """보낸 결과가 규칙에 맞는지 — 맞으면 저장할 모양(rep · log)으로 돌려준다."""
    if data.get("op", "result") != "result":
        raise_app_error("MOONSHOTVS_BAD")
    winner, how = data.get("winner"), data.get("how")
    if winner not in WINNERS or how not in HOW_REASON:
        raise_app_error("MOONSHOTVS_BAD")
    if (how in WIN_HOW) != (winner != "draw"):
        raise_app_error("MOONSHOTVS_BAD")
    h, ver = data.get("hash"), data.get("ver")
    if not isinstance(h, str) or not _HASH.fullmatch(h) or not isinstance(ver, str) or not _VER.fullmatch(ver):
        raise_app_error("MOONSHOTVS_BAD")
    turns, mp, sec = data.get("turns"), data.get("map"), data.get("sec")
    if not _is_int(turns) or not 1 <= turns <= TURN_CAP or not _is_int(mp) or not 1 <= mp <= MAP_COUNT:
        raise_app_error("MOONSHOTVS_BAD")
    if not isinstance(sec, (int, float)) or isinstance(sec, bool) or not 0 <= sec <= MAX_SEC:
        raise_app_error("MOONSHOTVS_BAD")
    log = data.get("log")
    if not isinstance(log, list) or len(log) > LOG_MAX or not turns - 2 <= len(log) <= turns + 4:
        raise_app_error("MOONSHOTVS_BAD")
    if sum(len(x) if isinstance(x, str) else LOG_CHARS + 1 for x in log) > LOG_CHARS:
        raise_app_error("MOONSHOTVS_BAD")
    if any(clean_line(x) is None for x in log):
        raise_app_error("MOONSHOTVS_BAD")
    rep = {"winner": winner, "how": how, "hash": h, "turns": turns, "sec": round(float(sec), 1), "map": mp, "ver": ver}
    return {"rep": rep, "log": list(log)}


def _judge(m) -> tuple:
    st = m.state
    host, guest = _players(m)
    ra, rb = _report(st, host), _report(st, guest)
    if any(ra.get(k) != rb.get(k) for k in SAME_KEYS):
        return (None, "MISMATCH")
    st["final"] = {**{k: ra[k] for k in SAME_KEYS}, "sec": ra.get("sec", 0), "log": list((st.get("logs") or {}).get(str(host)) or [])}
    if ra["winner"] == "draw":
        return (None, "DRAW")
    return (host if ra["winner"] == "host" else guest, HOW_REASON[ra["how"]])


# ── 규약 함수 ──
def start(m, players: tuple, rnd) -> dict:
    now = _now_ms()
    r = rnd if isinstance(rnd, random.Random) else random.Random()
    return {
        "rep": {},
        "logs": {},
        "p": [int(m.challenger_id), int(m.opponent_id)],
        "seed": r.getrandbits(32),
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
    if not isinstance(data, dict) or member_id not in _players(m):
        raise_app_error("MOONSHOTVS_BAD")
    if data.get("op") == "void":  # 화면끼리 판이 어긋남 — 결과 없이 끝(승자 없음 · 세지 않음)
        return (None, "VOID")
    got = _check(data)
    if _report(st, member_id) is not None:
        raise_app_error("MOONSHOTVS_ALREADY")
    now_ms = _ms(now)
    if now_ms - int(st.get("at") or 0) < MIN_PLAY_SEC * 1000:
        raise_app_error("MOONSHOTVS_TOO_EARLY")
    st.setdefault("rep", {})[str(member_id)] = {**got["rep"], "at": now_ms}
    st.setdefault("logs", {})[str(member_id)] = got["log"]
    if all(_report(st, p) is not None for p in _players(m)):
        return _judge(m)
    return None


def on_timeout(m, now: datetime) -> tuple:
    """기한이 지났다 — 한쪽만 보낸 결과는 받지 않는다. 늘 무승부."""
    return (None, "TIMEOUT_DRAW")


def counts(m) -> bool:
    """도장 · 순위에 셀 판 — 두 사람 결과가 서로 맞은 판만(체력 · 별바다 · 체력 비교 · 비김)."""
    return m.end_reason in ("HP", "SEA", "MORE", "DRAW")


def view(m, member_id: int, board: bool) -> dict:
    st = m.state or {}
    host, guest = _players(m)
    me_host = member_id == host
    out = {"role": "host" if me_host else "guest", "turnSec": TURN_SEC}
    if board:
        out["seed"] = st.get("seed")  # 두 사람 화면이 같은 판을 차린다(판 주인 둘에게만 — 목록 줄에는 넣지 않음)
        out["reported"] = {
            "me": _report(st, member_id) is not None,
            "rival": _report(st, guest if me_host else host) is not None,
        }
        out["until"] = st.get("until")
    final = st.get("final")
    if m.status == "DONE" and isinstance(final, dict):
        out["how"] = final.get("how")
        out["turns"] = final.get("turns")
        out["map"] = final.get("map")
    return out
