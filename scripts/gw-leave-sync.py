#!/usr/bin/env python3
"""그룹웨어 휴가 → 헬스키퍼 보내기 — 휴가 · 반차 · 반반차 · 특별휴가인 사람은 쉬는 시간대에 아케이드가 열려요.

그룹웨어 DB 는 사내망에서만 열려서, 사내망 맥에서 이 프로그램을 돌려 헬스키퍼로 보내요(헬스키퍼는 받기만 해요).
- 그룹웨어는 읽기만 해요(읽기 전용 연결 · search_path=groupware).
- 오늘 · 내일(한국 시간)에 걸친 결재 문서만 읽어요 — 양식 1 휴가 · 11 반차 · 13 반반차 · 14 특별휴가, 진행중(002) · 완료(003).
- 이름 · 메일 · 본문 · 비밀값은 화면에 찍지 않아요. 실패하면 한 줄 이유와 함께 종료 코드 1.

쓰는 법
  python3 scripts/gw-leave-sync.py --gw-env <그룹웨어 접속 env> --hk-env <헬스키퍼 env> [--dry-run]
  자세한 안내: scripts/gw-leave-sync.md

필요한 것: 파이썬 3.9 이상 + psycopg(3) (pip install "psycopg[binary]")
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

KST = timezone(timedelta(hours=9))

GW_KEYS = ("GW_DB_HOST", "GW_DB_PORT", "GW_DB_NAME", "GW_DB_USER", "GW_DB_PASSWORD")
HK_KEYS = ("HK_URL", "LEAVE_SYNC_TOKEN")
SYNC_PATH = "/api/internal/leave-sync"

# 결재 양식 → 헬스키퍼 휴가 종류
FORM_VACATION, FORM_HALF, FORM_QUARTER, FORM_SPECIAL = 1, 11, 13, 14
FORM_KIND = {FORM_VACATION: "VACATION", FORM_HALF: "HALF", FORM_QUARTER: "QUARTER", FORM_SPECIAL: "SPECIAL"}
KIND_LABEL = {"VACATION": "휴가", "HALF": "반차", "QUARTER": "반반차", "SPECIAL": "특별휴가"}

DAY_END = 24 * 60
HALF_AM = (0, 14 * 60)            # 오전 반차 — 00:00~14:00
HALF_PM = (13 * 60, DAY_END)      # 오후 반차 — 13:00~24:00
QUARTER_DEFAULT = (16 * 60, 18 * 60)  # 반반차 — 본문에 시간이 없으면 16:00~18:00
QUARTER_MARGIN = 30               # 반반차 — 본문 시간 앞뒤 30분 여유
QUARTER_MAX = 4 * 60              # 본문 시간이 이보다 길면 잘못 읽은 것으로 보고 기본 시간대

SQL = """
SELECT d.sanc_doc_seq AS doc, d.sanc_frm_seq AS form, d.str_dt, d.end_dt, d.rmk_seg2, d.cont, lower(trim(u.mail)) AS email
FROM dw_sanc_doc d
JOIN dw_usr u ON u.usr_seq = COALESCE(d.req_usr, d.reg_usr)
WHERE d.sanc_frm_seq IN (1, 11, 13, 14)
  AND d.sts IN ('002', '003')
  AND d.str_dt IS NOT NULL
  AND d.str_dt < %(until)s
  AND COALESCE(d.end_dt, d.str_dt) >= %(since)s
  AND u.use_yn = 'Y'
  AND COALESCE(u.rtm_yn, 'N') <> 'Y'
  AND u.mail IS NOT NULL AND trim(u.mail) <> ''
"""


class SyncError(Exception):
    """한 줄로 알려 줄 실패 — 비밀값 · 개인정보를 넣지 않는다."""


# ── 설정 파일 ──────────────────────────────────────────────────

def read_env(path: str, keys: Iterable[str]) -> dict:
    """KEY=VALUE 파일에서 필요한 키만 읽는다(따옴표 · export · 주석 허용). 다른 키는 보지 않는다."""
    wanted = set(keys)
    out: dict = {}
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError as exc:
        raise SyncError(f"설정 파일을 열 수 없어요 ({type(exc).__name__})") from None
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, _, value = line.partition("=")
        key = key.strip()
        if key not in wanted:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        out[key] = value
    return out


# ── 시간대 계산 (순수 함수 — 시험에서 바로 부른다) ───────────────

def hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _as_date(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


_TAG = re.compile(r"<[^>]+>")
_TIME_RANGE = re.compile(
    r"(?<!\d)(\d{1,2})\s*(?::|시)\s*(\d{2})?\s*(?:분)?\s*[~\-–—～〜]\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?(?!\d)"
)


def html_text(cont: Optional[str]) -> str:
    """본문 HTML → 글자만 (태그 · &nbsp; 등 지우기)."""
    if not cont:
        return ""
    text = _TAG.sub(" ", str(cont))
    return html.unescape(text).replace("\xa0", " ")


def _hour24(h: int) -> int:
    """12시간제로 적은 시각 — 9시 전(1~8시)은 오후로 본다(반반차는 업무 시간 안에 쓴다)."""
    return h + 12 if h < 9 else h


def quarter_body_time(cont: Optional[str]) -> Optional[tuple]:
    """반반차 본문의 「16:00~18:00」 같은 시간 → (시작 분, 끝 분). 없거나 말이 안 되면 None."""
    for m in _TIME_RANGE.finditer(html_text(cont)):
        h1, m1, h2, m2 = int(m.group(1)), int(m.group(2) or 0), int(m.group(3)), int(m.group(4) or 0)
        if not (0 <= h1 <= 24 and 0 <= h2 <= 24 and m1 < 60 and m2 < 60):
            continue
        start, end = _hour24(h1) * 60 + m1, _hour24(h2) * 60 + m2
        if 0 < end - start <= QUARTER_MAX and end <= DAY_END:
            return start, end
    return None


def quarter_window(cont: Optional[str]) -> tuple:
    """반반차 쉬는 시간대 — 본문 시간(앞뒤 30분 여유), 없으면 16:00~18:00."""
    found = quarter_body_time(cont)
    if found is None:
        return QUARTER_DEFAULT
    return max(0, found[0] - QUARTER_MARGIN), min(DAY_END, found[1] + QUARTER_MARGIN)


def half_window(seg2: Optional[str]) -> Optional[tuple]:
    """반차 — 001 오전(00:00~14:00) · 002 오후(13:00~24:00). 모르는 값은 None(보내지 않는다)."""
    code = (str(seg2).strip() if seg2 is not None else "")
    if code in ("001", "1"):
        return HALF_AM
    if code in ("002", "2"):
        return HALF_PM
    return None


def doc_items(row: dict, since: date, until: date) -> list:
    """결재 문서 한 줄 → 보낼 줄들 [{email, day, start, end, kind, doc}] (since~until 안의 날짜만)."""
    try:
        form = int(row.get("form"))
    except (TypeError, ValueError):
        return []
    kind = FORM_KIND.get(form)
    first = _as_date(row.get("str_dt"))
    email = (row.get("email") or "").strip().lower()
    if not kind or first is None or not email:
        return []
    last = first
    if form in (FORM_VACATION, FORM_SPECIAL):
        last = _as_date(row.get("end_dt")) or first
        if last < first:
            last = first
        window = (0, DAY_END)
    elif form == FORM_HALF:
        window = half_window(row.get("rmk_seg2"))
        if window is None:
            return []
    else:
        window = quarter_window(row.get("cont"))
    out = []
    day = max(first, since)
    while day <= min(last, until):
        out.append({
            "email": email, "day": day.isoformat(), "start": hhmm(window[0]), "end": hhmm(window[1]),
            "kind": kind, "doc": str(row.get("doc") or "")[:40],
        })
        day += timedelta(days=1)
    return out


def build_items(rows: Iterable[dict], since: date, until: date) -> list:
    """모든 문서 → 보낼 줄 (같은 사람 · 같은 날 · 같은 시간대 · 같은 종류는 한 줄로)."""
    seen, out = set(), []
    for row in rows:
        for it in doc_items(row, since, until):
            key = (it["email"], it["day"], it["start"], it["end"], it["kind"])
            if key in seen:
                continue
            seen.add(key)
            out.append(it)
    out.sort(key=lambda it: (it["day"], it["start"], it["kind"], it["doc"]))
    return out


def summary(items: list, today: date, tomorrow: date) -> str:
    """건수만 — 「오늘 N명 · 내일 M명 · 종류별 건수」(이름 · 메일 없이)."""
    people = {today.isoformat(): set(), tomorrow.isoformat(): set()}
    kinds: Counter = Counter()
    for it in items:
        people.setdefault(it["day"], set()).add(it["email"])
        kinds[it["kind"]] += 1
    kind_text = " · ".join(f"{KIND_LABEL[k]} {kinds[k]}건" for k in ("VACATION", "HALF", "QUARTER", "SPECIAL") if kinds[k]) or "없음"
    return (f"오늘({today.isoformat()}) {len(people[today.isoformat()])}명 · 내일({tomorrow.isoformat()}) "
            f"{len(people[tomorrow.isoformat()])}명 · 종류별 {kind_text} · 모두 {len(items)}줄")


# ── 그룹웨어 읽기 · 헬스키퍼 보내기 ─────────────────────────────

def fetch_rows(gw: dict, since: date, until: date) -> list:
    missing = [k for k in ("GW_DB_HOST", "GW_DB_USER", "GW_DB_PASSWORD") if not gw.get(k)]
    if missing:
        raise SyncError(f"그룹웨어 설정에 {', '.join(missing)} 가 없어요")
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        raise SyncError('psycopg 가 없어요 — pip install "psycopg[binary]"') from None
    try:
        port = int(gw.get("GW_DB_PORT") or 5432)
    except ValueError:
        raise SyncError("GW_DB_PORT 가 숫자가 아니에요") from None
    try:
        with psycopg.connect(
            host=gw["GW_DB_HOST"], port=port, dbname=gw.get("GW_DB_NAME") or "postgres",
            user=gw["GW_DB_USER"], password=gw["GW_DB_PASSWORD"],
            options="-c search_path=groupware -c default_transaction_read_only=on",
            connect_timeout=10, row_factory=dict_row,
        ) as conn:
            conn.read_only = True
            return conn.execute(SQL, {"since": since, "until": until + timedelta(days=1)}).fetchall()
    except psycopg.Error as exc:
        raise SyncError(f"그룹웨어를 읽지 못했어요 ({type(exc).__name__})") from None


def post_items(hk: dict, since: date, until: date, items: list) -> dict:
    url, token = (hk.get("HK_URL") or "").strip().rstrip("/"), (hk.get("LEAVE_SYNC_TOKEN") or "").strip()
    if not url or not token:
        raise SyncError("헬스키퍼 설정에 HK_URL · LEAVE_SYNC_TOKEN 이 있어야 해요")
    local = url.startswith(("http://localhost", "http://127.0.0.1"))
    if not url.startswith("https://") and not local:
        raise SyncError("HK_URL 은 https:// 로 시작해야 해요")
    body = json.dumps({"from": since.isoformat(), "to": until.isoformat(), "items": items}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url + SYNC_PATH, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-Leave-Sync-Token": token, "User-Agent": "gw-leave-sync/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raise SyncError(f"헬스키퍼가 받지 않았어요 (HTTP {exc.code})") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SyncError(f"헬스키퍼에 연결하지 못했어요 ({type(exc).__name__})") from None
    except ValueError:
        raise SyncError("헬스키퍼 응답을 읽지 못했어요") from None


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(description="그룹웨어 휴가 → 헬스키퍼 (오늘 · 내일)")
    ap.add_argument("--gw-env", required=True, help="그룹웨어 접속 env 파일 (GW_DB_HOST · GW_DB_PORT · GW_DB_NAME · GW_DB_USER · GW_DB_PASSWORD)")
    ap.add_argument("--hk-env", help="헬스키퍼 env 파일 (HK_URL · LEAVE_SYNC_TOKEN) — --dry-run 이면 없어도 돼요")
    ap.add_argument("--dry-run", action="store_true", help="보내지 않고 건수만 보여 주기")
    args = ap.parse_args(argv)
    try:
        today = datetime.now(KST).date()
        tomorrow = today + timedelta(days=1)
        gw = read_env(args.gw_env, GW_KEYS)
        hk = None
        if not args.dry_run:
            if not args.hk_env:
                raise SyncError("--hk-env 가 필요해요 (또는 --dry-run)")
            hk = read_env(args.hk_env, HK_KEYS)
        items = build_items(fetch_rows(gw, today, tomorrow), today, tomorrow)
        line = summary(items, today, tomorrow)
        if args.dry_run:
            print(f"[dry-run] {line} — 보내지 않았어요")
            return 0
        res = post_items(hk, today, tomorrow, items)
        data = res.get("data", res) if isinstance(res, dict) else {}
        print(f"보냈어요 — {line} · 저장 {data.get('saved', '?')}줄 · 회원 못 찾음 {data.get('unmatched', '?')}줄")
        return 0
    except SyncError as exc:
        print(f"실패: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 — 예상 못 한 실패도 비밀 없이 한 줄로
        print(f"실패: 예상하지 못한 오류 ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
