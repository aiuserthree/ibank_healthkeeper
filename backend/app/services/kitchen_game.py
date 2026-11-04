"""2인 협동 「점심 분식집」 — 협동 시리즈 「오늘도 둘이서」 1화. 홀과 주방이 3분 동안 분식집을 운영한다.

홀: 줄 선 손님을 자리에 안내하고, 주문을 주방에 전달하고, 다 된 음식을 서빙하고, 테이블을 치운다.
    포장 손님은 줄을 서지 않고 포장대(카운터)에 바로 선다 — 음식이 나오면 홀이 건넨다(자리 · 치우기 없음).
주방: 화구 2개로 떡볶이·라면·어묵을 끓이고(다 익고 오래 두면 탄다), 김밥을 만다. 다 되면 벨로 홀을 부른다.
주방은 주문을 직접 볼 수 없어 홀이 전달해 줘야 한다 — 둘이 말로 손발을 맞추는 게 핵심.

그 밖의 규칙
- 단골손님(★): 1.5배를 내지만 오래 못 기다린다. 첫 손님은 늘 문 반장님(떡볶이 하나 — 단골이지만 느긋하다).
- 콤보: 기다림 막대가 반 넘게 남았을 때 내면 콤보가 오르고 팁이 커진다(최대 2배). 늦게 내거나 손님을 놓치거나
  음식을 태우면 끊긴다.
- 점심 러시: 가운데쯤(95~125초) 손님이 한꺼번에 몰린다. 복순 사장님이 병원에서 전화로 미리 알려 준다.
- 오늘의 메뉴: 판마다 한 가지 — 한 그릇에 1,000원을 더 받고, 손님들이 자주 시킨다.
- 손님을 HEARTS 명 놓치면 가게 문을 일찍 닫는다(끝 코드 HEARTS — 실패로 친다).

시간으로 흘러가는 일(손님 도착 · 기다리다 떠남 · 식사 끝 · 음식이 탐 · 사장님 전화 · 영업 끝)은 서버가 요청을 받을 때마다
advance() 로 '지금'까지 시간 순서대로 처리한다. 손님 도착표와 사장님 전화는 시작할 때 한 번에 정해 두므로
같은 상태에서 언제 다시 계산해도 결과가 같다(동작이 실패해 저장이 안 돼도 다음 요청이 똑같이 다시 만든다).
화면은 next_event 시각에 다시 물어 와서 바뀐 걸 받는다. 화면 효과(동전 · 콤보 · 벨 · 놓친 손님)는 ev 목록으로 알린다.

판마다 벌 수 있는 돈이 고르도록, 도착표는 후보 몇 개를 만들어 음식값 합 · 음식 수 · 단골 · 포장 수가 가운데에 가장 가까운 걸 고른다.

상태 모양: 첫 버전이 저장한 방(지난 기록 · 배포할 때 진행 중이던 방)에는 새 칸(오늘의 메뉴 · 포장대 · 콤보 · 사장님 말 …)이
없다. 상태를 읽는 함수는 모두 _k() 로 빈 칸을 채운 뒤 쓴다(k["v"] 가 STATE_V 면 이미 새 모양).
"""

from __future__ import annotations

import copy
import random
from dataclasses import dataclass
from typing import Optional

from app.core.errors import raise_app_error, register_messages

SHIFT_SEC = 180
TABLES = 3
COUNTER = 2  # 포장대 칸
BURNERS = 2
QUEUE_MAX = 4
QUEUE_PATIENCE = 25  # 줄에서 기다리는 시간
TABLE_PATIENCE = 55  # 자리에 앉아 음식을 기다리는 시간
VIP_QUEUE_PATIENCE = 17  # 단골은 성격이 급하다
VIP_TABLE_PATIENCE = 40
TOGO_PATIENCE = 50  # 포장 손님이 포장대에서 기다리는 시간(요리 시간 포함)
EAT_SEC = 4
BURN_SEC = 6  # 다 익은 뒤 이만큼 지나면 탄다
PASS_MAX = 6  # 배식구에 올려 둘 수 있는 음식
GIMBAP_STEPS = ("밥 펴기", "재료 올리기", "돌돌 말기", "썰기")
HEARTS = 5  # 손님을 이만큼 놓치면 문을 닫는다(봇 시뮬레이션: 처음 하는 팀 넷 중 하나쯤 · 익숙한 팀은 거의 안 닫음)
ACT_GAP = 0.15  # 같은 사람 연타 막기(초)
BELL_GAP = 1.0  # 벨 연타 막기(초)

VIP_RATE = 1.5  # 단골은 음식값을 1.5배 낸다
TODAY_BONUS = 1000  # 오늘의 메뉴 한 그릇마다 더 받는 돈
TIP_RATE = 0.3  # 팁 = 음식값 × 0.3 × 남은 기다림 비율 × 콤보 배수
QUICK = 0.5  # 남은 기다림이 이 비율 이상일 때 내면 '빠른 서빙' — 콤보가 오른다
COMBO_STEP = 0.25  # 콤보 하나마다 팁 배수 +0.25
COMBO_CAP = 5  # 콤보 5부터 팁 2배
RUSH_AT, RUSH_END = 95, 125  # 점심 러시(시작 뒤 초)
SAY_SEC = 6  # 사장님 말풍선을 보여 주는 시간(화면용)
EV_KEEP = 24
LOG_KEEP = 30

STATE_V = 2  # 상태 모양 번호 — 첫 버전(번호 없음)이 저장한 상태는 _k() 가 이 모양으로 맞춘다
OLD_HEARTS = 3  # 첫 버전의 하트 수(예전 판의 남은 하트를 그대로 그리려고)

# 도착표 고르기 — 손님을 다 받았을 때 음식값 합 · 음식 수 · 단골 · 포장 수의 가운데(3000판 셈)
SCHEDULE_TRIES = 12
POT_MID, ITEMS_MID, VIP_MID, TOGO_MID = 139000, 35, 3, 4

register_messages({
    "KITCHEN_GONE": "그 손님은 이미 떠났어요.",
    "KITCHEN_SENT": "이미 주방에 전달한 주문이에요.",
    "KITCHEN_HALL_ONLY": "홀에서 하는 일이에요.",
    "KITCHEN_KITCHEN_ONLY": "주방에서 하는 일이에요.",
    "KITCHEN_BURNER_BUSY": "그 화구는 이미 쓰고 있어요.",
    "KITCHEN_NO_GUEST": "기다리는 손님이 없어요.",
})


@dataclass(frozen=True)
class Dish:
    key: str
    name: str
    price: int
    cook: float  # 화구에서 익는 시간 — 0 이면 김밥(말기)
    weight: int


MENU = {
    d.key: d
    for d in (
        Dish("tteok", "떡볶이", 3500, 7, 3),
        Dish("ramen", "라면", 4000, 6, 3),
        Dish("odeng", "어묵", 2500, 4, 2),
        Dish("gimbap", "김밥", 3000, 0, 2),
    )
}
BURNER_DISHES = tuple(k for k, d in MENU.items() if d.cook)
# 포장 손님이 잘 시키는 것 — 김밥 · 떡볶이
TOGO_WEIGHT = {"tteok": 3, "ramen": 0, "odeng": 1, "gimbap": 4}

NPC = {"boksun": "복순 사장님", "mun": "문 반장님", "shop": "가게 소식"}


class KitchenRoom:
    """방 정보 — 방탈출 방(Room)과 같은 이름의 값을 갖춰 협동 방 공용 코드가 그대로 쓴다."""

    key = "lunch"
    title = "점심 분식집"
    label = "협동 게임"
    page = "kitchen"
    game = "kitchen"
    blurb = "둘이 홀과 주방을 나눠 3분 동안 분식집을 운영하는 협동 게임이에요."
    intro = (
        "한 사람은 홀에서 손님을 앉히고 주문을 전달해 서빙하고, 한 사람은 주방에서 분식을 만들어요. "
        "주방은 주문을 못 봐서 홀이 알려 줘야 해요. 3분 동안 매출을 올려 보세요."
    )
    outro = "오늘도 고생 많았어요. 손님들이 맛있게 먹고 갔어요!"
    sides = {"hall": "홀", "kitchen": "주방"}
    limit_sec = SHIFT_SEC


ROOM = KitchenRoom()


def _err(code: str) -> None:
    raise_app_error(code)


def _r100(x: float) -> int:
    return int(round(x / 100)) * 100


def combo_mult(combo: int) -> float:
    """콤보 n 일 때 팁 배수 — 1번째 1배, 2번째 1.25배 … 5번째부터 2배."""
    return 1.0 + COMBO_STEP * max(0, min(combo, COMBO_CAP) - 1)


def _josa(word: str, with_final: str, without_final: str) -> str:
    """받침에 맞는 조사 — 받침이 있으면 with_final(이 · 을), 없으면 without_final(가 · 를)."""
    ch = word[-1:] or "가"
    if "가" <= ch <= "힣":
        return with_final if (ord(ch) - 0xAC00) % 28 else without_final
    return with_final


def _guest_name(g: dict, default: str) -> str:
    """기록에 쓰는 손님 이름 — 문 반장님처럼 이름 있는 손님은 이름으로."""
    return NPC.get(g.get("who") or "", "") or default


# ── 시작 · 도착표 ──────────────────────────────────────────────

def _pick(rnd: random.Random, n: int, today: str, togo: bool) -> list:
    keys = list(MENU)
    weights = [(TOGO_WEIGHT[k] if togo else MENU[k].weight) * (2 if k == today else 1) for k in keys]
    return rnd.choices(keys, weights, k=n)


def _schedule(rnd: random.Random, start: float, today: str) -> list:
    """손님 도착표 — 처음엔 드문드문 한 가지, 갈수록 자주 여러 가지. 러시 때는 한꺼번에 몰린다.

    첫 손님은 문 반장님(단골 · 떡볶이 하나 — 1화 이야기에서 시킨 그 떡볶이).
    """
    out = [{"id": 0, "at": start + 3.0, "items": ["tteok"], "vip": True, "togo": False, "who": "mun"}]
    t, i = 13.0, 1
    while t < SHIFT_SEC - 10:
        rush = RUSH_AT <= t < RUSH_END
        togo = t > 24 and rnd.random() < (0.3 if rush else 0.2)
        vip = not togo and t > 28 and rnd.random() < 0.16
        if togo:
            n = rnd.choice((1, 1, 2))
        elif t < 40:
            n = 1
        elif t < 95:
            n = rnd.choice((1, 2, 2))
        else:
            n = rnd.choice((1, 2, 2, 3))
        if vip:
            n = max(2, n)
        out.append({"id": i, "at": start + t, "items": _pick(rnd, n, today, togo), "vip": vip, "togo": togo})
        i += 1
        if rush:
            t += rnd.uniform(3.6, 5.0)
        else:
            frac = t / SHIFT_SEC
            t += max(6.0, 13.0 - 6.5 * frac + rnd.uniform(-1.5, 1.5))
    return out


def _beats(spawns: list, start: float, today: str) -> list:
    """사장님(병원에서 전화) · 문 반장님이 하는 말 — 정해 둔 시각에 나온다.

    말은 휴대폰 소식 줄 두 줄에 들어가게 짧게 쓴다(사장님 말은 화면이 「전화」 표시를 붙인다).
    문 반장님은 메뉴를 말하지 않는다 — 주문은 홀만 보고 주방에는 홀이 전달해야 하니까.
    """
    name = MENU[today].name
    plan = [
        (0.6, "boksun", f"병원 도착! 오늘의 메뉴는 {name}, 1,000원 더 받아요."),
        (3.2, "mun", "나 왔어요~ 늘 먹던 걸로 하나! 천천히 줘도 돼요."),
        (RUSH_AT - 7, "boksun", "큰일! 옆 건물 회의가 끝났대요. 곧 손님 몰려가요!"),
        (RUSH_AT, "shop", "점심 러시! 손님이 한꺼번에 몰려와요."),
        (RUSH_END, "boksun", "고비 넘겼죠? 조금만 더 힘내요!"),
        (SHIFT_SEC - 30, "boksun", "30초 남았어요! 나도 거의 다 왔어요~"),
    ]
    first_vip = next((s for s in spawns if s["vip"] and not s.get("who")), None)
    if first_vip:
        plan.append((first_vip["at"] - start, "boksun", "★ 단골손님이 와요. 성격이 급하니 먼저 앉혀요!"))
    first_togo = next((s for s in spawns if s["togo"]), None)
    if first_togo:
        plan.append((first_togo["at"] - start, "boksun", "포장 손님은 주문 전달하고, 나오면 포장대에서 건네요!"))
    plan.sort(key=lambda x: x[0])
    # 말풍선이 겹치지 않게 — 앞 말과 4초 안이면 조금 미룬다
    out, last = [], -99.0
    for at, who, text in plan:
        at = max(at, last + 4.0)
        if at >= SHIFT_SEC - 2:
            continue
        out.append({"at": start + at, "who": who, "text": text})
        last = at
    return out


def _pick_schedule(rnd: random.Random, now: float) -> tuple:
    """오늘의 메뉴와 도착표 — 후보 몇 개 가운데 판의 크기(음식값 합 · 음식 수 · 단골 · 포장)가 가운데에 가장 가까운 것.

    운 좋은 판 · 나쁜 판의 차이를 줄여 매출 순위와 「최고예요」 기준이 판보다 솜씨를 따르게 한다.
    (아무것도 안 고르면 음식값 합이 9.5만~19.5만 원까지 벌어진다 — 고르면 대부분 13만~14.5만 원)
    """
    best = None
    for _ in range(SCHEDULE_TRIES):
        today = rnd.choice(list(MENU))
        spawns = _schedule(rnd, now, today)
        pot = sum(_price({"today": today}, sp) for sp in spawns)
        items = sum(len(sp["items"]) for sp in spawns)
        vip = sum(1 for sp in spawns if sp["vip"])
        togo = sum(1 for sp in spawns if sp["togo"])
        gap = (abs(pot - POT_MID) / POT_MID + abs(items - ITEMS_MID) / ITEMS_MID
               + 0.04 * abs(vip - VIP_MID) + 0.03 * abs(togo - TOGO_MID))
        if best is None or gap < best[0]:
            best = (gap, today, spawns)
    return best[1], best[2]


def start(st: dict, now: float) -> None:
    seed = random.randrange(1 << 30)
    rnd = random.Random(seed)
    today, spawns = _pick_schedule(rnd, now)
    st["k"] = {
        "v": STATE_V, "maxHearts": HEARTS,
        "start": now, "end": now + SHIFT_SEC, "today": today,
        "spawns": spawns, "next": 0, "beats": _beats(spawns, now, today), "bi": 0,
        "queue": [], "counter": [None] * COUNTER, "tables": [{"s": "empty", "c": None} for _ in range(TABLES)],
        "burners": [None] * BURNERS, "gimbap": 0, "pass": [],
        "money": 0, "tips": 0, "hearts": HEARTS, "served": 0, "missed": 0, "burnt": 0,
        "vip": 0, "togo": 0, "combo": 0, "bestCombo": 0,
        "bell": {"n": 0, "at": 0}, "say": None, "ev": [], "evn": 0, "once": [],
        "over": False, "reason": None, "gap": {},
    }
    st["klog"] = []


def _k(st: dict) -> dict:
    """st["k"] — 첫 버전이 저장한 상태면 빈 칸을 채워 새 모양으로 맞춘다(그 자리에서 고친다 · 여러 번 불러도 같다).

    운영 DB 에는 첫 버전의 분식집 방(지난 기록 · 배포 때 진행 중이던 방)이 남아 있다. 그 상태에는 오늘의 메뉴 · 포장대 ·
    콤보 · 사장님 말 칸이 없고, 손님에는 단골 여부 · 기다림 길이(pat)가, 먹던 손님에는 팁이 없다.
    """
    k = st["k"]
    if k.get("v") == STATE_V:
        return k
    for key, val in (("over", False), ("reason", None), ("gimbap", 0), ("money", 0), ("served", 0), ("missed", 0),
                     ("burnt", 0), ("next", 0), ("hearts", OLD_HEARTS)):
        k.setdefault(key, val)
    for key in ("spawns", "queue", "pass", "ev", "once", "beats"):
        if not isinstance(k.get(key), list):
            k[key] = []
    if not isinstance(k.get("gap"), dict):
        k["gap"] = {}
    k.setdefault("today", None)
    k.setdefault("maxHearts", OLD_HEARTS)
    k.setdefault("bi", 0)
    for key in ("tips", "vip", "togo", "combo", "bestCombo", "evn"):
        k.setdefault(key, 0)
    k.setdefault("bell", {"n": 0, "at": 0})
    k.setdefault("say", None)
    if not isinstance(k.get("counter"), list) or len(k["counter"]) != COUNTER:
        k["counter"] = [None] * COUNTER
    if not isinstance(k.get("burners"), list) or len(k["burners"]) != BURNERS:
        k["burners"] = [None] * BURNERS
    if not isinstance(k.get("tables"), list) or len(k["tables"]) != TABLES:
        k["tables"] = [{"s": "empty", "c": None} for _ in range(TABLES)]
    k.setdefault("start", k.get("end", 0) - SHIFT_SEC)
    k.setdefault("end", k["start"] + SHIFT_SEC)
    for sp in k["spawns"]:
        sp.setdefault("vip", False)
        sp.setdefault("togo", False)
    for q in k["queue"]:
        q.setdefault("vip", False)
        q.setdefault("pat", QUEUE_PATIENCE)
    for tb in k["tables"]:
        c = tb.get("c")
        tb.setdefault("s", "empty" if c is None else "wait")
        if c:
            c.setdefault("vip", False)
            c.setdefault("pat", TABLE_PATIENCE)
            c.setdefault("sent", False)
            if "pay" in c:
                c.setdefault("tip", 0)
                c.setdefault("quick", False)
    k["old"] = True  # 첫 버전 판 — 러시가 없던 판이라 화면에 러시를 그리지 않는다
    k["v"] = STATE_V
    return k


# ── 기록 · 효과 ────────────────────────────────────────────────

def _log(st: dict, text: str, now: float, kind: str = "") -> None:
    st["klog"] = [*st.get("klog", []), {"t": now, "text": text, "kind": kind}][-LOG_KEEP:]


def _ev(k: dict, kind: str, at: float, **data) -> None:
    """화면 효과 알림 — 화면은 처음 보는 id 만 한 번 보여 준다(동전 · 콤보 · 벨 · 놓친 손님 …)."""
    k["evn"] += 1
    k["ev"] = [*k["ev"], {"id": k["evn"], "k": kind, "at": at, **data}][-EV_KEEP:]


def _say(k: dict, st: dict, at: float, who: str, text: str) -> None:
    k["evn"] += 1
    k["say"] = {"id": k["evn"], "at": at, "who": who, "name": NPC.get(who, ""), "text": text, "call": who == "boksun"}
    # 사장님은 병원에서 전화로 말한다 — 기록에도 「(전화)」를 붙인다
    _log(st, text if who == "shop" else f"{NPC.get(who, '')}{'(전화)' if who == 'boksun' else ''}: {text}", at, "say")


def _once(k: dict, key: str) -> bool:
    """판마다 한 번만 하는 말인지 — 처음이면 True."""
    if key in k["once"]:
        return False
    k["once"] = [*k["once"], key]
    return True


def _break(k: dict, st: dict, at: float) -> None:
    if k["combo"] >= 2:
        _ev(k, "break", at, n=k["combo"])
    k["combo"] = 0


def _miss(k: dict, st: dict, at: float, why: str, where: str, vip: bool = False) -> None:
    k["missed"] += 1
    k["hearts"] = max(0, k["hearts"] - 1)
    _break(k, st, at)
    _ev(k, "miss", at, where=where, vip=vip)
    _log(st, f"{why} (♥ {k['hearts']})", at, "miss")
    if k["hearts"] == 1 and _once(k, "hearts"):
        _say(k, st, at, "boksun", "손님이 자꾸 간다고요? 괜찮아요, 침착하게 하나씩!")


def _price(k: dict, c: dict) -> int:
    base = sum(MENU[i].price for i in c["items"]) + TODAY_BONUS * c["items"].count(k["today"])
    return _r100(base * VIP_RATE) if c.get("vip") else base


def _settle(k: dict, st: dict, c: dict, now: float, where: str) -> None:
    """서빙(포장은 건네기) 순간 — 값 · 팁 · 콤보를 정한다. 돈은 테이블은 다 먹고, 포장은 바로 받는다."""
    base = _price(k, c)
    ratio = max(0.0, min(1.0, (c["until"] - now) / c["pat"]))
    if ratio >= QUICK:
        k["combo"] += 1
        k["bestCombo"] = max(k["bestCombo"], k["combo"])
        mult = combo_mult(k["combo"])
        if k["combo"] >= 2:
            _ev(k, "combo", now, n=k["combo"], mult=mult, where=where)
        if k["combo"] == 5 and _once(k, "combo5"):
            _say(k, st, now, "boksun", "단골 단톡방에 오늘 엄청 빠르다고 칭찬 올라왔어요!")
    else:
        _break(k, st, now)
        mult = 1.0
    tip = _r100(base * TIP_RATE * ratio * mult)
    c["pay"], c["tip"], c["quick"] = base + tip, tip, ratio >= QUICK


def _earn(k: dict, st: dict, c: dict, at: float, where: str, label: str) -> None:
    c.setdefault("tip", 0)
    k["money"] += c["pay"]
    k["tips"] += c["tip"]
    k["served"] += 1
    if c.get("vip"):
        k["vip"] += 1
    if c.get("togo"):
        k["togo"] += 1
    _ev(k, "pay", at, where=where, amount=c["pay"], tip=c["tip"], vip=bool(c.get("vip")))
    _log(st, f"{label} {c['pay']:,}원 받았어요" + (f" (팁 {c['tip']:,}원)" if c["tip"] else ""), at, "pay")


# ── 흐름 ──────────────────────────────────────────────────────

def _guest(sp: dict, until: float, pat: float) -> dict:
    g = {"id": sp["id"], "items": list(sp["items"]), "vip": bool(sp.get("vip")), "until": until, "pat": pat}
    if sp.get("who"):
        g["who"] = sp["who"]
    return g


def _pay_eaters(k: dict, st: dict, at: float) -> None:
    """가게 문을 닫을 때(영업 끝 · 일찍 닫음) — 이미 음식을 받아 먹고 있던 손님은 계산하고 나간다(홀 화면에 금액이 보였던 손님)."""
    for i, tb in enumerate(k["tables"]):
        if tb["s"] == "eat":
            c = tb["c"]
            k["tables"][i] = {"s": "dirty", "c": None}
            _earn(k, st, c, at, f"t{i}", f"{i + 1}번 테이블")


def advance(st: dict, now: float) -> bool:
    """지금(또는 영업 끝)까지 일어난 일을 시간 순서대로 처리한다. 바뀐 게 있으면 True."""
    k = _k(st)
    if k["over"]:
        return False
    limit = min(now, k["end"])
    changed = False
    while True:
        events = []
        if k["next"] < len(k["spawns"]) and k["spawns"][k["next"]]["at"] <= limit:
            events.append((k["spawns"][k["next"]]["at"], 0, "spawn", None))
        if k["bi"] < len(k["beats"]) and k["beats"][k["bi"]]["at"] <= limit:
            events.append((k["beats"][k["bi"]]["at"], 0, "beat", None))
        for q in k["queue"]:
            if q["until"] <= limit:
                events.append((q["until"], 1, "qgone", q["id"]))
        for i, c in enumerate(k["counter"]):
            if c and c["until"] <= limit:
                events.append((c["until"], 1, "cgone", i))
        for i, tb in enumerate(k["tables"]):
            c = tb["c"]
            if tb["s"] == "wait" and c["until"] <= limit:
                events.append((c["until"], 1, "tgone", i))
            if tb["s"] == "eat" and c["eatEnd"] <= limit:
                events.append((c["eatEnd"], 2, "pay", i))
        for i, b in enumerate(k["burners"]):
            if b and not b.get("burnt") and b["start"] + MENU[b["dish"]].cook + BURN_SEC <= limit:
                events.append((b["start"] + MENU[b["dish"]].cook + BURN_SEC, 1, "burn", i))
        if not events:
            break
        at, _, kind, ref = min(events, key=lambda e: (e[0], e[1]))
        changed = True
        if kind == "spawn":
            sp = k["spawns"][k["next"]]
            k["next"] += 1
            if sp["togo"]:
                free = next((i for i, c in enumerate(k["counter"]) if c is None), None)
                if free is None:
                    _miss(k, st, at, "포장대가 꽉 차서 포장 손님이 그냥 갔어요", "counter")
                else:
                    k["counter"][free] = {**_guest(sp, at + TOGO_PATIENCE, TOGO_PATIENCE), "togo": True, "sent": False}
                    _ev(k, "arrive", at, togo=True, vip=False, where=f"c{free}")
            elif len(k["queue"]) >= QUEUE_MAX:
                _miss(k, st, at, "줄이 너무 길어 손님이 그냥 돌아갔어요", "queue", sp["vip"])
            else:
                vip_fast = sp["vip"] and not sp.get("who")
                pat = VIP_QUEUE_PATIENCE if vip_fast else QUEUE_PATIENCE
                k["queue"].append(_guest(sp, at + pat, pat))
                _ev(k, "arrive", at, togo=False, vip=sp["vip"], who=sp.get("who"))
        elif kind == "beat":
            b = k["beats"][k["bi"]]
            k["bi"] += 1
            _say(k, st, at, b["who"], b["text"])
        elif kind == "qgone":
            q = next(x for x in k["queue"] if x["id"] == ref)
            k["queue"] = [x for x in k["queue"] if x["id"] != ref]
            who = _guest_name(q, "★ 단골손님" if q["vip"] else "줄 서 있던 손님")
            _miss(k, st, at, f"{who}{_josa(who, '이', '가')} 기다리다 갔어요", "queue", q["vip"])
        elif kind == "cgone":
            k["counter"][ref] = None
            _miss(k, st, at, "포장 손님이 기다리다 갔어요", f"c{ref}")
        elif kind == "tgone":
            c = k["tables"][ref]["c"]
            k["tables"][ref] = {"s": "dirty", "c": None}
            who = _guest_name(c, "★ 단골손님" if c["vip"] else "손님")
            _miss(k, st, at, f"{ref + 1}번 테이블 {who}{_josa(who, '이', '가')} 화가 나서 나갔어요", f"t{ref}", c["vip"])
        elif kind == "pay":
            c = k["tables"][ref]["c"]
            k["tables"][ref] = {"s": "dirty", "c": None}
            _earn(k, st, c, at, f"t{ref}", f"{ref + 1}번 테이블")
        elif kind == "burn":
            b = k["burners"][ref]
            b["burnt"] = True
            k["burnt"] += 1
            _break(k, st, at)
            _ev(k, "burn", at, burner=ref)
            name = MENU[b["dish"]].name
            _log(st, f"{ref + 1}번 화구 {name}{_josa(name, '이', '가')} 타 버렸어요", at, "burn")
            if _once(k, "burn"):
                _say(k, st, at, "boksun", "어머, 타는 냄새가 여기까지 나요! 익으면 바로 꺼내요~")
        if k["hearts"] <= 0:
            _pay_eaters(k, st, at)
            k["over"], k["reason"] = True, "hearts"
            _log(st, "손님을 너무 많이 놓쳐 가게 문을 일찍 닫았어요", at, "miss")
            return True
    if now >= k["end"]:
        _pay_eaters(k, st, k["end"])  # 영업 끝
        k["over"], k["reason"] = True, "time"
        changed = True
    return changed


def next_event(st: dict) -> Optional[float]:
    """다음에 저절로 바뀌는 시각 — 화면은 이때 다시 물어 온다."""
    k = _k(st)
    if k["over"]:
        return None
    times = [k["end"]]
    if k["next"] < len(k["spawns"]):
        times.append(k["spawns"][k["next"]]["at"])
    if k["bi"] < len(k["beats"]):
        times.append(k["beats"][k["bi"]]["at"])
    times += [q["until"] for q in k["queue"]]
    times += [c["until"] for c in k["counter"] if c]
    for tb in k["tables"]:
        if tb["s"] == "wait":
            times.append(tb["c"]["until"])
        elif tb["s"] == "eat":
            times.append(tb["c"]["eatEnd"])
    for b in k["burners"]:
        if b and not b.get("burnt"):
            times.append(b["start"] + MENU[b["dish"]].cook + BURN_SEC)
    return min(times)


# ── 할 일 ─────────────────────────────────────────────────────

def _int(n, lo: int, hi: int) -> int:
    if isinstance(n, bool):
        _err("KITCHEN_BAD_ACTION")
    try:
        i = int(n)
    except (TypeError, ValueError):
        _err("KITCHEN_BAD_ACTION")
    if not lo <= i < hi:
        _err("KITCHEN_BAD_ACTION")
    return i


def _spot(arg) -> tuple:
    """테이블 · 포장대 자리 — "t0"~"t2" · "c0"~"c1" (숫자만 오면 테이블)."""
    if isinstance(arg, str) and len(arg) >= 2 and arg[0] in "tc":
        kind = arg[0]
        return kind, _int(arg[1:], 0, TABLES if kind == "t" else COUNTER)
    return "t", _int(arg, 0, TABLES)


def _take_items(k: dict, items: list) -> None:
    left = list(k["pass"])
    for item in items:
        if item not in left:
            _err("KITCHEN_MISSING")
        left.remove(item)
    k["pass"] = left


HALL_ACTIONS = ("seat", "send", "serve", "give", "clean")
KITCHEN_ACTIONS = ("cook", "take", "roll", "bell")


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    """한 사람의 동작 하나. 먼저 advance() 로 지금까지의 흐름을 맞춘 뒤 부른다."""
    k = _k(st)
    if k["over"]:
        _err("ESCAPE_NOT_PLAYING")
    if side not in ("hall", "kitchen"):
        _err("KITCHEN_BAD_ACTION")
    if action in HALL_ACTIONS and side != "hall":
        _err("KITCHEN_HALL_ONLY")
    if action in KITCHEN_ACTIONS and side != "kitchen":
        _err("KITCHEN_KITCHEN_ONLY")
    gap = k.setdefault("gap", {})
    if now - gap.get(str(member_id), 0) < ACT_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[str(member_id)] = now

    if action == "toss":  # 배식구 음식 하나 버리기 — 둘 다. 음식 이름(같은 게 여럿이면 하나만) 또는 칸 번호
        if isinstance(arg, str) and arg in MENU:
            if arg not in k["pass"]:
                _err("KITCHEN_BAD_ACTION")
            i = len(k["pass"]) - 1 - k["pass"][::-1].index(arg)
        else:
            i = _int(arg, 0, len(k["pass"]))
        k["pass"] = k["pass"][:i] + k["pass"][i + 1:]
        return

    # ── 홀 ──
    if action == "seat":
        if not k["queue"]:
            _err("KITCHEN_NO_GUEST")
        if arg is None:
            q = k["queue"][0]
        else:
            if isinstance(arg, bool) or not isinstance(arg, (int, str)):
                _err("KITCHEN_BAD_ACTION")
            q = next((x for x in k["queue"] if str(x["id"]) == str(arg)), None)
            if q is None:
                _err("KITCHEN_GONE")
        free = next((i for i, tb in enumerate(k["tables"]) if tb["s"] == "empty"), None)
        if free is None:
            _err("KITCHEN_NO_TABLE")
        k["queue"] = [x for x in k["queue"] if x is not q]
        pat = VIP_TABLE_PATIENCE if q["vip"] and not q.get("who") else TABLE_PATIENCE
        c = {**{key: v for key, v in q.items() if key not in ("until", "pat")}, "until": now + pat, "pat": pat, "sent": False}
        k["tables"][free] = {"s": "wait", "c": c}
        return
    if action == "send":
        kind, i = _spot(arg)
        c = k["tables"][i]["c"] if kind == "t" else k["counter"][i]
        if kind == "t" and k["tables"][i]["s"] != "wait":
            _err("KITCHEN_GONE" if k["tables"][i]["s"] in ("dirty", "empty") else "KITCHEN_BAD_ACTION")
        if c is None:
            _err("KITCHEN_GONE")
        if c["sent"]:
            _err("KITCHEN_SENT")
        c["sent"] = True
        _ev(k, "ticket", now, where=f"{kind}{i}", vip=bool(c.get("vip")), togo=kind == "c")
        return
    if action in ("serve", "give"):
        kind, i = _spot(arg)
        if kind == "t":
            tb = k["tables"][i]
            if tb["s"] != "wait":
                _err("KITCHEN_GONE" if tb["s"] in ("dirty", "empty") else "KITCHEN_BAD_ACTION")
            c = tb["c"]
            _take_items(k, c["items"])
            _settle(k, st, c, now, f"t{i}")
            c["eatEnd"] = now + EAT_SEC
            tb["s"] = "eat"
            _ev(k, "serve", now, where=f"t{i}", quick=c["quick"])
            return
        c = k["counter"][i]
        if c is None:
            _err("KITCHEN_GONE")
        _take_items(k, c["items"])
        _settle(k, st, c, now, f"c{i}")
        k["counter"][i] = None
        _earn(k, st, c, now, f"c{i}", "포장 손님")
        return
    if action == "clean":
        i = _int(arg, 0, TABLES)
        if k["tables"][i]["s"] != "dirty":
            _err("KITCHEN_BAD_ACTION")
        k["tables"][i] = {"s": "empty", "c": None}
        return

    # ── 주방 ──
    if action == "cook":
        if not isinstance(arg, dict):
            _err("KITCHEN_BAD_ACTION")
        i = _int(arg.get("burner"), 0, BURNERS)
        dish = arg.get("dish")
        if dish not in BURNER_DISHES:
            _err("KITCHEN_BAD_ACTION")
        if k["burners"][i] is not None:
            _err("KITCHEN_BURNER_BUSY")
        k["burners"][i] = {"dish": dish, "start": now}
        return
    if action == "take":
        i = _int(arg, 0, BURNERS)
        b = k["burners"][i]
        if b is None:
            _err("KITCHEN_BAD_ACTION")
        done = b["start"] + MENU[b["dish"]].cook
        if b.get("burnt") or now > done + BURN_SEC:  # 탄 건 버린다(탄 순간은 advance 가 이미 셌다)
            k["burners"][i] = None
            name = MENU[b["dish"]].name
            _log(st, f"탄 {name}{_josa(name, '을', '를')} 버렸어요", now, "burn")
            return
        if now < done:
            _err("KITCHEN_NOT_DONE")
        if len(k["pass"]) >= PASS_MAX:
            _err("KITCHEN_PASS_FULL")
        k["burners"][i] = None
        k["pass"] = [*k["pass"], b["dish"]]
        return
    if action == "roll":
        if k["gimbap"] + 1 >= len(GIMBAP_STEPS) and len(k["pass"]) >= PASS_MAX:
            _err("KITCHEN_PASS_FULL")
        k["gimbap"] += 1
        if k["gimbap"] >= len(GIMBAP_STEPS):
            k["gimbap"] = 0
            k["pass"] = [*k["pass"], "gimbap"]
        return
    if action == "bell":
        if now - k["bell"]["at"] < BELL_GAP:
            return  # 방금 울렸다 — 조용히 넘긴다
        k["bell"] = {"n": k["bell"]["n"] + 1, "at": now}
        _ev(k, "bell", now, n=k["bell"]["n"])
        return
    _err("KITCHEN_BAD_ACTION")


# ── 화면 ──────────────────────────────────────────────────────

def _who(g: dict) -> dict:
    out = {"id": g["id"], "vip": bool(g.get("vip")), "until": g["until"], "pat": g["pat"]}
    if g.get("who"):
        out["who"] = g["who"]
        out["name"] = NPC.get(g["who"], "")
    return out


def view(st: dict, side: Optional[str], now: float) -> dict:
    """한쪽에 보내는 화면 — 주방은 홀이 전달한 주문만 본다(줄 선 손님 · 전달 전 주문 내용은 홀만).

    받은 st 는 고치지 않는다(방 JSON 을 그대로 넘겨받는다) — 예전 모양이면 사본을 맞춰서 그린다.
    """
    if st["k"].get("v") != STATE_V:
        st = copy.deepcopy(st)
    k = _k(st)
    base = {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st),
        "money": k["money"], "tips": k["tips"], "hearts": k["hearts"], "maxHearts": k["maxHearts"],
        "served": k["served"], "missed": k["missed"], "burnt": k["burnt"], "vip": k["vip"], "togo": k["togo"],
        "combo": k["combo"], "bestCombo": k["bestCombo"], "nextMult": combo_mult(k["combo"] + 1), "quick": QUICK,
        "over": k["over"], "reason": k["reason"], "pass": k["pass"], "passMax": PASS_MAX,
        "menu": {key: {"name": d.name, "price": d.price, "cook": d.cook} for key, d in MENU.items()},
        "today": k["today"], "todayBonus": TODAY_BONUS, "vipRate": VIP_RATE,
        "rush": None if k.get("old") else {"at": k["start"] + RUSH_AT, "end": k["start"] + RUSH_END},
        "burnSec": BURN_SEC, "eatSec": EAT_SEC, "saySec": SAY_SEC, "gimbapSteps": len(GIMBAP_STEPS),
        "say": k.get("say"),
        "bell": k["bell"], "ev": k["ev"][-12:],
        "log": st.get("klog", [])[-8:],
    }
    if side == "hall":
        base["queue"] = [{**_who(q), "size": len(q["items"])} for q in k["queue"]]
        base["queueMax"] = QUEUE_MAX
        base["tables"] = []
        for i, tb in enumerate(k["tables"]):
            t = {"n": i, "s": tb["s"]}
            c = tb["c"]
            if c:
                t.update(_who(c))
                t.update({"items": c["items"], "sent": c["sent"], "eatEnd": c.get("eatEnd"), "pay": c.get("pay"), "tip": c.get("tip")})
            base["tables"].append(t)
        base["counter"] = [
            {"n": i, "s": "empty"} if c is None else {"n": i, "s": "wait", **_who(c), "items": c["items"], "sent": c["sent"]}
            for i, c in enumerate(k["counter"])
        ]
    elif side == "kitchen":
        tickets = [
            {"where": f"t{i}", "label": f"{i + 1}번 테이블", "items": tb["c"]["items"], "until": tb["c"]["until"],
             "pat": tb["c"]["pat"], "vip": bool(tb["c"].get("vip")), "togo": False}
            for i, tb in enumerate(k["tables"]) if tb["s"] == "wait" and tb["c"]["sent"]
        ]
        tickets += [
            {"where": f"c{i}", "label": f"포장 {i + 1}", "items": c["items"], "until": c["until"], "pat": c["pat"], "vip": False, "togo": True}
            for i, c in enumerate(k["counter"]) if c and c["sent"]
        ]
        base["tickets"] = sorted(tickets, key=lambda x: x["until"])
        base["burners"] = [
            None if b is None else {"dish": b["dish"], "start": b["start"], "done": b["start"] + MENU[b["dish"]].cook,
                                    "burn": b["start"] + MENU[b["dish"]].cook + BURN_SEC, "burnt": bool(b.get("burnt"))}
            for b in k["burners"]
        ]
        base["gimbap"] = {"step": k["gimbap"], "steps": list(GIMBAP_STEPS)}
        base["waiting"] = (len(k["queue"]) + sum(1 for tb in k["tables"] if tb["s"] == "wait" and not tb["c"]["sent"])
                           + sum(1 for c in k["counter"] if c and not c["sent"]))
    return base


# ── 협동 방 공용 코드가 부르는 결과 ─────────────────────────────

START_TEXT = f"영업 시작! {SHIFT_SEC // 60}분 동안 손님을 받아요."


def score(st: dict) -> int:
    return _k(st)["money"]


def end_code(st: dict) -> str:
    return "SHIFT" if _k(st)["reason"] == "time" else "HEARTS"


def summary(st: dict) -> str:
    k = _k(st)
    head = "영업 끝!" if k["reason"] == "time" else "손님을 너무 많이 놓쳐 가게 문을 일찍 닫았어요."
    tail = f" · 최고 콤보 {k['bestCombo']}" if k["bestCombo"] >= 2 else ""
    return f"{head} 매출 {k['money']:,}원 · 손님 {k['served']}명{tail}"
