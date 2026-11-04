"""2인 협동 「점심 분식집」 — 홀과 주방이 3분 동안 분식집을 운영한다.

홀: 줄 선 손님을 자리에 안내하고, 주문을 주방에 전달하고, 다 된 음식을 서빙하고, 테이블을 치운다.
주방: 화구 2개로 떡볶이·라면·어묵을 끓이고(너무 오래 두면 탄다), 김밥을 만다.
주방은 주문을 직접 볼 수 없어 홀이 전달해 줘야 한다 — 둘이 손발을 맞추는 게 핵심.

시간으로 흘러가는 일(손님 도착 · 기다리다 떠남 · 식사 끝 · 영업 끝)은 서버가 요청을 받을 때마다
advance() 로 '지금'까지 순서대로 처리한다. 화면은 next_event 시각에 다시 물어 와서 바뀐 걸 받는다.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional

from app.core.errors import raise_app_error

SHIFT_SEC = 180
TABLES = 3
BURNERS = 2
QUEUE_MAX = 4
QUEUE_PATIENCE = 25  # 줄에서 기다리는 시간
TABLE_PATIENCE = 55  # 자리에 앉아 음식을 기다리는 시간
EAT_SEC = 4
BURN_SEC = 6  # 다 익은 뒤 이만큼 지나면 탄다
PASS_MAX = 6  # 배식구에 올려 둘 수 있는 음식
GIMBAP_STEPS = ("밥 펴기", "재료 올리기", "돌돌 말기", "썰기")
HEARTS = 3
ACT_GAP = 0.15  # 같은 사람 연타 막기(초)


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


class KitchenRoom:
    """방 정보 — 방탈출 방(Room)과 같은 이름의 값을 갖춰 협동 방 공용 코드가 그대로 쓴다."""

    key = "lunch"
    title = "점심 분식집"
    label = "협동 게임"
    page = "kitchen"
    game = "kitchen"
    blurb = "둘이 홀과 주방을 나눠 3분 동안 분식집을 운영하는 협동 게임이에요."
    intro = (
        "점심시간, 회사 앞 분식집에 손님이 몰려와요. 한 사람은 홀에서 손님을 앉히고 주문을 받아 서빙하고, "
        "다른 한 사람은 주방에서 떡볶이·라면·어묵을 끓이고 김밥을 말아요. 주방은 주문을 직접 볼 수 없어서 "
        "홀이 전달해 줘야 해요. 3분 동안 매출을 최대한 올려 보세요."
    )
    outro = "오늘도 고생 많았어요. 손님들이 맛있게 먹고 갔어요!"
    sides = {"hall": "홀", "kitchen": "주방"}
    limit_sec = SHIFT_SEC


ROOM = KitchenRoom()


def _err(code: str) -> None:
    raise_app_error(code)


# ── 시작 · 흐름 ────────────────────────────────────────────────

def _schedule(seed: int, start: float) -> list:
    """손님 도착표 — 처음엔 드문드문 한 가지, 갈수록 자주 여러 가지를 시킨다."""
    rnd = random.Random(seed)
    keys = list(MENU)
    weights = [MENU[k].weight for k in keys]
    out, t, i = [], 4.0, 0
    while t < SHIFT_SEC - 12:
        frac = t / SHIFT_SEC
        n = 1 if t < 40 else rnd.choice((1, 2)) if t < 110 else rnd.choice((1, 2, 2, 3))
        out.append({"id": i, "at": start + t, "items": rnd.choices(keys, weights, k=n)})
        i += 1
        t += max(5.0, 13 - 7 * frac + rnd.uniform(-1.5, 1.5))
    return out


def start(st: dict, now: float) -> None:
    seed = random.randrange(1 << 30)
    st["k"] = {
        "start": now, "end": now + SHIFT_SEC, "spawns": _schedule(seed, now), "next": 0,
        "queue": [], "tables": [{"s": "empty", "c": None} for _ in range(TABLES)],
        "burners": [None] * BURNERS, "gimbap": 0, "pass": [],
        "money": 0, "hearts": HEARTS, "served": 0, "missed": 0, "burnt": 0,
        "over": False, "reason": None, "gap": {},
    }


def _log(st: dict, text: str, now: float) -> None:
    st.setdefault("klog", [])
    st["klog"] = [*st["klog"], {"t": now, "text": text}][-30:]


def _miss(k: dict, st: dict, now: float, why: str) -> None:
    k["missed"] += 1
    k["hearts"] = max(0, k["hearts"] - 1)
    _log(st, f"{why} (♥ {k['hearts']})", now)


def advance(st: dict, now: float) -> bool:
    """지금(또는 영업 끝)까지 일어난 일을 시간 순서대로 처리한다. 바뀐 게 있으면 True."""
    k = st["k"]
    if k["over"]:
        return False
    limit = min(now, k["end"])
    changed = False
    while True:
        events = []
        if k["next"] < len(k["spawns"]) and k["spawns"][k["next"]]["at"] <= limit:
            events.append((k["spawns"][k["next"]]["at"], 0, "spawn", None))
        for q in k["queue"]:
            if q["until"] <= limit:
                events.append((q["until"], 1, "qgone", q["id"]))
        for i, tb in enumerate(k["tables"]):
            c = tb["c"]
            if tb["s"] == "wait" and c["until"] <= limit:
                events.append((c["until"], 1, "tgone", i))
            if tb["s"] == "eat" and c["eatEnd"] <= limit:
                events.append((c["eatEnd"], 2, "pay", i))
        if not events:
            break
        at, _, kind, ref = min(events, key=lambda e: (e[0], e[1]))
        changed = True
        if kind == "spawn":
            sp = k["spawns"][k["next"]]
            k["next"] += 1
            if len(k["queue"]) >= QUEUE_MAX:
                _miss(k, st, at, "줄이 너무 길어 손님이 그냥 돌아갔어요")
            else:
                k["queue"].append({"id": sp["id"], "items": sp["items"], "until": at + QUEUE_PATIENCE})
        elif kind == "qgone":
            k["queue"] = [q for q in k["queue"] if q["id"] != ref]
            _miss(k, st, at, "줄 서 있던 손님이 기다리다 갔어요")
        elif kind == "tgone":
            k["tables"][ref] = {"s": "dirty", "c": None}
            _miss(k, st, at, f"{ref + 1}번 테이블 손님이 화가 나서 나갔어요")
        elif kind == "pay":
            c = k["tables"][ref]["c"]
            k["money"] += c["pay"]
            k["served"] += 1
            k["tables"][ref] = {"s": "dirty", "c": None}
            _log(st, f"{ref + 1}번 테이블 {c['pay']:,}원 결제", at)
        if k["hearts"] <= 0:
            k["over"], k["reason"] = True, "hearts"
            return True
    if now >= k["end"]:
        # 영업 끝 — 이미 음식을 받아 먹고 있던 손님은 계산하고 나간다
        for i, tb in enumerate(k["tables"]):
            if tb["s"] == "eat":
                k["money"] += tb["c"]["pay"]
                k["served"] += 1
                k["tables"][i] = {"s": "dirty", "c": None}
        k["over"], k["reason"] = True, "time"
        changed = True
    return changed


def next_event(st: dict) -> Optional[float]:
    """다음에 저절로 바뀌는 시각 — 화면은 이때 다시 물어 온다."""
    k = st["k"]
    if k["over"]:
        return None
    times = [k["end"]]
    if k["next"] < len(k["spawns"]):
        times.append(k["spawns"][k["next"]]["at"])
    times += [q["until"] for q in k["queue"]]
    for tb in k["tables"]:
        if tb["s"] == "wait":
            times.append(tb["c"]["until"])
        elif tb["s"] == "eat":
            times.append(tb["c"]["eatEnd"])
    return min(times)


# ── 할 일 ─────────────────────────────────────────────────────

def _table(k: dict, n) -> int:
    try:
        i = int(n)
    except (TypeError, ValueError):
        _err("KITCHEN_BAD_ACTION")
    if not 0 <= i < TABLES:
        _err("KITCHEN_BAD_ACTION")
    return i


def _burner(k: dict, n) -> int:
    try:
        i = int(n)
    except (TypeError, ValueError):
        _err("KITCHEN_BAD_ACTION")
    if not 0 <= i < BURNERS:
        _err("KITCHEN_BAD_ACTION")
    return i


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    """한 사람의 동작 하나. 먼저 advance() 로 지금까지의 흐름을 맞춘 뒤 부른다."""
    k = st["k"]
    if k["over"]:
        _err("ESCAPE_NOT_PLAYING")
    gap = k.setdefault("gap", {})
    if now - gap.get(str(member_id), 0) < ACT_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[str(member_id)] = now

    if action == "toss":  # 배식구 음식 버리기 — 둘 다
        try:
            k["pass"].pop(int(arg))
        except (TypeError, ValueError, IndexError):
            _err("KITCHEN_BAD_ACTION")
        return

    if side == "hall":
        if action == "seat":
            q = next((x for x in k["queue"] if x["id"] == arg), None) if arg is not None else (k["queue"][0] if k["queue"] else None)
            if q is None:
                _err("KITCHEN_BAD_ACTION")
            free = next((i for i, tb in enumerate(k["tables"]) if tb["s"] == "empty"), None)
            if free is None:
                _err("KITCHEN_NO_TABLE")
            k["queue"] = [x for x in k["queue"] if x is not q]
            k["tables"][free] = {"s": "wait", "c": {"id": q["id"], "items": q["items"], "until": now + TABLE_PATIENCE, "sent": False}}
            return
        if action == "send":
            tb = k["tables"][_table(k, arg)]
            if tb["s"] != "wait" or tb["c"]["sent"]:
                _err("KITCHEN_BAD_ACTION")
            tb["c"]["sent"] = True
            return
        if action == "serve":
            tb = k["tables"][_table(k, arg)]
            if tb["s"] != "wait":
                _err("KITCHEN_BAD_ACTION")
            left = list(k["pass"])
            for item in tb["c"]["items"]:
                if item not in left:
                    _err("KITCHEN_MISSING")
                left.remove(item)
            k["pass"] = left
            c = tb["c"]
            base = sum(MENU[i].price for i in c["items"])
            ratio = max(0.0, min(1.0, (c["until"] - now) / TABLE_PATIENCE))
            c["pay"] = base + int(round(base * 0.5 * ratio / 100)) * 100  # 빨리 내면 팁(최대 50%)
            c["eatEnd"] = now + EAT_SEC
            tb["s"] = "eat"
            return
        if action == "clean":
            i = _table(k, arg)
            if k["tables"][i]["s"] != "dirty":
                _err("KITCHEN_BAD_ACTION")
            k["tables"][i] = {"s": "empty", "c": None}
            return
        _err("KITCHEN_BAD_ACTION")

    if side == "kitchen":
        if action == "cook":
            i = _burner(k, arg.get("burner") if isinstance(arg, dict) else None)
            dish = arg.get("dish") if isinstance(arg, dict) else None
            if dish not in BURNER_DISHES or k["burners"][i] is not None:
                _err("KITCHEN_BAD_ACTION")
            k["burners"][i] = {"dish": dish, "start": now}
            return
        if action == "take":
            i = _burner(k, arg)
            b = k["burners"][i]
            if b is None:
                _err("KITCHEN_BAD_ACTION")
            done = b["start"] + MENU[b["dish"]].cook
            if now < done:
                _err("KITCHEN_NOT_DONE")
            if now > done + BURN_SEC:  # 탄 건 버린다
                k["burners"][i] = None
                k["burnt"] += 1
                _log(st, f"「{MENU[b['dish']].name}」 타 버려서 버렸어요", now)
                return
            if len(k["pass"]) >= PASS_MAX:
                _err("KITCHEN_PASS_FULL")
            k["burners"][i] = None
            k["pass"].append(b["dish"])
            return
        if action == "roll":
            if k["gimbap"] + 1 >= len(GIMBAP_STEPS) and len(k["pass"]) >= PASS_MAX:
                _err("KITCHEN_PASS_FULL")
            k["gimbap"] += 1
            if k["gimbap"] >= len(GIMBAP_STEPS):
                k["gimbap"] = 0
                k["pass"].append("gimbap")
            return
        _err("KITCHEN_BAD_ACTION")
    _err("KITCHEN_BAD_ACTION")


# ── 화면 ──────────────────────────────────────────────────────

def view(st: dict, side: Optional[str], now: float) -> dict:
    k = st["k"]
    base = {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st),
        "money": k["money"], "hearts": k["hearts"], "maxHearts": HEARTS, "served": k["served"], "missed": k["missed"], "burnt": k["burnt"],
        "over": k["over"], "reason": k["reason"], "pass": k["pass"], "passMax": PASS_MAX,
        "menu": {key: {"name": d.name, "price": d.price, "cook": d.cook} for key, d in MENU.items()},
        "burnSec": BURN_SEC, "tablePatience": TABLE_PATIENCE, "queuePatience": QUEUE_PATIENCE,
        "log": st.get("klog", [])[-8:],
    }
    if side == "hall":
        base["queue"] = [{"id": q["id"], "until": q["until"], "size": len(q["items"])} for q in k["queue"]]
        base["queueMax"] = QUEUE_MAX
        base["tables"] = [
            {"n": i, "s": tb["s"], **({"items": tb["c"]["items"], "until": tb["c"]["until"], "sent": tb["c"]["sent"],
                                       "eatEnd": tb["c"].get("eatEnd"), "pay": tb["c"].get("pay")} if tb["c"] else {})}
            for i, tb in enumerate(k["tables"])
        ]
    elif side == "kitchen":
        base["tickets"] = [
            {"n": i, "items": tb["c"]["items"], "until": tb["c"]["until"]}
            for i, tb in enumerate(k["tables"]) if tb["s"] == "wait" and tb["c"]["sent"]
        ]
        base["burners"] = [
            None if b is None else {"dish": b["dish"], "start": b["start"], "done": b["start"] + MENU[b["dish"]].cook,
                                    "burn": b["start"] + MENU[b["dish"]].cook + BURN_SEC}
            for b in k["burners"]
        ]
        base["gimbap"] = {"step": k["gimbap"], "steps": list(GIMBAP_STEPS)}
        base["waiting"] = len(k["queue"]) + sum(1 for tb in k["tables"] if tb["s"] == "wait" and not tb["c"]["sent"])
    return base


# ── 협동 방 공용 코드가 부르는 결과 ─────────────────────────────

START_TEXT = f"영업 시작! {SHIFT_SEC // 60}분 동안 손님을 받아요."


def score(st: dict) -> int:
    return st["k"]["money"]


def end_code(st: dict) -> str:
    return "SHIFT" if st["k"]["reason"] == "time" else "HEARTS"


def summary(st: dict) -> str:
    k = st["k"]
    head = "영업 끝!" if k["reason"] == "time" else "손님을 너무 많이 놓쳐 가게 문을 일찍 닫았어요."
    return f"{head} 매출 {k['money']:,}원 · 손님 {k['served']}명"
