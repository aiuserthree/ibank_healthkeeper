"""안개 군도 FPS(키 fogisle) 시험 하네스 — 본체 web/games/embed/fogisle.html 을 검사하고 헤드리스 크롬으로 연다.

실행(시스템 파이썬 · playwright 1.58.0, -I 붙이지 않음):
    REPO="/Users/jhcho/Documents/개인 프로젝트/헬스키퍼"
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py lint
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py smoke [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py arcade --frame [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py move --basic [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py move [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf [--sec 20] [--fire] [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py shoot --core [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py shoot [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf --blast [--sec 20] [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py ai --core [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf --ai [--sec 20] [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py mission --id t2 [--diff normal] [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py checkpoint [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py arcade [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py ui [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py assets [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py mission --id m1w [--out DIR]        (S10a — 임무 1 지형 걷기)
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf --mission m1 --sec 60 [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py mission --id m1 --diff easy|normal|hard [--out DIR]   (S10b — 임무 1 한 판)
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py mission --id m2w [--out DIR]        (S11a — 임무 2 지형 걷기 · 통로 · 증기 · 폭파 문)
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf --mission m2 --sec 60 [--out DIR]   (S11a — 임무 2 지형만)

- 종료 코드 0 = 통과. 마지막 줄은 JSON 요약.
- 산출물(스크린샷 · 수치)은 --out (기본: 환경 변수 FOGISLE_OUT 또는 /tmp/fogisle-check/).
- 페이지는 http://hk.test/** 를 저장소 web/ 폴더로 돌려준다(route). /api/** 는 가짜 {"data":{}}, unpkg 는 가짜 lucide.
  그 밖의 바깥 주소 요청은 막고 기록한다(본체는 바깥 파일을 부르지 않아야 함).
- 본체 파일을 통째로 출력하지 않는다(three 압축본 한 줄이 67만 자).

명령(단계마다 늘어남 — build-plan.md 부록 A):
    lint   S0  문법(node --check) · 금지 문자열 · 금지어 · sim 모듈 규칙 · 크기
    smoke  S0  단독으로 열어 오류 0 · __fps.ready 5초 안 · THREE r160 · 타이틀 스크린샷 · 단독이면 hk 신호 없음
    arcade --frame  S1  단독: 출격 · 대체 조작 끌기 · Space · 고리 손잡이 · 멈춤 / 가짜 부모 창(/__parent.html): 멈춤 규약 신호 순서
    move --basic    S2  시험 구역 t0: 앞으로 걷기 · 속도 · 벽/모서리/좁은 통로/60° 모서리 뚫지 않음 · 경사판 · 계단 · 천장 낮은 통로 일어서기 거부 ·
                        점프 높이 0.4~0.6m · 문 · 결정성 · 맵 자료 확인 · 구역 만들기 50ms · 그리기 호출
    move            S3  위 + 낮은 벽 넘기 · 높은 벽 실패 · 가슴 높이 오르기 · 넘기 취소 · 슬라이딩 3~5m · 대기 · 점프 취소 · 넘은 직후 슬라이딩 ·
                        전술 달리기 ×1.8 → 3초 뒤 ×1.5 · 대기 6초 · 착지 감속 · 연속 점프 · 기대기(기본 끔) · 실제 키 Shift 두 번 · 결정성
    perf [--sec N]  S3  실시간 고리 t0(보통 화질): 그리기 호출 ≤ 40 · 삼각형 · 33ms 초과 1% 이하 · 이동 sim ≤ 0.8ms · ?dbg=1 표(아케이드는 없음)
                        — 헤드리스 M5 수치는 참고, 판정은 실제 사무 PC. --fire(S4): 걸으며 연사 중 그리기 호출 ≤ 60
    shoot --core    S4  무기 6종 발사 · aimAt → hit · 탄창 감소 · 반동 배열 = 카메라 pitch · 쏜 뒤 그린 카메라 = 다음 탄 방향 · 손 떼면 0.2초 복귀 ·
                        전술(+약실 1) < 빈 탄창 재장전 · 자동 · 달리기 취소 · 달리기 → 사격 0.2초 · 산탄 8줄기 고정 무늬 · 펌프 간격 · 조준 시야각 ·
                        부위 배율 · 방탄 · 감쇠 · 처치 · 맞힘 표시 4종(X 아님) · 교체 0.45/0.3 · 조준경 덮개 · 십자선 · 소리 · 결정성 · 연사 중 호출 ≤ 60
    shoot           S5  위 전부 + 부착물 9종(큰 탄창 +50% · 빠른 탄창 · 소음기 · 반동 억제기 · 점/배율 조준경 · 칸 제한) · 근접 1.5m(방탄 2회 · 재장전 취소) ·
                        벽 앞 총 거두기 · 발사기 날아가는 탄 · 기대기 켬 → 섬광 키 4(실제 키) · 훈련장: 나무 판자 · 얇은 철판 관통 ×0.5 · 콘크리트 막힘 ·
                        수류탄 반경 · 엄폐 뒤 무피해 · 쿠킹 퓨즈 3초 · 궤적 점 · 손에서 터짐 · 섬광 반경 8m · 플레이어 흰빛(동작 줄이기 회색) ·
                        효과(예광 · 탄피 · 탄흔 · 점광 · 폭발 빛 · 흔들림 · 붉은 입자 없음) · 첫 폭발 셰이더 새로 안 만듦 · 「훈련장」 클릭 → 과제 6개를 __fps 입력만으로
    perf --blast    S5  실시간 고리 t0 에서 폭발 연속(0.7초마다) 중 33ms 넘는 프레임 0 · 호출 ≤ 60 · 셰이더 새로 안 만듦
    perf --mission m1 [--sec 60]  S10b  임무 1 실제 판(적 · 아군 · 소품)을 god · 자동 조종으로 실시간: 구역 만들기 각 ≤ 50ms · 합 ≤ 300ms ·
                        호출 ≤ 150 · 삼각형 ≤ 150k · 구역별 최대 · 동굴 야간투시경 구간 · 동굴 빛 낮춤 · 33ms 초과 1% 이하 · 새벽 하늘 · 생성 무늬
                        + 등대 켜짐 → 선착장 돌파 20초(회전 빛줄기 · 깨어난 적)도 같은 예산(S10a 지형만 걷기는 mission --id m1w)
    perf --mission m2 [--sec 60]  S11a  임무 2 지형(시험 작전 m2w — 적 없음)을 god · 자동 조종으로 실시간: 구역 만들기 · 호출 ≤ 150 · 삼각형 ≤ 150k ·
                        구역별 최대 · 33ms 초과 1% 이하 · 흐린 하늘 · 생성 무늬(salt · rustplate · corrugated …) + 탱크 마당 증기 기둥 10초도 같은 예산
    ai --core       S6  시험 구역 t1: 무리 2개 순찰 · 길찾기(높은 벽 돌아가기 · 줄 당기기 · 캐시 · 단계당 A* ≤ 2) · 40m 안 총성 → 경계(소음기 12m) ·
                        시야 원뿔 + 발견 게이지 → 교전(뒤돈 적은 못 봄) · 반응 시간 뒤 첫 발 빗나감(옆 0.5~1.5m · 탄흔) · 확률 명중 · 토큰 ≤ 3 ·
                        맞으면 엄폐 지점(숨은 머리 = 엄폐물에 맞음) · 엿보며 사격 · 놓치면 추격 → 경계 → 순찰 · 쓰러짐 2.1초 뒤 제거(흐려짐) · 동료 쓰러짐 경계 ·
                        엄폐 벽 뒤 앉은 플레이어 못 맞힘 → 서면 맞음 · 닫힌 문 끼임 감지 · 사람 그림(부위 InstancedMesh · 팀 색) · 호출 ≤ 100
    perf --ai       S6  시험 구역 t1 적 14명 깨어 있음(실시간): AI ≤ 1.2ms/프레임 · 그리기 호출 ≤ 100
    mission --id ID S8  임무(t2 · t0)를 god · autopilot · fast(8) 로 결과까지: phase result · 목표 순서 = 자료 순서 · 목표 시간 상한 · autopilotStuck 없음 ·
                        점수 0~250,000 정수 · 점수식 다시 셈 · 실패 규칙. t2: 시작 연출(입력 버림 · Enter/클릭 건너뛰기 · 시점 복귀) · 목표 줄 · 나침반 ·
                        마커 + 거리 · 화면 밖 화살표 · 자막 2줄(기호 + 이름) · 무전 소리 · 상호작용(F 길게 · 유지 · 줄어듦 · 바라봄) · 웨이브 · 버티기 20초.
                        t0: 실제 키 W 만으로 「표식까지 걷기」 끝
                    S10b  m1(--diff easy|normal|hard): 위 + 물총새 구역 건너기 · 떨어짐 0 · 첫 처치 ≤ 20초. 보통이면 더: 첫 30초(시작 연출 포함 · 추천 장비 —
                        첫 사격 ≤ 15 · 첫 처치 ≤ 20 · 경비 교전 없음) · 바탕 소리(파도 · 바람 · 무적) · 음악(은신 → 등대 곡 → 전투 곡) · 등대 소품(빛줄기 회전 ·
                        체크포인트 복원도 켜짐) · 동굴 밝기 배수 · 야간투시경(밝은 곳 눈부심 / 동굴 증폭 · 깊이 안개) · 0발 명중 절반 · 어려움 트인 곳 쓰러짐 ≥ 1.2초
    arcade          S9  arcade --frame 전부 + 점수 규약(가짜 부모 창 ?hk=1&dev=1&quick=t0): hk:ready → hk:hello → 「바로 출격」 → hk:start 1번 →
                        출격 직후 Space = 점프(hk:start 그대로 1번) → hk:live 2초 간격(정수) → 키 W 만으로 t0 끝 → hk:score 1번(정수 ≤ 250,000 = 판 점수) →
                        결과에서 Space = 「다음 작전」(hk:start) → 멈춤 「임무 그만두기」 → 확인 창 → 실패 점수 hk:score → 「다시 하기」 → 메뉴로 빠지면 먼저 실패 점수 →
                        손잡이 쓴 판은 hk:live · hk:score 없음 · 결과에 「시험 판」 → 부모 hk:restart = 작전 고르기
    ui              S9  화면 전환 전부 스크린샷(타이틀 · 설정 · 고르기 · 장비 · 브리핑 · 놀이 · Tab 조작 보기 · 야간투시경 · 멈춤 · 확인 창 · 결과) ·
                        놀이 중 NEXT 정규식 단추 0(no-zoom.js HKNextKey.find) · 결과 Space → 「다음 작전」 · 저장(설정 유지 · 손상 값 버림 · 막힘 = 모두 열림 ·
                        기록 · 진행 초기화) · 음악 요청 상태(첫 클릭 전 무음 · 메뉴 → 전투 1초 겹침 · 무전 낮춤 · 은신 · 멈춤 · 끄기 · 반복 겹침 · 파일 없어도 진행) ·
                        야간투시경(덮개 · 잡음 초당 15번 · 장면 노출) · 조준/앉기 방식 · 첫 판 안내 한 번
    assets      (그림)  생성 자산(FG.ASSETS 29개): 파일 · 형식 · 용량 상한 · 준비 끝까지 받은 것은 타이틀 그림만 · 타이틀 그림 나타남 · 쉬는 틈에 받기 · 모두 ok ·
                        고르기 지도 · 훈련장 썸네일 · t0 생성 무늬 · 하늘(흐림) · 안개색 = 하늘 아래 띠 · 사람 무늬판 · 야간투시경 하늘 녹색 · 임무 하늘 바꾸기 ·
                        구역 · 다시 시작 4바퀴에 텍스처 · 형상 · 셰이더 수 그대로 · GPU 추정 ≤ 28MB · 낮음 화질(256² · 하늘 끔) · ?noart=1(요청 0) ·
                        자산 폴더 전부 404: ready · 타이틀 · 모두 fail · 고르기 → 훈련장 사격 · 「바로 출격」 임무 진행 · 게임 코드 오류 0(브라우저 404 줄 제외)
    checkpoint      S8  t2: 싸우던 적이 있는 채로 cp1 → 탄 · 위치 · 적 · 상호작용 바꾼 뒤 hp 0 → 1.5초 뒤 복원 직후 = 스냅숏(같은 JSON) ·
                        0.5초 뒤 위치 · 탄 · 적 수 · 목표 번호 · 점수 누적 유지 · cp2(버티기) 복원
"""
import argparse
import json
import mimetypes
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

REPO = pathlib.Path(__file__).resolve().parents[2]
WEB = REPO / "web"
BODY = pathlib.Path(os.environ["FOGISLE_BODY"]) if os.environ.get("FOGISLE_BODY") else WEB / "games" / "embed" / "fogisle.html"  # lint 음성 시험용 바꿔 끼우기
BODY_URL = "/games/embed/fogisle.html"
ASSET_DIR = "/assets/games/fogisle/"
HOST = "http://hk.test"
DEFAULT_OUT = os.environ.get("FOGISLE_OUT", "/tmp/fogisle-check")

SIZE_WARN = int(1.6 * 1024 * 1024)       # tdd-final §1-2 — 넘으면 임무 자료 분리를 사용자에게 묻는다
GAME_CODE_WARN = 800 * 1024
THREE_MIN_LINE = 200_000                 # 이보다 긴 줄이 든 <script> 는 three 압축본 덩어리로 본다
SIM_MODULES = {"player", "weapons", "ballistics", "combat", "projectiles", "drill", "ai", "nav", "allies", "mission", "world"}
SIM_BANNED = [("Math.random", r"Math\.random"), ("performance.now", r"performance\.now"), ("document.", r"\bdocument\.")]

# 금지 문자열(본체 게임 코드 · 마크업 — three 덩어리는 빼고 검사)
BANNED_STRINGS = [
    ("cdnjs.", r"cdnjs\."),
    ("unpkg.", r"unpkg\."),
    ("jsdelivr.", r"jsdelivr\."),
    ("alert(", r"(?:(?<![\w$.])|(?<=window\.))alert\s*\("),
    ("confirm(", r"(?:(?<![\w$.])|(?<=window\.))confirm\s*\("),
    ("prompt(", r"(?:(?<![\w$.])|(?<=window\.))prompt\s*\("),
    ("mix-blend-mode", r"mix-blend-mode"),
    ("api.js/mgmt.js", r"/_shared/(?:api|mgmt)\.js"),
]

# 금지어 — 레퍼런스 시리즈 · 제작사 · 인물 · 부대 · 실존 부대 · 실존 총기 · 실존 국가/지역(대소문자 무시).
# 라틴 글자는 낱말 경계로, 한글은 그대로 찾는다. 새 이름이 나오면 여기에 더한다.
BANNED_WORDS_LATIN = [
    "call of duty", "modern warfare", "black ops", "warzone", "infinity ward", "treyarch", "activision", "raven software",
    "mactavish", "captain price", "soap", "makarov", "zakhaev", "task force 141", "tf141", "tf 141", "shadow company",
    "nikolai", "farah karim", "alex keller", "kate laswell", "laswell", "ghost riley", "simon riley", "gaz garrick",
    "valeria garza", "hassan zyani", "konni", "al-qatala", "al qatala", "urzikstan", "verdansk", "las almas",
    "navy seal", "seal team", "delta force", "spetsnaz", "gign", "green beret", "rangers", "marsoc", "sas", "kssf", "udt",
    "ak-47", "ak47", "akm", "ak-74", "m4a1", "m16", "m249", "mp5", "mp7", "ump45", "p90", "scar-h", "scar-l", "fn scar",
    "glock", "desert eagle", "kalashnikov", "barrett", "hk416", "famas", "steyr aug", "uzi", "rpg-7", "m1911", "beretta",
    "dragunov", "remington", "mossberg", "kar98", "javelin", "stinger",
    "korea", "dprk", "pyongyang", "seoul", "busan", "incheon", "china", "beijing", "shanghai", "japan", "tokyo",
    "russia", "moscow", "ukraine", "usa", "united states", "america",
]
BANNED_WORDS_HANGUL = [
    "콜 오브 듀티", "콜오브듀티", "모던 워페어", "모던워페어", "블랙 옵스", "블랙옵스", "워존", "인피니티 워드", "트레이아크", "액티비전",
    "맥태비시", "프라이스 대위", "마카로프", "자카예프", "태스크 포스", "섀도 컴퍼니", "쉐도우 컴퍼니",
    "델타 포스", "스페츠나츠", "네이비 실", "그린베레", "특전사", "해병대",
    "칼라시니코프", "글록", "데저트 이글", "바렛", "드라구노프", "레밍턴", "모스버그", "베레타",
    "한반도", "대한민국", "한국군", "북한", "남한", "조선인민군", "평양", "서울", "부산", "인천", "중국", "베이징", "일본", "도쿄",
    "러시아", "모스크바", "우크라이나", "미국", "미군",
]



def _easy_counts(sq):
    """fix3 — 본체 ai dropPlan 과 같은 규칙: 전체 × 0.8(반올림)이 되게, 무리 첫 사람은 남기고 소총수 · 남은 인원 많은 무리 · 뒤쪽부터 뺌."""
    left = {g: v["n"] for g, v in sq.items()}
    cand = []
    for g, v in sq.items():
        for k in range(1, v["n"]):
            cand.append((g, k, v["types"][k] == "rifle", len(cand)))
    total = sum(left.values())
    n = total - int(total * 0.8 + 0.5)
    out = set()
    for rifle_only in (True, False):
        while n > 0:
            best = None
            for c in cand:
                if (c[0], c[1]) in out or (rifle_only and not c[2]):
                    continue
                if best is None or left[c[0]] > left[best[0]] or (left[c[0]] == left[best[0]] and c[3] > best[3]):
                    best = c
            if best is None:
                break
            out.add((best[0], best[1])); left[best[0]] -= 1; n -= 1
    return left

def out_dir(args):
    p = pathlib.Path(args.out or DEFAULT_OUT)
    p.mkdir(parents=True, exist_ok=True)
    return p


def finish(name, ok, summary, notes):
    for n in notes:
        print(("  ok  " if n[0] else "  XX  ") + n[1])
    summary = dict(summary)
    summary["cmd"] = name
    summary["ok"] = bool(ok)
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if ok else 1


# ───────────────────────────── lint ─────────────────────────────

SCRIPT_RE = re.compile(r"<script(\s[^>]*)?>(.*?)</script>", re.S | re.I)
MODULE_RE = re.compile(r"/\*\s*====\s*MODULE:\s*([A-Za-z0-9_-]+)")


def split_body(text):
    """본체를 (three 덩어리, 게임 코드 덩어리 목록, three 를 뺀 나머지 글) 로 나눈다."""
    # HTML 주석을 같은 길이의 빈칸으로 가린 글에서 덩어리를 찾는다(주석 안 글자가 <script> 로 잘못 읽히지 않게).
    # 자리는 같으니 잘라 내는 내용은 원문에서 — 주석 안 금지어도 검사된다.
    masked = re.sub(r"<!--.*?-->", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    three = []
    blocks = []
    rest_parts = []
    pos = 0
    for m in SCRIPT_RE.finditer(masked):
        attrs = m.group(1) or ""
        code = text[m.start(2):m.end(2)]
        line = text.count("\n", 0, m.start()) + 1
        longest = max((len(x) for x in code.split("\n")), default=0)
        if "src=" in attrs:
            continue
        if longest >= THREE_MIN_LINE:
            three.append({"line": line, "chars": len(code)})
            rest_parts.append(text[pos:m.start()])
            rest_parts.append("\n" * text.count("\n", m.start(), m.end()))  # 줄 번호 유지
            pos = m.end()
            continue
        mm = MODULE_RE.search(code.split("\n", 1)[0])
        blocks.append({"line": line, "code": code, "module": mm.group(1) if mm else None, "first": code.split("\n", 1)[0][:80]})
    rest_parts.append(text[pos:])
    return three, blocks, "".join(rest_parts)


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def cmd_lint(args):
    notes = []
    ok = True
    if not BODY.exists():
        return finish("lint", False, {"error": "본체 없음"}, [(False, f"본체 없음: {BODY}")])
    raw = BODY.read_bytes()
    text = raw.decode("utf-8")
    size = len(raw)
    three, blocks, rest = split_body(text)

    # 0) 구조: 4줄 no-zoom.js, three 덩어리 1개, 게임 코드 덩어리마다 모듈 표시, boot 가 마지막
    lines4 = text.split("\n", 5)[:5]
    nz = len(lines4) >= 4 and "/_shared/no-zoom.js" in lines4[3]
    notes.append((nz, "4줄에 /_shared/no-zoom.js"))
    ok &= nz
    t_ok = len(three) == 1
    notes.append((t_ok, f"three 덩어리 1개(찾은 수 {len(three)}{', ' + str(three[0]['line']) + '줄~' if three else ''})"))
    ok &= t_ok
    if three:
        before = all(b["line"] > three[0]["line"] for b in blocks)
        notes.append((before, "three 덩어리가 게임 코드보다 앞"))
        ok &= before
    unmarked = [b for b in blocks if not b["module"]]
    notes.append((not unmarked, "게임 코드 덩어리마다 첫 줄 모듈 표시" + (f" — 표시 없음: {[b['line'] for b in unmarked]}" if unmarked else "")))
    ok &= not unmarked
    names = [b["module"] for b in blocks if b["module"]]
    dup = sorted({n for n in names if names.count(n) > 1})
    notes.append((not dup, "모듈 이름 겹침 없음" + (f" — {dup}" if dup else "")))
    ok &= not dup
    last_boot = bool(names) and names[-1] == "boot"
    notes.append((last_boot, "boot 모듈이 마지막"))
    ok &= last_boot

    # 1) 문법 — 덩어리마다 node --check
    syntax_err = []
    with tempfile.TemporaryDirectory(prefix="fogisle-lint-") as td:
        for k, b in enumerate(blocks):
            p = pathlib.Path(td) / f"b{k:02d}_{b['module'] or 'x'}.js"
            p.write_text(b["code"], encoding="utf-8")
            r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
            if r.returncode != 0:
                msg = (r.stderr or r.stdout).strip().splitlines()
                syntax_err.append(f"{b['module']}({b['line']}줄~): " + " / ".join(x[:160] for x in msg[:4]))
    notes.append((not syntax_err, f"문법 node --check {len(blocks)}덩어리" + ("" if not syntax_err else " — " + " | ".join(syntax_err))))
    ok &= not syntax_err

    # 2) 금지 문자열(three 덩어리 제외)
    hits = []
    for label, pat in BANNED_STRINGS:
        for m in re.finditer(pat, rest):
            hits.append(f"{label}@{line_of(rest, m.start())}")
    # localStorage 키 접두 — 게임 키는 core 의 FG.GAME.key 에서 읽는다
    km = re.search(r"FG\.GAME\s*=\s*Object\.freeze\(\{\s*key:\s*'([a-z0-9_-]+)'", rest)
    gkey = km.group(1) if km else "fogisle"
    for m in re.finditer(r"localStorage\.(setItem|getItem|removeItem)\(\s*(['\"`])([^'\"`]*)", rest):
        if not m.group(3).startswith(gkey + "."):
            hits.append(f"localStorage 키 접두 없음 '{m.group(3)[:30]}'@{line_of(rest, m.start())}")
    # 자산(설계 변경 승인 — user-decisions §4 · §6): 같은 출처 /assets/games/<키>/[한 단계 폴더/]이름-v<n>.<확장자>(art · sky · tex · 음악)와
    # 글꼴 /assets/fonts/ 만. 바깥 주소(http · https) · CDN 은 금지
    for m in re.finditer(r"https?://[^\s'\"`)]+", rest):
        if not m.group(0).startswith("http://www.w3.org/"):
            hits.append(f"바깥 주소 '{m.group(0)[:50]}'@{line_of(rest, m.start())}")
    asset_urls = set()
    for m in re.finditer(r"/assets/[^\s'\"`)]*", rest):
        u = m.group(0)
        if not (u.startswith("/assets/fonts/") or re.fullmatch(r"/assets/games/" + re.escape(gkey) + r"/(?:[a-z0-9]+/)?[a-z0-9_-]+-v\d+\.[a-z0-9]+", u)):
            hits.append(f"자산 주소 규칙 밖 '{u[:60]}'@{line_of(rest, m.start())}")
        else:
            asset_urls.add(u)
    # 본체가 부르는 자산 파일이 저장소 web/ 에 실제로 있는지(음성 시험용 바꿔 끼운 본체는 건너뜀)
    if not os.environ.get("FOGISLE_BODY"):
        for u in sorted(asset_urls):
            if not (WEB / u.lstrip("/")).is_file():
                hits.append(f"자산 파일 없음 '{u}'")
    if re.search(r"<select\b", rest, re.I) and not re.search(r"appearance\s*:\s*none", rest):
        hits.append("select 에 appearance:none 없음")
    notes.append((not hits, "금지 문자열 0" + ("" if not hits else " — " + ", ".join(hits[:20]))))
    ok &= not hits

    # 3) 금지어(대소문자 무시)
    words = []
    low = rest.lower()
    for w in BANNED_WORDS_LATIN:
        for m in re.finditer(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", low):
            words.append(f"{w}@{line_of(rest, m.start())}")
    for w in BANNED_WORDS_HANGUL:
        for m in re.finditer(re.escape(w), rest):
            words.append(f"{w}@{line_of(rest, m.start())}")
    notes.append((not words, f"금지어 0(목록 {len(BANNED_WORDS_LATIN) + len(BANNED_WORDS_HANGUL)}개)" + ("" if not words else " — " + ", ".join(words[:20]))))
    ok &= not words

    # 4) sim 모듈 안 Math.random · performance.now · document.
    sim_hits = []
    sim_found = []
    for b in blocks:
        if b["module"] in SIM_MODULES:
            sim_found.append(b["module"])
            for label, pat in SIM_BANNED:
                for m in re.finditer(pat, b["code"]):
                    sim_hits.append(f"{b['module']}:{label}@{b['line'] + b['code'].count(chr(10), 0, m.start())}")
    notes.append((not sim_hits, f"sim 모듈 규칙(검사한 sim 모듈 {sim_found or '아직 없음'})" + ("" if not sim_hits else " — " + ", ".join(sim_hits[:20]))))
    ok &= not sim_hits

    # 5) 크기
    game_code = sum(len(b["code"].encode("utf-8")) for b in blocks)
    warn = []
    if size > SIZE_WARN:
        warn.append(f"본체 {size / 1048576:.2f}MB > 1.6MB — 임무 자료 분리를 사용자에게 물을 것")
    if game_code > GAME_CODE_WARN:
        warn.append(f"게임 코드 {game_code / 1024:.0f}KB > 800KB — 분리를 사용자에게 물을 것")
    for w in warn:
        print("  !!  " + w)
    notes.append((True, f"크기 본체 {size / 1024:.0f}KB · 게임 코드 {game_code / 1024:.1f}KB · 모듈 {names}"))

    return finish("lint", ok, {"bytes": size, "game_code_bytes": game_code, "modules": names,
                               "three_line": three[0]["line"] if three else None, "warnings": warn,
                               "syntax_errors": len(syntax_err), "banned": len(hits) + len(words), "sim_hits": len(sim_hits)}, notes)


# ───────────────────────────── 브라우저 ─────────────────────────────

FAKE_LUCIDE = "window.lucide={createIcons:function(){},icons:{}};"
HK_SPY = """(() => {
  window.__hkSeen = [];
  window.addEventListener('message', (e) => {
    const d = e.data; if (d && typeof d.type === 'string' && d.type.indexOf('hk:') === 0) window.__hkSeen.push(d.type);
  });
})();"""


# 알려진 콘솔 경고(이것만 빼고 경고도 0 이어야 함 — 나머지는 errors 에 「console.warning:」으로 넣어 실패시킴)
KNOWN_WARNINGS = (
    'are deprecated with r150+',          # three r160 UMD(build/three.min.js) 사용 중단 안내 — r160 UMD 를 쓰는 한 그대로
    'allow-scripts and allow-same-origin',  # 가짜 부모 창 iframe sandbox(hk-embed 와 같은 설정)
    'GPU stall due to ReadPixels',         # 헤드리스 스크린샷 · readPixels(크롬 GL 드라이버 안내)
)


class Session:
    """헤드리스 크롬 한 판 — route · 오류 수집을 맡는다."""

    def __init__(self, pw, viewport=(1280, 720)):
        self.browser = pw.chromium.launch(headless=True, args=[
            "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        self.viewport = viewport
        self.ctx = None

    def page(self, init_scripts=()):
        if self.ctx:
            self.ctx.close()
        self.ctx = self.browser.new_context(viewport={"width": self.viewport[0], "height": self.viewport[1]}, device_scale_factor=1)
        for s in init_scripts:
            self.ctx.add_init_script(s)
        pg = self.ctx.new_page()
        self.errors = []      # pageerror + console.error + 모르는 console.warning
        self.warn_known = []  # 알려진 경고(KNOWN_WARNINGS) — 보고만
        self.external = []    # 막은 바깥 요청
        self.missing = []     # hk.test 에서 없는 파일
        self.api = []         # /api/** 요청(메서드 · 경로 · 본문)
        self.block_music = getattr(self, "block_music", False)
        self.block_assets = getattr(self, "block_assets", False)
        pg.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)[:300]))
        pg.on("console", self._console)
        # 나중에 등록한 route 가 먼저 — 바깥 막기를 먼저 깔고 그 위에 hk.test · unpkg
        pg.route("**/*", self._block)
        pg.route("https://unpkg.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE_LUCIDE))
        pg.route(HOST + "/**", self._serve)
        self.pg = pg
        return pg

    def _console(self, m):
        if m.type == "error":
            self.errors.append("console.error: " + m.text[:300])
        elif m.type in ("warning", "warn"):
            if any(k in m.text for k in KNOWN_WARNINGS):
                self.warn_known.append(m.text[:120])
            else:
                self.errors.append("console.warning: " + m.text[:300])

    def _block(self, route):
        u = route.request.url
        if u.startswith("data:") or u.startswith("blob:"):
            return route.continue_()
        self.external.append(u[:200])
        return route.abort()

    def _serve(self, route):
        req = route.request
        path = req.url.split("?")[0].split("#")[0].replace(HOST, "")
        if path == PARENT_PATH:  # 가짜 부모 창(하네스가 직접 돌려줌 — 저장소에 시험용 HTML 을 두지 않음). ?q=a%3Db → 창 주소에 &a=b
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(req.url).query).get("q", [""])[0]
            extra = ("&" + q) if re.fullmatch(r"[a-z0-9=&]*", q) and q else ""
            return route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PARENT_HTML.replace("__EXTRA__", extra))
        if self.block_music and path.endswith(".mp3"):   # 음악 파일 못 불러옴 흉내(ui 시험)
            self.missing.append(path)
            return route.fulfill(status=404, body="")
        if self.block_assets and path.startswith(ASSET_DIR):   # 생성 자산(그림 · 음악) 전부 못 불러옴 흉내(assets 시험)
            self.missing.append(path)
            return route.fulfill(status=404, body="")
        if path.startswith("/api/"):
            self.api.append({"method": req.method, "path": path, "body": req.post_data})
            return route.fulfill(status=200, content_type="application/json", body='{"data":{}}')
        p = (WEB / path.lstrip("/")).resolve()
        if WEB.resolve() not in p.parents or not p.is_file():
            self.missing.append(path)
            return route.fulfill(status=404, body="")
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if p.suffix == ".woff2":
            ctype = "font/woff2"
        body = p.read_bytes()
        rng = req.headers.get("range")
        m = re.fullmatch(r"bytes=(\d+)-(\d*)", rng or "")
        if m:   # 음악(<audio>)은 범위 요청으로 앞뒤를 오감 — 실제 정적 서버처럼 206(되감기 · 반복이 되게)
            a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else len(body) - 1
            b = min(b, len(body) - 1)
            return route.fulfill(status=206, body=body[a:b + 1], headers={"Content-Type": ctype, "Accept-Ranges": "bytes",
                                 "Content-Range": f"bytes {a}-{b}/{len(body)}", "Content-Length": str(b - a + 1)})
        return route.fulfill(status=200, content_type=ctype, body=body, headers={"Accept-Ranges": "bytes"})

    def close(self):
        try:
            if self.ctx:
                self.ctx.close()
        finally:
            self.browser.close()


def wait_ready(pg, timeout_ms=5000):
    """__fps.ready 를 기다린다 → (ok, 걸린 ms)."""
    t0 = time.time()
    try:
        pg.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=timeout_ms)
        left = max(100, timeout_ms - int((time.time() - t0) * 1000))
        val = pg.evaluate("""(ms) => Promise.race([
            window.__fps.ready.then(v => ({v: v})),
            new Promise(r => setTimeout(() => r({timeout: true}), ms))])""", left)
        ok = bool(val.get("v")) and not val.get("timeout")
    except Exception as e:  # noqa: BLE001
        print("  ..  ready 대기 실패: " + str(e)[:200])
        ok = False
    return ok, int((time.time() - t0) * 1000)


def image_spread(path):
    """스크린샷이 한 색으로만 칠해졌는지(그림이 안 나옴) — 밝기 표준편차를 돌려준다."""
    try:
        from PIL import Image, ImageStat
    except Exception:  # noqa: BLE001
        return None
    im = Image.open(path).convert("L").resize((160, 90))
    return round(ImageStat.Stat(im).stddev[0], 2)


# ───────────────────────────── smoke ─────────────────────────────

def cmd_smoke(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            # 1) 단독으로 열기
            pg = s.page([HK_SPY])
            t0 = time.time()
            pg.goto(HOST + BODY_URL, wait_until="load")
            load_ms = int((time.time() - t0) * 1000)
            r_ok, r_ms = wait_ready(pg, 5000)
            notes.append((r_ok, f"__fps.ready 5초 안(대기 {r_ms}ms · 불러오기 {load_ms}ms)"))
            ok &= r_ok
            pg.wait_for_timeout(1200)  # 몇 프레임 그리기
            info = pg.evaluate("""() => ({
                rev: window.THREE ? window.THREE.REVISION : null,
                st: window.__fps ? window.__fps.state() : null,
                perf: window.__fps ? window.__fps.perf() : null,
                hkEv: window.__fps ? window.__fps.events().filter(e => e.type === 'hk').length : -1,
                hkSeen: (window.__hkSeen || []).slice(),
                title: document.title,
                game: window.FG ? {key: FG.GAME.key, title: FG.GAME.title, logo: FG.GAME.logo, prefix: FG.STORE_PREFIX} : null,
                logo: (document.getElementById('titleName') || {}).textContent || '',
                titleOn: (() => { const t = document.getElementById('scrTitle'); return !!t && getComputedStyle(t).display !== 'none'; })(),
                btn: (() => { const b = document.getElementById('btnQuick'); if (!b) return null;
                               const r = b.getBoundingClientRect(); return {text: b.textContent.trim(), w: r.width, h: r.height}; })(),
                fatalOn: (() => { const f = document.getElementById('fatal'); return !!f && getComputedStyle(f).display !== 'none'; })(),
                fontOk: document.fonts ? document.fonts.check('700 20px Pretendard') : null,
            })""")
            summary.update({"three": info["rev"], "phase": (info["st"] or {}).get("phase"), "perf": info["perf"], "game": info["game"]})
            c = info["rev"] == "160"
            notes.append((c, f"THREE.REVISION === '160' (값 {info['rev']!r})")); ok &= c
            c = bool(info["st"]) and info["st"]["phase"] == "title" and info["st"]["gfx"]
            notes.append((c, f"phase title · 그리기 준비(state {info['st']})")); ok &= c
            c = info["titleOn"] and not info["fatalOn"] and info["btn"] and info["btn"]["text"] == "바로 출격" and info["btn"]["w"] > 40
            notes.append((c, f"타이틀 화면 · 「바로 출격」 단추 보임 · 실패 안내 숨김(btn {info['btn']})")); ok &= c
            g = info["game"] or {}
            c = bool(g) and info["title"] == g.get("title") and info["logo"] == g.get("logo") and g.get("prefix") == g.get("key", "") + "."
            notes.append((c, f"이름 · 키 한 곳(FG.GAME) — 문서 제목 {info['title']!r} · 로고 {info['logo']!r} · 저장 접두 {g.get('prefix')!r}")); ok &= c
            c = info["hkEv"] == 0 and not info["hkSeen"]
            notes.append((c, f"단독 열기라 hk 신호 안 보냄(사건 {info['hkEv']} · 받은 메시지 {info['hkSeen']})")); ok &= c
            p = info["perf"] or {}
            c = p.get("frames", 0) > 10 and p.get("calls", 0) > 0
            notes.append((c, f"그리기 고리 돎(프레임 {p.get('frames')} · 호출 {p.get('calls')} · 삼각형 {p.get('tris')} · 중앙값 {p.get('ftMed')}ms)")); ok &= c
            notes.append((True, f"Pretendard 글꼴 확인 {info['fontOk']}"))
            shot = out / "smoke-title.png"
            pg.screenshot(path=str(shot))
            spread = image_spread(shot)
            c = spread is None or spread > 4
            notes.append((c, f"타이틀 스크린샷 {shot} (밝기 퍼짐 {spread})")); ok &= c
            summary["shot"] = str(shot)
            c = not s.errors
            notes.append((c, "오류 0(pageerror · console.error · 알려진 것 밖의 console.warning)" + ("" if c else " — " + " | ".join(s.errors[:6])))); ok &= c
            notes.append((True, f"알려진 경고 {len(s.warn_known)}줄(빼고 봄): {sorted(set(w[:60] for w in s.warn_known))}"))
            summary["warn_known"] = len(s.warn_known)
            c = not s.external
            notes.append((c, "바깥 요청 0" + ("" if c else " — " + ", ".join(s.external[:6])))); ok &= c
            c = not s.missing
            notes.append((c, "없는 파일 요청 0" + ("" if c else " — " + ", ".join(s.missing[:6])))); ok &= c
            summary["errors"] = len(s.errors)

            # 2) ?hk=1(아케이드 표시, dev 없음) — 손잡이 없음 · 오류 0
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1", wait_until="load")
            pg.wait_for_function("() => window.FG && FG.game && FG.game.phase !== 'boot'", timeout=5000)
            pg.wait_for_timeout(300)
            v = pg.evaluate("() => ({fps: typeof window.__fps, phase: FG.game.phase, seen: (window.__hkSeen||[]).slice()})")
            c = v["fps"] == "undefined" and v["phase"] == "title" and not v["seen"] and not s.errors
            notes.append((c, f"?hk=1 단독: __fps 없음 · phase title · hk 신호 없음(부모 없음) · 오류 0 ({v}, 오류 {s.errors[:3]})")); ok &= c

            # 3) ?hk=1&dev=1 — 손잡이 있음
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1&dev=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            c = r_ok and not s.errors
            notes.append((c, "?hk=1&dev=1: __fps 있음 · ready" + ("" if not s.errors else f" — {s.errors[:3]}"))); ok &= c
        finally:
            s.close()
    return finish("smoke", ok, summary, notes)


# ───────────────────────────── arcade --frame ─────────────────────────────

PARENT_PATH = "/__parent.html"
# 가짜 부모 창 — hk-embed.js 와 같은 sandbox · allow 속성의 iframe, 받은 신호 기록, hk-embed 의 paused 규칙과 play.js togglePause 흉내.
PARENT_HTML = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>가짜 부모</title>
<style>body{margin:0;background:#0f172a;color:#cbd5e1;font:13px system-ui}#bar{height:40px;display:flex;gap:8px;align-items:center;padding:0 10px}
#f{display:block;width:1200px;height:660px;border:0}</style></head><body>
<div id="bar"><button id="bPause" type="button">pause</button><button id="bResume" type="button">resume</button><button id="bRestart" type="button">restart</button><span id="log"></span></div>
<iframe id="f" title="게임" src="/games/embed/fogisle.html?hk=1&dev=1__EXTRA__" allow="autoplay; fullscreen; gamepad"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" referrerpolicy="no-referrer"></iframe>
<script>
(() => {
  const f = document.getElementById('f');
  const origin = location.origin;
  let paused = false;
  window.__got = []; window.__sent = []; window.__gotT = [];
  const send = (type) => { window.__sent.push(type); try { f.contentWindow.postMessage({ type }, origin); } catch (_) {} };
  f.addEventListener('load', () => send('hk:hello'));
  window.addEventListener('message', (e) => {
    if (e.origin !== origin || e.source !== f.contentWindow) return;
    const m = e.data && typeof e.data === 'object' ? e.data : {};
    window.__got.push(m.type);
    window.__gotT.push({ type: m.type, t: performance.now(), score: m.score, why: m.why });
    document.getElementById('log').textContent = window.__got.join(' ');
    if (m.type === 'hk:ready') return send('hk:hello');
    if (m.type === 'hk:paused') { paused = true; return; }
    if (m.type === 'hk:resumed') { paused = false; return; }
    if (m.type === 'hk:esc') return togglePause();
  });
  const pauseFn = () => { paused = true; send('hk:pause'); };
  const resumeFn = () => { if (!paused) return false; paused = false; send('hk:resume'); return true; };
  const togglePause = () => { if (!resumeFn()) pauseFn(); };
  document.getElementById('bPause').onclick = pauseFn;
  document.getElementById('bResume').onclick = () => resumeFn();
  document.getElementById('bRestart').onclick = () => { paused = false; send('hk:restart'); };
  window.__parentPaused = () => paused;
})();
</script></body></html>"""

ST = "() => window.__fps.state()"


def _phase_wait(fr, phase, ms=1500):
    try:
        fr.wait_for_function("(p) => window.__fps && window.__fps.state().phase === p", arg=phase, timeout=ms)
        return True
    except Exception:  # noqa: BLE001
        return False


def _to_title(pg):
    """메뉴 어디서든 타이틀로(시험 손잡이 아님 — 판 상태를 바꾸지 않는 화면 이동)."""
    pg.evaluate("() => { if (FG.ui) FG.ui.closeOverlays(); FG.game.setPhase('title', { why: 'test' }); }")


def _check(notes, cond, text):
    notes.append((bool(cond), text))
    return bool(cond)


def _standalone(s, out, notes, summary):
    """단독으로 열기 — 출격 · 대체 조작 끌기 · Space · 고리 손잡이 · Esc/blur/잠금 풀림 멈춤 · 멈춤 중 Space(no-zoom 「계속하기」)."""
    ok = True
    pg = s.page([HK_SPY])
    pg.goto(HOST + BODY_URL, wait_until="load")
    r_ok, _ = wait_ready(pg, 5000)
    ok &= _check(notes, r_ok, "[단독] __fps.ready")
    pg.click("#btnSortie")
    ok &= _check(notes, _phase_wait(pg, "play"), "[단독] 「출격 준비」 클릭 → phase play")
    pg.wait_for_timeout(400)  # 헤드리스는 잠금 실패 → 대체 조작
    v = pg.evaluate("""() => ({st: __fps.state(), active: document.activeElement && document.activeElement.id,
        hint: (document.getElementById('hint')||{}).textContent || '', hintOn: document.getElementById('hint').classList.contains('on'),
        titleOn: getComputedStyle(document.getElementById('scrTitle')).display, pauseOn: getComputedStyle(document.getElementById('scrPause')).display})""")
    st = v["st"]
    ok &= _check(notes, st["fallback"] and not st["locked"] and v["hintOn"] and "끌어서" in v["hint"],
                 f"[단독] 헤드리스 잠금 실패 → 대체 조작 + 안내 한 줄(fallback {st['fallback']} · 안내 {v['hint']!r})")
    ok &= _check(notes, v["active"] == "gl" and v["titleOn"] == "none" and v["pauseOn"] == "none",
                 f"[단독] 초점 규칙: 초점 {v['active']!r} · 타이틀 {v['titleOn']} · 덮개 {v['pauseOn']}")
    # 출격 직후 Space — 덮개 · 단추가 다시 눌리지 않음, 화면 안 밀림
    pg.keyboard.press("Space")
    pg.wait_for_timeout(250)
    v = pg.evaluate("() => ({st: __fps.state(), sy: window.scrollY, pz: getComputedStyle(document.getElementById('scrPause')).display})")
    ok &= _check(notes, v["st"]["phase"] == "play" and v["st"]["ui"]["sortieCount"] == 1 and v["st"]["ui"]["resumeClicks"] == 0 and v["pz"] == "none" and v["sy"] == 0,
                 f"[단독] 출격 직후 Space → 그대로 play · 출격 1번 · 덮개 안 뜸({v['st']['phase']}, 출격 {v['st']['ui']['sortieCount']}, 덮개 {v['pz']})")
    # 대체 조작: 누른 채 끌어서 시점
    y0 = pg.evaluate(ST)
    pg.mouse.move(640, 360)
    pg.mouse.down()
    pg.mouse.move(840, 330, steps=12)
    pg.mouse.up()
    pg.wait_for_timeout(120)
    y1 = pg.evaluate(ST)
    dyaw = y1["yaw"] - y0["yaw"]
    dpitch = y1["pitch"] - y0["pitch"]
    ok &= _check(notes, dyaw > 10 and dpitch > 1 and y1["phase"] == "play",
                 f"[단독] 끌어서 둘러보기: 오른쪽 200px → yaw +{dyaw:.1f}° · 위 30px → pitch +{dpitch:.1f}°")
    summary["drag_yaw_deg"] = round(dyaw, 2)
    # 키 입력 → 입력 표(e.code)
    pg.keyboard.down("KeyW"); pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(120)
    v = pg.evaluate(ST)
    pg.keyboard.up("KeyW"); pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(80)
    v2 = pg.evaluate(ST)
    ok &= _check(notes, v["input"]["moveZ"] == 1 and v["input"]["sprint"] and v2["input"]["moveZ"] == 0 and not v2["input"]["sprint"],
                 f"[단독] W · Shift → 입력 표 moveZ {v['input']['moveZ']} · sprint {v['input']['sprint']} → 뗀 뒤 {v2['input']['moveZ']}")
    shot = out / "arcade-standalone-play.png"
    pg.screenshot(path=str(shot))
    summary["shot_play"] = str(shot)
    # 고리 손잡이: pauseLoop · step · resumeLoop · fast · setInput · look · turn
    v = pg.evaluate("""async () => {
        const F = window.__fps; const r = {};
        F.pauseLoop(); const t0 = F.state().time; await new Promise(z => setTimeout(z, 300)); r.held = F.state().time - t0;
        const n = F.step(1); r.stepN = n; r.stepDt = +(F.state().time - t0).toFixed(6);
        F.setInput({moveZ: -1, jump: true}); F.step(1/60); r.inp = F.state().input; F.clearInput(); F.step(1/60); r.inp2 = F.state().input;
        F.resumeLoop(); const t1 = F.state().time; await new Promise(z => setTimeout(z, 500)); r.normal = F.state().time - t1;
        F.fast(8, 8); const t2 = F.state().time; const fr0 = F.state().loop.frames; await new Promise(z => setTimeout(z, 500));
        r.fast = F.state().time - t2; r.fastFrames = F.state().loop.frames - fr0; F.fast(1, 1);
        r.look = F.look(30, -10); r.turn = F.turn(15, 5); r.tainted = F.state().tainted;
        return r; }""")
    ok &= _check(notes, v["held"] == 0 and v["stepN"] == 60 and abs(v["stepDt"] - 1) < 1e-6,
                 f"[단독] pauseLoop 중 시간 멈춤({v['held']}) · step(1) = 60단계 · 시간 +{v['stepDt']}")
    ok &= _check(notes, v["inp"]["moveZ"] == -1 and v["inp"]["jump"] and v["inp2"]["moveZ"] == 0 and not v["inp2"]["jump"],
                 f"[단독] setInput 이 입력 표를 덮어씀 → clearInput 으로 풂({v['inp']['moveZ']}/{v['inp']['jump']} → {v['inp2']['moveZ']}/{v['inp2']['jump']})")
    ok &= _check(notes, v["fast"] > v["normal"] * 4 and v["normal"] > 0.3,
                 f"[단독] fast(8): 0.5초 동안 sim {v['fast']:.2f}초(보통 {v['normal']:.2f}초) — 상한 4번에 안 막힘")
    ok &= _check(notes, abs(v["look"]["yaw"] - 30) < 1e-3 and abs(v["look"]["pitch"] + 10) < 1e-3 and abs(v["turn"]["yaw"] - 45) < 1e-3 and abs(v["turn"]["pitch"] + 5) < 1e-3 and v["tainted"],
                 f"[단독] look(30,-10) → {v['look']} · turn(15,5) → {v['turn']} · tainted {v['tainted']}")
    summary["fast_sim_sec_in_0.5s"] = round(v["fast"], 2)
    # Esc(잠금 없는 놀이) → 멈춤
    pg.keyboard.press("Escape")
    ok &= _check(notes, _phase_wait(pg, "paused") and pg.evaluate(ST)["pauseWhy"] == "esc", "[단독] 대체 조작 중 Esc → 멈춤")
    shot = out / "arcade-standalone-paused.png"
    pg.screenshot(path=str(shot))
    summary["shot_paused"] = str(shot)
    pg.keyboard.press("Escape")  # 단독 멈춤 중 Esc 는 덮개 그대로
    pg.wait_for_timeout(150)
    ok &= _check(notes, pg.evaluate(ST)["phase"] == "paused", "[단독] 멈춤 중 Esc → 덮개 그대로(단독은 부모 없음)")
    pg.click("#scrPause", position={"x": 60, "y": 60})
    ok &= _check(notes, _phase_wait(pg, "play"), "[단독] 덮개 클릭 → play")
    # blur → 멈춤 + 키 비우기
    pg.keyboard.down("KeyD")
    pg.wait_for_timeout(60)
    pg.evaluate("() => window.dispatchEvent(new Event('blur'))")
    pg.keyboard.up("KeyD")
    v = pg.evaluate(ST)
    ok &= _check(notes, v["phase"] == "paused" and v["pauseWhy"] == "blur", f"[단독] 창 blur → 멈춤({v['phase']}, {v['pauseWhy']})")
    pg.click("#btnResume")
    ok &= _check(notes, _phase_wait(pg, "play") and pg.evaluate("() => document.activeElement.id") == "gl", "[단독] 「계속하기」 클릭 → play · 초점 캔버스")
    # simulateLockLost → 멈춤, 그 뒤 멈춤 중 Space → no-zoom.js 가 「계속하기」 누름(대체 조작이라 바로 이어 감)
    pg.evaluate("() => __fps.simulateLockLost()")
    ok &= _check(notes, pg.evaluate(ST)["phase"] == "paused", "[단독] simulateLockLost → 멈춤")
    pg.wait_for_timeout(450)
    pg.keyboard.press("Space")
    ok &= _check(notes, _phase_wait(pg, "play", 1500), "[단독] 멈춤 중 Space → no-zoom.js 가 「계속하기」를 눌러 play")
    ok &= _check(notes, pg.evaluate("() => window.__fps.events().filter(e => e.type === 'hk').length") == 0 and not pg.evaluate("() => window.__hkSeen.length"),
                 "[단독] 단독이라 hk 신호 0")
    ok &= _check(notes, not s.errors and not s.external and not s.missing,
                 f"[단독] 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
    return ok


def cmd_arcade(args):
    from playwright.sync_api import sync_playwright
    score_part = not getattr(args, "frame", False)   # S9: --frame 없이 = 멈춤 규약 + 점수 규약
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            ok &= _standalone(s, out, notes, summary)

            # ── 가짜 부모 창 안(hk-embed.js 와 같은 sandbox · allow) ──
            pg = s.page()
            pg.goto(HOST + PARENT_PATH, wait_until="load")
            fr = pg.query_selector("#f").content_frame()
            fl = pg.frame_locator("#f")
            r_ok = False
            try:
                fr.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=5000)
                r_ok = bool(fr.evaluate("() => window.__fps.ready"))
            except Exception as e:  # noqa: BLE001
                notes.append((False, "[창] ready 대기 실패 " + str(e)[:160]))
            ok &= _check(notes, r_ok, "[창] 창 안 본체 ready(?hk=1&dev=1)")
            pg.wait_for_timeout(300)
            got = lambda: pg.evaluate("() => window.__got.slice()")  # noqa: E731
            sent = lambda: pg.evaluate("() => window.__sent.slice()")  # noqa: E731
            g = got()
            inhk = fr.evaluate("() => document.documentElement.classList.contains('in-hk') && __fps.state().inHk")
            ok &= _check(notes, g == ["hk:ready"] and inhk, f"[창] hk:ready 1번 → 부모 hk:hello → html.in-hk ({g}, in-hk {inhk})")

            fl.locator("#btnSortie").click()
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 「출격 준비」 클릭 → play")
            pg.wait_for_timeout(350)
            pg.keyboard.press("Space")
            pg.wait_for_timeout(200)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "play" and v["ui"]["sortieCount"] == 1 and v["fallback"] and fr.evaluate("() => document.activeElement.id") == "gl",
                         f"[창] 출격 직후 Space → play 그대로 · 출격 1번 · 초점 캔버스 · 대체 조작 {v['fallback']}")
            y0 = v["yaw"]
            pg.mouse.move(600, 380); pg.mouse.down(); pg.mouse.move(760, 380, steps=10); pg.mouse.up()
            pg.wait_for_timeout(100)
            y1 = fr.evaluate(ST)["yaw"]
            ok &= _check(notes, y1 - y0 > 10, f"[창] 창 안에서도 끌어서 시점 돎(yaw +{y1 - y0:.1f}°)")
            ok &= _check(notes, got() == ["hk:ready"], f"[창] 놀이 시작까지 점수 신호 · 멈춤 신호 없음({got()})")

            # 1) 잠금 풀림 → 멈춤 + hk:paused 1번, 400ms 안 Esc 는 무시
            mark = len(got())
            fr.evaluate("() => __fps.simulateLockLost()")
            pg.keyboard.press("Escape")  # 풀린 직후 같은 Esc(무시돼야 함)
            pg.wait_for_timeout(300)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "paused" and got()[mark:] == ["hk:paused"],
                         f"[창] simulateLockLost → paused + hk:paused 1번 · 400ms 안 Esc 무시({got()[mark:]})")
            # 2) 멈춤 중 Esc → hk:esc → 부모 togglePause → hk:resume → 「클릭하면 이어서」 + hk:paused 다시
            pg.wait_for_timeout(200)
            mark = len(got()); smark = len(sent())
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(300)
            v = fr.evaluate("() => ({st: __fps.state(), clickOn: getComputedStyle(document.querySelector('#scrPause .pz-click')).display, txt: document.querySelector('#scrPause .pz-click').textContent})")
            ok &= _check(notes, got()[mark:] == ["hk:esc", "hk:paused"] and sent()[smark:] == ["hk:resume"] and v["st"]["phase"] == "paused" and v["st"]["ui"]["pauseMode"] == "click" and v["clickOn"] != "none",
                         f"[창] 멈춤 중 Esc → hk:esc → 부모 hk:resume → 덮개 「{v['txt']}」 + hk:paused 재송신({got()[mark:]}, 부모 보냄 {sent()[smark:]})")
            shot = out / "arcade-frame-click-to-resume.png"
            pg.screenshot(path=str(shot))
            summary["shot_frame"] = str(shot)
            # 3) 덮개 클릭 → play + hk:resumed
            mark = len(got())
            fl.locator("#scrPause").click(position={"x": 80, "y": 80})
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 덮개 클릭 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:resumed"] and not pg.evaluate("() => window.__parentPaused()"),
                         f"[창] → hk:resumed · 부모 멈춤 표시 꺼짐({got()[mark:]})")
            # 4) 부모 hk:pause → paused + hk:paused, hk:resume → 「클릭하면 이어서」 + hk:paused 재송신, 덮개 클릭 → play + hk:resumed
            mark = len(got())
            pg.evaluate("() => document.getElementById('bPause').click()")
            ok &= _check(notes, _phase_wait(fr, "paused") and fr.evaluate(ST)["pauseWhy"] == "parent", "[창] 부모 hk:pause → paused")
            pg.wait_for_timeout(150)
            pg.evaluate("() => document.getElementById('bResume').click()")
            pg.wait_for_timeout(200)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "paused" and v["ui"]["pauseMode"] == "click" and got()[mark:] == ["hk:paused", "hk:paused"],
                         f"[창] 부모 hk:resume → 멈춤 그대로 · 「클릭하면 이어서」 · hk:paused 재송신({got()[mark:]})")
            mark = len(got())
            fl.locator("#btnResume").click()
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 「계속하기」 클릭 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:resumed"], f"[창] → hk:resumed({got()[mark:]})")
            # 5) 멈춤 중 Space → no-zoom.js 가 「계속하기」를 누름(헤드리스는 대체 조작이라 바로 이어 감)
            mark = len(got())
            pg.evaluate("() => document.getElementById('bPause').click()")
            _phase_wait(fr, "paused")
            pg.wait_for_timeout(150)
            pg.keyboard.press("Space")
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 멈춤 중 Space → 「계속하기」 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:paused", "hk:resumed"], f"[창] 신호 hk:paused → hk:resumed({got()[mark:]})")
            # 6) 창 blur → 멈춤 + hk:paused
            mark = len(got())
            fr.evaluate("() => window.dispatchEvent(new Event('blur'))")
            pg.wait_for_timeout(150)
            ok &= _check(notes, fr.evaluate(ST)["phase"] == "paused" and got()[mark:] == ["hk:paused"], f"[창] 창 blur → 멈춤 + hk:paused({got()[mark:]})")
            fl.locator("#scrPause").click(position={"x": 80, "y": 80})
            _phase_wait(fr, "play")
            pg.wait_for_timeout(150)
            # 7) 출처 검사 — 부모가 아닌 곳(자기 자신)이 보낸 hk:restart 는 무시
            fr.evaluate("() => window.postMessage({type: 'hk:restart'}, '*')")
            pg.wait_for_timeout(150)
            ok &= _check(notes, fr.evaluate(ST)["phase"] == "play", "[창] 부모가 아닌 창이 보낸 hk:restart 무시(출처 · 보낸 창 검사)")
            # 8) 부모 hk:restart → 작전 고르기(S9 — gdd §9)
            pg.evaluate("() => document.getElementById('bRestart').click()")
            ok &= _check(notes, _phase_wait(fr, "select"), "[창] 부모 hk:restart → 작전 고르기")
            v = fr.evaluate("() => ({pz: getComputedStyle(document.getElementById('scrPause')).display, t: getComputedStyle(document.getElementById('scrSelect')).display})")
            ok &= _check(notes, v["pz"] == "none" and v["t"] != "none", f"[창] 덮개 숨김(display {v['pz']}) · 작전 고르기 보임")

            # 전체 순서 · 본체 기록과 부모 받은 것 일치 · 점수 신호 없음
            g = got()
            expect = ["hk:ready", "hk:paused", "hk:esc", "hk:paused", "hk:resumed", "hk:paused", "hk:paused", "hk:resumed",
                      "hk:paused", "hk:resumed", "hk:paused", "hk:resumed"]
            ok &= _check(notes, g == expect, f"[창] 신호 순서 {g}")
            body_hk = fr.evaluate("() => __fps.events().filter(e => e.type === 'hk').map(e => e.payload.type)")
            ok &= _check(notes, body_hk == g, "[창] 본체 사건 기록('hk')과 부모가 받은 것 일치")
            ok &= _check(notes, not any(x in ("hk:start", "hk:live", "hk:score") for x in g), "[창] 시험 구역(임무 아님)이라 점수 신호(hk:start · live · score) 없음")
            summary["signals"] = g
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"[창] 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            if score_part:
                ok &= _arcade_score(s, out, notes, summary)
                ok &= _arcade_missions(s, out, notes, summary)
        finally:
            s.close()
    return finish("arcade", ok, summary, notes)



def _arcade_missions(s, out, notes, summary):
    """S11b — 실제 임무 두 판(임무 1 → 임무 2)을 가짜 부모 창 안에서: 고르기 → 장비 → 브리핑 → 「출격」 = hk:start, 판 끝 = hk:score 한 번(= 판 점수).
    판은 시험 손잡이(__fps — 판을 「시험 판」으로 표시해 신호를 막음) 없이 본체를 바로 움직여 빠르게 끝냄(무적 · 자동 조종 · 8배속).
    임무 1 완수 → 임무 2 열림 · 결과 「다음 작전」 → 임무 2 브리핑(아직 hk:start 없음) → 「출격」 → hk:start → 끝 hk:score."""
    ok = True
    pg = s.page()
    pg.goto(HOST + PARENT_PATH, wait_until="load")
    fr = pg.query_selector("#f").content_frame()
    fl = pg.frame_locator("#f")
    try:
        fr.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=8000)
    except Exception as e:  # noqa: BLE001
        return _check(notes, False, "[임무 점수] 창 안 ready 실패 " + str(e)[:160])
    pg.wait_for_timeout(300)
    full = lambda: pg.evaluate("() => window.__gotT.slice()")  # noqa: E731
    cnt = lambda ty: sum(1 for x in full() if x["type"] == ty)  # noqa: E731
    FAST = "() => { FG.player.god = true; FG.weapons.infinite = true; FG.weapons.refill(); FG.mission.autopilot(true); FG.loop.timeScale = 8; FG.loop.renderEvery = 8; return FG.arcade.tainted; }"

    def play(mid, budget):
        t0 = time.time()
        while time.time() - t0 < budget and fr.evaluate("() => FG.game.phase") != "result":
            pg.wait_for_timeout(400)
        fr.evaluate("() => { FG.loop.timeScale = 1; FG.loop.renderEvery = 1; }")
        pg.wait_for_timeout(900)   # 결과 뒤 신호가 더 오지 않는지
        return fr.evaluate("() => ({ ph: FG.game.phase, m: FG.mission.state(), sc: FG.mission.score(), last: FG.ui.state().lastEnd, a: FG.arcade.state(), rec: FG.store.progress.missions[FG.mission.state().id] || null })"), round(time.time() - t0, 1)

    # 1) 임무 1 — 처음 온 회원: m2 잠김
    fl.locator("#btnSelect").click()
    _phase_wait(fr, "select")
    v = fr.evaluate("() => FG.ui.state().unlock")
    ok &= _check(notes, v.get("m1") and not v.get("m2"), f"[임무 점수] 처음: 해금 {v}(임무 2 잠김)")
    fl.locator('#selMap .fg-card[data-id="m1"]').click()
    _phase_wait(fr, "loadout")
    fl.locator("#btnLoBrief").click()
    _phase_wait(fr, "briefing")
    s0 = cnt("hk:start")
    fl.locator("#btnBfGo").click()
    ok &= _check(notes, _phase_wait(fr, "play", 4000), "[임무 점수] 고르기 → 장비 → 브리핑 → 「출격」 → play")
    pg.wait_for_timeout(300)
    tainted = fr.evaluate(FAST)
    ok &= _check(notes, cnt("hk:start") == s0 + 1 and not tainted and fr.evaluate("() => FG.mission.state().id") == "m1",
                 f"[임무 점수] 임무 1 출격 → hk:start 1번 · 시험 판 아님(tainted {tainted})")
    sc0 = cnt("hk:score")
    r, real = play("m1", 120)
    sc_msgs = [x for x in full() if x["type"] == "hk:score"][sc0:]
    lives = [x for x in full() if x["type"] == "hk:live"]
    summary["m1run"] = {"score": r["sc"]["total"], "sent": [x["score"] for x in sc_msgs], "t": r["m"]["t"], "real": real}
    ok &= _check(notes, r["ph"] == "result" and r["m"]["result"] == "success" and len(sc_msgs) == 1 and sc_msgs[0]["score"] == r["sc"]["total"] == r["last"]["total"]
                 and isinstance(sc_msgs[0]["score"], int) and 0 < sc_msgs[0]["score"] <= 250000 and not r["a"]["runOpen"] and not r["last"]["tainted"],
                 f"[임무 점수] 임무 1 완수(임무 시계 {r['m']['t']}초 · 실시간 {real}초) → hk:score {[x['score'] for x in sc_msgs]} 한 번 = 판 점수 {r['sc']['total']} = 결과 화면 {r['last']['total']} · hk:live {len(lives)}번")
    v = fr.evaluate("() => ({ unlock: FG.ui.state().unlock, next: getComputedStyle(document.getElementById('btnNext')).display, rec: FG.store.progress.missions.m1 })")
    ok &= _check(notes, v["unlock"].get("m2") and v["next"] != "none" and v["rec"] and v["rec"]["cleared"] and v["rec"]["best"] == r["sc"]["total"],
                 f"[임무 점수] 임무 1 완수 → 임무 2 열림 {v['unlock']} · 「다음 작전」 보임 · 기록 최고 {v['rec'] and v['rec']['best']}")
    pg.screenshot(path=str(out / "arcade-m1-result.png"))
    # 2) 「다음 작전」 → 임무 2 브리핑(아직 판 시작 아님) → 「출격」
    s1 = cnt("hk:start")
    fl.locator("#btnNext").click()
    ok_b = _phase_wait(fr, "briefing", 3000)
    v = fr.evaluate("() => ({ t: document.getElementById('bfTitle').textContent, no: document.getElementById('bfNo').textContent, goals: Array.from(document.querySelectorAll('#bfGoals li')).map(e => e.textContent), sel: FG.ui.state().sel.id })")
    ok &= _check(notes, ok_b and v["t"] == "짠물 밸브" and v["sel"] == "m2" and cnt("hk:start") == s1 and len(v["goals"]) == 3,
                 f"[임무 점수] 결과 「다음 작전」 → 임무 2 브리핑 「{v['no']} {v['t']}」 · 목표 {v['goals']} · hk:start 아직 없음")
    pg.screenshot(path=str(out / "arcade-m2-briefing.png"))
    fl.locator("#btnBfGo").click()
    ok &= _check(notes, _phase_wait(fr, "play", 4000), "[임무 점수] 임무 2 「출격」 → play")
    pg.wait_for_timeout(300)
    tainted = fr.evaluate(FAST)
    ok &= _check(notes, cnt("hk:start") == s1 + 1 and not tainted and fr.evaluate("() => FG.mission.state().id") == "m2", "[임무 점수] 임무 2 출격 → hk:start 1번")
    sc1 = cnt("hk:score")
    r, real = play("m2", 120)
    sc_msgs = [x for x in full() if x["type"] == "hk:score"][sc1:]
    summary["m2run"] = {"score": r["sc"]["total"], "sent": [x["score"] for x in sc_msgs], "t": r["m"]["t"], "real": real}
    ok &= _check(notes, r["ph"] == "result" and r["m"]["result"] == "success" and len(sc_msgs) == 1 and sc_msgs[0]["score"] == r["sc"]["total"] == r["last"]["total"]
                 and 0 < sc_msgs[0]["score"] <= 250000 and not r["a"]["runOpen"] and r["rec"] and r["rec"]["cleared"],
                 f"[임무 점수] 임무 2 완수(임무 시계 {r['m']['t']}초 · 실시간 {real}초) → hk:score {[x['score'] for x in sc_msgs]} 한 번 = 판 점수 {r['sc']['total']} = 결과 화면 {r['last']['total']} · 기록 저장")
    v = fr.evaluate("() => ({ next: getComputedStyle(document.getElementById('btnNext')).display, unlock: FG.ui.state().unlock, cards: FG.ui.state().cards })")
    pg.screenshot(path=str(out / "arcade-m2-result.png"))
    ok &= _check(notes, v["next"] == "none" and v["unlock"].get("m3"),
                 f"[임무 점수] 임무 2 결과: 다음(임무 3)은 자료가 없어 「다음 작전」 숨김 · 해금 {v['unlock']}")
    seq = [x["type"] for x in full() if x["type"] in ("hk:start", "hk:score")]
    ok &= _check(notes, seq[-4:] == ["hk:start", "hk:score", "hk:start", "hk:score"], f"[임무 점수] 두 판 신호 순서 {seq[-4:]}")
    return ok


def _hk_next(fr):
    """no-zoom.js 가 Space 로 누를 단추(놀이 중이면 없어야 함) — 글자 또는 None"""
    return fr.evaluate("() => { const b = window.HKNextKey && window.HKNextKey.find(); return b ? (b.innerText || b.textContent).trim() : null; }")


def _arcade_score(s, out, notes, summary):
    """S9 점수 규약(tdd-final §9-2 · gdd-final §7-2) — 가짜 부모 창(?hk=1&dev=1&quick=t0)에서 키 입력만으로 한 판."""
    ok = True
    pg = s.page()
    pg.goto(HOST + PARENT_PATH + "?q=quick%3Dt0", wait_until="load")
    fr = pg.query_selector("#f").content_frame()
    fl = pg.frame_locator("#f")
    try:
        fr.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=5000)
        fr.evaluate("() => window.__fps.ready")
    except Exception as e:  # noqa: BLE001
        return _check(notes, False, "[점수] 창 안 ready 실패 " + str(e)[:160])
    pg.wait_for_timeout(300)
    got = lambda: pg.evaluate("() => window.__got.slice()")  # noqa: E731
    full = lambda: pg.evaluate("() => window.__gotT.slice()")  # noqa: E731
    cnt = lambda ty: sum(1 for x in got() if x == ty)  # noqa: E731
    ok &= _check(notes, got() == ["hk:ready"] and fr.evaluate("() => __fps.state().inHk"), f"[점수] hk:ready → 부모 hk:hello({got()})")
    q = fl.locator("#btnQuick")
    qt = q.inner_text().strip()
    ok &= _check(notes, qt == "바로 출격" and fr.evaluate("() => __fps.ui().firstVisit"), f"[점수] 처음 온 회원 타이틀 큰 단추 「{qt}」")
    # 1) 「바로 출격」 → hk:start 1번
    q.click()
    ok &= _check(notes, _phase_wait(fr, "play"), "[점수] 「바로 출격」 클릭 → play")
    pg.wait_for_timeout(250)
    v = fr.evaluate("() => ({ m: __fps.mission(), st: __fps.state(), a: __fps.arcade() })")
    ok &= _check(notes, v["m"]["id"] == "t0" and v["m"]["active"] and cnt("hk:start") == 1 and v["a"]["runOpen"] and not v["st"]["tainted"],
                 f"[점수] 임무 {v['m']['id']} 시작 · hk:start 1번 · runOpen {v['a']['runOpen']} · 시험 판 아님({got()})")
    # 2) 출격 직후 Space = 점프(초점 캔버스), hk:start 더 안 옴
    y0 = fr.evaluate(ST)["pos"][1]
    pg.keyboard.press("Space")
    ys = []
    for _ in range(6):
        pg.wait_for_timeout(50)
        ys.append(fr.evaluate(ST)["pos"][1])
    act = fr.evaluate("() => document.activeElement.id")
    ok &= _check(notes, max(ys) > y0 + 0.08 and cnt("hk:start") == 1 and fr.evaluate(ST)["phase"] == "play" and act == "gl",
                 f"[점수] 출격 직후 Space = 점프(높이 {y0:.2f} → 최고 {max(ys):.2f}) · hk:start 1번 그대로 · 초점 {act!r}")
    # 3) hk:live 2초 간격(가만히 4.6초)
    pg.wait_for_timeout(4600)
    lv = [x for x in full() if x["type"] == "hk:live"]
    gaps = [round(lv[k + 1]["t"] - lv[k]["t"]) for k in range(len(lv) - 1)]
    ok &= _check(notes, len(lv) >= 2 and all(1600 <= g_ <= 2400 for g_ in gaps) and all(isinstance(x["score"], int) and 0 <= x["score"] <= 250000 for x in lv),
                 f"[점수] hk:live {len(lv)}번 · 간격 {gaps}ms(≈2000) · 값 {[x['score'] for x in lv]}(지금 그만두면 받을 점수 — 정수)")
    # 4) 키 W 만으로 t0 끝 → hk:score 1번
    t0 = time.time()
    pg.keyboard.down("KeyW")
    while time.time() - t0 < 8 and fr.evaluate("() => __fps.state().phase") != "result":
        pg.wait_for_timeout(100)
    pg.keyboard.up("KeyW")
    pg.wait_for_timeout(300)
    v = fr.evaluate("() => ({ m: __fps.mission(), sc: __fps.score(), a: __fps.arcade(), ui: __fps.ui(), st: __fps.store() })")
    sc_msgs = [x for x in full() if x["type"] == "hk:score"]
    ok &= _check(notes, v["m"]["result"] == "success" and len(sc_msgs) == 1 and isinstance(sc_msgs[0]["score"], int) and 0 < sc_msgs[0]["score"] <= 250000
                 and sc_msgs[0]["score"] == v["sc"]["total"] and not v["a"]["runOpen"],
                 f"[점수] 키 W 만으로 t0 끝({round(time.time() - t0, 1)}초) → hk:score 1번 = 판 점수 {sc_msgs[0]['score'] if sc_msgs else None}(본체 {v['sc']['total']}) · runOpen 닫힘")
    ok &= _check(notes, v["ui"]["visible"]["result"] and not v["ui"]["visible"]["test"] and v["st"]["progress"]["missions"].get("t0", {}).get("cleared"),
                 f"[점수] 결과 화면 · 「시험 판」 아님 · 기록 저장(t0 최고 {v['st']['progress']['missions'].get('t0', {}).get('best')})")
    seq = [x for x in got() if x in ("hk:start", "hk:live", "hk:score")]
    ok &= _check(notes, seq[0] == "hk:start" and seq[-1] == "hk:score" and set(seq[1:-1]) == {"hk:live"},
                 f"[점수] 순서 hk:start → hk:live … → hk:score({seq})")
    pg.screenshot(path=str(out / "arcade-result.png"))
    # 5) 결과에서 Space = 「다음 작전」 → 새 판 hk:start
    pg.wait_for_timeout(300)
    nxt = _hk_next(fr)
    pg.keyboard.press("Space")
    ok &= _check(notes, _phase_wait(fr, "play", 3000) and fr.evaluate("() => __fps.mission().id") == "t2" and cnt("hk:start") == 2 and fr.evaluate("() => __fps.ui().counts.next") == 1,
                 f"[점수] 결과에서 Space → no-zoom 이 「{nxt}」 누름 → t2 시작 · hk:start 2번({cnt('hk:start')})")
    pg.wait_for_timeout(300)
    ok &= _check(notes, _hk_next(fr) is None, "[점수] 놀이 중 Space 로 눌릴 단추 없음")
    # 6) 멈춤 → 「임무 그만두기」 → 확인 창 → 실패 점수 hk:score
    pg.evaluate("() => document.getElementById('bPause').click()")
    _phase_wait(fr, "paused")
    pg.wait_for_timeout(150)
    fl.locator("#btnPzQuit").click()
    pg.wait_for_timeout(150)
    dlg = fr.evaluate("() => ({ open: !document.getElementById('dlg').hidden, msg: document.getElementById('dlgMsg').textContent, ph: FG.game.phase })")
    nx = _hk_next(fr)
    fl.locator("#dlgNo").click()
    pg.wait_for_timeout(120)
    still = fr.evaluate("() => ({ ph: FG.game.phase, open: !document.getElementById('dlg').hidden })")
    ok &= _check(notes, dlg["open"] and dlg["ph"] == "paused" and nx is None and still["ph"] == "paused" and not still["open"],
                 f"[점수] 「임무 그만두기」 → 게임 안 확인 창(「{dlg['msg'][:24]}…」 · Space 로 눌릴 단추 {nx}) → 취소 → 멈춤 그대로")
    exp_quit = fr.evaluate("() => __fps.score('quit').total")
    fl.locator("#btnPzQuit").click()
    fl.locator("#dlgYes").click()
    ok &= _check(notes, _phase_wait(fr, "result", 2000), "[점수] 확인 → 결과(임무 그만둠)")
    pg.wait_for_timeout(200)
    sc_msgs = [x for x in full() if x["type"] == "hk:score"]
    rt = fr.evaluate("() => document.getElementById('rsTitle').textContent")
    ok &= _check(notes, len(sc_msgs) == 2 and sc_msgs[-1]["score"] == exp_quit and isinstance(sc_msgs[-1]["score"], int) and rt == "임무 그만둠",
                 f"[점수] 그만두기 → hk:score {sc_msgs[-1]['score'] if sc_msgs else None}(실패 규칙 {exp_quit}) · 결과 「{rt}」 · 「다음 작전」 숨김 {not fr.evaluate('() => __fps.ui().visible.next')}")
    # 7) 「다시 하기」 → hk:start · 판이 열린 채 메뉴로 빠지면 먼저 실패 점수
    fl.locator("#btnRetry").click()
    ph_ok = _phase_wait(fr, "play")
    pg.wait_for_timeout(150)   # 부모 창에 메시지가 닿을 때까지
    ok &= _check(notes, ph_ok and cnt("hk:start") == 3 and fr.evaluate("() => __fps.mission().id") == "t2", f"[점수] 「다시 하기」 → 같은 임무 t2 · hk:start 3번째")
    pg.wait_for_timeout(300)
    fr.evaluate("() => FG.mission.completeObjective()")   # __fps 손잡이가 아니라 본체를 바로(시험 표시 없이) — 목표 하나 끝냄
    pg.wait_for_timeout(100)
    exp_quit = fr.evaluate("() => FG.mission.score('quit').total")
    fr.evaluate("() => FG.game.setPhase('select', { why: 'test' })")
    pg.wait_for_timeout(200)
    sc_msgs = [x for x in full() if x["type"] == "hk:score"]
    ok &= _check(notes, len(sc_msgs) == 3 and sc_msgs[-1]["score"] == exp_quit and exp_quit > 0 and sc_msgs[-1].get("why") == "select" and fr.evaluate("() => __fps.arcade().runOpen") is False,
                 f"[점수] 판이 열린 채 작전 고르기로 → 먼저 실패 점수 hk:score {sc_msgs[-1]['score']}(목표 1/4 → {exp_quit})")
    # 8) 손잡이 쓴 판 — hk:live · hk:score 없음, 결과에 「시험 판」
    fl.locator("#selTest button[data-id='t0']").click()
    _phase_wait(fr, "loadout")
    fl.locator("#btnLoGo").click()
    ph_ok = _phase_wait(fr, "play")
    pg.wait_for_timeout(150)
    ok &= _check(notes, ph_ok and cnt("hk:start") == 4, "[점수] 고르기 → 장비 「출격」 → hk:start 4번째")
    fr.evaluate("() => __fps.god(true)")
    mark_l = cnt("hk:live"); mark_s = cnt("hk:score")
    pg.wait_for_timeout(2300)
    pg.keyboard.down("KeyW")
    t0 = time.time()
    while time.time() - t0 < 8 and fr.evaluate("() => __fps.state().phase") != "result":
        pg.wait_for_timeout(100)
    pg.keyboard.up("KeyW")
    pg.wait_for_timeout(300)
    v = fr.evaluate("() => ({ ui: __fps.ui(), st: __fps.state(), txt: document.getElementById('rsTest').textContent })")
    ok &= _check(notes, v["st"]["phase"] == "result" and cnt("hk:live") == mark_l and cnt("hk:score") == mark_s and v["ui"]["visible"]["test"] and v["st"]["tainted"],
                 f"[점수] 손잡이(god) 쓴 판 → hk:live · hk:score 없음 · 결과에 「{v['txt']}」")
    pg.screenshot(path=str(out / "arcade-tainted.png"))
    # 9) 부모 hk:restart → 작전 고르기 · 시험 표시 지움
    pg.evaluate("() => document.getElementById('bRestart').click()")
    ok &= _check(notes, _phase_wait(fr, "select") and not fr.evaluate("() => __fps.state().tainted"), "[점수] 부모 hk:restart → 작전 고르기 · 시험 표시 지움")
    body_hk = fr.evaluate("() => __fps.events().filter(e => e.type === 'hk').map(e => e.payload.type)")
    ok &= _check(notes, body_hk[-len(got()):] == got() or body_hk == got(), "[점수] 본체 사건 기록('hk')과 부모가 받은 것 일치")
    summary["score_signals"] = [x for x in got() if x in ("hk:start", "hk:live", "hk:score")]
    summary["scores"] = [x["score"] for x in full() if x["type"] == "hk:score"]
    ok &= _check(notes, not s.errors and not s.external and not s.missing, f"[점수] 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
    return ok



# ───────────────────────────── move --basic ─────────────────────────────

# 페이지 안 도우미 — 시험 손잡이로 표식에 놓고 입력을 넣은 채 sim 을 0.1초씩 돌리며 위치 · 박힘을 모은다(그리기 없이, 결정적)
MOVE_JS = r"""(() => {
  const F = window.__fps;
  const settle = () => F.step(0.4);
  window.__mv = {
    put(mark, yaw) { F.clearInput(); F.teleportTo(mark); if (yaw !== undefined && yaw !== null) F.look(yaw, 0); settle(); return F.state(); },
    run(input, sec, every) {
      const dt = every || 0.1, out = [];
      F.setInput(input);
      const n = Math.round(sec / dt);
      let maxPen = 0;
      for (let k = 0; k < n; k++) {
        F.step(dt);
        const s = F.state(); const pen = F.pen();
        if (pen > maxPen) maxPen = pen;
        out.push({ pos: s.pos, vel: s.vel, ground: s.onGround, stance: s.stance, pen });
      }
      F.clearInput();
      return { samples: out, maxPen, end: F.state() };
    },
    hspeed(s) { return Math.hypot(s.vel[0], s.vel[2]); },
  };
  return true;
})()"""


def cmd_move(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    R = 0.35
    TOL = 0.03
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            w = pg.evaluate("() => __fps.world()")
            zs = (w.get("zones") or {}).get("t0") or {}
            summary["zone_t0"] = zs
            ok &= _check(notes, w["ready"] and w["tris"] > 100 and "player" in w["systems"] and w["spawn"] == "t0.spawn",
                         f"시험 구역 t0 충돌 자료 준비(삼각형 {w['tris']} · 동적 {w['dyn']} · sim 체계 {w['systems']})")
            ok &= _check(notes, zs.get("ms", 999) <= 50,
                         f"구역 만들기 {zs.get('ms')}ms ≤ 50ms(원시 {zs.get('prims')} · 그림 삼각형 {zs.get('visTris')} · 메시 {zs.get('meshes')} · 인스턴스 {zs.get('inst')})")
            ok &= _check(notes, zs.get("inst", 0) >= 7, f"같은 모양 7개 이상 인스턴싱(상자 {zs.get('inst')}개) — 충돌은 펼쳐서 넣음")
            # 맵 자료 확인
            v = pg.evaluate("""() => ({ good: __fps.validateZone(),
                bad: __fps.validateZone({ id: 'bad', size: [20, 20], pieces: [['nope', 0, 0, 0, 0, {}], ['wall', 40, 0, 0, 0, {}],
                  ['door', 0, 0, 0, 0, {id: 'x'}], ['door', 2, 0, 0, 0, {id: 'x'}], ['wall', 'a', 0, 0]],
                  marks: { far: [0, 0, 99] }, markList: [['far', 0, 0, 0]] }) })""")
            ok &= _check(notes, v["good"] == [] and len(v["bad"]) >= 5,
                         f"FG.map.validate: t0 오류 0 · 틀린 자료 오류 {len(v['bad'])}개 {v['bad']}")
            nav = pg.evaluate("() => ({ wall: __fps.navAt(-12.7, 7), open: __fps.navAt(0, 10), ramp: __fps.navAt(6, 8), roof: __fps.navAt(0, -11) })")
            ok &= _check(notes, nav["wall"]["blocked"] and not nav["open"]["blocked"] and 0.5 < nav["ramp"]["h"] < 1.5 and not nav["ramp"]["blocked"] and not nav["roof"]["blocked"],
                         f"길찾기 격자 칠하기: 벽 막힘 · 빈 곳 열림 · 경사판 높이 {nav['ramp']['h']} · 통로 천장 밑 열림")

            # 1) 실제 키 — 출격 → W 1초(시점 0 = -Z 앞)
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            pg.wait_for_timeout(300)
            st0 = pg.evaluate(ST)
            ok &= _check(notes, st0["pos"] and abs(st0["pos"][0]) < 0.05 and abs(st0["pos"][2] - 14) < 0.05 and abs(st0["pos"][1]) < 0.05 and st0["onGround"],
                         f"출격 위치 = t0.spawn (0, 0, 14) · 바닥 위({st0['pos']}, onGround {st0['onGround']})")
            pg.keyboard.down("KeyW")
            pg.wait_for_timeout(1000)
            pg.keyboard.up("KeyW")
            pg.wait_for_timeout(250)
            st1 = pg.evaluate(ST)
            dz = st0["pos"][2] - st1["pos"][2]
            ok &= _check(notes, 2.5 < dz < 6.0 and abs(st1["pos"][0]) < 0.1, f"[실제 키] W 1초 → 앞(-Z)으로 {dz:.2f}m")
            shot = out / "move-play.png"
            pg.screenshot(path=str(shot))
            perf = pg.evaluate("() => __fps.perf()")
            summary["shot_play"] = str(shot)
            summary["play_calls"] = perf["calls"]
            ok &= _check(notes, 0 < perf["calls"] <= 40, f"놀이 화면 그리기 호출 {perf['calls']} ≤ 40 · 삼각형 {perf['tris']} · 프레임 중앙값 {perf['ftMed']}ms")

            # 이후는 고리를 붙잡고 sim 만(결정적). S4 부터 무기 이동 배율이 있어 이동 시험은 맨손(배율 1)으로 잰다
            pg.evaluate("() => { __fps.pauseLoop(); __fps.setLoadout({primary: null, secondary: null}); }")
            pg.evaluate(MOVE_JS)

            def put(mark, yaw=None):
                return pg.evaluate("([m, y]) => __mv.put(m, y)", [mark, yaw])

            def run(inp, sec, every=0.1):
                return pg.evaluate("([i, s, e]) => __mv.run(i, s, e)", [inp, sec, every])

            def press(name, settle=0.1):
                pg.evaluate("([n, t]) => { __fps.press(n); __fps.step(t); }", [name, settle])
                return pg.evaluate(ST)

            # 2) 앞 2초 → z 증가(표식 run 은 +Z 를 봄)
            a = put("t0.run")
            r = run({"moveZ": 1}, 2.0)
            e = r["end"]
            dz = e["pos"][2] - a["pos"][2]
            ok &= _check(notes, dz > 7.0 and abs(e["pos"][0] - a["pos"][0]) < 0.05 and abs(e["pos"][1]) < 0.02 and e["onGround"],
                         f"앞 2초 → z +{dz:.2f}m(걷기 4.5m/s · 가속 포함) · 높이 {e['pos'][1]} · 바닥 위")
            summary["walk2s_dz"] = round(dz, 3)

            # 3) 속도 — 걷기 · 달리기 · 앉기 · 엎드리기
            sp = {}
            put("t0.run"); r = run({"moveZ": 1}, 1.0); sp["walk"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            put("t0.run"); r = run({"moveZ": 1, "sprint": True}, 1.0); sp["sprint"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"]); sp["sprintState"] = r["samples"][3]["stance"] + "/" + str(pg.evaluate(ST)["sprint"])
            put("t0.run"); st = press("crouch"); c_ok = st["stance"] == "crouch"; r = run({"moveZ": 1}, 1.0); sp["crouch"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            put("t0.run"); press("crouch"); st = press("prone"); p_ok = st["stance"] == "prone"; r = run({"moveZ": 1}, 1.0); sp["prone"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            press("prone")  # 일으켜 둠
            summary["speeds"] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in sp.items()}
            ok &= _check(notes, abs(sp["walk"] - 4.5) < 0.05 and abs(sp["sprint"] - 6.75) < 0.05 and abs(sp["crouch"] - 2.7) < 0.05 and abs(sp["prone"] - 1.125) < 0.05 and c_ok and p_ok,
                         f"속도: 걷기 {sp['walk']:.2f} · 달리기(Shift) {sp['sprint']:.2f} · 앉기(C) {sp['crouch']:.2f} · 엎드리기(Z) {sp['prone']:.2f} m/s (기준 4.5 · 6.75 · 2.7 · 1.125)")
            # C 길게 → 엎드리기, Space → 일어서기
            put("t0.run")
            pg.evaluate("() => { __fps.setInput({crouch: true}); __fps.step(0.6); __fps.setInput({crouch: null}); __fps.step(0.1); }")
            st = pg.evaluate(ST)
            st2 = press("jump"); st3 = press("jump")
            ok &= _check(notes, st["stance"] == "prone" and st2["stance"] == "crouch" and st3["stance"] == "stand",
                         f"C 길게(0.4초) → 엎드리기({st['stance']}) · Space → 앉기({st2['stance']}) → 서기({st3['stance']})")

            # 4) 벽 · 모서리 · 좁은 통로 · 60° 모서리 — 3초 밀기
            def wall_case(label, mark, inp, sec, cond_fn, desc_fn):
                a = put(mark)
                r = run(inp, sec)
                e = r["end"]
                start_w = [a["pos"][0], 0.9, a["pos"][2]]
                end_w = [e["pos"][0], 0.9, e["pos"][2]]
                los = pg.evaluate("([a, b]) => __fps.los(a, b)", [start_w, end_w])
                c = cond_fn(e, r) and r["maxPen"] <= TOL and los
                return _check(notes, c, f"{label}: {desc_fn(e, r)} · 최대 박힘 {r['maxPen']}m · 지나온 길에 벽 없음 {los}")

            wn = -19.6 + R
            ok &= wall_case("북쪽 벽으로 3초(걷기)", "t0.wallN", {"moveZ": 1}, 3.0, lambda e, r: e["pos"][2] >= wn - TOL and abs(e["pos"][0] + 8) < 0.05,
                            lambda e, r: f"z {e['pos'][2]} ≥ {wn - TOL:.2f}")
            ok &= wall_case("북쪽 벽으로 3초(달리기 + 비스듬히)", "t0.wallN", {"moveZ": 1, "moveX": 0.5, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][2] >= wn - TOL and e["pos"][0] > -8 + 2, lambda e, r: f"z {e['pos'][2]} · 벽 따라 미끄러짐 x {e['pos'][0]}")
            ce = 19.6 - R
            ok &= wall_case("북동 모서리로 3초(달리기)", "t0.cornerNE", {"moveZ": 1, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][0] <= ce + TOL and e["pos"][2] >= -ce - TOL, lambda e, r: f"x {e['pos'][0]} ≤ {ce:.2f} · z {e['pos'][2]} ≥ {-ce:.2f}")
            for mx in (0.6, -0.6):
                a = put("t0.corridor")
                r = run({"moveZ": 1, "moveX": mx}, 3.0)
                inside = [x for x in r["samples"] if 4.4 <= x["pos"][2] <= 9.6]
                xs = [x["pos"][0] for x in inside]
                lo, hi = -12.5 + R - TOL, -11.5 - R + TOL
                c = len(inside) >= 5 and all(lo <= x <= hi for x in xs) and r["maxPen"] <= TOL
                ok &= _check(notes, c, f"좁은 통로(폭 1.0m) 비스듬히 3초(옆 {mx}): 통로 안 표본 {len(inside)}개 x {min(xs) if xs else None}~{max(xs) if xs else None} ⊂ [{lo:.2f}, {hi:.2f}] · 끝 z {r['end']['pos'][2]} · 최대 박힘 {r['maxPen']}m")
            ok &= wall_case("60° 좁은 모서리로 3초(달리기)", "t0.vee", {"moveZ": 1, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][2] >= 3.0 - TOL and abs(e["pos"][0] - 12) < 0.1, lambda e, r: f"끝 ({e['pos'][0]}, {e['pos'][2]}) — 꼭짓점 안쪽 한계 z 3.0")
            ok &= wall_case("낮은 벽 0.9m 앞 2초(넘기는 S3)", "t0.lowWall", {"moveZ": 1}, 2.0,
                            lambda e, r: e["pos"][2] >= -4 + 0.15 + R - TOL and e["pos"][1] < 0.05, lambda e, r: f"z {e['pos'][2]} · 높이 {e['pos'][1]}(올라타지 않음)")
            ok &= wall_case("높은 벽 1.6m 앞 2초", "t0.highWall", {"moveZ": 1}, 2.0,
                            lambda e, r: e["pos"][2] >= -4 + 0.15 + R - TOL and e["pos"][1] < 0.05, lambda e, r: f"z {e['pos'][2]}")

            # 5) 경사판 · 계단 — 2초 걸어 1.5m 단 위로
            for mark, label in (("t0.ramp", "경사판"), ("t0.stairs", "계단(충돌은 경사판)")):
                put(mark)
                r = run({"moveZ": 1}, 2.0, 0.05)
                ys = [x["pos"][1] for x in r["samples"]]
                mono = all(ys[k + 1] >= ys[k] - 0.01 for k in range(len(ys) - 1))
                e = r["end"]
                c = e["pos"][1] >= 1.45 and e["onGround"] and mono and r["maxPen"] <= TOL and e["pos"][2] < 7
                ok &= _check(notes, c, f"{label} 2초: 높이 0 → {e['pos'][1]}m · z {e['pos'][2]} · 오르는 동안 높이가 줄지 않음 {mono} · 바닥 위 {e['onGround']} · 최대 박힘 {r['maxPen']}m")
            # 내리막: 단 위에서 뒤로 걸어 내려오기 — 바닥에 붙어 내려옴(공중 단계 적음)
            put("t0.ramp"); run({"moveZ": 1}, 2.0)
            pg.evaluate("() => { __fps.turn(180, 0); __fps.step(0.5); }")   # 오르던 관성이 멎은 뒤
            r = run({"moveZ": 1}, 2.0, 1 / 60)
            air = sum(1 for x in r["samples"] if not x["ground"])
            e = r["end"]
            ok &= _check(notes, e["pos"][1] < 0.05 and air <= 3, f"경사판 내려오기: 끝 높이 {e['pos'][1]} · 바닥에서 뜬 단계 {air}/{len(r['samples'])}(내리막 붙기)")

            # 6) 천장 낮은 통로 — 서서는 못 들어감, 앉아서 들어가 일어서기 거부
            a = put("t0.tunnel")
            r = run({"moveZ": 1}, 2.0)
            e = r["end"]
            ok &= _check(notes, e["pos"][2] >= -8 + R - TOL and r["maxPen"] <= TOL, f"천장 낮은 통로(1.3m): 서서는 입구에서 멈춤 z {e['pos'][2]} ≥ {-8 + R - TOL:.2f}")
            st = press("crouch")
            r = run({"moveZ": 1}, 1.2)
            e = r["end"]
            b0 = e["blocked"]
            st1 = press("crouch")
            st2 = press("jump")
            st3 = press("prone")
            st4 = press("prone")
            ev = pg.evaluate("() => __fps.events().filter(x => x.type === 'stanceBlocked').length")
            c = st["stance"] == "crouch" and e["pos"][2] <= -9.4 and st1["stance"] == "crouch" and st2["stance"] == "crouch" and st3["stance"] == "prone" and st4["stance"] == "crouch" and st4["blocked"] >= b0 + 3 and ev >= 3
            ok &= _check(notes, c, f"앉아서 통로 안(z {e['pos'][2]}) → C(서기) 거부 {st1['stance']} · Space 거부 {st2['stance']} · Z 엎드리기 {st3['stance']} · Z(서기 막힘 → 앉기) {st4['stance']} · 거절 {st4['blocked'] - b0}번 · stanceBlocked 사건 {ev}")
            r = run({"moveZ": -1}, 2.5)
            st5 = press("crouch")
            ok &= _check(notes, r["end"]["pos"][2] > -7.6 and st5["stance"] == "stand", f"통로 밖으로 나와(z {r['end']['pos'][2]}) C → 서기 {st5['stance']}")

            # 7) 점프 높이
            a = put("t0.jump")
            y0 = a["pos"][1]
            pg.evaluate("() => __fps.press('jump')")
            r = run({}, 1.0, 1 / 60)
            ys = [x["pos"][1] for x in r["samples"]]
            rise = max(ys) - y0
            ok &= _check(notes, 0.4 <= rise <= 0.6 and r["end"]["onGround"] and abs(r["end"]["pos"][1] - y0) < 0.02,
                         f"점프 높이 {rise:.3f}m(0.4~0.6) · 다시 바닥 {r['end']['onGround']}")
            summary["jump_m"] = round(rise, 3)
            # 경사판 위에서 미끄러지지 않음
            put("t0.ramp"); run({"moveZ": 1}, 0.8)
            pg.evaluate("() => __fps.step(0.6)")   # 손 뗀 뒤 감속(0.2초)까지 끝나고
            m0 = pg.evaluate(ST)
            r = run({}, 2.0)
            slip = abs(r["end"]["pos"][2] - m0["pos"][2])
            ok &= _check(notes, m0["pos"][1] > 0.3 and slip < 0.05 and r["end"]["onGround"], f"경사판 중간(높이 {m0['pos'][1]})에 서 있기 2초 → 미끄러짐 {slip:.3f}m")

            # 8) 문 — 닫힘은 막고, 열면 지나감
            put("t0.door")
            r = run({"moveZ": 1}, 2.0)
            z_closed = r["end"]["pos"][2]
            ok &= _check(notes, z_closed >= -8 + 0.06 + R - TOL and r["maxPen"] <= TOL, f"닫힌 문 앞 2초 → z {z_closed} (문 면 -7.94)")
            pg.evaluate("() => __fps.door('d1', true)")
            r = run({"moveZ": 1}, 2.0)
            ok &= _check(notes, r["end"]["pos"][2] < -9.5 and r["maxPen"] <= TOL, f"문 열고 2초 → z {r['end']['pos'][2]}(문을 지나감)")
            pg.evaluate("() => { __fps.resumeLoop(); }")
            pg.wait_for_timeout(700)   # 문 그림 0.6초 열림
            pg.evaluate("() => { __fps.pauseLoop(); __fps.teleport(15.9, 0, -3.5, 0); __fps.step(0.1); }")
            pg.wait_for_timeout(150)
            shot = out / "move-door.png"
            pg.screenshot(path=str(shot))
            summary["shot_door"] = str(shot)
            pg.evaluate("() => __fps.door('d1', false)")

            # 9) 결정성 — 같은 입력 두 번 → 같은 자리
            seq = """() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, moveX: 0.3, sprint: true}); __fps.step(0.5);
                __fps.press('jump'); __fps.step(0.7); __fps.turn(37, 0); __fps.setInput({sprint: null, moveX: -1}); __fps.step(1.1);
                __fps.press('crouch'); __fps.step(0.6); __fps.clearInput(); return __fps.state(); }"""
            d1 = pg.evaluate(seq)
            d2 = pg.evaluate(seq)
            ok &= _check(notes, d1["pos"] == d2["pos"] and d1["vel"] == d2["vel"] and d1["stance"] == d2["stance"],
                         f"결정성: 같은 입력 두 번 → 같은 자리 {d1['pos']} / {d2['pos']}")

            # S3 — 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기 · 착지(--basic 이 아니면)
            if not getattr(args, "basic", False):
                ok &= _move_s3(pg, out, notes, summary)

            # 10) 둘러본 화면 — 단 위에서
            pg.evaluate("() => { __fps.clearInput(); __fps.teleport(6, 1.5, 4, -140); __fps.look(-140, -12); __fps.step(0.2); __fps.resumeLoop(); }")
            pg.wait_for_timeout(400)
            shot = out / "move-overview.png"
            pg.screenshot(path=str(shot))
            spread = image_spread(shot)
            ok &= _check(notes, spread is None or spread > 4, f"둘러본 화면 스크린샷 {shot} (밝기 퍼짐 {spread})")
            summary["shot_overview"] = str(shot)
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("move", ok, summary, notes)


# ───────────────────────────── move(S3) — 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기 · 착지 ─────────────────────────────

# 페이지 안 도우미 — 사건 읽기 · 원 그리며 달리기(전술 달리기 시험: 40m 구역 안에서 3초 넘게 달리려고 반지름 r 원을 돈다)
MOVE3_JS = r"""(() => {
  const F = window.__fps;
  window.__m3 = {
    mark() { const e = F.events(); return e.length ? e[e.length - 1].i + 1 : 0; },
    ev(since, types) { return F.events(since).filter((e) => types.indexOf(e.type) >= 0).map((e) => ({ type: e.type, t: +e.t.toFixed(4), p: e.payload })); },
    circle(sec, r, every) {
      const out = [], n = Math.round(sec * 60), ev = every || 6;
      for (let k = 0; k < n; k++) {
        const s = F.state();
        const hs = Math.hypot(s.vel[0], s.vel[2]);
        F.turn(-(hs / r) * (180 / Math.PI) / 60, 0);
        F.step(1 / 60);
        if (k % ev === ev - 1) { const e = F.state(); out.push({ t: e.time, hs: Math.hypot(e.vel[0], e.vel[2]), sprint: e.sprint, pos: e.pos, cool: e.tac.cool }); }
      }
      return out;
    },
    // 1/60 씩 돌리며 표본(자세 · 속도 · 높이)
    trace(sec) {
      const out = [];
      for (let k = 0; k < Math.round(sec * 60); k++) {
        F.step(1 / 60);
        const s = F.state();
        out.push({ t: s.time, pos: s.pos, hs: Math.hypot(s.vel[0], s.vel[2]), vy: s.vel[1], stance: s.stance, ground: s.onGround, sprint: s.sprint, pen: F.pen() });
      }
      return out;
    },
  };
  return true;
})()"""


def _move_s3(pg, out, notes, summary):
    ok = True
    R = 0.35
    TOL = 0.03
    pg.evaluate("() => { __fps.pauseLoop(); __fps.setLoadout({primary: null, secondary: null}); }")   # 맨손(무기 이동 배율 1)
    pg.evaluate(MOVE_JS)
    pg.evaluate(MOVE3_JS)

    def mark():
        return pg.evaluate("() => __m3.mark()")

    def ev(since, types):
        return pg.evaluate("([i, t]) => __m3.ev(i, t)", [since, types])

    def js(code):
        return pg.evaluate(code)

    def trace(sec):
        return pg.evaluate("(s) => __m3.trace(s)", sec)

    def at(x, z, yaw=0, settle=0.3):
        # 서 있는 자세로(앞 시험이 앉기 · 엎드리기로 끝났으면 일으킴) 놓고 잠깐 기다림
        js(f"""() => {{ __fps.clearInput(); __fps.teleport({x}, 0, {z}, {yaw}); __fps.step(0.05);
            for (let k = 0; k < 3 && __fps.state().stance !== 'stand'; k++) {{ __fps.press(__fps.state().stance === 'prone' ? 'prone' : 'crouch'); __fps.step(0.05); }}
            __fps.step({settle}); }}""")

    s3 = {}

    # ── 1) 넘기 — 낮은 벽 0.9m(넘을 수 있음 표시, 두께 0.3) ──
    at(0, -3.0)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(1.0)
    e = ev(i0, ["vault", "vaultEnd", "jump"])
    v = [x for x in e if x["type"] == "vault"]
    ve = [x for x in e if x["type"] == "vaultEnd"]
    end = tr[-1]
    dur = (ve[0]["t"] - v[0]["t"]) if v and ve else None
    maxy = max(x["pos"][1] for x in tr)
    maxpen = max(x["pen"] for x in tr)
    c = (probe and probe["kind"] == "vault" and probe["over"] and v and abs(v[0]["p"]["h"] - 0.9) < 0.02 and v[0]["p"]["over"]
         and dur is not None and abs(dur - 0.4) < 0.04 and not any(x["type"] == "jump" for x in e)
         and end["pos"][2] < -4.15 - R and end["pos"][1] < 0.03 and end["ground"] and end["stance"] == "stand" and maxy > 0.9 and maxpen <= TOL)
    ok &= _check(notes, c, f"넘기: 낮은 벽 0.9m — 미리 보기 {probe} · 사건 {[x['type'] for x in e]} · 걸린 시간 {dur}s(0.4) · 가장 높이 {maxy:.2f}m · "
                           f"끝 z {end['pos'][2]}(벽 뒷면 -4.15 너머) 높이 {end['pos'][1]} · {end['stance']} · 최대 박힘 {maxpen}m")
    s3["vault"] = {"h": v[0]["p"]["h"] if v else None, "dur": dur, "end": end["pos"]}

    # ── 2) 높은 벽 1.6m(표시 없음 · 너무 높음) — 넘기 실패, 그냥 점프 ──
    at(-7, -3.0)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(1.2)
    e = ev(i0, ["vault", "jump"])
    end = tr[-1]
    c = (probe is None and not any(x["type"] == "vault" for x in e) and any(x["type"] == "jump" for x in e)
         and end["pos"][2] >= -4 + 0.15 + R - TOL and end["pos"][1] < 0.03 and max(x["pen"] for x in tr) <= TOL)
    ok &= _check(notes, c, f"높은 벽 1.6m: 미리 보기 {probe} · 사건 {[x['type'] for x in e]}(넘기 없음 · 점프만) · 끝 z {end['pos'][2]} 높이 {end['pos'][1]}")

    # ── 3) 오르기 — 가슴 높이 1.2m(두께 0.6) ──
    at(7, -2.9)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(0.75)
    js("() => __fps.clearInput()")
    tr += trace(0.4)
    e = ev(i0, ["vault", "vaultEnd", "jump"])
    v = [x for x in e if x["type"] == "vault"]
    ve = [x for x in e if x["type"] == "vaultEnd"]
    end = tr[-1]
    dur = (ve[0]["t"] - v[0]["t"]) if v and ve else None
    maxpen = max(x["pen"] for x in tr)
    c = (probe and probe["kind"] == "mantle" and v and v[0]["p"]["kind"] == "mantle" and abs(v[0]["p"]["h"] - 1.2) < 0.02
         and dur is not None and abs(dur - 0.7) < 0.04 and abs(end["pos"][1] - 1.2) < 0.03 and end["ground"] and end["stance"] == "stand"
         and -4.3 <= end["pos"][2] <= -3.7 and maxpen <= TOL)
    ok &= _check(notes, c, f"오르기: 가슴 높이 1.2m — 미리 보기 {probe} · 걸린 시간 {dur}s(0.7) · 끝 높이 {end['pos'][1]}(윗면 1.2) z {end['pos'][2]} · {end['stance']} · 바닥 {end['ground']} · 최대 박힘 {maxpen}m")
    s3["mantle"] = {"h": v[0]["p"]["h"] if v else None, "dur": dur, "end": end["pos"]}
    js("() => { __fps.resumeLoop(); __fps.look(180, -18); }")
    pg.wait_for_timeout(350)
    shot = out / "move-mantle.png"
    pg.screenshot(path=str(shot))
    summary["shot_mantle"] = str(shot)
    js("() => __fps.pauseLoop()")

    # ── 4) 넘기 취소 — 넘어가기 전에 이동 키를 떼면 제자리 ──
    at(0, -3.0)
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.1); __fps.setInput({moveZ: 0}); }")
    tr = trace(0.4)
    e = ev(i0, ["vault", "vaultCancel", "vaultEnd"])
    end = tr[-1]
    c = ([x["type"] for x in e] == ["vault", "vaultCancel"] and abs(end["pos"][2] + 3.0) < 0.05 and end["pos"][1] < 0.03 and end["stance"] == "stand")
    ok &= _check(notes, c, f"넘기 중 이동 키 떼기 → 취소 {[x['type'] for x in e]} · 제자리 z {end['pos'][2]} 높이 {end['pos'][1]}")
    # 이동 키 없이 Space → 그냥 점프
    at(0, -3.0)
    i0 = mark()
    js("() => __fps.press('jump')")
    trace(0.6)
    e = ev(i0, ["vault", "jump"])
    ok &= _check(notes, [x["type"] for x in e] == ["jump"], f"이동 키 없이 Space(낮은 벽 앞) → 점프만 {[x['type'] for x in e]}")

    # ── 5) 슬라이딩 — 달리는 중 C: 0.7초 · 거리 3~5m · 끝에 앉기 ──
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); }")
    st = js(ST)
    hs0 = (st["vel"][0] ** 2 + st["vel"][2] ** 2) ** 0.5
    i0 = mark()
    js("() => { __fps.setInput({sprint: null}); __fps.press('crouch'); }")
    tr = trace(1.0)
    e = ev(i0, ["slide", "slideEnd", "stance"])
    sl = [x for x in e if x["type"] == "slide"]
    se = [x for x in e if x["type"] == "slideEnd"]
    first = tr[0]
    after = [x for x in tr if x["stance"] != "slide"]
    sdur = (se[0]["t"] - sl[0]["t"]) if sl and se else None
    sdist = se[0]["p"]["dist"] if se else None
    maxpen = max(x["pen"] for x in tr)
    c = (st["sprint"] == "run" and abs(hs0 - 6.75) < 0.05 and sl and abs(first["hs"] - 9.0) < 0.15 and se and se[0]["p"]["why"] == "time"
         and 3.0 <= sdist <= 5.0 and abs(sdur - 0.7) < 0.04 and after and after[0]["stance"] == "crouch" and tr[-1]["stance"] == "crouch" and maxpen <= TOL)
    ok &= _check(notes, c, f"슬라이딩: 달리기 {hs0:.2f}m/s → C → 시작 {first['hs']:.2f}m/s(9.0) · 걸린 시간 {sdur}s(0.7) · 거리 {sdist}m(3~5) · 끝 자세 {after[0]['stance'] if after else None} · 최대 박힘 {maxpen}m")
    s3["slide"] = {"v0": round(first["hs"], 3), "dist": sdist, "dur": sdur}
    # 연속 사용 대기 1초 — 바로 다시 달려 C 는 그냥 앉기
    i1 = mark()
    js("() => { __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.2); __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.1); }")
    st1 = js(ST)
    e1 = ev(i1, ["slide"])
    # 1초 넘게 지난 뒤에는 다시 됨
    i2 = mark()
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.1); }")
    st2 = js(ST)
    e2 = ev(i2, ["slide"])
    ok &= _check(notes, not e1 and st1["stance"] == "crouch" and e2 and st2["stance"] == "slide",
                 f"슬라이딩 대기 1초: 끝난 직후 달려 C → {st1['stance']}(슬라이딩 {len(e1)}번) · 1초 뒤 → {st2['stance']}(슬라이딩 {len(e2)}번)")
    # 점프로 취소
    i3 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.step(0.15); __fps.press('jump'); __fps.step(2 / 60); }")
    st3 = js(ST)
    e3 = ev(i3, ["slideEnd", "jump"])
    ok &= _check(notes, st3["stance"] == "stand" and st3["vel"][1] > 2 and [x["type"] for x in e3] == ["slideEnd", "jump"] and e3[0]["p"]["why"] == "jump",
                 f"슬라이딩 중 Space → 일어나 점프(자세 {st3['stance']} · 위 속도 {st3['vel'][1]} · 사건 {[(x['type'], (x['p'] or {}).get('why')) for x in e3]})")
    js("() => { __fps.clearInput(); __fps.step(1.0); }")
    # 뒤로 가며 C → 슬라이딩 없음(앉기)
    i4 = mark()
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: -1, sprint: true}); __fps.step(0.5); __fps.press('crouch'); __fps.step(0.1); __fps.clearInput(); }")
    e4 = ev(i4, ["slide"])
    ok &= _check(notes, not e4 and js(ST)["stance"] == "crouch", f"뒤로 가며 Shift + C → 슬라이딩 없음({len(e4)}) · 앉기")
    # 넘기 직후 C → 바로 슬라이딩(달리지 않아도)
    at(0, -3.0)
    i5 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.15); __fps.press('crouch'); __fps.step(0.5); }")
    e5 = ev(i5, ["vault", "vaultEnd", "slide"])
    st5 = js(ST)
    js("() => { __fps.clearInput(); __fps.step(1.0); }")
    ok &= _check(notes, [x["type"] for x in e5] == ["vault", "vaultEnd", "slide"] and e5[2]["p"]["fromVault"] and st5["stance"] == "slide",
                 f"넘는 중 C → 넘자마자 슬라이딩 {[x['type'] for x in e5]} · 자세 {st5['stance']}")

    # ── 6) 전술 달리기 — ×1.8 이 3초 뒤 ×1.5, 대기 6초 ──
    at(4, 3, 0)
    js("() => __fps.setInput({moveZ: 1, sprint: true})")
    a = pg.evaluate("() => __m3.circle(1.0, 4)")
    i6 = mark()
    js("() => __fps.press('tacSprint')")
    b = pg.evaluate("() => __m3.circle(3.6, 4)")
    e6 = ev(i6, ["tacSprint", "tacSprintTired"])
    t_on = e6[0]["t"] if e6 else 0
    run_hs = a[-1]["hs"]
    tac_s = [x for x in b if 0.4 <= x["t"] - t_on <= 2.9]
    late = [x for x in b if x["t"] - t_on >= 3.4]
    t_off = [x["t"] for x in e6 if x["type"] == "tacSprint" and not x["p"]["on"]]
    tac_hs = [x["hs"] for x in tac_s]
    late_hs = [x["hs"] for x in late]
    c = (abs(run_hs - 6.75) < 0.3 and e6 and e6[0]["p"]["on"] and tac_s and all(x["sprint"] == "tac" for x in tac_s) and all(abs(h - 8.1) < 0.3 for h in tac_hs)
         and t_off and abs(t_off[0] - t_on - 3.0) < 0.04 and late and all(x["sprint"] == "run" for x in late) and all(abs(h - 6.75) < 0.3 for h in late_hs))
    ok &= _check(notes, c, f"전술 달리기: 달리기 {run_hs:.2f} → Shift 두 번 → {min(tac_hs) if tac_hs else 0:.2f}~{max(tac_hs) if tac_hs else 0:.2f}m/s(8.1) · "
                           f"{round(t_off[0] - t_on, 3) if t_off else None}초 뒤 일반 달리기 {min(late_hs) if late_hs else 0:.2f}~{max(late_hs) if late_hs else 0:.2f}m/s(6.75)")
    s3["tac"] = {"run": round(run_hs, 3), "tac": [round(min(tac_hs), 3), round(max(tac_hs), 3)] if tac_hs else None,
                 "after": [round(min(late_hs), 3), round(max(late_hs), 3)] if late_hs else None, "dur": round(t_off[0] - t_on, 3) if t_off else None}
    i7 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st7 = js(ST)
    e7 = ev(i7, ["tacSprint", "tacSprintTired"])
    pg.evaluate("() => __m3.circle(4.8, 4)")
    i8 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st8 = js(ST)
    e8 = ev(i8, ["tacSprint", "tacSprintTired"])
    allpos = [x["pos"] for x in a + b]
    rmax = max(((p[0]) ** 2 + (p[2] - 3) ** 2) ** 0.5 for p in allpos)
    ok &= _check(notes, st7["sprint"] == "run" and [x["type"] for x in e7] == ["tacSprintTired"] and st8["sprint"] == "run" and [x["type"] for x in e8] == ["tacSprintTired"],
                 f"전술 달리기 대기: 끝난 직후 Shift 두 번 → {st7['sprint']}(대기 {st7['tac']['cool']}초) · 5.4초 뒤 → {st8['sprint']}(대기 {st8['tac']['cool']}초)")
    pg.evaluate("() => { __fps.setInput({moveZ: 1, sprint: true}); __m3.circle(0.8, 4); }")
    i9 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st9 = js(ST)
    e9 = ev(i9, ["tacSprint", "tacSprintTired"])
    js("() => { __fps.clearInput(); __fps.step(0.5); }")
    ok &= _check(notes, st9["sprint"] == "tac" and e9 and e9[0]["type"] == "tacSprint", f"전술 달리기 6초 뒤 다시 됨 → {st9['sprint']} (원 반지름 최대 {rmax:.2f}m — 벽에 안 닿음)")

    # ── 7) 착지 감속 · 연속 점프 감속 · 착지 화면 눌림 ──
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1}); __fps.step(0.5); __fps.press('jump'); }")
    i10 = mark()
    tr = trace(0.8)
    js("() => __fps.clearInput()")
    e10 = ev(i10, ["land"])
    cam = js("() => __fps.camfx()")
    land_t = e10[0]["t"] if e10 else None
    post = [x["hs"] for x in tr if land_t is not None and 0 < x["t"] - land_t <= 0.2]
    rec = [x["hs"] for x in tr if land_t is not None and x["t"] - land_t >= 0.33]
    c = e10 and post and min(post) < 4.5 * 0.85 and rec and abs(rec[-1] - 4.5) < 0.05 and cam["landOff"] < -0.02
    ok &= _check(notes, c, f"착지 감속: 걷다 점프 → 착지 직후 최저 {round(min(post), 2) if post else None}m/s(< 3.83) → {rec[-1] if rec else 0:.2f}m/s 회복 · 화면 눌림 {cam['landOff']}m")
    js("() => { __mv.put('t0.jump'); __fps.press('jump'); }")
    tr1 = trace(0.4)
    js("() => __fps.press('jump')")
    i11 = mark()
    tr2 = trace(0.6)
    e11 = ev(i11, ["jump"])
    y0 = 0.0
    r1 = max(x["pos"][1] for x in tr1) - y0
    r2 = max(x["pos"][1] for x in tr2) - y0
    c = e11 and e11[0]["p"]["chain"] == 1 and 0.3 < r2 < r1 - 0.08 and 0.45 < r1 < 0.55
    ok &= _check(notes, c, f"연속 점프 감속: 첫 점프 {r1:.3f}m → 착지 바로 다시 {r2:.3f}m(연속 {e11[0]['p'] if e11 else None})")
    s3["jump_chain"] = [round(r1, 3), round(r2, 3)]
    js("() => __fps.step(1.0)")

    # ── 8) 기대기 — 기본 끔, 설정 켜면 Q/E(섬광 4), 옆이 막히면 줄임 ──
    c0 = js("() => __fps.setControls({})")
    at(0, 8)
    js("() => { __fps.setInput({leanR: true}); __fps.step(0.5); }")
    l0 = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.3); }")
    c1 = js("() => __fps.setControls({lean: true})")
    js("() => __fps.resumeLoop()")
    pg.keyboard.down("KeyE")
    pg.wait_for_timeout(450)
    lr = js(ST)["lean"]
    pg.keyboard.up("KeyE")
    pg.keyboard.down("KeyQ")
    pg.wait_for_timeout(600)
    lq = js(ST)["lean"]
    shot = out / "move-lean.png"
    pg.screenshot(path=str(shot))
    summary["shot_lean"] = str(shot)
    pg.keyboard.up("KeyQ")
    js("() => __fps.pauseLoop()")
    at(19.2, 0, 0)
    js("() => { __fps.setInput({leanR: true}); __fps.step(0.5); }")
    lw = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.4); }")
    c2 = js("() => __fps.setControls({lean: false})")
    js("() => { __fps.setInput({leanL: true}); __fps.step(0.5); }")
    l3 = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.2); }")
    c = (c0["leanR"] is None and c0["flash"] == "KeyQ" and l0["off"] == 0 and c1["leanR"] == "KeyE" and c1["leanL"] == "KeyQ" and c1["flash"] == "Digit4"
         and abs(lr["off"] - 0.4) < 0.02 and abs(lq["off"] + 0.4) < 0.02 and 0 < lw["off"] < 0.3 and c2["flash"] == "KeyQ" and l3["off"] == 0)
    ok &= _check(notes, c, f"기대기: 기본 끔(키 {c0['leanR']} · 섬광 {c0['flash']} · 손잡이로 눌러도 {l0['off']}) → 켜면 Q/E(섬광 {c1['flash']}) · "
                           f"[실제 키] E {lr['off']}m · Q {lq['off']}m · 오른쪽 벽 0.4m 옆 {lw['off']}m(줄임) · 다시 끄면 {l3['off']}")

    # ── 9) [실제 키] 달리는 중 Shift 두 번 → 전술 달리기, 흔들림이 커짐 ──
    js("() => { __fps.clearInput(); __fps.teleport(0, 0, 14, 0); __fps.step(0.2); __fps.resumeLoop(); }")
    pg.keyboard.down("KeyW")
    pg.wait_for_timeout(250)
    pg.keyboard.press("ShiftLeft")
    pg.wait_for_timeout(350)
    a1 = js("() => ({ s: __fps.state().sprint, fx: __fps.camfx() })")
    pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(60)
    pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(80)
    pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(60)
    pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(450)
    a2 = js("() => ({ s: __fps.state().sprint, fx: __fps.camfx() })")
    shot = out / "move-tac.png"
    pg.screenshot(path=str(shot))
    summary["shot_tac"] = str(shot)
    pg.keyboard.up("KeyW")
    pg.wait_for_timeout(200)
    js("() => __fps.pauseLoop()")
    ok &= _check(notes, a1["s"] == "run" and a2["s"] == "tac" and a2["fx"]["amp"] > a1["fx"]["amp"] + 0.008,
                 f"[실제 키] W + Shift → {a1['s']}(흔들림 {a1['fx']['amp']}) · Shift 두 번 → {a2['s']}(흔들림 {a2['fx']['amp']})")

    # ── 10) 결정성 — S3 동작을 섞어 두 번 ──
    seq = """() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); __fps.press('tacSprint'); __fps.step(0.5);
        __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.9); __fps.clearInput(); __fps.press('crouch'); __fps.step(0.1);
        __fps.teleport(7, 0, -2.9, 0); __fps.step(0.2); __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.75);
        __fps.clearInput(); __fps.step(0.3); return __fps.state(); }"""
    d1 = js(seq)
    d2 = js(seq)
    ok &= _check(notes, d1["pos"] == d2["pos"] and d1["vel"] == d2["vel"] and d1["stance"] == d2["stance"] and d1["tac"] == d2["tac"] and abs(d1["pos"][1] - 1.2) < 0.03,
                 f"결정성(전술 달리기 · 슬라이딩 · 오르기 — 끝은 가슴 높이 벽 위): {d1['pos']} / {d2['pos']}")
    summary["s3"] = s3
    return ok


# ───────────────────────────── shoot --core ─────────────────────────────

SHOOT_JS = r"""(() => {
  const F = window.__fps;
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const mark = () => { const e = F.events(); return e.length ? e[e.length - 1].i + 1 : 0; };
  const ev = (since, types) => F.events(since).filter((e) => types.indexOf(e.type) >= 0).map((e) => ({ type: e.type, t: +e.t.toFixed(4), p: e.payload }));
  const ang = (a, b) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
    return Math.acos(Math.max(-1, Math.min(1, d / (la * lb)))) * 180 / Math.PI; };
  window.__sh = {
    raf, mark, ev, ang,
    reset(w1, w2, hp) {
      F.clearInput();
      F.setLoadout({ primary: w1 === undefined ? 'nuwool' : w1, secondary: w2 === undefined ? 'sondeung' : w2 });
      F.resetTargets(hp ? { hp } : undefined);
      F.teleportTo('t0.range');
      F.step(0.5);
      return F.weapon();
    },
    // 한 단계씩 돌리며 발사 n 번 — 발사 직후 그림을 그려 카메라 방향을 읽고, 다음 탄 방향과 비교(보이는 것 = 판정)
    async burst(n, maxSec) {
      const out = [];
      let last = mark();
      F.setInput({ fire: true });
      const limit = Math.round((maxSec || 4) * 60);
      for (let k = 0; k < limit && out.length < n; k++) {
        F.step(1 / 60);
        const e = ev(last, ['shot']);
        last = mark();
        if (e.length) {
          await raf();
          const c = F.camDir();
          const st = F.state();
          out.push({ t: e[0].t, dir: e[0].p.dir, aim: e[0].p.aim, recoil: e[0].p.recoil, kick: e[0].p.kick, sway: e[0].p.sway, camAfter: c.dir, recAfter: st.recoil });
        }
      }
      F.setInput({ fire: null });
      return out;
    },
    stepUntil(types, maxSec, since) {
      const s0 = since === undefined ? mark() : since;
      for (let k = 0; k < Math.round(maxSec * 60); k++) { F.step(1 / 60); const e = ev(s0, types); if (e.length) return e; }
      return [];
    },
  };
  return true;
})()"""


def cmd_shoot(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            pg.wait_for_timeout(300)
            J = lambda code, arg=None: pg.evaluate(code, arg) if arg is not None else pg.evaluate(code)  # noqa: E731
            defs = J("() => __fps.weaponDefs()")
            ids = J("() => FG.cfg.WEAPON_ORDER")
            st = J(ST)
            tg = J("() => __fps.targets()")
            ok &= _check(notes, len(defs) == 6 and ids == ["nuwool", "mulsu", "neoreok", "meondeung", "sondeung", "cheondung"]
                         and all(12 <= len(defs[k]["pattern"]) <= 20 for k in ids),
                         f"무기 6종 {[defs[k]['name'] for k in ids]} · 반동 배열 {[len(defs[k]['pattern']) for k in ids]}개(12~20)")
            ok &= _check(notes, st["weapon"]["id"] == "nuwool" and st["weapon"]["slots"][1]["id"] == "sondeung" and st["weapon"]["mag"] == 30,
                         f"기본 장비 너울 + 손등불 · 탄 {st['weapon']['mag']}/{st['weapon']['reserve']}")
            ok &= _check(notes, len(tg) == 3 and [t["armored"] for t in tg] == [False, False, True],
                         f"시험 구역 과녁 3개(판정 몸 — 셋째는 방탄) {[(t['id'], t['pos']) for t in tg]}")
            # 실제 마우스 — 잠금이 안 되는 헤드리스는 대체 조작: 짧은 클릭 = 한 발
            J("() => { __fps.aimAt('tg1'); }")
            m0 = J("() => { const e = __fps.events(); return e.length ? e[e.length - 1].i + 1 : 0; }")
            pg.mouse.click(640, 360)
            pg.wait_for_timeout(250)
            e = J("(m) => __fps.events(m).filter(x => x.type === 'shot' || x.type === 'hit').map(x => [x.type, x.payload.targetId || x.payload.wpn])", m0)
            ok &= _check(notes, ["shot", "nuwool"] in e, f"[실제 마우스] 화면 짧은 클릭 → 발사 {e}")
            pg.screenshot(path=str(out / "shoot-hip.png"))
            summary["shot_hip"] = str(out / "shoot-hip.png")

            # 이후는 고리를 붙잡고 sim 만
            J("() => __fps.pauseLoop()")
            J(SHOOT_JS)

            # 1) aimAt + 발사 → hit · 탄창 감소 · HUD 꺾쇠 · 소리
            J("() => __sh.reset()")
            J("() => __fps.aimAt('tg1')")
            r = pg.evaluate("""async () => { const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.05);
                await __sh.raf(); return { e: __sh.ev(m, ['shot', 'hit', 'impact']), w: __fps.weapon(), hud: __fps.hud(), au: __fps.audio() }; }""")
            types = [x["type"] for x in r["e"]]
            hit = next((x["p"] for x in r["e"] if x["type"] == "hit"), None)
            ok &= _check(notes, types[:2] == ["shot", "hit"] and hit and hit["targetId"] == "tg1" and hit["byPlayer"] and hit["part"] == "torso"
                         and abs(hit["dmg"] - 28) < 1e-6 and r["w"]["mag"] == 29,
                         f"aimAt(tg1) + 발사 → 사건 {types} · {hit and (hit['part'], hit['dmg'])} · 탄창 30 → {r['w']['mag']}")
            ok &= _check(notes, r["hud"]["hm"]["cls"] == "on k-hit" and r["hud"]["hm"]["corners"] == 4 and r["hud"]["ammo"]["mag"] == "29" and r["hud"]["ammo"]["name"] == "너울",
                         f"HUD 맞힘 꺾쇠 4개 {r['hud']['hm']} · 탄약 「{r['hud']['ammo']['name']} {r['hud']['ammo']['mag']} {r['hud']['ammo']['reserve']}」")
            ok &= _check(notes, r["au"]["unlocked"] and r["au"]["comp"] and r["au"]["played"].get("shot_nuwool", 0) >= 1 and r["au"]["played"].get("hm_hit", 0) >= 1,
                         f"소리: 출격 클릭에서 켜짐({r['au']['ctx']}) · 압축기 · 버스 {r['au']['buses']} · 총성 · 맞힘 「톡」 {r['au']['played']}")

            # 2) 반동 배열 · 보이는 것 = 판정 · 0.2초 복귀(조준 중 — 흔들림 거의 0)
            J("() => __sh.reset('nuwool', 'sondeung', 1e6)")
            base = J("() => { __fps.aimAt('tg1', 'torso', -0.12); __fps.setInput({ads: true}); __fps.step(0.4); return __fps.state(); }")
            m = J("() => __sh.mark()")
            b = pg.evaluate("() => __sh.burst(10, 3)")
            pat = defs["nuwool"]["pattern"]
            KV = 0.45 * defs["nuwool"]["recoil"][0]
            exp_cum, cum, worst, worst_cam, hiprec = [], 0.0, 0.0, 0.0, []
            for k, x in enumerate(b):
                exp_cum.append(cum)
                worst = max(worst, abs(x["recoil"][0] - cum))
                cum += pat[k][0] * KV
            for k in range(len(b) - 1):
                worst_cam = max(worst_cam, pg.evaluate("([a, c]) => __sh.ang(a, c)", [b[k + 1]["dir"], b[k]["camAfter"]]))
            hits = J("(m) => __sh.ev(m, ['hit']).map(x => [x.p.part, x.p.pos[1]])", m)
            ok &= _check(notes, len(b) == 10 and worst < 0.002,
                         f"연사 10발: 탄마다 카메라 반동 pitch = 배열 누적(최대 오차 {worst:.4f}°) — {[x['recoil'][0] for x in b]}")
            ok &= _check(notes, len(b) == 10 and worst_cam < 0.05,
                         f"보이는 것 = 판정: 쏜 뒤 그린 카메라 방향과 다음 탄 방향 차 최대 {worst_cam:.4f}° (흔들림 {base['sway']['amp']}°)")
            ys = [h[1] for h in hits]
            ok &= _check(notes, len(hits) >= 6 and ys[-1] - ys[0] > 0.4 and hits[0][0] == "torso" and "head" in [h[0] for h in hits],
                         f"반동만큼 올라간 곳에 맞음(10m 과녁): 부위 {[h[0] for h in hits]} · 맞은 높이 {[round(y, 2) for y in ys]}")
            dt = pg.evaluate("""() => { const t0 = __fps.state().time; const out = [];
                for (let k = 0; k < 15; k++) { __fps.step(1/60); const s = __fps.state(); out.push([+(s.time - t0).toFixed(4), s.recoil.pitch]); } return out; }""")
            p0 = b[-1]["recAfter"]["pitch"]
            mid = next((v for t, v in dt if abs(t - 0.1) < 0.009), None)
            zero_t = next((t for t, v in dt if v == 0), None)
            ok &= _check(notes, p0 > 3 and mid is not None and 0 < mid < p0 and zero_t is not None and zero_t <= 0.2 + 1e-3,
                         f"손 떼면 복귀: {p0:.3f}° → 0.1초 {mid}° → 0 까지 {zero_t}초(≤ 0.2)")
            fov_ads = J("() => __fps.camDir().fov")
            J("() => { __fps.setInput({ads: null}); __fps.step(0.5); }")
            pg.evaluate("() => __sh.raf()")
            fov_hip = J("() => __fps.camDir().fov")
            exp_fov = 2 * __import__("math").degrees(__import__("math").atan(__import__("math").tan(__import__("math").radians(37.5)) / 1.1))
            ok &= _check(notes, abs(fov_ads - exp_fov) < 0.05 and abs(fov_hip - 75) < 1e-3, f"조준 중 시야각 {fov_ads}°(기대 {exp_fov:.2f}) → 떼면 {fov_hip}°")

            # 3) 전술 재장전 < 빈 탄창 재장전 · 약실 +1 · 자동 재장전
            J("() => __sh.reset('nuwool', 'sondeung', 1e6)")
            J("() => { __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.25); __fps.step(0.2); }")
            m = J("() => __sh.mark()")
            J("() => __fps.press('reload')")
            e = J("(m) => __sh.stepUntil(['reloadEnd'], 4, m)", m)
            ev1 = J("(m) => __sh.ev(m, ['reload', 'reloadStep', 'reloadEnd'])", m)
            tac = next((x["p"] for x in ev1 if x["type"] == "reloadEnd"), None)
            J("() => { __fps.setInput({fire: true}); for (let k = 0; k < 600 && __fps.weapon().mag > 0; k++) __fps.step(1/60); __fps.setInput({fire: null}); }")
            m = J("() => __sh.mark()")
            J("(m) => __sh.stepUntil(['reloadEnd'], 4, m)", m)
            ev2 = J("(m) => __sh.ev(m, ['reload', 'reloadStep', 'reloadEnd'])", m)
            emp = next((x["p"] for x in ev2 if x["type"] == "reloadEnd"), None)
            rel2 = next((x["p"] for x in ev2 if x["type"] == "reload"), None)
            w = J("() => __fps.weapon()")
            ok &= _check(notes, tac and emp and tac["kind"] == "tac" and emp["kind"] == "empty" and abs(tac["t"] - 1.8) < 0.02 and abs(emp["t"] - 2.4) < 0.02
                         and tac["t"] < emp["t"] and tac["mag"] == 31 and emp["mag"] == 30 and rel2 and rel2["why"] == "auto",
                         f"전술 재장전 {tac and tac['t']}초(탄창 {tac and tac['mag']} = 30 + 약실 1) < 빈 탄창 {emp and emp['t']}초(탄창 {emp and emp['mag']}) · 빈 탄창은 자동({rel2 and rel2['why']}) · 예비 {w['reserve']}")
            steps = [x["p"]["step"] for x in ev2 if x["type"] == "reloadStep"]
            ok &= _check(notes, steps == ["out", "in", "rack"], f"빈 탄창 재장전 단계 {steps}(빼기 · 넣기 · 당기기 — 소리)")
            # 달리기로 취소 · 달리기 → 사격 0.2초
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung', 1e6); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.press('reload'); __fps.step(0.5);
                const m = __sh.mark(); const mag = __fps.weapon().mag; __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.3);
                const c = __sh.ev(m, ['reloadCancel']); const w = __fps.weapon(); const sp = __fps.state().sprint;
                const m2 = __sh.mark(); __fps.setInput({sprint: null, fire: true});
                let tOff = null; for (let k = 0; k < 60; k++) { __fps.step(1/60); const s = __fps.state(); if (tOff === null && s.sprint === 'off') tOff = s.time - 1/60; if (__sh.ev(m2, ['shot']).length) break; }
                __fps.clearInput(); const sh = __sh.ev(m2, ['shot']);
                return { c, mag, magAfter: w.mag, state: w.state, sp, tOff, shotT: sh.length ? sh[0].t : null }; }""")
            gap = (r["shotT"] - r["tOff"]) if r["shotT"] is not None and r["tOff"] is not None else None
            ok &= _check(notes, r["c"] and r["c"][0]["p"]["why"] == "sprint" and r["magAfter"] == r["mag"] and r["state"] == "idle" and r["sp"] == "run",
                         f"재장전 중 달리기 → 취소({r['c'] and r['c'][0]['p']['why']}) · 탄창 그대로 {r['mag']} → {r['magAfter']}")
            ok &= _check(notes, gap is not None and abs(gap - 0.2) < 0.02, f"달리기 멈춘 뒤 첫 발까지 {gap and round(gap, 3)}초(0.2)")

            # 4) 산탄 8줄기(고정 무늬 + 작은 회전) · 펌프 간격
            r = pg.evaluate("""() => { __sh.reset('neoreok', 'sondeung', 1e6); __fps.aimAt([0, 1.5, -19.6]); const m = __sh.mark();
                __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); const s1 = __fps.lastShot(); const e1 = __sh.ev(m, ['impact']);
                __fps.step(0.9); const m2 = __sh.mark(); for (let k = 0; k < 66; k++) { __fps.press('fire'); __fps.step(1/60); }
                const sh = __sh.ev(m2, ['shot']); const s2 = __fps.lastShot(); return { s1, e1, sh, s2, m2t: __sh.ev(m2, ['shot']) }; }""")
            s1, s2 = r["s1"], r["s2"]
            ang = [pg.evaluate("([a, c]) => __sh.ang(a, c)", [s1["rays"][0], q]) for q in s1["rays"]]
            ang2 = [pg.evaluate("([a, c]) => __sh.ang(a, c)", [s2["rays"][0], q]) for q in s2["rays"]] if s2 else []
            sp = defs["neoreok"]["spread"][0]
            pat_ok = len(ang) == 8 and ang[0] < 1e-3 and all(abs(a - sp) < 0.02 for a in ang[1::2]) and all(abs(a - sp * 0.55) < 0.02 for a in ang[2::2])
            same = len(ang2) == 8 and all(abs(a - b2) < 0.02 for a, b2 in zip(ang, ang2))
            shots = r["m2t"]
            pump_gap = shots[1]["t"] - shots[0]["t"] if len(shots) >= 2 else None
            ok &= _check(notes, s1["pellets"] == 8 and len(r["e1"]) == 8 and pat_ok and same and s1["rot"] != s2["rot"],
                         f"산탄 8줄기: 맞은 곳 {len(r['e1'])}개 · 가운데에서 각도 {[round(a, 2) for a in ang]}°(고정 무늬) · 회전 {s1['rot']}° → {s2['rot']}°")
            ok &= _check(notes, pump_gap is not None and 60 / 70 - 1e-6 <= pump_gap < 60 / 70 + 1 / 60 + 1e-6, f"펌프: 매 단계 눌러도 간격 {pump_gap and round(pump_gap, 3)}초(70발/분 = 0.857)")

            # 5) 무기 6종 모두 쏨 · 소리 · 1인칭 모델
            res6 = {}
            for wid in ids:
                r = pg.evaluate("""async (w) => { __sh.reset(w, 'sondeung', 1e6); __fps.aimAt('tg1'); const m = __sh.mark(); const m0 = __fps.weapon().mag;
                    __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(w === 'cheondung' ? 0.4 : 0.1); await __sh.raf();
                    const e = __sh.ev(m, ['shot', 'hit', 'explode']); return { types: e.map(x => x.type), hit: e.filter(x => x.type === 'hit').map(x => [x.p.kind, x.p.dmg]),
                      m0, m1: __fps.weapon().mag, vm: __fps.vm() }; }""", wid)
                res6[wid] = r
            pg.evaluate("() => __sh.raf()")
            au = J("() => __fps.audio()")
            good = all(r["types"] and r["types"][0] == "shot" and r["m1"] == r["m0"] - 1 and "hit" in r["types"] and r["vm"]["model"] == w2 for w2, r in res6.items())
            ok &= _check(notes, good and "explode" in res6["cheondung"]["types"] and res6["cheondung"]["hit"][0][0] == "explosion",
                         "무기 6종 발사 → shot · hit(탄창 -1) · 1인칭 모델: " + " · ".join(f"{defs[k]['name']} {res6[k]['types'][:3]}" for k in ids))
            ok &= _check(notes, all(au["played"].get("shot_" + k, 0) >= 1 for k in ids), f"총성 6종 {[(k, au['played'].get('shot_' + k, 0)) for k in ids]}")

            # 6) 피해 — 거리 감쇠 · 부위 배율 · 방탄 · 처치 · 다시 일어섬
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung', 1e6); const out = {};
                const one = (t, part) => { __fps.aimAt(t, part); __fps.setInput({ads: true}); __fps.step(0.4); const m = __sh.mark();
                  __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.4); const h = __sh.ev(m, ['hit']); return h.length ? h[0].p : null; };
                out.torso = one('tg1', 'torso'); out.head = one('tg1', 'head'); out.legs = one('tg1', 'legs'); out.armor = one('tg3', 'torso'); out.armorHead = one('tg3', 'head');
                out.far = one('tg2', 'torso');
                __fps.setInput({ads: null}); return out; }""")
            dist2 = ((3.2) ** 2 + 20 ** 2 + (1.62 - 1.15) ** 2) ** 0.5
            ok &= _check(notes, r["torso"] and abs(r["torso"]["dmg"] - 28) < 1e-6 and abs(r["head"]["dmg"] - 50.4) < 1e-6 and abs(r["legs"]["dmg"] - 22.4) < 1e-6,
                         f"부위 배율(너울 10m): 몸통 {r['torso'] and r['torso']['dmg']} · 머리 {r['head'] and r['head']['dmg']}(×1.8) · 다리 {r['legs'] and r['legs']['dmg']}(×0.8)")
            ok &= _check(notes, r["armor"] and r["armor"]["armored"] and abs(r["armor"]["dmg"] - 9.8) < 1e-6 and r["armorHead"] and not r["armorHead"]["armored"]
                         and abs(r["armorHead"]["dmg"] - 50.4) < 1e-6 and r["far"] and abs(r["far"]["dmg"] - 28) < 1e-6,
                         f"방탄 과녁(28m) 몸통 {r['armor'] and r['armor']['dmg']}(×0.35) · 머리 {r['armorHead'] and r['armorHead']['dmg']}(방탄 없음) · 20m 몸통 {r['far'] and r['far']['dmg']}(감쇠 전)")
            fo = J("""() => { const d = FG.cfg.WEAPONS.nuwool; return [FG.combat.falloff(d, 10), FG.combat.falloff(d, 45), FG.combat.falloff(d, 80), FG.combat.falloff(FG.cfg.WEAPONS.mulsu, 21)]; }""")
            ok &= _check(notes, fo == [28, 24, 20, 19], f"거리 감쇠(최대 → 최소 사이 직선): 너울 10m {fo[0]} · 45m {fo[1]} · 80m {fo[2]} / 물수제비 21m {fo[3]}")
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung'); const m = __sh.mark();
                const one = (part) => { __fps.aimAt('tg1', part); __fps.setInput({ads: true}); __fps.step(0.4); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); };
                one('head'); __fps.step(0.4); one('head'); __fps.step(0.05); await __sh.raf(); const hud = __fps.hud();
                const down = __sh.ev(m, ['targetDown']); const tg = __fps.targets()[0];
                const up = __sh.stepUntil(['targetUp'], 4, m); __fps.setInput({ads: null});
                return { hits: __sh.ev(m, ['hit']).map(x => [x.p.part, x.p.dmg, x.p.killed]), hud, down, tgDown: tg.down, up: up.length ? up[0].t - down[0].t : null }; }""")
            ok &= _check(notes, len(r["hits"]) == 2 and r["hits"][1][2] and r["down"] and r["tgDown"] and r["hud"]["hm"]["cls"] == "on k-kill" and r["up"] is not None and abs(r["up"] - 3.0) < 0.05,
                         f"머리 2발 → 처치 {r['hits']} · 굵은 주황 꺾쇠 {r['hud']['hm']['cls']} · 넘어짐 → {r['up'] and round(r['up'], 3)}초 뒤 일어섬")
            # HUD 맞힘 표시 종류(머리 = 꺾쇠 + 노랑 점, 방탄 = 파란 마름모) — X 모양 없음
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung', 1e6); const out = {};
                for (const [t, p] of [['tg1', 'head'], ['tg3', 'torso']]) { __fps.aimAt(t, p); __fps.setInput({ads: true}); __fps.step(0.4); __fps.setInput({fire: true}); __fps.step(1/60);
                  __fps.setInput({fire: null}); await __sh.raf(); const h = document.getElementById('hm');
                  const vis = [...h.children].filter(c => getComputedStyle(c).display !== 'none').map(c => c.className);
                  out[t + p] = { cls: h.className, vis, dotColor: getComputedStyle(h.querySelector('.dot')).backgroundColor, dia: getComputedStyle(h.querySelector('.dia')).borderTopColor };
                  __fps.step(0.6); await __sh.raf(); }
                __fps.setInput({ads: null}); return out; }""")
            hh, aa = r["tg1head"], r["tg3torso"]
            ok &= _check(notes, hh["cls"] == "on k-head" and "dot" in hh["vis"] and "dia" not in hh["vis"] and aa["cls"] == "on k-armor" and "dia" in aa["vis"],
                         f"맞힘 표시 모양: 머리 {hh['vis']}(노랑 점 {hh['dotColor']}) · 방탄 {aa['vis']}(마름모 {aa['dia']})")
            # 교체 0.45 / 권총 0.3 · 휠
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung'); const m = __sh.mark(); __fps.press('weapon2'); __sh.stepUntil(['switchEnd'], 2, m);
                const a = __sh.ev(m, ['switch', 'switchEnd']); const w1 = __fps.weapon().id; const m2 = __sh.mark(); __fps.press('weapon1'); __sh.stepUntil(['switchEnd'], 2, m2);
                const b = __sh.ev(m2, ['switch', 'switchEnd']); const m3 = __sh.mark(); __fps.setInput({wheel: 1}); __fps.step(1/60); __fps.setInput({wheel: null}); __sh.stepUntil(['switchEnd'], 2, m3);
                return { a, b, w1, w2: __fps.weapon().id, wheel: __sh.ev(m3, ['switchEnd']) }; }""")
            ta = r["a"][1]["t"] - r["a"][0]["t"] if len(r["a"]) == 2 else None
            tb = r["b"][1]["t"] - r["b"][0]["t"] if len(r["b"]) == 2 else None
            ok &= _check(notes, r["w1"] == "sondeung" and ta is not None and abs(ta - 0.3) < 0.02 and tb is not None and abs(tb - 0.45) < 0.02
                         and r["wheel"] and r["w2"] == "sondeung",
                         f"교체: → 손등불 {ta and round(ta, 3)}초(0.3) · → 너울 {tb and round(tb, 3)}초(0.45) · 휠 → {r['w2']}")
            # 고배율 조준경(먼등불) — 시야각 · 원형 덮개 · 총 숨김 · 십자선 숨김
            r = pg.evaluate("""async () => { __sh.reset('meondeung', 'sondeung'); __fps.aimAt('tg3'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf();
                return { fov: __fps.camDir().fov, hud: __fps.hud(), vm: __fps.vm() }; }""")
            pg.screenshot(path=str(out / "shoot-scope.png"))
            ok &= _check(notes, abs(r["fov"] - 34.0) < 0.2 and r["hud"]["scope"] and r["vm"]["hidden"] and r["hud"]["xh"]["opacity"] == 0,
                         f"먼등불 조준: 시야각 {r['fov']}°(×2.5) · 원형 덮개 {r['hud']['scope']} · 총 숨김 {r['vm']['hidden']} · 십자선 투명 {r['hud']['xh']['opacity']}")
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.5); await __sh.raf();
                const a = __fps.hud(); __fps.setInput({ads: null}); __fps.step(0.5); await __sh.raf(); const h = __fps.hud();
                __fps.setInput({moveZ: 1}); __fps.step(0.8); await __sh.raf(); const mv = __fps.hud(); __fps.clearInput(); return { a, h, mv }; }""")
            ok &= _check(notes, r["a"]["xh"]["opacity"] == 0 and r["h"]["xh"]["opacity"] == 1 and r["mv"]["xh"]["gap"] > r["h"]["xh"]["gap"] + 2,
                         f"십자선: 조준 중 숨김({r['a']['xh']['opacity']}) · 허리 {r['h']['xh']['gap']}px → 걸으며 {r['mv']['xh']['gap']}px(흔들림만큼 벌어짐)")
            J("() => { __sh.reset('nuwool', 'sondeung'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.5); }")
            pg.evaluate("() => __sh.raf()")
            pg.screenshot(path=str(out / "shoot-ads.png"))
            J("() => __fps.clearInput()")
            # 결정성 — 같은 입력 두 번 같은 결과
            det = pg.evaluate("""() => { const run = () => { __sh.reset('mulsu', 'sondeung', 1e6); __fps.aimAt('tg2'); __fps.setInput({moveX: 1}); const m = __sh.mark();
                __fps.fireFor(1.2); __fps.clearInput(); return __sh.ev(m, ['shot', 'hit']).map(x => x.type === 'hit' ? [x.p.part, x.p.pos] : x.p.dir); };
                return [JSON.stringify(run()), JSON.stringify(run())]; }""")
            ok &= _check(notes, det[0] == det[1] and len(det[0]) > 100, f"결정성(옆으로 걸으며 연사 — 흔들림 · 반동 · 맞은 곳) 두 번 같음({len(det[0])}자)")

            # 7) 실시간 연사 중 그리기 호출
            J("() => { __sh.reset('nuwool', 'sondeung', 1e6); __fps.infiniteAmmo(true); __fps.aimAt('tg2'); __fps.resumeLoop(); }")
            pg.wait_for_timeout(500)
            J("() => { __fps.perfReset(); __fps.setInput({fire: true}); }")
            pg.wait_for_timeout(2000)
            pg.screenshot(path=str(out / "shoot-fire.png"))
            p = J("() => __fps.perf()")
            J("() => { __fps.clearInput(); __fps.infiniteAmmo(false); }")
            n_shots = J("() => __fps.weapon().shots")
            ok &= _check(notes, 0 < p["callsMax"] <= 60, f"실시간 연사 2초: 그리기 호출 최대 {p['callsMax']} ≤ 60 · 삼각형 {p['trisMax']} · 무기 sim {p['ms']['shots']}ms/프레임 · 누적 발사 {n_shots}")
            summary.update({"shots": {"hip": str(out / "shoot-hip.png"), "ads": str(out / "shoot-ads.png"), "scope": str(out / "shoot-scope.png"), "fire": str(out / "shoot-fire.png")},
                            "fire_calls": p["callsMax"], "fire_tris": p["trisMax"]})
            if not args.core:   # S5 — 장비 · 효과 · 훈련장(고리를 다시 붙잡고 sim 만)
                J("() => __fps.pauseLoop()")
                ok &= _shoot_s5(pg, s, J, out, notes, summary, defs)
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            if not args.core:   # S5 검증 뒤 고친 것(다시 시작 · 구역 바꾸기 · 넘기 · 반동 상한) — 새 화면에서
                ok &= _shoot_regress(s, notes, summary)
        finally:
            s.close()
    return finish("shoot", ok, summary, notes)


def _shoot_regress(s, notes, summary):
    """S5 검증에서 나온 문제의 되풀이 막기 — 구역을 번갈아 다시 시작해도 그림 자원이 쌓이지 않음 · 같은 구역 다시 시작 때 과녁 · 무기 · 던진 것 초기화 ·
    hk:restart 때 던진 것 치움 · 시험 구역 자기 폭발로 멈추지 않음 · 위 끝에서 쏴도 반동이 아래로 안 감 · 훈련장 상자는 넘어감(속도 이어짐)."""
    ok = True
    G = "() => FG.gfx.renderer.info.memory.geometries"
    def fresh():
        pg = s.page([HK_SPY])
        pg.goto(HOST + BODY_URL, wait_until="load")
        wait_ready(pg, 5000)
        return pg
    pg = fresh()
    geo = [pg.evaluate(G)]
    for i in range(8):
        pg.click("#btnSortie" if i % 2 == 0 else "#btnRange")
        _phase_wait(pg, "play")
        pg.evaluate("() => __fps.simulateHk('hk:restart')")
        _to_title(pg)   # S9 — hk:restart 는 작전 고르기로 감. 시험 구역 단추는 타이틀에
        geo.append(pg.evaluate(G))
    ok &= _check(notes, geo[-1] == geo[-3] == geo[-5] and geo[-2] == geo[-4] == geo[-6],
                 f"시험 구역 · 훈련장을 번갈아 다시 시작 8번 — geometries {geo}(번갈아 같은 값, 쌓이지 않음)")
    # 같은 구역 다시 시작 — 과녁 체력 · 무기 동작 · 던진 것
    pg.click("#btnSortie"); _phase_wait(pg, "play")
    pg.evaluate("""() => { __fps.pauseLoop(); FG.combat.targets[0].hp = 60; __fps.setInput({fire: true}); __fps.step(0.3); __fps.setInput({fire: null}); __fps.step(0.2);
        __fps.press('reload'); __fps.step(0.1); }""")
    a = pg.evaluate("() => ({ w: FG.weapons.state, hp: FG.combat.targets[0].hp })")
    pg.evaluate("() => __fps.spawnProjectile('grenade', [0, 1, 0], [0, 4, -4], 3)")
    np0 = pg.evaluate("() => __fps.projectiles().length")
    pg.evaluate("() => __fps.simulateHk('hk:restart')")
    np1 = pg.evaluate("() => ({ n: __fps.projectiles().length, ph: FG.game.phase, taint: FG.arcade.tainted })")
    _to_title(pg)
    pg.evaluate("() => __fps.spawnProjectile('grenade', [0, 1, 0], [0, 4, -4], 3)")   # 타이틀에서 남은 것이 있어도 출격이 치움
    pg.click("#btnSortie"); _phase_wait(pg, "play")
    b = pg.evaluate("() => { __fps.pauseLoop(); return { w: FG.weapons.state, hp: FG.combat.targets[0].hp, np: __fps.projectiles().length, mag: __fps.weapon().mag }; }")
    ok &= _check(notes, a["hp"] == 60 and a["w"] == "reload" and b["hp"] == 100 and b["w"] == "idle" and b["np"] == 0 and np0 >= 1 and np1["n"] == 0 and np1["ph"] == "select" and not np1["taint"],
                 f"같은 구역 다시 시작: 과녁 체력 {a['hp']} → {b['hp']} · 무기 {a['w']} → 첫 단계 전 {b['w']} · 던진 것 {np0} → hk:restart {np1['n']}(작전 고르기) → 출격 {b['np']} · 시험 표시 {np1['taint']}")
    # 시험 구역 자기 폭발 · 위 끝 반동
    c = pg.evaluate("""() => { const e = __fps.state().pos; __fps.explodeAt([e[0], e[1] + 0.3, e[2] - 0.5], 'rocket'); __fps.step(0.1);
        const hp = FG.player.hp, alive = FG.player.alive; __fps.setHp(100); __fps.look(0, 89); __fps.step(0.6); const n0 = __fps.weapon().shots;
        __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        return { hp, alive, shot: __fps.weapon().shots - n0, rp: FG.weapons.recoil.pitch * 180 / Math.PI }; }""")
    ok &= _check(notes, c["alive"] and c["hp"] >= 1 and c["shot"] == 1 and c["rp"] >= 0,
                 f"시험 구역 t0 발밑 천둥통 → 쓰러지지 않음(체력 {c['hp']} · S7 쓰러짐 단계 전까지 safe) · 89° 보고 한 발 → 반동 {c['rp']:.3f}° ≥ 0")
    # 훈련장 넘기 상자 — 넘어가고 속도가 이어짐
    pg = fresh()
    pg.click("#btnRange"); _phase_wait(pg, "play")
    v = pg.evaluate("""() => { __fps.pauseLoop(); __fps.teleportTo('tr.vault'); __fps.look(0, 0); __fps.step(0.3); const pr = __fps.vaultProbe();
        __fps.setInput({moveZ: 1}); __fps.step(0.3); __fps.press('jump'); let end = null;
        for (let k = 0; k < 60; k++) { __fps.step(1/60); const s = __fps.state(); if (!end && s.stance === 'stand' && k > 3) end = +Math.hypot(s.vel[0], s.vel[2]).toFixed(2); }
        __fps.clearInput(); const ev = __fps.events().filter(e => e.type === 'vaultEnd').slice(-1)[0];
        return { pr, end, over: ev ? ev.payload.over : null, y: __fps.state().pos[1] }; }""")
    ok &= _check(notes, v["pr"] and v["pr"]["over"] and v["over"] and v["end"] and v["end"] >= 4.0 and abs(v["y"] - 3) < 0.05,
                 f"훈련장 낮은 상자 넘기: 미리 보기 {v['pr']} · 넘기 끝 over {v['over']} · 끝난 순간 수평 속도 {v['end']}m/s(걷기 이상 이어짐) · 갑판 높이 {v['y']}")
    ok &= _check(notes, not s.errors and not s.external and not s.missing, f"(새 화면) 오류 0 {s.errors[:4]}")
    summary["regress"] = {"geometries": geo, "restart": b, "vault": v}
    return ok


# ───────────────────────────── shoot(S5 — 장비 · 효과 · 훈련장) ─────────────────────────────

def _hue_ok(rgb):
    """붉은 입자 금지 — 채도가 있는 색은 색상각 28°~ 200°(노랑 · 주황 · 물빛)만, 채도 낮은 회색 · 갈색은 통과."""
    r, g, b = rgb
    mx, mn = max(rgb), min(rgb)
    if mx <= 0:
        return True, 0, 0
    sat = (mx - mn) / mx
    if mx == mn:
        hue = 0.0
    elif mx == r:
        hue = (60 * ((g - b) / (mx - mn)) + 360) % 360
    elif mx == g:
        hue = 60 * ((b - r) / (mx - mn)) + 120
    else:
        hue = 60 * ((r - g) / (mx - mn)) + 240
    return (sat < 0.3) or (28 <= hue <= 200), round(hue, 1), round(sat, 2)


def _shoot_s5(pg, s, J, out, notes, summary, defs):
    ok = True
    s5 = {}
    # A) 부착물 9종 · 칸 제한
    att = J("() => __fps.attachDefs()")
    n9 = sum(len([k for k in att[c] if isinstance(att[c][k], dict)]) for c in ("optic", "muzzle", "mag"))
    ok &= _check(notes, n9 == 9 and all(att[c][k].get("pro") and att[c][k].get("con") for c in ("optic", "muzzle", "mag") for k in att[c]),
                 f"부착물 9종(칸마다 장점 1 + 단점 1): {[(c, [att[c][k]['name'] for k in att[c]]) for c in ('optic', 'muzzle', 'mag')]}")
    r = pg.evaluate("""() => { const o = {};
        __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'gotgan' } } }); __sh.reset !== undefined; o.big = __fps.weapon();
        __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'multtae' } } }); o.fast = __fps.weapon();
        __fps.setLoadout({ primary: 'neoreok', secondary: 'sondeung', attach: { primary: { optic: 'banditbul', mag: 'gotgan' } } }); o.sg = __fps.weapon();
        __fps.setLoadout({ primary: 'cheondung', secondary: 'sondeung', attach: { primary: { optic: 'maenun', muzzle: 'sombang', mag: 'gotgan' } } }); o.rk = __fps.weapon();
        return o; }""")
    big, fast, sg, rk = r["big"], r["fast"], r["sg"], r["rk"]
    ok &= _check(notes, big["cap"] == 45 and big["mag"] == 45 and abs(big["mods"]["reload"][0] - 2.2) < 1e-6 and abs(big["mods"]["reload"][1] - 2.8) < 1e-6 and abs(big["mods"]["ads"] - 0.28) < 1e-6,
                 f"큰 탄창 「곳간」: 탄창 30 → {big['cap']}(+50%) · 재장전 {big['mods']['reload']}(+0.4) · 조준 {big['mods']['ads']}초(+0.03)")
    ok &= _check(notes, fast["cap"] == 24 and abs(fast["mods"]["reload"][0] - 1.35) < 1e-6 and abs(fast["mods"]["reload"][1] - 1.8) < 1e-6,
                 f"빠른 탄창 「물때」: 탄창 {fast['cap']}(−20%) · 재장전 {fast['mods']['reload']}(×0.75)")
    ok &= _check(notes, sg["att"]["optic"] == "iron" and sg["att"]["mag"] == "gotgan" and sg["cap"] == 9 and rk["att"] == {"optic": "iron", "muzzle": "none", "mag": "std"} and rk["cap"] == 1,
                 f"칸 제한: 산탄총 조준경 칸 없음 {sg['att']}(탄창 6 → {sg['cap']}) · 발사기 부착물 없음 {rk['att']}")
    # 큰 탄창 실제 반영 — 쏘고 전술 재장전 → 45 + 약실 1, 시간 2.2초, HUD 탄약
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'gotgan' } } });
        __fps.resetTargets({hp: 1e6}); __fps.teleportTo('t0.range'); __fps.step(0.3); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.step(0.2);
        const m = __sh.mark(); __fps.press('reload'); __sh.stepUntil(['reloadEnd'], 4, m); await __sh.raf();
        return { e: __sh.ev(m, ['reloadEnd']), w: __fps.weapon(), hud: __fps.hud() }; }""")
    re_ = r["e"][0]["p"] if r["e"] else None
    ok &= _check(notes, re_ and re_["kind"] == "tac" and re_["mag"] == 46 and abs(re_["t"] - 2.2) < 0.02 and r["hud"]["ammo"]["mag"] == "46",
                 f"큰 탄창 반영: 전술 재장전 {re_ and re_['t']}초 → 탄창 {re_ and re_['mag']}(45 + 약실 1) · HUD 「{r['hud']['ammo']['mag']} {r['hud']['ammo']['reserve']}」")
    # 소음기 — shot.silenced · 경계 반경 12 · 총구 화염 숨김 · 소리 · 감쇠 −15%
    r = pg.evaluate("""async () => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { muzzle: 'sombang' } } });
        __fps.teleportTo('t0.range'); __fps.step(0.3); __fps.aimAt('tg2'); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        await __sh.raf(); const vm = __fps.vm(); const sh = __sh.ev(m, ['shot'])[0].p; __fps.step(0.3);
        const d = FG.cfg.WEAPONS.nuwool;
        return { sh, vm, au: __fps.audio(), f: [FG.combat.falloff(d, 28, 0.85), FG.combat.falloff(d, 28, 1), FG.combat.falloff(d, 51, 0.85)] }; }""")
    ok &= _check(notes, r["sh"]["silenced"] and r["sh"]["noise"] == 12 and not r["vm"]["flash"] and "sup" in r["vm"]["att"] and r["au"]["played"].get("shot_sil", 0) >= 1
                 and r["f"][1] == 28 and r["f"][0] < 28 and r["f"][2] == 20,
                 f"소음기 「솜방망이」: silenced · 경계 반경 {r['sh']['noise']}m(40 → 12) · 총구 화염 {r['vm']['flash']} · 모델 {r['vm']['att']} · 소리 shot_sil · 28m 피해 {r['f'][1]} → {round(r['f'][0], 2)}(감쇠 거리 −15%)")
    # 반동 억제기 — 수직 킥 ×0.8 · 조준 +0.04
    r = pg.evaluate("""() => { const k = (att) => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: att } }); __fps.teleportTo('t0.range'); __fps.step(0.3);
        __fps.aimAt([0, 1.5, -19.6]); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.4); return [__sh.ev(m, ['shot'])[0].p.kick, __fps.weapon().mods.ads]; };
        return { base: k({}), dat: k({ muzzle: 'dat' }) }; }""")
    ok &= _check(notes, abs(r["dat"][0][0] - r["base"][0][0] * 0.8) < 1e-3 and abs(r["dat"][1] - 0.29) < 1e-6,
                 f"반동 억제기 「닻」: 첫 탄 수직 킥 {r['base'][0][0]}° → {r['dat'][0][0]}°(×0.8) · 조준 {r['dat'][1]}초(+0.04)")
    # 조준경 — 반딧불 ×1.4(가운데 청록 점) · 매눈 ×2.5(원형 덮개 · 조준 중 이동 −15%)
    r = pg.evaluate("""async () => { const o = {};
        for (const op of ['banditbul', 'maenun']) { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { optic: op } } }); __fps.teleportTo('t0.range');
          __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf(); o[op] = { fov: __fps.camDir().fov, hud: __fps.hud(), vm: __fps.vm(), w: __fps.weapon(), mm: FG.weapons.moveMul() };
          if (op === 'banditbul') { await __sh.raf(); o.shot = true; } __fps.setInput({ads: null}); __fps.step(0.5); }
        return o; }""")
    pg.screenshot(path=str(out / "shoot-dot.png")) if False else None
    import math
    fov14 = 2 * math.degrees(math.atan(math.tan(math.radians(37.5)) / 1.4))
    fov25 = 2 * math.degrees(math.atan(math.tan(math.radians(37.5)) / 2.5))
    b, mn = r["banditbul"], r["maenun"]
    ok &= _check(notes, abs(b["fov"] - fov14) < 0.05 and b["hud"]["dot"] and "dot" in b["vm"]["att"] and b["vm"]["sightY"] > 0.1 and abs(b["w"]["mods"]["ads"] - 0.28) < 1e-6,
                 f"점 조준경 「반딧불」: 조준 시야각 {b['fov']}°(×1.4 = {fov14:.2f}) · 가운데 청록 점 {b['hud']['dot']} · 모델 {b['vm']['att']} · 조준선 높이 {b['vm']['sightY']} · 조준 {b['w']['mods']['ads']}초")
    ok &= _check(notes, abs(mn["fov"] - fov25) < 0.05 and mn["hud"]["scope"] and mn["vm"]["hidden"] and abs(mn["mm"] - 0.95 * 0.6 * 0.85) < 1e-3 and abs(mn["w"]["mods"]["ads"] - 0.33) < 1e-6,
                 f"배율 조준경 「매눈」: 시야각 {mn['fov']}°(×2.5) · 원형 덮개 {mn['hud']['scope']} · 총 숨김 {mn['vm']['hidden']} · 조준 중 이동 배율 {round(mn['mm'], 4)}(0.95 × 0.6 × 0.85) · 조준 {mn['w']['mods']['ads']}초")
    J("() => { __fps.setInput({ads: true}); }")
    pg.evaluate("""async () => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { optic: 'banditbul', muzzle: 'dat', mag: 'gotgan' } } });
        __fps.teleportTo('t0.range'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf(); await __sh.raf(); }""")
    pg.screenshot(path=str(out / "shoot-dot.png"))
    J("() => { __fps.clearInput(); }")

    # B) 근접 V — 1.5m 안 1회 무력화(방탄 2회) · 밖이면 헛침 · 재장전 취소
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets(); const o = {};
        const at = (id, d) => { const t = __fps.targets().find(x => x.id === id); __fps.teleport(t.pos[0], t.pos[1], t.pos[2] + d, 0); __fps.look(0, -5); __fps.step(0.1); };
        at('tg1', 1.3); let m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); o.near = __sh.ev(m, ['melee', 'meleeHit', 'meleeMiss', 'hit', 'targetDown']);
        __fps.resetTargets(); at('tg1', 1.95); m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); o.far = __sh.ev(m, ['meleeHit', 'meleeMiss', 'hit']);
        at('tg3', 1.3); m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); __fps.press('melee'); __fps.step(0.7); o.arm = __sh.ev(m, ['meleeHit', 'hit']);
        __fps.resetTargets(); at('tg1', 6); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.step(0.2); __fps.press('reload'); __fps.step(0.4);
        m = __sh.mark(); const mag = __fps.weapon().mag; __fps.press('melee'); __fps.step(0.1); o.cancel = __sh.ev(m, ['reloadCancel', 'melee']); o.st = __fps.weapon().state; o.mag = [mag, __fps.weapon().mag];
        let t0 = null, t1 = null; for (let k = 0; k < 60; k++) { const w = __fps.weapon(); if (w.state === 'melee' && t0 === null) t0 = __fps.state().time; if (t0 !== null && w.state !== 'melee') { t1 = __fps.state().time; break; } __fps.step(1/60); }
        o.dur = t0 !== null && t1 !== null ? t1 - t0 + 0.1 : null; return o; }""")
    near_hit = [x for x in r["near"] if x["type"] == "hit"]
    ok &= _check(notes, any(x["type"] == "meleeHit" for x in r["near"]) and near_hit and near_hit[0]["p"]["kind"] == "melee" and near_hit[0]["p"]["killed"]
                 and any(x["type"] == "targetDown" for x in r["near"]),
                 f"근접 V: 1.3m 과녁 → {[x['type'] for x in r['near']]} · 한 번에 무력화({near_hit and near_hit[0]['p']['dmg']})")
    ok &= _check(notes, [x["type"] for x in r["far"]] == ["meleeMiss"], f"근접 1.95m(1.5m 밖) → {[x['type'] for x in r['far']]}")
    arm = [x["p"] for x in r["arm"] if x["type"] == "hit"]
    ok &= _check(notes, len(arm) == 2 and not arm[0]["killed"] and arm[1]["killed"], f"방탄 과녁 근접 2회 무력화 {[(a['dmg'], a['killed']) for a in arm]}")
    ok &= _check(notes, r["cancel"] and r["cancel"][0]["type"] == "reloadCancel" and r["cancel"][0]["p"]["why"] == "melee" and r["st"] == "melee" and r["dur"] and abs(r["dur"] - 0.6) < 0.04,
                 f"재장전 중 V → 재장전 취소({r['cancel'] and r['cancel'][0]['p']['why']}) · 근접 경직 {r['dur'] and round(r['dur'], 3)}초(0.6)")

    # C) 벽 앞 총 거두기 — 총구 앞 0.6m 안이 벽이면 못 쏨 · 총이 올라감
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({}); __fps.teleport(-8, 0, -18.95, 0); __fps.look(0, 0); __fps.step(0.3);
        const m = __sh.mark(); __fps.setInput({fire: true, ads: true}); __fps.step(0.3); __fps.setInput({fire: null, ads: null}); await __sh.raf(); await __sh.raf();
        const a = { w: __fps.weapon(), shots: __sh.ev(m, ['shot']).length, ev: __sh.ev(m, ['blocked']), vm: __fps.vm(), st: __fps.state().gunBlocked };
        __fps.teleport(-8, 0, -17.6, 0); __fps.step(0.2); const m2 = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.1);
        a.after = { shots: __sh.ev(m2, ['shot']).length, blocked: __fps.weapon().blocked };
        __fps.teleport(-8, 0, -18.95, 0); __fps.look(0, -80); __fps.step(0.2); a.floor = __fps.weapon().blocked; return a; }""")
    ok &= _check(notes, r["st"] and r["shots"] == 0 and r["w"]["adsT"] == 0 and r["vm"]["blockK"] > 0.5 and r["after"]["shots"] == 1 and not r["after"]["blocked"] and not r["floor"],
                 f"벽 앞 총 거두기: 벽까지 0.6m → 막힘 {r['st']} · 발사 {r['shots']}발 · 조준 {r['w']['adsT']} · 총 올림 {r['vm']['blockK']} / 물러서면 발사 {r['after']['shots']}발 / 바닥을 보면 안 막힘({r['floor']})")

    # D) 발사기 — 날아가는 탄(70m/s) → 맞은 곳 폭발
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({ primary: 'cheondung', secondary: 'sondeung' }); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('t0.range'); __fps.step(0.5);
        const a = __fps.aimAt('tg2'); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        const fly = __fps.projectiles(); __sh.stepUntil(['explode'], 2, m); return { a, fly, e: __sh.ev(m, ['shot', 'projSpawn', 'rocketHit', 'explode', 'hit']) }; }""")
    sp = next((x for x in r["e"] if x["type"] == "projSpawn"), None)
    rh = next((x for x in r["e"] if x["type"] == "rocketHit"), None)
    hx = next((x["p"] for x in r["e"] if x["type"] == "hit"), None)
    tt = (rh["t"] - sp["t"]) if sp and rh else None
    ok &= _check(notes, r["fly"] and r["fly"][0]["kind"] == "rocket" and rh and rh["p"]["target"] == "tg2" and hx and hx["kind"] == "explosion" and tt is not None and abs(tt - r["a"]["dist"] / 70) < 0.05,
                 f"발사기 「천둥통」: 날아가는 탄 {r['fly'] and r['fly'][0]['kind']} → {r['a']['dist']}m 를 {tt and round(tt, 3)}초(70m/s) 뒤 과녁에 맞아 폭발 · 피해 {hx and (hx['kind'], hx['dmg'])}")

    # E) 기대기 켬 → 섬광 키 4(실제 키보드) · G(실제 키보드)
    keys = J("() => __fps.setControls({ lean: true })")
    pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.teleportTo('t0.range'); __fps.look(0, 10); __fps.step(0.3); window.__m5 = __sh.mark(); __fps.resumeLoop(); }""")
    pg.keyboard.down("Digit4"); pg.wait_for_timeout(250); pg.keyboard.up("Digit4"); pg.wait_for_timeout(500)
    pg.keyboard.down("KeyG"); pg.wait_for_timeout(250); pg.keyboard.up("KeyG"); pg.wait_for_timeout(400)
    r = pg.evaluate("() => { __fps.pauseLoop(); return __sh.ev(window.__m5, ['cook', 'throw']).map(x => [x.type, x.p.kind]); }")
    keys2 = J("() => __fps.setControls({ lean: false })")
    ok &= _check(notes, keys["flash"] == "Digit4" and keys["leanL"] == "KeyQ" and ["cook", "flash"] in r and ["throw", "flash"] in r and ["throw", "grenade"] in r and keys2["flash"] == "KeyQ",
                 f"기대기 켬 → 섬광 키 {keys['flash']}(기대기 {keys['leanL']}/{keys['leanR']}) · 실제 키 4 · G → {r} · 끄면 섬광 {keys2['flash']}")
    pg.evaluate("() => { __sh.stepUntil(['explode'], 4); __sh.stepUntil(['explode'], 4); __fps.step(0.5); }")

    # F) 훈련장 구역 — 관통(나무 판자 · 얇은 철판 뚫림 ×0.5 · 콘크리트 막힘)
    z = J("() => __fps.loadZone('tr')")
    tg = J("() => __fps.targets().map(t => t.id)")
    ok &= _check(notes, z == ["tr"] and tg == ["tgWood", "tgConc", "tgSteel", "tgOpen", "tgCover", "buoy1", "buoy2", "buoy3"], f"훈련장 구역 tr · 과녁 {tg}")
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('tr.range'); __fps.step(0.3); const o = {};
        for (const id of ['tgWood', 'tgConc', 'tgSteel']) { __fps.aimAt(id); __fps.setInput({ads: true}); __fps.step(0.4); __fps.aimAt(id); const m = __sh.mark();
          __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.3); o[id] = __sh.ev(m, ['impact', 'hit']).map(x => x.type === 'hit' ? ['hit', x.p.targetId, x.p.dmg, x.p.pen] : ['impact', x.p.mat, x.p.kind, x.p.pen, x.p.thick || null]); }
        __fps.setInput({ads: null}); return o; }""")
    w, c, st = r["tgWood"], r["tgConc"], r["tgSteel"]
    ok &= _check(notes, w[0][:4] == ["impact", "wood", "bullet", True] and w[1][:3] == ["impact", "wood", "exit"] and w[-1][:2] == ["hit", "tgWood"] and abs(w[-1][2] - 14) < 1e-6 and w[-1][3] == 1,
                 f"나무 판자 관통: {w} → 피해 28 × 0.5 = {w[-1][2] if w and w[-1][0] == 'hit' else None}")
    ok &= _check(notes, c == [["impact", "concrete", "bullet", False, None]], f"콘크리트 막힘: {c}(과녁 피해 없음)")
    ok &= _check(notes, st and st[-1][:2] == ["hit", "tgSteel"] and abs(st[-1][2] - 14) < 1e-6, f"얇은 철판 관통: {st}")

    # G) 수류탄 — 반경 5m 안 과녁 피해 · 엄폐(콘크리트 벽) 뒤 무피해 · 반경 밖 무피해
    r = pg.evaluate("""() => { __fps.resetTargets(); const o = {};
        let m = __sh.mark(); __fps.explodeAt([12, 0.8, -22], 'grenade'); __fps.step(1/60); o.inR = __sh.ev(m, ['hit']).map(x => [x.p.targetId, x.p.dmg, x.p.kind]);
        __fps.resetTargets(); m = __sh.mark(); __fps.explodeAt([12, 0.8, -27.2], 'grenade'); __fps.step(1/60); o.outR = __sh.ev(m, ['hit']).map(x => [x.p.targetId, x.p.dmg]);
        o.dOut = Math.min(...__fps.targets().map(t => Math.hypot(t.parts.torso[0] - 12, t.parts.torso[1] - 0.8, t.parts.torso[2] + 27.2)));
        o.dOpen = Math.hypot(10 - 12, 1.75 - 0.8); o.dCover = Math.hypot(14.4 - 12, 1.75 - 0.8);
        o.los = [__fps.los([12, 0.8, -22], [10, 1.75, -22]), __fps.los([12, 0.8, -22], [14.4, 1.75, -22])];
        return o; }""")
    ids = [x[0] for x in r["inR"]]
    exp = 150 + (20 - 150) * min(1, r["dOpen"] / 5)
    ok &= _check(notes, ids == ["tgOpen"] and abs(r["inR"][0][1] - exp) < 0.05 and r["los"] == [True, False] and r["dCover"] < 5,
                 f"수류탄 반경 5m: 드러난 과녁({r['dOpen']:.2f}m) 피해 {r['inR']} · 벽 뒤 과녁({r['dCover']:.2f}m, 시야 {r['los'][1]}) 무피해")
    ok &= _check(notes, r["outR"] == [] and 5 < r["dOut"] < 6, f"반경 밖(가장 가까운 과녁 {r['dOut']:.2f}m) 무피해 {r['outR']}")
    # 실제로 던지기 — 쿠킹 0.5초 → 퓨즈 3초(쥔 시간 포함) · 궤적 점 30개 · 첫 닿는 곳 ≈ 궤적 끝 · 튕김
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.resetTargets(); __fps.teleportTo('tr.range'); __fps.aimAt([12, 0.8, -22]); __fps.turn(0, 12); __fps.step(0.3);
        const g0 = __fps.state().gear.grenade; const m = __sh.mark(); __fps.setInput({grenade: true}); __fps.step(0.5); await __sh.raf(); const fx = __fps.fx(); const hud = __fps.hud();
        __fps.setInput({grenade: null}); __fps.step(1/60); const g1 = __fps.state().gear.grenade; const ex = __sh.stepUntil(['explode'], 4, m);
        return { fx, hud, g0, g1, e: __sh.ev(m, ['cook', 'throw', 'projSpawn', 'bounce', 'projRest', 'explode', 'hit']) }; }""")
    ev = {x["type"]: x for x in reversed(r["e"])}
    cook, thr, bnc, ex = ev.get("cook"), ev.get("throw"), next((x for x in r["e"] if x["type"] == "bounce"), None), ev.get("explode")
    fuse_t = (ex["t"] - cook["t"]) if cook and ex else None
    arc_d = None
    if bnc and r["fx"]["arcEnd"]:
        a2, b2 = bnc["p"]["pos"], r["fx"]["arcEnd"]
        arc_d = math.dist(a2, b2)
    ok &= _check(notes, cook and thr and abs(thr["p"]["cooked"] - 0.5) < 0.03 and fuse_t is not None and abs(fuse_t - 3.0) < 0.03 and ex["p"]["kind"] == "grenade" and ex["p"]["by"] == "player",
                 f"수류탄 G 길게(쿠킹 {thr and thr['p']['cooked']}초) → 쥔 때부터 {fuse_t and round(fuse_t, 3)}초에 폭발(퓨즈 3초)")
    ok &= _check(notes, 10 <= r["fx"]["arc"] <= 30 and arc_d is not None and arc_d < 0.6 and r["hud"]["fuse"] and r["g1"] == r["g0"],
                 f"궤적 점 {r['fx']['arc']}개(≤ 30) · 첫 닿는 곳과 궤적 끝 차 {arc_d and round(arc_d, 3)}m · 남은 퓨즈 표시 「{r['hud']['fuse']}」 · 훈련장이라 개수 그대로 {r['g0']} → {r['g1']}")
    # 손에서 터짐(퓨즈 다 될 때까지 쥠) — 훈련장은 쓰러지지 않음(체력 1 남김)
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.teleportTo('tr.range'); __fps.step(0.2); const m = __sh.mark(); __fps.setInput({grenade: true}); __fps.step(3.2); __fps.setInput({grenade: null}); __fps.step(0.1);
        return { e: __sh.ev(m, ['throw', 'explode', 'playerHurt']), hp: __fps.state().hp }; }""")
    thr = next((x["p"] for x in r["e"] if x["type"] == "throw"), None)
    hurt = next((x["p"] for x in r["e"] if x["type"] == "playerHurt"), None)
    ok &= _check(notes, thr and thr["fuse"] == 0 and hurt and r["hp"] >= 1 and any(x["type"] == "explode" for x in r["e"]),
                 f"너무 오래 쥠 → 손에서 터짐(퓨즈 {thr and thr['fuse']}) · 플레이어 피해 {hurt and hurt['dmg']} · 훈련장이라 체력 {r['hp']} 남음")
    J("() => { __fps.setHp(100); __fps.step(0.1); }")

    # H) 섬광 — 반경 8m · 시야 트인 과녁 멍함 · 플레이어 흰빛(동작 줄이기면 회색 · 짧게)
    r = pg.evaluate("""async () => { __fps.resetTargets(); const o = {};
        let m = __sh.mark(); __fps.explodeAt([12, 0.8, -22], 'flash'); __fps.step(1/60); o.a = __sh.ev(m, ['stun', 'flashed']).map(x => [x.type, x.p.id || null, x.p.dur]);
        __fps.resetTargets(); const fp = [12, 0.8, -26];
        m = __sh.mark(); __fps.explodeAt(fp, 'flash'); __fps.step(1/60); o.b = __sh.ev(m, ['stun']).map(x => x.p.id);
        o.d = __fps.targets().map(t => [t.id, +Math.hypot(t.parts.head[0] - fp[0], t.parts.head[1] - fp[1], t.parts.head[2] - fp[2]).toFixed(2), __fps.los(fp, t.parts.head)]);
        o.exp = o.d.filter(x => x[1] <= 8 && x[2]).map(x => x[0]);
        __fps.teleportTo('tr.range'); __fps.look(0, 0); __fps.step(0.2); const e = __fps.state().eye;
        m = __sh.mark(); __fps.explodeAt([e[0], e[1] - 0.4, e[2] - 3], 'flash'); __fps.step(1/60); await __sh.raf(); o.me = __sh.ev(m, ['flashed']).map(x => x.p); o.hud = __fps.hud();
        o.tgs = __fps.targets().length;
        FG.cfg.CAMFX.REDUCE = true; __fps.step(1.6); await __sh.raf(); m = __sh.mark(); __fps.explodeAt([e[0], e[1] - 0.4, e[2] - 3], 'flash'); __fps.step(1/60); await __sh.raf();
        o.red = __fps.hud(); FG.cfg.CAMFX.REDUCE = false; __fps.step(1.6); await __sh.raf();
        return o; }""")
    stun_ids = [x[1] for x in r["a"] if x[0] == "stun"]
    out8 = [x for x in r["d"] if 8 < x[1] <= 10]
    ok &= _check(notes, stun_ids == ["tgOpen"] and not any(x[0] == "flashed" for x in r["a"]) and sorted(r["b"]) == sorted(r["exp"]) and len(r["b"]) >= 1 and out8,
                 f"섬광 반경 8m: 부잔교 가운데 → 멍함 {stun_ids}(벽 뒤 과녁 빠짐 · 18m 밖 플레이어 흰빛 없음) / 물 위에서 → {r['b']}(8m 안 · 시야 트인 것 {r['exp']}, 8m 밖 {out8})")
    me = r["me"][0] if r["me"] else None
    ok &= _check(notes, me and abs(me["dur"] - 1.5 * me["amount"]) < 0.01 and me["amount"] > 0.7 and r["hud"]["flash"]["on"] and r["hud"]["flash"]["opacity"] > 0.5 and not r["hud"]["flash"]["grey"],
                 f"플레이어 앞 3m 섬광 → 흰빛 {me and me['dur']}초(최대 1.5) · 덮개 {r['hud']['flash']}")
    ok &= _check(notes, r["red"]["flash"]["grey"] and 0 < r["red"]["flash"]["t"] <= 0.8 + 1e-6,
                 f"동작 줄이기 → 회색 · 짧게 {r['red']['flash']}")
    pg.screenshot(path=str(out / "shoot-range.png")) if False else None

    # I) 효과 — 붉은 입자 없음 · 탄흔 · 예광 · 탄피 · 점광 · 폭발 빛 · 화면 흔들림
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('tr.range'); __fps.aimAt('tgWood'); __fps.step(0.2);
        __fps.setInput({fire: true}); __fps.step(1/60); await __sh.raf(); const a = __fps.fx(); __fps.step(0.1); __fps.setInput({fire: null});
        __fps.explodeAt([12, 0.8, -22], 'grenade'); __fps.step(1/60); await __sh.raf(); const b = __fps.fx(); const cam = FG.camfx.state(); const sh = FG.camfx.shakeA; return { a, b, sh }; }""")
    pg.screenshot(path=str(out / "shoot-fx.png"))
    bad = []
    for col in r["b"]["colors"]:
        rgb = [float(x) for x in col.split(",")]
        good, hue, sat = _hue_ok(rgb)
        if not good:
            bad.append((col, hue, sat))
    ok &= _check(notes, r["a"]["tracers"] >= 1 and r["a"]["shells"] >= 1 and r["a"]["lights"] >= 1 and r["b"]["decals"] >= 3 and r["b"]["particles"] > 50 and r["b"]["blasts"] >= 1 and r["sh"] > 0,
                 f"효과: 예광 {r['a']['tracers']} · 탄피 {r['a']['shells']} · 총구 점광 {r['a']['lights']}/{r['a']['lightPool']} · 탄흔 {r['b']['decals']} · 입자 {r['b']['particles']} · 폭발 빛 {r['b']['blasts']} · 흔들림 {round(r['sh'], 3)}")
    ok &= _check(notes, not bad and len(r["b"]["colors"]) >= 5, f"붉은 입자 없음 — 쓴 색 {len(r['b']['colors'])}가지 모두 노랑 · 주황 · 회색 · 갈색 · 물빛 {bad}")
    s5["fx"] = r["b"]
    # 첫 폭발 끊김 없음 — 셰이더 프로그램 수가 폭발 전후 같음(미리 만들어 둠)은 새 페이지에서 따로 잼(아래)
    ok &= _check(notes, not s.errors and not s.external and not s.missing,
                 f"(첫 화면) 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")

    # J) 새 화면 — 타이틀에서 「훈련장」 실제 클릭 → 과제 6개를 __fps 입력만으로
    pg = s.page([HK_SPY])
    pg.goto(HOST + BODY_URL, wait_until="load")
    r_ok, _ = wait_ready(pg, 5000)
    prog0 = pg.evaluate("() => __fps.perf().programs")
    pg.click("#btnRange")
    ok &= _check(notes, r_ok and _phase_wait(pg, "play"), "타이틀 「훈련장」 실제 클릭 → play")
    pg.wait_for_timeout(400)
    pg.evaluate(SHOOT_JS)
    st = pg.evaluate(ST)
    hud0 = pg.evaluate("() => __fps.hud()")
    ok &= _check(notes, st["zones"] == ["tr"] and st["drill"]["active"] and hud0["drill"]["on"] and hud0["drill"]["items"] == 6 and hud0["drill"]["display"] == "block",
                 f"훈련장: 구역 {st['zones']} · 과제 표 {hud0['drill']['items']}칸 「{hud0['drill']['text'][:40]}…」")
    # 첫 폭발 · 첫 총구 점광 — 셰이더 다시 만들기 없음
    pg.evaluate("() => { __fps.pauseLoop(); const e = __fps.state().eye; __fps.explodeAt([e[0] + 3, e[1] - 2, e[2] - 9], 'grenade'); __fps.explodeAt([e[0] - 3, e[1] - 2, e[2] - 9], 'flash'); __fps.step(1/60); }")
    pg.evaluate("() => __sh.raf()"); pg.evaluate("() => __sh.raf()")
    prog1 = pg.evaluate("() => __fps.perf().programs")
    ok &= _check(notes, prog1 == prog0 and prog0 > 0, f"셰이더 미리 만들기: 첫 폭발 · 섬광 · 입자 그린 뒤 프로그램 수 {prog0} → {prog1}(새로 안 만듦 — 첫 폭발 끊김 없음)")
    drill = pg.evaluate("""async () => {
        const F = __fps; F.clearInput(); F.setHp(100); const m0 = __sh.mark(); const log = [];
        const stepUntil = (fn, sec) => { for (let k = 0; k < Math.round(sec * 60); k++) { F.step(1/60); if (fn()) return true; } return false; };
        const done = (id) => !!F.drill().done[id];
        // ① 둘러보기 · 걷기
        F.teleportTo('tr.spawn'); for (let k = 0; k < 4; k++) { F.turn(35, 0); F.step(0.05); } F.turn(-140, 0);
        F.setInput({moveZ: 1}); stepUntil(() => done('look'), 3); F.setInput({moveZ: null}); F.step(0.2); log.push(['look', done('look'), F.drill().progress]);
        // ② 허리 사격 · 조준 사격
        F.teleportTo('tr.range'); F.step(0.3);
        for (let k = 0; k < 8 && !F.drill().progress.hip; k++) { F.aimAt('buoy1'); F.setInput({fire: true}); F.step(1/60); F.setInput({fire: null}); F.step(0.3); }
        F.setInput({ads: true}); F.step(0.5);
        for (let k = 0; k < 8 && !F.drill().progress.ads; k++) { F.aimAt('buoy1'); F.setInput({fire: true}); F.step(1/60); F.setInput({fire: null}); F.step(0.3); }
        F.setInput({ads: null}); F.step(0.4); log.push(['aim', done('aim')]);
        // ③ 재장전 두 가지(전술 → 빈 탄창 자동)
        F.press('reload'); stepUntil(() => F.drill().progress.tac, 3);
        F.aimAt([0, 1, -40]); F.setInput({fire: true}); stepUntil(() => F.weapon().mag === 0, 6); F.setInput({fire: null}); stepUntil(() => done('reload'), 4); log.push(['reload', done('reload')]);
        // ④ 넘기 · 앉기 · 슬라이딩
        F.teleportTo('tr.vault'); F.look(0, 0); F.step(0.2); F.setInput({moveZ: 1}); F.press('jump');
        stepUntil(() => F.drill().progress.vault, 1.5); F.setInput({moveZ: null}); F.step(1.0);
        F.press('crouch'); F.step(0.3); F.press('crouch'); F.step(0.4);
        F.teleportTo('tr.slide'); F.look(0, 0); F.step(0.2); F.setInput({moveZ: 1, sprint: true}); F.step(0.6); F.press('crouch'); stepUntil(() => F.drill().progress.slide, 1);
        F.setInput({moveZ: null, sprint: null}); F.step(1.2); log.push(['move', done('move'), F.drill().progress]);
        // ⑤ 수류탄
        F.teleportTo('tr.range'); F.aimAt([12, 0.8, -22]); F.turn(0, 12); F.step(0.2); F.setInput({grenade: true}); F.step(0.4); F.setInput({grenade: null});
        stepUntil(() => done('grenade'), 4); log.push(['grenade', done('grenade')]);
        // ⑥ 창고 안 야간투시경
        F.teleportTo('tr.store'); F.step(0.2); F.press('nvg'); stepUntil(() => done('nvg'), 1); log.push(['nvg', done('nvg')]);
        F.step(0.1); await __sh.raf();
        return { log, d: F.drill(), ev: __sh.ev(m0, ['drillTask', 'drillDone']).map(x => [x.type, x.p.id || null]), hud: F.hud(), st: F.state() }; }""")
    pg.evaluate("() => __sh.raf()")
    pg.screenshot(path=str(out / "shoot-drill.png"))
    tasks = [x[1] for x in drill["ev"] if x[0] == "drillTask"]
    ok &= _check(notes, drill["d"]["finished"] and sorted(tasks) == sorted(["look", "aim", "reload", "move", "grenade", "nvg"]) and ["drillDone", None] in drill["ev"],
                 f"훈련장 과제 6개를 __fps 입력만으로 끝냄: 순서 {tasks} · drillDone · 과정 {[(x[0], x[1]) for x in drill['log']]}")
    ok &= _check(notes, drill["hud"]["drill"]["ok"] == 6 and "훈련 완료" in drill["hud"]["drill"]["text"] and drill["st"]["nvg"],
                 f"과제 표 체크 {drill['hud']['drill']['ok']}/6 · 「{drill['hud']['drill']['text'][:24]}…」 · 야간투시경 켬 {drill['st']['nvg']}")
    # 놀이 중 화면에 「다음 · 계속하기 · 이어서」 단추 없음(no-zoom.js Space) · hk 신호 없음(훈련장 — 단독)
    nb = pg.evaluate("""() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && /다음|계속하기|이어서/.test(b.textContent)).map(b => b.textContent)""")
    hk = pg.evaluate("() => window.__hkSeen")
    ok &= _check(notes, nb == [] and hk == [], f"놀이 중 보이는 「다음/계속하기/이어서」 단추 {nb} · hk 신호 {hk}(훈련장은 점수 없음)")
    summary["s5"] = {"drill_log": drill["log"], "fx_colors": s5.get("fx", {}).get("colors"), "shots": {
        "dot": str(out / "shoot-dot.png"), "fx": str(out / "shoot-fx.png"), "drill": str(out / "shoot-drill.png")}}
    return ok


# ───────────────────────────── perf ─────────────────────────────

PERF_WALK_JS = r"""(() => {
  // 실시간 고리에서 시험 구역을 원 그리며 걷고 가끔 달림(그리기 부하 대표값) — 하네스 전용
  __fps.setInput({moveZ: 1});
  let k = 0;
  window.__perfWalk = setInterval(() => {
    k++;
    __fps.turn(1.1, 0);
    if (k % 180 === 0) __fps.setInput({sprint: true});
    if (k % 180 === 90) __fps.setInput({sprint: null});
  }, 16);
  return true;
})()"""


def cmd_perf(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"sec": args.sec, "mission": args.mission, "quality": args.quality}
    if args.mission not in (None, "t0", "m1", "m2"):
        print("임무 측정은 지금 t0 · m1 · m2(S11a — 임무 2 지형) 만. m4 는 S13 부터")
        return finish("perf", False, {"error": "mission " + str(args.mission)}, [])
    if args.mission == "m1":
        return _perf_m1(args)
    if args.mission == "m2":
        return _perf_m2(args)
    if args.quality not in ("mid",):
        print("화질 단계(높음 · 낮음 · 자동)는 S14 에서 — 지금은 보통(mid)만")
        return finish("perf", False, {"error": "quality " + str(args.quality)}, [])
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?dbg=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            if args.ai:   # S6 — 시험 구역 t1(무리 A · B 8명) + 순찰 무리 C 6명 = 14명 깨어 있음 · 플레이어는 죽지 않게(god)
                n_ai = pg.evaluate("""() => { __fps.loadZone('t1'); __fps.god(true); __fps.infiniteAmmo(true);
                    const pat = [[-14, 0, 14], [14, 0, 14], [14, 0, -2], [-14, 0, -2]];
                    for (let k = 0; k < 6; k++) __fps.spawnEnemy({ group: 'C', state: 'patrol', pos: [-12 + k * 4.5, 0, 16], yaw: 180, patrol: pat, off: [k * 0.8, 0] });
                    __fps.teleport(0, 0, 8, 0); return __fps.enemies().filter(e => !__fps.ai().groups[e.group].dormant).length; }""")
                ok &= _check(notes, n_ai == 14, f"시험 구역 t1 · 깨어 있는 적 {n_ai}명")
            pg.evaluate(PERF_WALK_JS)
            if args.blast:  # S5 — 0.7초마다 앞 6m 에 수류탄 폭발(번갈아 섬광 · 발사기) — 첫 폭발도 측정 구간 안
                pg.evaluate("""() => { let k = 0; window.__perfBlast = setInterval(() => { if (!window.__blastOn) return; k++; const s = __fps.state(); const e = s.eye, y = s.yaw * Math.PI / 180;
                    const kind = k % 5 === 0 ? 'flash' : k % 3 === 0 ? 'rocket' : 'grenade';
                    __fps.explodeAt([e[0] + Math.sin(y) * 6.5, e[1] - 1.2, e[2] - Math.cos(y) * 6.5], kind); }, 700); }""")
                prog_before = pg.evaluate("() => __fps.perf().programs")
            if args.fire:   # S4 — 걸으며 연사(0.8초 쏘고 0.2초 쉼 · 탄 무한 · 재장전은 그대로)
                pg.evaluate("""() => { __fps.infiniteAmmo(true); let k = 0;
                    window.__perfFire = setInterval(() => { k++; __fps.setInput({fire: k % 5 !== 0 ? true : null}); }, 200); }""")
            pg.wait_for_timeout(3000)          # 몸풀기(셰이더 · 첫 프레임) — tdd-final §11-3 「시작 3초 뒤부터」
            pg.evaluate("() => __fps.perfReset()")
            if args.blast:
                pg.evaluate("() => { window.__blastOn = true; }")   # 첫 폭발이 측정 구간 안에 들어가게 재기 시작한 뒤에 켬
            pg.wait_for_timeout(int(args.sec * 1000))
            p = pg.evaluate("() => __fps.perf()")
            st = pg.evaluate(ST)
            dbg = pg.evaluate("() => { const d = document.getElementById('dbg'); return d ? { text: d.textContent, vis: d.offsetParent !== null || getComputedStyle(d).display !== 'none' } : null; }")
            shot = out / ("perf-ai.png" if args.ai else "perf-blast.png" if args.blast else "perf-fire.png" if args.fire else "perf-dbg.png")
            pg.screenshot(path=str(shot))
            pg.evaluate("() => { clearInterval(window.__perfWalk); clearInterval(window.__perfFire); clearInterval(window.__perfBlast); __fps.clearInput(); }")
            if args.blast:
                bl = pg.evaluate("() => __fps.fx().stats.blasts")
                summary["blasts"] = bl
                ok &= _check(notes, bl >= args.sec / 0.7 * 0.8, f"폭발 연속 중 측정 — 폭발 {bl}번(0.7초마다 · 수류탄 · 발사기 · 섬광)")
                ok &= _check(notes, p["over33"] == 0, f"폭발 연속 중 33ms 넘는 프레임 {p['over33']}개 = 0(첫 폭발 포함 — 셰이더 미리 만들기)")
                ok &= _check(notes, p["programs"] == prog_before, f"셰이더 프로그램 수 {prog_before} → {p['programs']}(폭발 · 입자 · 점광이 새로 만들지 않음)")
            if args.ai:
                a = pg.evaluate("() => __fps.ai()")
                ens = pg.evaluate("() => __fps.enemies()")
                states = {}
                for e in ens:
                    states[e["state"]] = states.get(e["state"], 0) + 1
                summary["ai"] = {"stats": a["stats"], "nav": a["nav"], "states": states, "people": a["people"]}
                ok &= _check(notes, len(ens) == 14 and a["stats"]["thinks"] > 0 and a["stats"]["shots"] > 0,
                             f"적 14명 측정 중 판단 {a['stats']['thinks']}번 · 시야 레이 {a['stats']['rays']} · 적 사격 {a['stats']['shots']}발 · 상태 {states} · 그린 사람 {a['people']['drawn']}")
                ok &= _check(notes, p["ms"]["ai"] <= 1.2, f"AI(판단 · 이동 · 사격 · 길찾기) {p['ms']['ai']}ms/프레임 ≤ 1.2ms(tdd-final §11-1) · A* {a['nav']['astar']}번 · 한 단계 최대 {a['nav']['perStepMax']}")
                # performance.now 는 헤드리스에서 0.1ms 단위라 단계마다 잰 값이 작게 나옴 — 고리를 붙잡고 10초(600단계)를 한꺼번에 재서
                # 적 14명 있을 때 − 없을 때 = AI 몫(단계당 = 60fps 프레임당)
                b = pg.evaluate("""() => { __fps.pauseLoop(); const t0 = performance.now(); __fps.step(10); const withAi = performance.now() - t0;
                    const st = __fps.enemies().reduce((o, e) => (o[e.state] = (o[e.state] || 0) + 1, o), {});
                    const n = __fps.enemies().length; __fps.killAll(); __fps.step(2.2);
                    const t1 = performance.now(); __fps.step(10); const noAi = performance.now() - t1; __fps.resumeLoop();
                    return { withAi: +withAi.toFixed(2), noAi: +noAi.toFixed(2), n, st, per: +((withAi - noAi) / 600).toFixed(4) }; }""")
                summary["aiBatch"] = b
                ok &= _check(notes, b["n"] == 14 and b["per"] <= 1.2,
                             f"고리 붙잡고 10초(600단계) 한꺼번에 — 적 {b['n']}명 {b['withAi']}ms · 없음 {b['noAi']}ms → AI {b['per']}ms/단계 ≤ 1.2ms · 그때 상태 {b['st']}")
            if args.fire:
                summary["shots"] = st["weapon"]["shots"]
                ok &= _check(notes, st["weapon"]["shots"] >= args.sec * 5, f"연사 중 측정 — 발사 {st['weapon']['shots']}발 · 무기 sim {p['ms']['shots']}ms/프레임")
            summary["perf"] = p
            summary["shot"] = str(shot)
            (out / ("perf-t1-ai.json" if args.ai else "perf-t0-blast.json" if args.blast else "perf-t0-fire.json" if args.fire else "perf-t0.json")).write_text(json.dumps(p, ensure_ascii=False, indent=1))
            ok &= _check(notes, st["phase"] == "play" and p["playFrames"] >= args.sec * 30 and p["measured"] >= args.sec * 30,
                         f"놀이 중 {p['sec']}초 측정 · 프레임 {p['measured']}개(큰 간격 {p['gaps']}개 뺌) · 지나간 길 {st['pos']}")
            lim = 100 if args.ai else 60 if (args.fire or args.blast) else 40
            ok &= _check(notes, 0 < p["callsMax"] <= lim, f"그리기 호출 최대 {p['callsMax']} ≤ {lim}({'S6 적 14명' if args.ai else 'S5 폭발 중' if args.blast else 'S4 연사 중' if args.fire else 'S3'} 기준 · 보통 화질 예산 {150})")
            ok &= _check(notes, p["trisMax"] <= 150000, f"삼각형 최대 {p['trisMax']} ≤ 150,000")
            ok &= _check(notes, p["over33Pct"] <= 1.0, f"33ms 넘는 프레임 {p['over33']}개 = {p['over33Pct']}% ≤ 1%")
            notes.append((True, f"(참고 · 헤드리스 M5) 중앙값 {p['ftMed']}ms · 95번째 {p['ftP95']}ms · 최대 {p['ftMax']}ms · fps {p['fpsMed']} · sim {p['ms']['sim']}ms "
                                f"(이동 · 충돌 {p['ms']['phys']}ms) · 그리기 준비 {p['ms']['render']}ms · 힙 {p['heapMB']}MB"))
            ok &= _check(notes, p["ms"]["phys"] <= 0.8, f"이동 · 충돌 sim {p['ms']['phys']}ms/프레임 ≤ 0.8ms(tdd-final §11-1)")
            ok &= _check(notes, dbg and dbg["vis"] and "fps" in dbg["text"] and "호출" in dbg["text"], f"?dbg=1 구석 표 {dbg['text'].splitlines()[:2] if dbg else None}")
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            # 아케이드(?hk=1)에서는 dbg 표를 띄우지 않음
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1&dbg=1", wait_until="load")
            pg.wait_for_function("() => window.FG && window.FG.perf && window.FG.game.phase === 'title'", timeout=5000)
            h = pg.evaluate("() => ({ dbg: !!document.getElementById('dbg'), on: FG.perf.dbgOn, fps: !!window.__fps })")
            ok &= _check(notes, not h["dbg"] and not h["on"] and not h["fps"], f"아케이드(?hk=1&dbg=1)에서는 구석 표 없음 · 시험 손잡이 없음 {h}")
        finally:
            s.close()
    return finish("perf", ok, summary, notes)


def _perf_m1(args):
    """S10b — 임무 1 「첫 불빛」 실제 판(적 14 · 아군 · 등대 소품)을 god · 자동 조종(시작 연출 건너뜀)으로 실시간 --sec 초 잰다(해안 교전 · 동굴 야간투시경 · 절벽 · 막사).
    이어서 등대 켜짐 → 선착장 돌파 구간(회전 빛줄기 · 보트 불빛 · 선착장 적 깨어남)을 20초 더 잰다.
    두 구간 모두 호출 ≤ 150 · 삼각형 ≤ 150k(보통 화질 예산), 33ms 초과 1% 이하, 구역 만들기 50ms 이하 · 합 300ms 이하, 구역별 최대 호출 · 삼각형,
    야간투시경 켠 구간 포함, 동굴 안 빛 낮춤, 하늘 · 생성 무늬 붙음, 오류 0. (S10a 의 지형만 걷기는 시험 작전 m1w — mission --id m1w)"""
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"sec": args.sec, "mission": "m1", "quality": args.quality}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?dbg=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            st0 = pg.evaluate("""() => { const t0 = performance.now(); const okm = __fps.startMission('m1', { seed: 3 }); const ms = performance.now() - t0;
                __fps.god(true); __fps.infiniteAmmo(true); __fps.autopilot(true);
                return { ok: okm, ms: +ms.toFixed(1), zones: __fps.world().zones, phase: __fps.state().phase, env: FG.gfx.envState(),
                    errs: FG.map.loaded.map(id => [id, FG.map.built[id].errors.length]) }; }""")
            zs = st0["zones"]
            summary["zones"] = zs
            summary["startMs"] = st0["ms"]
            ok &= _check(notes, st0["ok"] and st0["phase"] == "play" and list(zs.keys()) == ["m1z1", "m1z2", "m1z3", "m1z4", "m1z5"],
                         f"임무 1(실제 판 — 적 · 아군 · 소품) 시작 → play · 구역 {list(zs.keys())} · 자료 오류 {st0['errs']}")
            ok &= _check(notes, all(v["ms"] <= 50 for v in zs.values()) and sum(v["ms"] for v in zs.values()) <= 300,
                         "구역 만들기 " + " · ".join(f"{k} {v['ms']}ms(원시 {v['prims']} · 그림 삼각형 {v['visTris']} · 충돌 {v['collTris']} · 메시 {v['meshes']})" for k, v in zs.items())
                         + f" — 각 ≤ 50ms · 합 {round(sum(v['ms'] for v in zs.values()), 1)}ms ≤ 300ms(시작 전체 {st0['ms']}ms)")
            ok &= _check(notes, st0["env"]["dyn"] and st0["env"]["fog"][1] <= 140 and not st0["env"]["placeholder"],
                         f"새벽 분위기: 안개 {st0['env']['fog']} · 노출 {st0['env']['exposure']} · 해 그림자 따라감 · 어두운 곳 {st0['env']['darks']}개 · 자리표시 숨김")
            # 구역별 최대 호출 · 삼각형 · 야간투시경 · 빛 배수 — 0.25초마다 표본
            pg.evaluate("""() => { window.__m1 = { by: {}, nvgSamples: 0, nvgCalls: 0, minF: 1, t: [] };
                window.__m1T = setInterval(() => { const i = FG.gfx.renderer.info.render, P = FG.player.pos; const g = FG.nav.gridAt(P.x, P.z); const z = g ? g.id : '?';
                    const b = window.__m1.by[z] || (window.__m1.by[z] = { calls: 0, tris: 0, n: 0 }); b.calls = Math.max(b.calls, i.calls); b.tris = Math.max(b.tris, i.triangles); b.n++;
                    const e = FG.gfx.envState(); window.__m1.minF = Math.min(window.__m1.minF, e.f);
                    if (FG.nvgView.isOn()) { window.__m1.nvgSamples++; window.__m1.nvgCalls = Math.max(window.__m1.nvgCalls, i.calls); } }, 250); }""")
            pg.wait_for_timeout(3000)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(int(args.sec * 1000))
            p = pg.evaluate("() => __fps.perf()")
            m1 = pg.evaluate("() => { clearInterval(window.__m1T); return window.__m1; }")
            st = pg.evaluate("() => ({ s: __fps.state(), m: __fps.mission(), a: __fps.assets() })")
            pg.screenshot(path=str(out / "perf-m1.png"))
            summary["perf"] = p
            summary["byZone"] = m1["by"]
            (out / "perf-m1.json").write_text(json.dumps({"perf": p, "byZone": m1["by"], "zones": zs}, ensure_ascii=False, indent=1))
            ok &= _check(notes, st["s"]["phase"] in ("play", "result") and p["measured"] >= args.sec * 30 and not st["m"]["autopilot"]["stuck"],
                         f"실시간 {p['sec']}초 걸으며 측정 · 프레임 {p['measured']}개 · 지금 목표 {st['m']['objective']} · 자리 {st['s']['pos']} · 끼임 {st['m']['autopilot']['stuck']}")
            ok &= _check(notes, len(m1["by"]) >= 3, f"지나간 구역 {list(m1['by'].keys())}(구역별 최대 호출 · 삼각형 " + " · ".join(f"{k} {v['calls']}/{v['tris']}" for k, v in m1["by"].items()) + ")")
            ok &= _check(notes, 4 <= m1["nvgSamples"] <= args.sec * 4 * 0.6 and m1["minF"] <= 0.6 and not st["s"].get("nvg"),
                         f"동굴 구간만 야간투시경 켜고 측정 — 켠 표본 {m1['nvgSamples']}개(0.25초마다) · 그때 최대 호출 {m1['nvgCalls']} · 동굴 빛 배수 최저 {m1['minF']} · 동굴 나와서 끔")
            ok &= _check(notes, 0 < p["callsMax"] <= 150 and p["trisMax"] <= 150000,
                         f"그리기 호출 최대 {p['callsMax']} ≤ 150 · 삼각형 최대 {p['trisMax']} ≤ 150,000(보통 화질 예산)")
            notes.append((True, f"(참고) S10a 지형만 74 / 45.6k → 적 · 아군 · 효과 · 등대 소품이 더해진 지금 {p['callsMax']} / {p['trisMax']}"))
            ok &= _check(notes, p["over33Pct"] <= 1.0, f"33ms 넘는 프레임 {p['over33']}개 = {p['over33Pct']}% ≤ 1%")
            ok &= _check(notes, p["ms"]["phys"] <= 0.8, f"이동 · 충돌 sim {p['ms']['phys']}ms/프레임 ≤ 0.8ms(지형 삼각형 많아짐)")
            notes.append((True, f"(참고 · 헤드리스 M5) 중앙값 {p['ftMed']}ms · 95번째 {p['ftP95']}ms · 최대 {p['ftMax']}ms · fps {p['fpsMed']} · sim {p['ms']['sim']}ms · 그리기 준비 {p['ms']['render']}ms · 힙 {p['heapMB']}MB"))
            sky = st["a"]["sky"]
            looks = st["a"]["looks"]
            ok &= _check(notes, sky["name"] == "dawn" and all(k in looks for k in ("pebbles", "rock", "turf", "plaster", "wetground")),
                         f"하늘 {sky} · 생성 무늬 {looks}")
            # 구간 B — 등대 켜짐 → 선착장 돌파(회전 빛줄기 · 보트 불빛 · 깨어난 적 · 관측수 손전등) 20초 실시간
            pg.evaluate("""() => { __fps.autopilot(false); __fps.skipTo('o5'); const m = FG.map.mark('m1z4.genFront'); __fps.teleport(m[0], m[1] + 0.05, m[2], 0);
                FG.mission.completeObjective(); __fps.autopilot(true); }""")
            pg.wait_for_timeout(2500)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(20000)
            pb = pg.evaluate("() => __fps.perf()")
            sb = pg.evaluate("() => ({ props: FG.props.state(), m: __fps.mission(), en: __fps.enemies().filter(e => /g_dock|g_quay|g_spot/.test(e.group)).map(e => e.state), pos: __fps.state().pos })")
            pg.screenshot(path=str(out / "perf-m1-dock.png"))
            summary["dock"] = {"calls": pb["callsMax"], "tris": pb["trisMax"], "over33": pb["over33"], "ftP95": pb["ftP95"]}
            ok &= _check(notes, sb["props"]["on"] and sb["props"]["visible"] and pb["measured"] >= 20 * 30,
                         f"구간 B(등대 켜짐 → 선착장 돌파 20초): 빛줄기 켜짐 {sb['props']['on']} · 선착장 적 {sb['en']} · 목표 {sb['m']['objective'] and sb['m']['objective']['id']} · 결과 {sb['m']['result']} · 자리 {sb['pos']}")
            ok &= _check(notes, 0 < pb["callsMax"] <= 150 and pb["trisMax"] <= 150000 and pb["over33Pct"] <= 1.0,
                         f"구간 B 그리기 호출 최대 {pb['callsMax']} ≤ 150 · 삼각형 최대 {pb['trisMax']} ≤ 150,000 · 33ms 초과 {pb['over33']}개 = {pb['over33Pct']}% ≤ 1% (참고 중앙값 {pb['ftMed']}ms · 95번째 {pb['ftP95']}ms)")
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("perf", ok, summary, notes)


def _perf_m2(args):
    """S11a → S11b — 임무 2 「짠물 밸브」 실제 판(적 27 · 아군 바위 · 소품 — S11a 는 지형만 m2w)을 god · 자동 조종으로 실시간 --sec 초 잰다(둑길 → 정문 마당 → 펌프동 → …).
    이어서 구간 B 탱크 마당 증기 기둥 10초, 구간 C 45초 버티기(세 방향 웨이브 + 증기) 15초, 구간 D 폭파 뒤 창고 안 교전 10초를 따로 잰다. 호출 ≤ 150 · 삼각형 ≤ 150k(지형만 목표 110 · 110k), 33ms 초과 1% 이하,
    구역 만들기 각 ≤ 50ms · 합 ≤ 300ms, 구역별 최대 호출 · 삼각형, 흐린 하늘 · 생성 무늬, 오류 0."""
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"sec": args.sec, "mission": "m2", "quality": args.quality}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?dbg=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            st0 = pg.evaluate("""() => { const t0 = performance.now(); const okm = __fps.startMission('m2', { seed: 3 }); const ms = performance.now() - t0;
                __fps.god(true); __fps.autopilot(true);
                return { ok: okm, ms: +ms.toFixed(1), zones: __fps.world().zones, phase: __fps.state().phase, env: FG.gfx.envState(),
                    errs: FG.map.loaded.map(id => [id, FG.map.built[id].errors.length]), stats: FG.map.stats(), enemies: __fps.enemies().length }; }""")
            zs = st0["stats"]
            summary["zones"] = zs
            summary["startMs"] = st0["ms"]
            ok &= _check(notes, st0["ok"] and st0["phase"] == "play" and list(zs.keys()) == ["m2z1", "m2z2", "m2z3", "m2z4"] and all(e[1] == 0 for e in st0["errs"]),
                         f"임무 2 실제 판(적 {st0.get('enemies')}명 · 아군 바위) 시작 → play · 구역 {list(zs.keys())} · 자료 오류 {st0['errs']}")
            ok &= _check(notes, all(v["ms"] <= 50 for v in zs.values()) and sum(v["ms"] for v in zs.values()) <= 300,
                         "구역 만들기 " + " · ".join(f"{k} {v['ms']}ms(원시 {v['prims']} · 그림 삼각형 {v['visTris']} · 충돌 {v['collTris']} · 메시 {v['meshes']})" for k, v in zs.items())
                         + f" — 각 ≤ 50ms · 합 {round(sum(v['ms'] for v in zs.values()), 1)}ms ≤ 300ms(시작 전체 {st0['ms']}ms)")
            ok &= _check(notes, st0["env"]["dyn"] and st0["env"]["fog"][1] >= 180 and not st0["env"]["placeholder"],
                         f"흐린 낮 분위기: 안개 {st0['env']['fog']}(임무 1 은 12 ~ 125m — 더 멀리 보임) · 노출 {st0['env']['exposure']} · 해 그림자 따라감 · 어두운 곳(건물 안) {st0['env']['darks']}개")
            pg.evaluate("""() => { window.__m2 = { by: {} };
                window.__m2T = setInterval(() => { const i = FG.gfx.renderer.info.render, P = FG.player.pos; const g = FG.nav.gridAt(P.x, P.z); const z = g ? g.id : '?';
                    const b = window.__m2.by[z] || (window.__m2.by[z] = { calls: 0, tris: 0, n: 0 }); b.calls = Math.max(b.calls, i.calls); b.tris = Math.max(b.tris, i.triangles); b.n++; }, 250); }""")
            pg.wait_for_timeout(3000)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(int(args.sec * 1000))
            p = pg.evaluate("() => __fps.perf()")
            m2 = pg.evaluate("() => { clearInterval(window.__m2T); return window.__m2; }")
            st = pg.evaluate("() => ({ s: __fps.state(), m: __fps.mission(), a: __fps.assets() })")
            pg.screenshot(path=str(out / "perf-m2.png"))
            summary["perf"] = p
            summary["byZone"] = m2["by"]
            (out / "perf-m2.json").write_text(json.dumps({"perf": p, "byZone": m2["by"], "zones": zs}, ensure_ascii=False, indent=1))
            ok &= _check(notes, st["s"]["phase"] in ("play", "result") and p["measured"] >= args.sec * 30 and not st["m"]["autopilot"]["stuck"],
                         f"실시간 {p['sec']}초 걸으며 측정 · 프레임 {p['measured']}개 · 지금 목표 {st['m']['objective'] and st['m']['objective']['id']} · 자리 {st['s']['pos']} · 끼임 {st['m']['autopilot']['stuck']}")
            ok &= _check(notes, len(m2["by"]) >= 2, f"지나간 구역 {list(m2['by'].keys())}(적과 싸우며 60초 — 탱크 마당 · 창고는 아래 구간 C · D)(구역별 최대 호출 · 삼각형 " + " · ".join(f"{k} {v['calls']}/{v['tris']}" for k, v in m2["by"].items()) + ")")
            ok &= _check(notes, 0 < p["callsMax"] <= 150 and p["trisMax"] <= 150000,
                         f"그리기 호출 최대 {p['callsMax']} ≤ 150 · 삼각형 최대 {p['trisMax']} ≤ 150,000(보통 화질 예산 — 적 · 아군 · 소품 포함)")
            notes.append((True, f"(참고) 임무 1 실제 판(S10b) 98 / 51.9k · 임무 2 지형만(S11a) 67 / 63.1k → 임무 2 실제 판 {p['callsMax']} / {p['trisMax']}"))
            ok &= _check(notes, p["over33Pct"] <= 1.0, f"33ms 넘는 프레임 {p['over33']}개 = {p['over33Pct']}% ≤ 1%")
            ok &= _check(notes, p["ms"]["phys"] <= 0.8, f"이동 · 충돌 sim {p['ms']['phys']}ms/프레임 ≤ 0.8ms")
            notes.append((True, f"(참고 · 헤드리스 M5) 중앙값 {p['ftMed']}ms · 95번째 {p['ftP95']}ms · 최대 {p['ftMax']}ms · fps {p['fpsMed']} · sim {p['ms']['sim']}ms · 그리기 준비 {p['ms']['render']}ms · 힙 {p['heapMB']}MB"))
            sky = st["a"]["sky"]
            looks = st["a"]["looks"]
            ok &= _check(notes, sky["name"] == "overcast" and all(k in looks for k in ("salt", "rustplate", "corrugated", "concrete", "planks", "burlap", "wetground")),
                         f"하늘 {sky} · 생성 무늬 {looks}")
            # 구간 B — 탱크 마당에서 증기 기둥을 보며 10초
            pg.evaluate("""() => { __fps.autopilot(false); __fps.clearInput(); const v = FG.map.mark('m2z3.vent'), e = FG.map.mark('m2z3.entry');
                __fps.teleport(e[0], e[1] + 0.05, e[2], 340); __fps.look(340, 8);
                FG.world.smokeAdd({ id: 'perf', x: v[0], y: v[1], z: v[2], r: 3.4, h: 11, dur: 14 }); }""")
            pg.wait_for_timeout(1500)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(10000)
            pb = pg.evaluate("() => __fps.perf()")
            sb = pg.evaluate("() => FG.props.state().steam")
            pg.screenshot(path=str(out / "perf-m2-steam.png"))
            summary["steam"] = {"calls": pb["callsMax"], "tris": pb["trisMax"], "over33": pb["over33"], "puffs": sb["puffs"]}
            ok &= _check(notes, sb["columns"] == 1 and sb["puffs"] >= 40 and 0 < pb["callsMax"] <= 150 and pb["trisMax"] <= 150000 and pb["over33Pct"] <= 1.0,
                         f"구간 B(증기 기둥 10초 — 뭉게 {sb['puffs']}개 · 기둥 {sb['columns']}): 호출 최대 {pb['callsMax']} ≤ 150 · 삼각형 {pb['trisMax']} ≤ 150,000 · 33ms 초과 {pb['over33']}개 = {pb['over33Pct']}% (참고 중앙값 {pb['ftMed']}ms)")
            # 구간 C — 45초 버티기(장치 앞): 앞 무리를 치우고 버티기 목표로 → 웨이브가 차례로 깸 + 증기 기둥 · 15초
            pg.evaluate("""() => { for (const g of ['g_cause', 'g_yard', 'g_yardN', 'g_pump', 'g_pumpH', 'g_valve', 'g_tank']) __fps.killGroup(g);
                if (__fps.mission().objective.id === 'o7') { FG.mission.M.defendT = 0; FG.mission.M.objT0 = FG.mission.now(); } else __fps.skipTo('o7');   // 버티기 처음부터(웨이브는 이미 깼으면 그대로)
                const d = FG.map.mark('m2z3.defend'), v = FG.map.mark('m2z3.vent'); __fps.teleport(d[0], d[1] + 0.05, d[2], 330); __fps.look(330, 4); __fps.autopilot(true);
                FG.world.smokeAdd({ id: 'perfC', x: v[0], y: v[1], z: v[2], r: 3.4, h: 11, dur: 12 }); }""")
            pg.wait_for_timeout(13000)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(15000)
            pc = pg.evaluate("() => __fps.perf()")
            nc = pg.evaluate("() => ({ alive: __fps.enemies().filter(e => !e.down && /^g_w/.test(e.group)).length, awake: Object.keys(FG.ai.groups).filter(k => /^g_w/.test(k) && !FG.ai.groups[k].dormant), obj: __fps.mission().objective && __fps.mission().objective.id })")
            pg.screenshot(path=str(out / "perf-m2-defend.png"))
            summary["defend"] = {"calls": pc["callsMax"], "tris": pc["trisMax"], "over33": pc["over33"], "awake": nc["awake"]}
            ok &= _check(notes, 0 < pc["callsMax"] <= 150 and pc["trisMax"] <= 150000 and pc["over33Pct"] <= 1.0 and len(nc["awake"]) >= 3 and nc["obj"] in ("o7", "o8"),
                         f"구간 C(버티기 시작 13초 뒤부터 15초 — 웨이브 깸 {nc['awake']} · 살아 있는 웨이브 적 {nc['alive']} · 목표 {nc['obj']}): 호출 최대 {pc['callsMax']} ≤ 150 · 삼각형 {pc['trisMax']} ≤ 150,000 · 33ms 초과 {pc['over33']}개 = {pc['over33Pct']}% (참고 중앙값 {pc['ftMed']}ms)")
            # 구간 D — 폭파 뒤 창고 안(선반 사이 교전) 10초
            pg.evaluate("""() => { __fps.autopilot(false); for (const g of ['g_wSW', 'g_wRoof', 'g_wStair', 'g_wN']) __fps.killGroup(g); __fps.skipTo('o10'); }""")
            pg.wait_for_timeout(3500)
            pg.evaluate("""() => { const m = FG.map.mark('m2z4.inside'); __fps.teleport(m[0], m[1] + 0.05, m[2], 0); __fps.look(0, 2); __fps.autopilot(true); }""")
            pg.wait_for_timeout(1500)
            pg.evaluate("() => __fps.perfReset()")
            pg.wait_for_timeout(10000)
            pd = pg.evaluate("() => __fps.perf()")
            nd = pg.evaluate("() => ({ open: !FG.world.dynGet('blast').enabled, obj: __fps.mission().objective && __fps.mission().objective.id, pos: __fps.state().pos })")
            pg.screenshot(path=str(out / "perf-m2-warehouse.png"))
            summary["warehouse"] = {"calls": pd["callsMax"], "tris": pd["trisMax"], "over33": pd["over33"]}
            ok &= _check(notes, nd["open"] and 0 < pd["callsMax"] <= 150 and pd["trisMax"] <= 150000 and pd["over33Pct"] <= 1.0,
                         f"구간 D(폭파 뒤 창고 안 10초 — 문 열림 {nd['open']} · 목표 {nd['obj']}): 호출 최대 {pd['callsMax']} ≤ 150 · 삼각형 {pd['trisMax']} ≤ 150,000 · 33ms 초과 {pd['over33']}개 = {pd['over33Pct']}% (참고 중앙값 {pd['ftMed']}ms)")
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("perf", ok, summary, notes)


# ───────────────────────────── ai(S6 — 사람 모델 · 적 AI 기본) ─────────────────────────────

AI_JS = r"""(() => {
  // 하네스 전용 도우미 — 시험 구역 t1 · 고리 붙잡기(step 으로만 진행) · 사건 고르기
  const H = window.__ai = {};
  H.setup = (seed) => { __fps.pauseLoop(); __fps.loadZone('t1'); __fps.god(true); __fps.setSeed(seed || 7); __fps.navResetStats(); return __fps.enemies().length; };
  // 구역 무리(A · B)를 치움 — 쓰러뜨리고 2.2초 → 목록에서 빠짐
  H.clearSquads = () => { __fps.killAll(); __fps.step(2.2); return __fps.enemies().length; };
  H.ev = (since, types) => __fps.events(since).filter(e => types.indexOf(e.type) >= 0).map(e => ({ t: +e.t.toFixed(3), type: e.type, p: e.payload }));
  H.mark = () => (window.FG.bus.count);
  H.en = (id) => __fps.enemies().find(e => e.id === id) || null;
  H.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // 상태가 바뀔 때까지 dt 씩 진행(최대 sec) → {t, e}
  H.until = (id, fn, sec, dt) => { const d = dt || 0.05; const t0 = __fps.state().time; for (let k = 0; k * d < sec; k++) { const e = H.en(id); if (e && fn(e)) return { t: +(__fps.state().time - t0).toFixed(3), e }; __fps.step(d); } return { t: null, e: H.en(id) }; };
  H.crouch = () => { if (__fps.state().stance !== 'crouch') __fps.press('crouch'); __fps.step(0.4); return __fps.state().stance; };
  // 한 발만 — 쏠 수 있게 될 때까지 누르고 있다가 한 발 나가면 뗌
  H.fireOne = () => { const n0 = __fps.weapon().shots; __fps.setInput({ fire: true }); for (let k = 0; k < 90 && __fps.weapon().shots === n0; k++) __fps.step(1 / 60); __fps.setInput({ fire: null }); return __fps.weapon().shots - n0; };
  H.stand = () => { for (let k = 0; k < 3 && __fps.state().stance !== 'stand'; k++) { __fps.press(__fps.state().stance === 'prone' ? 'prone' : 'crouch'); __fps.step(0.4); } return __fps.state().stance; };
  return true;
})()"""


def cmd_ai(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            def fresh(seed=7):
                pg = s.page([HK_SPY])
                pg.goto(HOST + BODY_URL, wait_until="load")
                wait_ready(pg, 5000)
                pg.click("#btnSortie")
                _phase_wait(pg, "play")
                pg.evaluate(AI_JS)
                n = pg.evaluate("(sd) => __ai.setup(sd)", seed)
                return pg, n

            # ── 1) 구역 t1 · 무리 2개 · 판정 몸 · 길찾기 격자 · 엄폐 점
            pg, n = fresh()
            J = pg.evaluate
            en = J("() => __fps.enemies()")
            bodies = J("() => __fps.bodies().filter(b => b.team === 'enemy')")
            info = J("() => __fps.navInfo()")
            cov = J("() => __fps.covers()")
            hi = sum(1 for c in cov if c["kind"] == "high")
            groups = sorted({e["group"] for e in en})
            ok &= _check(notes, n == 8 and groups == ["A", "B"] and all(e["state"] == "patrol" for e in en) and len(bodies) == 8 and all(b["hittable"] for b in bodies),
                         f"시험 구역 t1: 적 {n}명 · 무리 {groups} · 모두 순찰 · 판정 몸 {len(bodies)}개 등록")
            ok &= _check(notes, info and info["walk"] > 4000 and len(cov) >= 40 and hi >= 10,
                         f"길찾기 격자 {info['nx']}×{info['nz']}칸(0.5m) 중 걸을 수 있는 칸 {info['walk']} · 엄폐 점 {len(cov)}개(높음 {hi})")
            # 서 있는 판정 몸 = 과녁 치수(머리 1.62 · 몸통 1.0~1.3)
            b0 = bodies[0]
            e0 = next(e for e in en if e["id"] == b0["id"])
            ok &= _check(notes, abs(b0["head"][1] - e0["pos"][1] - 1.62) < 1e-3 and abs(b0["torso"][0][1] - e0["pos"][1] - 1.0) < 1e-3,
                         f"서 있는 적 판정 몸 — 머리 {b0['head'][1] - e0['pos'][1]:.2f}m · 몸통 {b0['torso'][0][1] - e0['pos'][1]:.2f}~{b0['torso'][1][1] - e0['pos'][1]:.2f}m(과녁과 같음)")

            # ── 2) 순찰 · 길찾기 대기열(단계당 A* ≤ 2) · 끼임 없음
            m0 = J("() => __ai.mark()")
            p0 = {e["id"]: e["pos"] for e in en}
            J("() => __fps.step(6)")
            en2 = J("() => __fps.enemies()")
            moved = [round(((e["pos"][0] - p0[e["id"]][0]) ** 2 + (e["pos"][2] - p0[e["id"]][2]) ** 2) ** 0.5, 2) for e in en2]
            bad = J("(m) => __ai.ev(m, ['aiStuck', 'aiNoPath'])", m0)
            aist = J("() => __fps.ai()")
            ok &= _check(notes, all(x > 1.0 for x in moved) and all(e["state"] == "patrol" for e in en2) and not bad and aist["nav"]["perStepMax"] <= 2,
                         f"6초 순찰: 모두 움직임 {moved}m · 끼임/길 없음 사건 {len(bad)} · 한 단계 A* 최대 {aist['nav']['perStepMax']}(≤ 2) · A* {aist['nav']['astar']}번")
            summary["patrol"] = {"moved": moved, "nav": aist["nav"]}

            # ── 3) 길찾기: 높은 벽 돌아가기 · 줄 당기기 · 캐시 · 대기열
            r = J("() => __fps.navPath([2, 0, 8], [2, 0, 0])")
            segs = J("(r) => { const pts = [[2, 0, 8]].concat(r.pts); const out = []; for (let k = 1; k < pts.length; k++) out.push(__fps.navLos(pts[k - 1], pts[k])); return out; }", r)
            plen = 0.0
            pts = [[2, 0, 8]] + r["pts"]
            for k in range(1, len(pts)):
                plen += ((pts[k][0] - pts[k - 1][0]) ** 2 + (pts[k][2] - pts[k - 1][2]) ** 2) ** 0.5
            straight = J("() => __fps.navLos([2, 0, 8], [2, 0, 0])")
            ch0 = J("() => __fps.ai().nav.cacheHits")
            J("() => __fps.navPath([2, 0, 8], [2, 0, 0])")
            ch1 = J("() => __fps.ai().nav.cacheHits")
            ok &= _check(notes, r["ok"] and all(segs) and not straight and 8.0 < plen < 14 and len(r["pts"]) <= 6 and ch1 == ch0 + 1,
                         f"높은 벽(2.2m) 너머 길: 곧장은 막힘 · 돌아가는 길 {len(r['pts'])}점 {plen:.1f}m(직선 8m) · 점 사이 모두 격자 직선 시야(줄 당기기) · 같은 길 다시 → 캐시")
            q = J("""() => { const ids = []; for (let k = 0; k < 6; k++) ids.push(__fps.spawnEnemy({ group: 'Q', state: 'idle', pos: [-15 + k * 6, 0, 18] }));
                __fps.navResetStats();
                const goals = [[-14, 0, -27], [-6, 0, -27], [0, 0, -12], [8, 0, -27], [14, 0, -10], [-17, 0, 0]];
                ids.forEach((id, k) => __fps.enemyCmd(id, 'goto', { at: goals[k] }));
                const per = []; for (let k = 0; k < 5; k++) { __fps.step(1 / 60); per.push(__fps.ai().nav.thisStep); }
                const st = __fps.ai().nav; const got = ids.map(id => FG.ai.get(id).path ? 1 : 0);
                ids.forEach(id => FG.ai.force(id, 'idle')); return { per, max: st.perStepMax, astar: st.astar, got }; }""")
            ok &= _check(notes, q["max"] <= 2 and q["per"][:3] == [2, 2, 2] and sum(q["got"]) >= 5,
                         f"길 요청 6개 한꺼번에 → 단계마다 A* {q['per']}(최대 {q['max']} ≤ 2) · 길 받은 적 {sum(q['got'])}/6")

            # ── 4) 소리: 40m 안 총성 → 경계, 40m 밖 · 소음기 12m 밖은 그대로
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __fps.spawnEnemy({ id: 'T1', group: 'T', state: 'idle', pos: [-8, 0, -3], yaw: 0 });
                __fps.spawnEnemy({ id: 'T2', group: 'U', state: 'idle', pos: [-18, 0, -20], yaw: 0 });
                __fps.teleportTo('t1.pcover'); __ai.crouch(); __fps.look(180, -5); }""")
            m0 = J("() => __ai.mark()")
            J("() => { __ai.fireOne(); __fps.step(0.3); }")
            sh = J("(m) => __ai.ev(m, ['shot'])", m0)
            org = sh[0]["p"]["origin"] if sh else [0, 1, 22.75]
            en = J("() => __fps.enemies()")
            exp, got = {}, {}
            for e in en:
                d = ((e["pos"][0] - org[0]) ** 2 + (e["pos"][1] + 1 - org[1]) ** 2 + (e["pos"][2] - org[2]) ** 2) ** 0.5
                exp[e["id"]] = d <= 40
                got[e["id"]] = e["state"] == "alert"
            dist = {e["id"]: round(((e["pos"][0] - org[0]) ** 2 + (e["pos"][2] - org[2]) ** 2) ** 0.5, 1) for e in en}
            heard = J("(m) => __ai.ev(m, ['aiHeard'])", m0)
            t1 = J("() => __ai.en('T1')")
            t2s = J("() => __ai.en('T2').state")
            ok &= _check(notes, len(sh) == 1 and exp == got and got["T1"] and not got["T2"] and t1["why"] == "shot" and any(not v for v in exp.values()),
                         f"총성 한 발(소리 반경 {sh[0]['p']['noise'] if sh else '?'}m) → 0.3초 뒤 40m 안만 경계: T1 {dist.get('T1')}m {t1['state']} · T2 {dist.get('T2')}m {t2s} · "
                         f"무리 A·B {[(k, dist[k], 'alert' if got[k] else 'x') for k in sorted(dist) if k.startswith('e')][:4]}…")
            # 경계한 적은 소리 난 쪽으로 감
            J("() => __fps.step(2)")
            t1b = J("() => __ai.en('T1')")
            ok &= _check(notes, t1b["state"] == "alert" and t1b["pos"][2] > -3 + 1.0,
                         f"경계한 T1 이 소리 난 쪽으로 이동(z {-3} → {t1b['pos'][2]})")
            # 소음기(솜방망이) — 12m
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.setLoadout({ primary: 'nuwool', attach: { primary: { muzzle: 'sombang' } } });
                __fps.spawnEnemy({ id: 'S1', group: 'T', state: 'idle', pos: [0, 0, 13], yaw: 0 });
                __fps.spawnEnemy({ id: 'S2', group: 'U', state: 'idle', pos: [0, 0, 6.5], yaw: 0 });
                __fps.teleportTo('t1.pcover'); __ai.crouch(); __fps.look(180, -5); __fps.step(0.6); }""")
            m0 = J("() => __ai.mark()")
            J("() => { __ai.fireOne(); __fps.step(0.3); }")
            sh = J("(m) => __ai.ev(m, ['shot'])", m0)
            s1, s2 = J("() => __ai.en('S1')"), J("() => __ai.en('S2')")
            ok &= _check(notes, sh and sh[0]["p"]["silenced"] and sh[0]["p"]["noise"] == 12 and s1["state"] == "alert" and s2["state"] == "idle",
                         f"소음기 총성(반경 {sh[0]['p']['noise'] if sh else '?'}m): 약 10m 적 {s1['state']} · 약 16m 적 {s2['state']}")

            # ── 5) 시야 → 발견 게이지 → 교전(+ 뒤돈 적은 못 봄)
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.teleportTo('t1.open'); __fps.look(0, 0);
                __fps.spawnEnemy({ id: 'V1', group: 'V', state: 'idle', pos: [0, 0, -7], yaw: 180 });
                __fps.spawnEnemy({ id: 'V2', group: 'W', state: 'idle', pos: [6, 0, -7], yaw: 0 }); }""")
            m0 = J("() => __ai.mark()")
            trace = J("""() => { const out = []; for (let k = 0; k < 60; k++) { const a = __ai.en('V1'), b = __ai.en('V2'); out.push([+(k * 0.1).toFixed(1), a.gauge, a.state, b.gauge, b.state]);
                if (a.state === 'engage') break; __fps.step(0.1); } return out; }""")
            sts = J("(m) => __ai.ev(m, ['aiState'])", m0)
            v1s = [x["p"]["to"] for x in sts if x["p"]["id"] == "V1"]
            te = trace[-1][0]
            mono = all(trace[k][1] >= trace[k - 1][1] - 1e-9 for k in range(1, len(trace)))
            ok &= _check(notes, trace[-1][2] == "engage" and 0.4 <= te <= 4.0 and mono and v1s[:2] == ["alert", "engage"] and trace[-1][3] == 0 and trace[-1][4] == "idle",
                         f"15m 정면 · 서 있는 플레이어: 게이지 {[round(x[1], 2) for x in trace[::4]]} → {te}초에 교전(경계 → 교전 {v1s}) · 뒤돈 V2 게이지 {trace[-1][3]} {trace[-1][4]}")
            summary["gauge"] = {"engageAt": te, "trace": trace}

            # ── 6) 교전 사격: 반응 시간 · 첫 발 빗나감(옆 0.5~1.5m · 뒤에 탄흔) · 확률 명중 · 토큰
            J("() => __fps.god(false)")
            m1 = J("() => __ai.mark()")
            t_eng = next(x["t"] for x in sts if x["p"]["id"] == "V1" and x["p"]["to"] == "engage")
            J("() => { for (let k = 0; k < 200 && (__fps.ai().stats.shots < 8 || __fps.state().hp >= 100); k++) __fps.step(0.1); }")
            es = J("(m) => __ai.ev(m, ['enemyShot', 'playerHurt', 'impact', 'shot'])", m1)
            v1shots = [x for x in es if x["type"] == "enemyShot" and x["p"]["id"] == "V1"]
            first = v1shots[0] if v1shots else None
            t_first = first["t"] if first else None
            misses = [x["p"] for x in es if x["type"] == "enemyShot" and not x["p"]["hit"] and x["p"]["canHit"] and x["p"]["passBy"] is not None]
            early = [x["p"] for x in es if x["type"] == "enemyShot" and not x["p"]["hit"] and x["p"]["canHit"] and x["p"]["passBy"] is None]
            hits = [x["p"] for x in es if x["type"] == "enemyShot" and x["p"]["hit"]]
            hurt = [x["p"] for x in es if x["type"] == "playerHurt"]
            imp = [x["p"] for x in es if x["type"] == "impact" and x["p"]["by"] != "player"]
            hp = J("() => __fps.state().hp")
            pb = [m["passBy"] for m in misses]
            react = J("() => FG.cfg.DIFF[FG.cfg.DIFFICULTY].react")
            st6 = J("() => __fps.ai()")
            ok &= _check(notes, first and not first["p"]["hit"] and first["p"]["first"] and first["p"]["canHit"] and t_first - t_eng >= react - 0.05,
                         f"반응 시간 {react}초 뒤 첫 발({round(t_first - t_eng, 2) if first else None}초) = 일부러 빗나감(경고 사격)")
            ok &= _check(notes, misses and all(0.45 <= x <= 1.6 for x in pb) and len(imp) >= 1 and all(H_dist(i["pos"], [0, 1, 8]) > 0.5 for i in imp),
                         f"빗나간 탄 {len(misses)}발 — 플레이어 가슴 옆 {sorted(pb)[:6]}m 로 지나감(+ 플레이어 앞 엄폐물에 먼저 맞은 것 {len(early)}) · 뒤 바닥/벽 탄흔 {len(imp)}개")
            ok &= _check(notes, hits and hurt and hp < 100 and abs(sum(h["taken"] for h in hurt) - (100 - hp)) < 0.5 and st6["stats"]["tokensMax"] <= 3,
                         f"명중 {len(hits)}발(확률 {[h['prob'] for h in hits][:3]}) → 플레이어 체력 100 → {hp:.0f}(받은 피해 {round(sum(h['taken'] for h in hurt), 1)}) · 동시 사격 최대 {st6['stats']['tokensMax']}(보통 3)")
            summary["fire"] = {"shots": len(v1shots), "hits": len(hits), "passBy": pb, "hp": hp, "firstAt": round(t_first - t_eng, 3) if first else None}

            # ── 7) 맞으면 엄폐 지점으로 → 숨음(판정 몸도 낮아져 탄이 엄폐물에) → 엿보며 사격
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0); __fps.infiniteAmmo(true);
                __fps.spawnEnemy({ id: 'C1', group: 'C', state: 'idle', pos: [-1.5, 0, 0], yaw: 0, hp: 400 }); __fps.step(0.2); }""")
            m0 = J("() => __ai.mark()")
            J("() => { __fps.aimAt('C1', 'torso'); __ai.fireOne(); __fps.step(0.25); }")
            c1 = J("() => __ai.en('C1')")
            pick = J("(m) => __ai.ev(m, ['coverPick', 'hit'])", m0)
            cp = next((x["p"] for x in pick if x["type"] == "coverPick"), None)
            hit1 = [x["p"] for x in pick if x["type"] == "hit" and x["p"]["targetId"] == "C1"]
            ok &= _check(notes, hit1 and c1["state"] == "cover" and c1["why"] == "hit" and cp is not None,
                         f"C1 맞음(피해 {hit1[0]['dmg'] if hit1 else None}) → 0.25초 안 엄폐(why {c1['why']}) · 고른 점 {cp['pos'] if cp else None} {cp['kind'] if cp else ''}")
            low = cp is not None and cp["kind"] == "low"
            hid = J("(low) => __ai.until('C1', e => e.coverPhase === 'hide' && (!low || e.crouch > 0.95), 6)", low)
            hb = J("() => __fps.bodies().find(b => b.id === 'C1')")
            eye = J("() => __fps.state().eye")
            cpos = cp["pos"] if cp else [0, 0, 0]
            losHead = J("(a) => __fps.los(a[0], a[1])", [eye, hb["head"]])
            near = H_dist(hid["e"]["pos"], cpos)
            hh = hb["head"][1] - hid["e"]["pos"][1]
            ok &= _check(notes, hid["t"] is not None and near < 0.4 and not losHead and (hh < 1.1 if low else hh > 1.5),
                         f"{hid['t']}초 뒤 엄폐 점에 숨음({cp['kind'] if cp else ''} — 점까지 {near:.2f}m · 앉음 {hid['e']['crouch']}) · 판정 머리 높이 {hh:.2f}m · 플레이어 눈 → 머리 시야 막힘")
            # 숨은 머리를 쏘면 엄폐물에 맞음
            m2 = J("() => __ai.mark()")
            hp0 = J("() => __ai.en('C1').hp")
            J("() => { __fps.aimAt('C1', 'head'); __fps.setInput({ fire: true }); __fps.step(0.2); __fps.setInput({ fire: null }); __fps.step(0.05); }")
            ev2 = J("(m) => __ai.ev(m, ['hit', 'impact'])", m2)
            hp1 = J("() => __ai.en('C1').hp")
            n_hit = len([x for x in ev2 if x["type"] == "hit"])
            n_imp = len([x for x in ev2 if x["type"] == "impact" and x["p"]["by"] == "player"])
            ok &= _check(notes, hp1 == hp0 and n_hit == 0 and n_imp >= 1,
                         f"숨은 머리 조준 사격 → 엄폐물에 맞음(impact {n_imp} · hit {n_hit} · 체력 {hp0} → {hp1})")
            pk = J("""() => { const ph = []; let shotFromCover = 0; const m = FG.bus.count;
                for (let k = 0; k < 120; k++) { __fps.step(0.05); const e = __ai.en('C1'); if (ph[ph.length - 1] !== e.coverPhase) ph.push(e.coverPhase); }
                shotFromCover = __fps.events(m).filter(x => x.type === 'enemyShot' && x.payload.id === 'C1').length;
                return { ph, shotFromCover, st: __ai.en('C1').state }; }""")
            ok &= _check(notes, "peek" in pk["ph"] and pk["ph"].count("hide") >= 1 and pk["shotFromCover"] >= 1 and pk["st"] == "cover",
                         f"엄폐 순환 6초: {pk['ph']} · 엿보며 쏜 탄 {pk['shotFromCover']}발")
            J("() => __fps.step(0.05)")
            pg.wait_for_timeout(150)
            pg.screenshot(path=str(out / "ai-cover.png"))

            # ── 8) 놓치면 추격(search) → 경계 → 순찰
            m3 = J("() => __ai.mark()")
            J("() => { __fps.setInput({ fire: null }); __fps.teleportTo('t1.shedIn'); }")
            sq = J("() => { const out = []; for (let k = 0; k < 160; k++) { __fps.step(0.25); const e = __ai.en('C1'); if (out[out.length - 1] !== e.state) out.push(e.state); if (e.state === 'patrol') break; } return out; }")
            tr = [(x["t"], x["p"]["to"], x["p"]["why"]) for x in J("(m) => __ai.ev(m, ['aiState'])", m3) if x["p"]["id"] == "C1"]
            order = [x[1] for x in tr]
            ok &= _check(notes, "search" in order and order[-1] == "patrol" and order.index("search") < len(order) - 1,
                         f"플레이어가 창고 안으로 사라짐 → {tr}")

            # ── 9) 쓰러짐: 플레이어 탄으로 처치 → 2.1초 뒤 목록 · 판정 몸에서 빠짐 · 그림은 흐려짐 · 25m 안 동료 경계
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.setLoadout({ primary: 'meondeung', attach: { primary: { muzzle: 'sombang' } } }); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0);
                __fps.spawnEnemy({ id: 'K1', group: 'K', state: 'idle', pos: [-1.5, 0, 6], yaw: 90 });
                __fps.spawnEnemy({ id: 'K2', group: 'K', state: 'idle', pos: [-14, 0, -6], yaw: 0 });
                __fps.spawnEnemy({ id: 'K3', group: 'K', state: 'idle', pos: [14, 0, -26], yaw: 0 }); __fps.step(0.1); }""")
            m0 = J("() => __ai.mark()")
            J("() => { for (let k = 0; k < 20 && __ai.en('K1').state !== 'down'; k++) { __fps.aimAt('K1', 'head'); __ai.fireOne(); __fps.step(0.1); } }")
            dn = J("(m) => __ai.ev(m, ['enemyDown', 'hit'])", m0)
            down = next((x for x in dn if x["type"] == "enemyDown" and x["p"]["id"] == "K1"), None)
            killed = [x for x in dn if x["type"] == "hit" and x["p"]["killed"] and x["p"]["byPlayer"]]
            k1 = J("() => __ai.en('K1')")
            kb = J("() => __fps.bodies().find(b => b.id === 'K1')")
            n_b0 = J("() => __fps.bodies().filter(b => b.team === 'enemy').length")
            J("() => __fps.step(1.2)")
            pg.wait_for_timeout(150)
            fade_mid = J("() => __fps.people()")
            pg.screenshot(path=str(out / "ai-down-fade.png"))
            dt_left = J("(m) => { const d = __fps.events(m).find(e => e.type === 'enemyDown'); return +(2.0 - (__fps.state().time - d.t)).toFixed(4); }", m0)
            J("(x) => __fps.step(x)", max(0.0, dt_left))
            still = J("() => __ai.en('K1')")
            J("() => __fps.step(0.15)")
            gone = J("() => __ai.en('K1')")
            rem = J("(m) => __ai.ev(m, ['enemyRemoved'])", m0)
            n_b1 = J("() => __fps.bodies().filter(b => b.team === 'enemy').length")
            pg.wait_for_timeout(150)
            ppl = J("() => __fps.people()")
            mates = {k: J(f"() => __ai.en('{k}').state") for k in ("K2", "K3")}
            k3why = J("() => __ai.en('K3').why")
            mate_why = J("() => __ai.en('K2').why")
            ok &= _check(notes, killed and down and k1["state"] == "down" and not kb["hittable"],
                         f"플레이어 탄(머리)으로 처치 → down · 판정 몸 꺼짐(맞힘 표시 처치 {len(killed)})")
            ok &= _check(notes, still is not None and still["state"] == "down" and gone is None and rem and abs(rem[0]["p"]["after"] - 2.1) < 0.02 and n_b1 == n_b0 - 1,
                         f"쓰러진 지 2.0초에는 남아 있음 → {rem[0]['p']['after'] if rem else None}초에 목록 · 판정 몸에서 빠짐(판정 몸 {n_b0} → {n_b1})")
            ok &= _check(notes, fade_mid["fadeMin"] < 0.9 and ppl["drawn"] == fade_mid["drawn"] - 1,
                         f"그림: 1.3초쯤 흐려짐 {fade_mid['fadeMin']}(망점 지우기) · 빠진 뒤 그린 사람 {fade_mid['drawn']} → {ppl['drawn']}")
            ok &= _check(notes, mates["K2"] == "alert" and mate_why == "mateDown" and mates["K3"] == "idle",
                         f"동료 쓰러짐(먼등불 + 소음기 한 발 — 총성 12m · 맞고 쓰러지기 전에 무리에 알릴 틈 없음): 25m 안 K2 {mates['K2']}({mate_why}) · 먼 K3 {mates['K3']}({k3why})")

            # ── 10) 적 탄은 엄폐 뒤 플레이어를 못 맞힘(제압 사격은 엄폐물에) → 일어서면 맞음
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.god(false); __fps.setHp(100); __fps.teleportTo('t1.pcover'); __ai.crouch(); __fps.look(0, 0);
                __fps.spawnEnemy({ id: 'P1', group: 'P', state: 'idle', pos: [-3, 0, 6], yaw: 180 });
                __fps.spawnEnemy({ id: 'P2', group: 'P', state: 'idle', pos: [4, 0, 9], yaw: 180 });
                __fps.enemyCmd('P1', 'engage'); __fps.enemyCmd('P2', 'engage'); __fps.aiOpts({ flank: false, grenade: false }); }""")
            m0 = J("() => __ai.mark()")
            # 적 자리는 고정(S7 측면 · 수류탄은 끔 — 여기서는 「탄이 엄폐를 못 뚫음」만 봄)(돌아 들어오지 못하게 0.1초마다 제자리로) — 엄폐 벽만이 막음
            HOLD = "() => { __fps.enemyCmd('P1', null, { pos: [-3, 0, 6] }); __fps.enemyCmd('P2', null, { pos: [4, 0, 9] }); }"
            J("(h) => { const hold = eval(h); for (let k = 0; k < 100; k++) { hold(); __fps.step(0.1); } }", HOLD)
            ev = J("(m) => __ai.ev(m, ['enemyShot', 'playerHurt', 'impact'])", m0)
            hp_hidden = J("() => __fps.state().hp")
            shots = [x["p"] for x in ev if x["type"] == "enemyShot"]
            imps = [x["p"] for x in ev if x["type"] == "impact" and x["p"]["by"] in ("P1", "P2")]
            on_wall = [i for i in imps if 21.7 <= i["pos"][2] <= 22.3 and abs(i["pos"][0]) <= 2.1]
            n_hit = sum(1 for x in shots if x["hit"])
            ok &= _check(notes, shots and n_hit == 0 and not any(x["canHit"] for x in shots) and hp_hidden == 100 and on_wall,
                         f"엄폐 벽(1.25m) 뒤에 앉은 플레이어 · 적 2명 고정 자리 교전: 10초 동안 적 탄 {len(shots)}발(제압 — 모두 몸까지 시야 막힘) · 명중 {n_hit} · 체력 {hp_hidden} · 엄폐 벽에 탄흔 {len(on_wall)}/{len(imps)}")
            J("() => __fps.step(0.05)")
            pg.wait_for_timeout(150)
            pg.screenshot(path=str(out / "ai-suppress.png"))
            m1 = J("() => __ai.mark()")
            J("() => { __fps.aiOpts({ flank: true, grenade: true }); __ai.stand(); for (let k = 0; k < 200 && __fps.state().hp >= 100; k++) __fps.step(0.1); }")   # 자리 풀어 줌 — 교전 · 엄폐 · 엿보기
            ev = J("(m) => __ai.ev(m, ['enemyShot'])", m1)
            hp_up = J("() => __fps.state().hp")
            ok &= _check(notes, hp_up < 100 and any(x["p"]["hit"] for x in ev),
                         f"일어서면(머리 · 가슴이 벽 위로) 보고 교전 → 맞음 — 체력 {hp_up:.0f} · 적 탄 {len(ev)}발 중 명중 {sum(1 for x in ev if x['p']['hit'])}")
            # 자리를 풀어 주면 적이 벽을 돌아 들어옴 — 그래도 명중은 모두 총구 → 몸 시야가 트였을 때만
            m2 = J("() => __ai.mark()")
            J("() => { __fps.setHp(100); __ai.crouch(); for (let k = 0; k < 120; k++) __fps.step(0.1); }")
            ev = [x["p"] for x in J("(m) => __ai.ev(m, ['enemyShot'])", m2)]
            fh = [x for x in ev if x["hit"]]
            ok &= _check(notes, all(x["canHit"] for x in fh) and all(x["canHit"] or not x["hit"] for x in ev),
                         f"자리를 풀면 돌아 들어와 쏨(12초 적 탄 {len(ev)}발 · 명중 {len(fh)}) — 명중은 모두 몸까지 시야가 트인 탄({sum(1 for x in fh if x['canHit'])}/{len(fh)})")

            # ── 11) 끼임 감지: 닫힌 문 너머로 가라고 하면 문에 막힘 → aiStuck → 다른 일
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __ai.clearSquads(); __fps.teleport(0, 0, 18, 0);
                __fps.spawnEnemy({ id: 'D1', group: 'D', state: 'alert', pos: [16.5, 0, -19], yaw: 0 }); __fps.step(0.1);
                __fps.enemyCmd('D1', 'alert', { at: [16.5, 0, -27] }); }""")
            m0 = J("() => __ai.mark()")
            t_m0 = J("() => __fps.state().time")
            # 문 앞에 닿는 때(z 가 더 줄지 않는 첫 단계)를 재며 5초
            arr = J("""() => { let last = 1e9, at = null; for (let k = 0; k < 50; k++) { __fps.step(0.1); const z = __ai.en('D1').pos[2];
                if (at === null && Math.abs(z - last) < 1e-3 && z < -23) at = __fps.state().time; last = z; } return at; }""")
            st = J("(m) => __ai.ev(m, ['aiStuck'])", m0)
            d1 = J("() => __ai.en('D1')")
            wait = round(st[0]["t"] - arr, 2) if st and arr is not None else None
            ok &= _check(notes, st and -23.9 < d1["pos"][2] < -23.4 and d1["path"] == 0 and st[0]["p"].get("why") == "door" and wait is not None and wait <= 0.6,
                         f"닫힌 창고 문(길찾기 격자에는 없음) 너머로 → 문 앞 z {d1['pos'][2]} 에서 막힘 → aiStuck {len(st)}번(명령 뒤 {round(st[0]['t'] - t_m0, 2) if st else None}초 · 문 앞에 닿고 {wait}초, 까닭 {st[0]['p'].get('why') if st else None}) · 길 버림")
            J("() => { __fps.door('shed', true); __fps.enemyCmd('D1', 'alert', { at: [16.5, 0, -27] }); for (let k = 0; k < 40; k++) __fps.step(0.1); }")
            d1b = J("() => __ai.en('D1')")
            ok &= _check(notes, d1b["pos"][2] < -25.5, f"문을 열면 들어감(z {d1b['pos'][2]})")

            # ── 11b) 같은 씨앗 · 같은 입력 → 같은 결과(S7 결정성 시험의 미리 보기) — 무리 A · B 와 탁 트인 곳 플레이어 20초
            runs = []
            for _ in range(2):
                pg, _n = fresh(11)
                runs.append(pg.evaluate("""() => { __fps.god(false); __fps.teleportTo('t1.open'); __fps.look(0, 0); __fps.setSeed(11);
                    __fps.setInput({ moveX: 1 }); __fps.step(3); __fps.setInput({ moveX: null }); __fps.step(17);
                    return JSON.stringify({ e: __fps.enemies(), hp: __fps.state().hp, pos: __fps.state().pos, st: __fps.ai().stats }); }"""))
            same = runs[0] == runs[1]
            st_det = json.loads(runs[0])
            ok &= _check(notes, same and st_det["st"]["shots"] > 0,
                         f"같은 씨앗 · 같은 입력 20초 두 번 → 적 상태 · 플레이어 체력 · 통계가 같음({same}) · 적 사격 {st_det['st']['shots']}발 · 체력 {st_det['hp']}")

            # ── 12) 실시간 화면 — 그리기 호출(사람 부위 InstancedMesh) · 색 · 오류
            pg, _ = fresh()
            J = pg.evaluate
            J("""() => { __fps.teleport(0, 0, 3, 0); __fps.look(0, -4);
                __fps.actorsDemo([{ team: 'ally', pos: [2.5, 0, 0.5], yaw: 200 }]);
                for (const e of __fps.enemies()) __fps.enemyCmd(e.id, 'idle', { pos: [e.pos[0] * 0.6, 0, -8 + (e.pos[2] + 19) * 2], yaw: 180 });
                __fps.resumeLoop(); }""")
            pg.wait_for_timeout(1200)
            ppl = J("() => __fps.people()")
            pf = J("() => { __fps.perfReset(); return true; }")
            pg.wait_for_timeout(1500)
            pf = J("() => __fps.perf()")
            pg.screenshot(path=str(out / "ai-people.png"))
            cols = J("""() => { const out = {}; for (const k of ['torso', 'band', 'cap', 'strap', 'hood']) { const m = FG.actors.people.meshes[k].im; const c = new THREE.Color();
                if (m.count) { m.getColorAt(0, c); out[k] = c.getHexString(); } } return out; }""")
            mats = J("() => Object.keys(FG.actors.people.meshes).length")
            ok &= _check(notes, ppl["drawn"] >= 8 and ppl["meshes"]["cap"] >= 8 and ppl["meshes"]["band"] >= 8 and ppl["meshes"]["hood"] == 1 and ppl["meshes"]["strap"] == 1 and mats == 19,
                         f"사람 그림: 부위 InstancedMesh {mats}개(사람 수와 상관없이) · 그린 사람 {ppl['drawn']} · 적 작업모 {ppl['meshes']['cap']} · 주황 팔띠 {ppl['meshes']['band']} · 아군 두건 {ppl['meshes']['hood']} · 흰 어깨 띠 {ppl['meshes']['strap']}")
            ok &= _check(notes, pf["callsMax"] <= 100, f"적 8 + 아군 그림 1 화면 그리기 호출 최대 {pf['callsMax']} ≤ 100 · 몸통 색 {cols}")
            ok &= _check(notes, not s.errors and not s.external and not s.missing, f"오류 0 · 바깥 요청 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            summary["people"] = ppl
            if not args.core:
                ok &= _ai_s7(s, out, notes, summary)
        finally:
            s.close()
    return finish("ai", ok, summary, notes)


def _ai_s7(s, out, notes, summary):
    """S7 — 섬광 멍함 · 적 수류탄 · 돌격수 · 방탄 경비 · 관측수 · 측면 · 난이도 · 아군 · 민간인 · 전투 HUD · 결정성."""
    ok = True

    def fresh(zone="t1", seed=7, diff=None):
        pg = s.page([HK_SPY])
        pg.goto(HOST + BODY_URL, wait_until="load")
        wait_ready(pg, 5000)
        pg.click("#btnSortie")
        _phase_wait(pg, "play")
        pg.evaluate(AI_JS)
        if diff:
            pg.evaluate("(d) => __fps.setDifficulty(d)", diff)
        pg.evaluate("(a) => { __fps.pauseLoop(); __fps.loadZone(a[0]); __fps.god(true); __fps.setSeed(a[1]); __fps.navResetStats(); return true; }", [zone, seed])
        return pg

    def render(pg, ms=160):
        pg.evaluate("() => __fps.step(1 / 60)")
        pg.wait_for_timeout(ms)

    # ── 13) 섬광 → stunned(제자리 · 사격 없음) · 돌격수 2배 · 끝나면 교전
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.teleport(0, 0, 8, 0); __fps.look(0, 0);
        __fps.spawnEnemy({ id: 'F1', group: 'F', type: 'rifle', state: 'idle', pos: [-1.5, 0, -6], yaw: 180 });
        __fps.spawnEnemy({ id: 'F2', group: 'F', type: 'rusher', state: 'idle', pos: [1.5, 0, -6], yaw: 180 });
        __fps.enemyCmd('F1', 'engage'); __fps.enemyCmd('F2', 'engage'); __fps.step(0.3); }""")
    m0 = J("() => __ai.mark()")
    J("() => { __fps.explodeAt([0, 1.2, -5], 'flash'); __fps.step(0.05); }")
    f1, f2 = J("() => __ai.en('F1')"), J("() => __ai.en('F2')")
    J("() => __fps.step(2.0)")
    sh_stun = J("(m) => __ai.ev(m, ['enemyShot'])", m0)
    f1b = J("() => __ai.en('F1')")
    st13 = [(x["p"]["id"], x["p"]["to"], x["p"]["why"], x["t"]) for x in J("(m) => __ai.ev(m, ['aiState'])", m0)]
    J("() => __fps.step(1.0)")
    f1c, f2c = J("() => __ai.en('F1')"), J("() => __ai.en('F2')")
    J("() => __fps.step(2.5)")
    f2d = J("() => __ai.en('F2')")
    ok &= _check(notes, f1["state"] == "stunned" and f2["state"] == "stunned" and abs(f1["stunT"] - 2.5) < 0.1 and abs(f2["stunT"] - 5.0) < 0.1 and not sh_stun
                 and f1b["state"] == "stunned" and f1b["pos"] == f1["pos"],
                 f"섬광 → 둘 다 stunned · 남은 멍함 소총수 {f1['stunT']}초 · 돌격수 {f2['stunT']}초(2배) · 멍한 2초 동안 적 탄 {len(sh_stun)}발 · 제자리")
    ok &= _check(notes, f1c["state"] == "engage" and f2c["state"] == "stunned" and f2d["state"] != "stunned",
                 f"멍함 끝 → 소총수 {f1c['state']}(2.5초) · 돌격수 3.5초에 {f2c['state']} → 5.5초에 {f2d['state']} · 상태 바뀜 {[x for x in st13 if x[1] in ('stunned', 'engage', 'alert')][:4]}")

    # ── 14) 한 엄폐 7초 → 적 수류탄(외침 · 0.6초 뒤 던짐 · 그 자리 근처에 떨어짐) · 무리 간격(보통 12초)
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.aiOpts({ flank: false }); __fps.teleportTo('t1.pcover'); __ai.crouch(); __fps.look(0, 0);
        __fps.spawnEnemy({ id: 'G1', group: 'G', state: 'idle', pos: [-3, 0, 9], yaw: 180 });
        __fps.spawnEnemy({ id: 'G2', group: 'G', state: 'idle', pos: [4, 0, 10], yaw: 180 });
        __fps.enemyCmd('G1', 'engage'); __fps.enemyCmd('G2', 'engage'); }""")
    m0 = J("() => __ai.mark()")
    t_start = J("() => __fps.state().time")
    cp0 = J("() => __fps.camp()")
    HOLD = "() => { __fps.enemyCmd('G1', null, { pos: [-3, 0, 9] }); __fps.enemyCmd('G2', null, { pos: [4, 0, 10] }); }"
    J("(h) => { const hold = eval(h); for (let k = 0; k < 300 && !__fps.events(0).some(e => e.type === 'aiGrenade'); k++) { hold(); __fps.step(0.05); } }", HOLD)
    ev = J("(m) => __ai.ev(m, ['aiGrenade', 'aiBark', 'aiState', 'projSpawn'])", m0)
    gr = next((x for x in ev if x["type"] == "aiGrenade"), None)
    bk = next((x for x in ev if x["type"] == "aiBark" and x["p"]["line"] == "grenade"), None)
    gs = next((x for x in ev if x["type"] == "aiState" and x["p"]["to"] == "grenade"), None)
    ppos = J("() => __fps.state().pos")
    J("() => { for (let k = 0; k < 60 && __fps.projectiles().length; k++) __fps.step(0.05); }")
    ev2 = J("(m) => __ai.ev(m, ['projRest', 'explode', 'playerHurt'])", m0)
    rest = next((x for x in ev2 if x["type"] in ("projRest", "explode")), None)
    land = rest["p"]["pos"] if rest else [99, 0, 99]
    dl = ((land[0] - ppos[0]) ** 2 + (land[2] - ppos[2]) ** 2) ** 0.5
    ok &= _check(notes, gr and gs and bk and gr["t"] - t_start >= 7.0 and abs((gr["t"] - gs["t"]) - 0.6) < 0.05 and dl < 3.5,
                 f"엄폐 벽 뒤에 앉아 머묾 → {round(gr['t'] - t_start, 2) if gr else None}초에 적 수류탄({gr['p']['id'] if gr else None} — 외침 「{bk['p']['line'] if bk else ''}」 → {round(gr['t'] - gs['t'], 2) if gr and gs else None}초 뒤 던짐 · 속력 {gr['p']['v'] if gr else None}m/s) · 떨어진 곳 플레이어에서 {dl:.2f}m")
    m1 = J("() => __ai.mark()")
    # 같은 자리에서 4초마다 2초 일어섰다 앉음(적이 그 자리를 다시 보고 교전) — 약 25초
    # (적 자리는 풀어 줌 — 엄폐 점으로 가서 숨었다 엿봄)
    J("() => { for (let k = 0; k < 440; k++) { if (k % 80 === 0) __ai.stand(); if (k % 80 === 40) __ai.crouch(); __fps.step(0.05); } }")
    ev3 = J("(m) => __ai.ev(m, ['aiGrenade'])", m1)
    gap = round(ev3[0]["t"] - gr["t"], 2) if ev3 and gr else None
    ok &= _check(notes, ev3 and gap >= 12 - 0.05,
                 f"같은 무리 다음 수류탄은 {gap}초 뒤(무리 간격 보통 {J('() => FG.cfg.DIFF.normal.grenadeGap')}초 이상 · 그 사이 같은 자리에서 일어섰다 앉기 반복) · 약 25초에 {len(ev3)}번")
    summary["grenade"] = {"at": round(gr["t"] - t_start, 2) if gr else None, "land": round(dl, 2), "gap": gap}

    # ── 15) 돌격수 — 12m 밖이면 다가옴 → 12m 안 「들어간다!」 예고(보통 2초) → 지그재그 돌진 → 가까이서 산탄
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.teleport(0, 0, 8, 0); __fps.look(0, 0);
        __fps.spawnEnemy({ id: 'U1', group: 'U', type: 'rusher', state: 'idle', pos: [0.5, 0, -10], yaw: 180 }); __fps.enemyCmd('U1', 'engage'); }""")
    m0 = J("() => __ai.mark()")
    tr = J("""() => { const out = []; for (let k = 0; k < 160; k++) { __fps.step(0.05); const e = __ai.en('U1'); out.push([+__fps.state().time.toFixed(3), e.state, e.rushPhase, e.pos[0], e.pos[2]]); if (e.state === 'engage' && e.why === 'reached') break; } return out; }""")
    ev = J("(m) => __ai.ev(m, ['rushWarn', 'rushGo', 'aiBark', 'enemyShot', 'aiState'])", m0)
    rw = next((x for x in ev if x["type"] == "rushWarn"), None)
    rg = next((x for x in ev if x["type"] == "rushGo"), None)
    bk = next((x for x in ev if x["type"] == "aiBark" and x["p"]["line"] == "rush"), None)
    ch = [x for x in tr if x[2] == "charge"]
    dist_w = None
    if rw:
        row = min(tr, key=lambda x: abs(x[0] - rw["t"]))
        dist_w = round(((row[3]) ** 2 + (row[4] - 8) ** 2) ** 0.5, 2)
    lat = max((abs(x[3] - 0.5) for x in ch), default=0)
    spd = None
    if len(ch) >= 2:
        d0 = ((ch[0][3]) ** 2 + (ch[0][4] - 8) ** 2) ** 0.5
        d1 = ((ch[-1][3]) ** 2 + (ch[-1][4] - 8) ** 2) ** 0.5
        spd = round((d0 - d1) / max(0.05, ch[-1][0] - ch[0][0]), 2)
    shots = [x["p"] for x in ev if x["type"] == "enemyShot"]
    warn = J("() => FG.cfg.DIFF.normal.rushWarn")
    ok &= _check(notes, rw and rg and bk and dist_w is not None and dist_w <= 12.05 and abs((rg["t"] - rw["t"]) - warn) < 0.25,
                 f"돌격수: {dist_w}m 에서 외침 「들어간다!」 + 예고 {round(rg['t'] - rw['t'], 2) if rw and rg else None}초(보통 {warn}) → 돌진")
    ok &= _check(notes, ch and lat > 0.3 and spd and spd > 3.0 and tr[-1][1] == "engage" and shots and all(x["wpn"] == "neoreok" for x in shots),
                 f"지그재그 돌진 — 옆으로 최대 {lat:.2f}m · 다가오는 빠르기 {spd}m/s · 끝 {tr[-1][1]}({len(ch)}구간) · 산탄 {len(shots)}발(거리 {[x['dist'] for x in shots][:4]})")
    summary["rush"] = {"warnDist": dist_w, "warn": round(rg["t"] - rw["t"], 2) if rw and rg else None, "lat": round(lat, 2), "speed": spd, "shots": len(shots)}

    # ── 16) 방탄 경비 — 몸통 피해 ×0.35(파란 불꽃 · 금속음 · 마름모), 머리 ×1.8 그대로, 3발 점사, 제압
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0); __fps.infiniteAmmo(true); __fps.aiOpts({ flank: false, grenade: false });
        __fps.spawnEnemy({ id: 'Hv', group: 'H', type: 'heavy', state: 'idle', pos: [-1.5, 0, 0], yaw: 0, hp: 900 });
        __fps.spawnEnemy({ id: 'Rf', group: 'R', type: 'rifle', state: 'idle', pos: [1, 0, 7], yaw: 0, hp: 900 }); __fps.step(0.1); }""")
    m0 = J("() => __ai.mark()")
    J("() => { __fps.aimAt('Hv', 'torso'); __ai.fireOne(); __fps.step(0.3); __fps.aimAt('Rf', 'torso'); __ai.fireOne(); __fps.step(0.3); __fps.aimAt('Hv', 'head'); __ai.fireOne(); __fps.step(0.1); }")
    render(pg)
    hits = [x["p"] for x in J("(m) => __ai.ev(m, ['hit'])", m0)]
    hv = [h for h in hits if h["targetId"] == "Hv"]
    rf = [h for h in hits if h["targetId"] == "Rf"]
    hvt = next((h for h in hv if h["part"] == "torso"), None)
    hvh = next((h for h in hv if h["part"] == "head"), None)
    rft = next((h for h in rf if h["part"] == "torso"), None)
    hu, fxs, au = J("() => __fps.hud()"), J("() => __fps.fx()"), J("() => __fps.audio()")
    blue = any(abs(c[0] - 0.62) < 0.01 and abs(c[2] - 1.0) < 0.01 for c in [list(map(float, x.split(','))) if isinstance(x, str) else x for x in fxs["colors"]]) if fxs["colors"] else False
    ok &= _check(notes, hvt and rft and hvh and abs(hvt["dmg"] - round(rft["dmg"] * 0.35, 2)) < 0.02 and hvt["armored"] and not hvh["armored"] and abs(hvh["dmg"] - rft["dmg"] * 1.8) < 0.05,
                 f"방탄 경비 몸통 {hvt['dmg'] if hvt else None} = 소총수 몸통 {rft['dmg'] if rft else None} × 0.35 · 머리 {hvh['dmg'] if hvh else None}(× 1.8 그대로)")
    ok &= _check(notes, hu["counts"]["armor"] >= 1 and blue and au["played"].get("metal", 0) >= 1,
                 f"방탄 맞힘 표시(마름모) {hu['counts']['armor']} · 파란 불꽃 색 {blue} · 금속음 {au['played'].get('metal', 0)}번 · 입자 색 {fxs['colors'][:9]}")
    # 점사 — 3발씩 끊어 쏨(같은 점사 안 간격 0.1초, 점사 사이 0.55~0.85초) + 제압 사건
    m1 = J("() => __ai.mark()")
    J("() => { __fps.enemyCmd('Rf', 'idle', { pos: [14, 0, -26] }); __fps.enemyCmd('Hv', 'engage'); for (let k = 0; k < 60; k++) { __fps.enemyCmd('Hv', null, { pos: [-1.5, 0, 0] }); __fps.step(0.1); } }")
    hs = [x for x in J("(m) => __ai.ev(m, ['enemyShot', 'suppress'])", m1)]
    ts = [x["t"] for x in hs if x["type"] == "enemyShot" and x["p"]["id"] == "Hv"]
    sup = [x for x in hs if x["type"] == "suppress"]
    gaps = [round(ts[k] - ts[k - 1], 3) for k in range(1, len(ts))]
    short = [g for g in gaps if g < 0.2]
    long_ = [g for g in gaps if g >= 0.2]
    ok &= _check(notes, len(ts) >= 6 and short and long_ and len(short) >= len(long_) * 1.5 and all(0.45 <= g <= 2.0 for g in long_),
                 f"점사: 6초 {len(ts)}발 · 점사 안 간격 {sorted(set(short))[:3]} · 점사 사이 {long_[:5]}")
    J("() => { __fps.setHp(100); __ai.crouch(); __fps.teleportTo('t1.pcover'); __ai.crouch(); __fps.enemyCmd('Hv', 'engage'); }")
    m2 = J("() => __ai.mark()")
    J("() => { for (let k = 0; k < 40; k++) { __fps.enemyCmd('Hv', null, { pos: [-1.5, 0, 9] }); __fps.step(0.1); } }")
    sup = J("(m) => __ai.ev(m, ['suppress'])", m2)
    render(pg, 60)
    hu2 = J("() => __fps.hud()")
    pg.screenshot(path=str(out / "ai-suppress-heavy.png"))
    ok &= _check(notes, sup and hu2["supp"] >= 0 and J("() => __fps.ai().stats.suppress") >= 1,
                 f"엄폐 벽 뒤 플레이어에게 방탄 경비 점사 → 제압 사건 {len(sup)}번(화면 가장자리 어둡게 · 흔들림 — 지금 {hu2['supp']})")

    # ── 17) 관측수 — 손전등 원 예고(보통 1.2초) 뒤 쏨 · 숨으면 취소 · 무리 반응 −0.2 · 측면 지시 · 쓰러지면 구역 반응 +0.2
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.aiOpts({ grenade: false }); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0);
        __fps.spawnEnemy({ id: 'S1', group: 'S', type: 'spotter', state: 'idle', pos: [-4, 0, -14], yaw: 180 });
        __fps.spawnEnemy({ id: 'S2', group: 'S', type: 'rifle', state: 'idle', pos: [8, 0, -20], yaw: 0 });
        __fps.spawnEnemy({ id: 'S3', group: 'S', type: 'rifle', state: 'idle', pos: [10, 0, -21], yaw: 0 });
        __fps.spawnEnemy({ id: 'O1', group: 'O', type: 'rifle', state: 'idle', pos: [-15, 0, 25], yaw: 180 }); }""")
    m0 = J("() => __ai.mark()")
    J("() => { for (let k = 0; k < 300 && !__fps.events(0).some(e => e.type === 'enemyShot' && e.payload.id === 'S1'); k++) __fps.step(0.05); }")
    ev = J("(m) => __ai.ev(m, ['spotterAim', 'enemyShot', 'aiBark', 'aiState', 'aiFlank'])", m0)
    aim = next((x for x in ev if x["type"] == "spotterAim"), None)
    shot = next((x for x in ev if x["type"] == "enemyShot" and x["p"]["id"] == "S1"), None)
    spot = next((x for x in ev if x["type"] == "aiBark" and x["p"]["line"] == "spot"), None)
    warn = J("() => FG.cfg.DIFF.normal.spotterWarn")
    reacts = J("() => Object.fromEntries(__fps.enemies().map(e => [e.id, e.react]))")
    ok &= _check(notes, aim and shot and spot and abs((shot["t"] - aim["t"]) - warn) < 0.05 and not shot["p"]["first"],
                 f"관측수(시야 ×1.5): 「위치 불렀다!」 → 손전등 원 예고 {round(shot['t'] - aim['t'], 3) if aim and shot else None}초(보통 {warn}) 뒤 사격(첫 발 일부러 빗나감 없음 — 예고가 경고) · 명중 {shot['p']['hit'] if shot else None}")
    # 손전등 원 그림 — 예고 중 원이 좁혀 옴
    J("() => { __fps.step(0.3); for (let k = 0; k < 200 && !__ai.en('S1').aiming; k++) __fps.step(0.05); __fps.step(0.1); }")
    render(pg)
    fa = J("() => __fps.fx()")
    J("() => __fps.step(0.8)")
    render(pg)
    fb = J("() => __fps.fx()")
    pg.screenshot(path=str(out / "ai-spotter-light.png"))
    hsa = J("() => __fps.hud().spotArcs")
    ok &= _check(notes, fa["spots"] >= 1 and fb["spots"] >= 1 and fb["spotR"] < fa["spotR"] and hsa,
                 f"손전등 원(주황 원판 + 옅은 빛 원뿔, 레이저 줄기 아님) — 반지름 {fa['spotR']} → {fb['spotR']}m 로 좁혀 옴 · 화면에 비추는 쪽 주황 점선 호 {hsa}")
    ok &= _check(notes, reacts.get("S2") == round(0.6 - 0.2, 3) and reacts.get("O1") == 0.6,
                 f"관측수가 본 무리 반응 {reacts.get('S2')}초(보통 0.6 − 0.2) · 다른 무리 {reacts.get('O1')}초")
    fl = next((x for x in ev if x["type"] == "aiState" and x["p"]["to"] == "flank"), None)
    J("() => __fps.step(2)")
    if not fl:
        fl = next((x for x in J("(m) => __ai.ev(m, ['aiState'])", m0) if x["p"]["to"] == "flank"), None)
    ok &= _check(notes, fl and fl["p"]["why"] == "spotter",
                 f"관측수 지시 → 무리 소총수 {fl['p']['id'] if fl else None} 바로 측면 이동(why {fl['p']['why'] if fl else None} · 교전 10초 안 기다림)")
    # 숨으면 예고 취소(쏘지 않음)
    J("() => { __fps.teleportTo('t1.pcover'); __ai.stand(); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0); }")
    J("() => { for (let k = 0; k < 120 && !(__ai.en('S1').aiming); k++) __fps.step(0.05); }")
    m2 = J("() => __ai.mark()")
    J("() => { __fps.teleportTo('t1.shedIn'); __fps.step(2.0); }")
    ev = J("(m) => __ai.ev(m, ['spotterAimEnd', 'enemyShot'])", m2)
    ce = next((x for x in ev if x["type"] == "spotterAimEnd"), None)
    s1shot = [x for x in ev if x["type"] == "enemyShot" and x["p"]["id"] == "S1"]
    ok &= _check(notes, ce and ce["p"]["why"] == "lost" and not s1shot, f"예고 중 플레이어가 숨음 → 예고 취소(why {ce['p']['why'] if ce else None}) · 관측수 탄 {len(s1shot)}발")
    J("() => { __fps.killEnemy('S1'); __fps.step(0.2); }")
    reacts2 = J("() => Object.fromEntries(__fps.enemies().map(e => [e.id, e.react]))")
    ok &= _check(notes, J("() => FG.ai.spotterDown()") == 1 and reacts2.get("O1") == 0.8 and reacts2.get("S2") == 0.6,
                 f"관측수 처치 → 구역 적 반응 +0.2: 다른 무리 {reacts2.get('O1')}초 · 관측수 무리 {reacts2.get('S2')}초(0.6 − 0.2 + 0.2)")

    # ── 18) 소총수 측면 — 무리 교전 10초 넘으면 1명이 외치고 플레이어 옆으로 → 도착하면 교전
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.aiOpts({ grenade: false }); __fps.teleport(0, 0, 18, 0); __fps.look(0, 0);
        __fps.spawnEnemy({ id: 'L1', group: 'L', state: 'idle', pos: [-3, 0, -4], yaw: 180 });
        __fps.spawnEnemy({ id: 'L2', group: 'L', state: 'idle', pos: [3, 0, -4], yaw: 180 });
        __fps.spawnEnemy({ id: 'L3', group: 'L', state: 'idle', pos: [0, 0, -8], yaw: 180 });
        __fps.enemyCmd('L1', 'engage'); }""")
    m0 = J("() => __ai.mark()")
    t0 = J("() => __fps.state().time")
    J("() => { for (let k = 0; k < 400 && !__fps.events(0).some(e => e.type === 'aiState' && e.payload.why === 'flankDone'); k++) __fps.step(0.05); }")
    ev = J("(m) => __ai.ev(m, ['aiFlank', 'aiState', 'aiBark'])", m0)
    af = [x for x in ev if x["type"] == "aiFlank"]
    fd = next((x for x in ev if x["type"] == "aiState" and x["p"]["why"] == "flankDone"), None)
    fb = next((x for x in ev if x["type"] == "aiBark" and x["p"]["line"] == "flank"), None)
    who = af[0]["p"]["id"] if af else None
    fe = J("(id) => __ai.en(id)", who) if who else None
    pp = J("() => __fps.state().pos")
    to = af[0]["p"]["to"] if af else [0, 0, 0]
    ok &= _check(notes, af and len(af) == 1 and af[0]["t"] - t0 >= 10 - 0.05 and fb and fd and fd["p"]["id"] == who,
                 f"무리 교전 {round(af[0]['t'] - t0, 2) if af else None}초 → {who} 외침 「옆으로」 · 측면 지점 {to}(플레이어에서 {round(((to[0] - pp[0]) ** 2 + (to[2] - pp[2]) ** 2) ** 0.5, 1)}m) · {round(fd['t'] - af[0]['t'], 2) if fd and af else None}초 뒤 도착 → 교전(why flankDone) · 무리에서 1명만({len(af)})")

    # ── 19) 난이도 — 반응 시간(발견 → 첫 발) 쉬움 0.9 · 보통 0.6 · 어려움 0.35, 적 수(쉬움 −20%), 회복 시작까지
    pg = fresh()
    J = pg.evaluate
    rx = {}
    for d in ("easy", "normal", "hard"):
        r = J("""(d) => { __fps.setDifficulty(d); __ai.clearSquads(); __fps.teleport(0, 0, 8, 0); __fps.look(0, 0);
            const id = __fps.spawnEnemy({ group: 'D' + d, state: 'idle', pos: [0, 0, -6], yaw: 180 }); const m = FG.bus.count;
            __fps.enemyCmd(id, 'engage'); const t0 = __fps.state().time;
            for (let k = 0; k < 120 && !__fps.events(m).some(e => e.type === 'enemyShot'); k++) __fps.step(1 / 60);
            const s = __fps.events(m).find(e => e.type === 'enemyShot'); return s ? +(s.t - t0).toFixed(3) : null; }""", d)
        rx[d] = r
    ok &= _check(notes, rx["easy"] and rx["normal"] and rx["hard"] and abs(rx["easy"] - 0.9) < 0.04 and abs(rx["normal"] - 0.6) < 0.04 and abs(rx["hard"] - 0.35) < 0.04,
                 f"난이도별 반응 시간(교전 → 첫 발) 쉬움 {rx['easy']} · 보통 {rx['normal']} · 어려움 {rx['hard']}초(표 0.9 · 0.6 · 0.35)")
    nz = {}
    for d in ("easy", "normal", "hard"):
        nz[d] = J("(d) => { __fps.setDifficulty(d); __fps.loadZone('t1'); return __fps.enemies().length; }", d)
    rg = {}
    for d in ("easy", "hard"):
        rg[d] = J("""(d) => { __fps.setDifficulty(d); __ai.clearSquads(); __fps.god(false); __fps.setHp(100); FG.player.hurt(10, [0, 0, -1]); const w0 = FG.player.regenWait;
            __fps.step(w0 - 0.1); const a = __fps.state().hp; __fps.step(0.3); const b = __fps.state().hp; __fps.god(true); return [+w0.toFixed(2), a, +b.toFixed(2)]; }""", d)
    J("() => __fps.setDifficulty('normal')")
    ok &= _check(notes, nz == {"easy": 6, "normal": 8, "hard": 8} and rg["easy"][0] == 2.5 and rg["hard"][0] == 5.0 and rg["easy"][1] == 90 and rg["easy"][2] > 90,
                 f"구역 t1 적 수 {nz}(쉬움 −20% · 무리마다 4 → 3) · 회복 시작까지 쉬움 {rg['easy'][0]}초 · 어려움 {rg['hard'][0]}초(그 전엔 체력 그대로 {rg['easy'][1]} → 뒤 {rg['easy'][2]})")
    summary["diff"] = {"react": rx, "enemies": nz, "regen": rg}

    # ── 20) 아군 — 분대 점 따라가기 · 기다리기 · 적 사격(피해 ×0.3) · 무릎 → 회복 · 판정 몸 없음
    pg = fresh("t3")
    J = pg.evaluate
    J("() => { __ai.clearSquads(); __fps.teleport(3, 0, 26, 0); __fps.look(0, 0); __fps.step(0.2); }")
    a0 = J("() => __fps.allies()")
    J("() => { __fps.setInput({ moveZ: 1 }); __fps.step(3.5); __fps.setInput({ moveZ: null }); __fps.step(5); }")
    a1 = J("() => __fps.allies()")
    pp = J("() => __fps.state().pos")
    dists = [round(((a["pos"][0] - pp[0]) ** 2 + (a["pos"][2] - pp[2]) ** 2) ** 0.5, 1) for a in a1["allies"]]
    ahead = [round(pp[2] - a["pos"][2], 1) for a in a1["allies"]]
    ok &= _check(notes, len(a0["allies"]) == 2 and len(a0["civs"]) == 1 and all(3 <= d <= 10.5 for d in dists) and all(x > 1 for x in ahead) and pp[2] < 26 - 10,
                 f"t3 아군 {[a['id'] for a in a0['allies']]} · 민간인 {[c['id'] for c in a0['civs']]} — 플레이어 {round(26 - pp[2], 1)}m 전진 뒤 아군 거리 {dists}m(4~10) · 플레이어보다 앞 {ahead}m")
    J("() => { __fps.allyCmd('mulchong', 'wait', [-9, 0, 8]); __fps.teleport(3, 0, 26, 0); __fps.step(5); }")
    w1 = J("() => __fps.allies().allies.find(a => a.id === 'mulchong')")
    J("() => { __fps.teleport(-6, 0, 10, 0); __fps.step(0.6); }")
    w2 = J("() => __fps.allies().allies.find(a => a.id === 'mulchong')")
    ok &= _check(notes, w1["state"] == "wait" and abs(w1["pos"][0] + 9) < 0.8 and abs(w1["pos"][2] - 8) < 0.8 and w2["state"] == "follow",
                 f"기다리기: 물총새가 정한 점 {w1['pos']} 에서 {w1['state']}(플레이어 22m 뒤) → 플레이어가 6m 안에 오면 {w2['state']}")
    # 플레이어 바로 앞을 가리지 않음 — 대본 자리(hold)가 플레이어 정면 0.9m 가 되면 옆으로 비켜서고, 플레이어가 떠나면 자리로 돌아감
    Y = J("""() => { const am = () => __fps.allies().allies.find(a => a.id === 'mulchong');
        const front = (a) => { const p = __fps.state().pos, dx = a.pos[0] - p[0], dz = a.pos[2] - p[2], d = Math.hypot(dx, dz), y = FG.player.yaw;
            return { d: +d.toFixed(2), cone: d > 1e-3 && (dx * Math.sin(y) - dz * Math.cos(y)) / d >= Math.cos(35 * Math.PI / 180) }; };
        __fps.teleport(6, 0, 22, 0); __fps.allyCmd('mulchong', 'hold', [0, 0, 13.1]); __fps.step(6);
        const a0 = am(); __fps.teleport(0, 0, 14, 0); __fps.look(0, 0); const f0 = front(a0);
        const m = __ai.mark(); __fps.step(1.5); const f1 = front(am()); __fps.step(4); const f2 = front(am());
        const ev = __ai.ev(m, ['allyYield']).length;
        __fps.teleport(6, 0, 24, 0); __fps.step(5); const a3 = am();
        return { a0: a0.pos, f0, f1, f2, ev, back: Math.hypot(a3.pos[0], a3.pos[2] - 13.1), st: a3.state }; }""")
    ok &= _check(notes, Y["f0"]["cone"] and Y["f0"]["d"] < 1.2 and not Y["f1"]["cone"] and not Y["f2"]["cone"] and Y["ev"] >= 1 and Y["back"] < 0.8 and Y["st"] == "hold",
                 f"아군이 플레이어 정면 {Y['f0']['d']}m(가림) → 1.5초 뒤 비켜섬(거리 {Y['f1']['d']}m · 정면 {Y['f1']['cone']}) · 5.5초 뒤도 {Y['f2']} · 비킴 {Y['ev']}번 → 플레이어가 떠나면 대본 자리로({Y['back']:.2f}m · {Y['st']})")
    J("() => __fps.allyCmd('mulchong', 'follow')")
    m0 = J("() => __ai.mark()")
    J("""() => { __fps.teleport(0, 0, 14, 0); __fps.look(0, 0); __fps.spawnEnemy({ id: 'Y1', group: 'Y', state: 'idle', pos: [0, 0, -2], yaw: 0, hp: 500 }); __fps.step(6); }""")
    ah = [x["p"] for x in J("(m) => __ai.ev(m, ['hit'])", m0) if x["p"]["targetId"] == "Y1"]
    ash = [x["p"] for x in J("(m) => __ai.ev(m, ['allyShot'])", m0)]
    exp_dmg = round(28 * 0.3, 2)
    ok &= _check(notes, ash and ah and all(not h["byPlayer"] and abs(h["dmg"] - exp_dmg) < 0.05 for h in ah),
                 f"아군이 적을 쏨 {len(ash)}발 · 맞음 {len(ah)} · 한 발 피해 {sorted(set(h['dmg'] for h in ah))}(너울 28 × 0.3 = {exp_dmg} — 주인공이 주역)")
    bd = J("() => __fps.bodies().filter(b => b.team === 'ally' || b.team === 'civ').length")
    J("() => { __fps.killAll(); __fps.step(2.2); __fps.allyHurt('bawi', 300); __fps.step(0.1); }")
    k1 = J("() => __fps.allies().allies.find(a => a.id === 'bawi')")
    J("() => __fps.step(2.6)")
    k2 = J("() => __fps.allies().allies.find(a => a.id === 'bawi')")
    J("() => __fps.step(0.6)")
    k3 = J("() => __fps.allies().allies.find(a => a.id === 'bawi')")
    render(pg)
    ok &= _check(notes, bd == 0 and k1["state"] == "kneel" and k1["crouch"] > 0.3 and k2["state"] == "kneel" and k3["state"] == "follow" and k3["hp"] == 100,
                 f"아군 판정 몸 {bd}개(플레이어 탄이 지나감) · 체력 0 → 쓰러지지 않고 무릎({k1['state']}) → 2.7초 {k2['state']} → 3.3초 {k3['state']} 체력 {k3['hp']}")

    # ── 21) 민간인 — 판정 몸 없음 · 조준하면 십자선 ⊘ · 쏘아도 안 맞음
    J("() => { __fps.teleport(7, 0, 20, 0); __fps.allyCmd('haram', 'idle'); __fps.step(0.3); }")
    J("() => { const c = __fps.allies().civs[0]; __fps.aimAt([c.pos[0], c.pos[1] + 1.2, c.pos[2]]); }")
    render(pg)
    h1 = J("() => __fps.hud()")
    pg.screenshot(path=str(out / "ai-civ-aim.png"))
    m0 = J("() => __ai.mark()")
    J("() => { __ai.fireOne(); __fps.step(0.2); }")
    ce = J("(m) => __ai.ev(m, ['hit', 'impact'])", m0)
    J("() => { __fps.look(90, 0); }")
    render(pg)
    h2 = J("() => __fps.hud()")
    ok &= _check(notes, h1["civ"] and not h2["civ"] and not [x for x in ce if x["type"] == "hit"] and [x for x in ce if x["type"] == "impact"],
                 f"민간인 조준 → 십자선 ⊘({h1['civ']}) · 쏜 탄은 지나가 뒤에 탄흔(맞음 0) · 돌리면 ⊘ 꺼짐({h2['civ']})")

    # ── 22) 전투 HUD — 피격 호 · 체력 가장자리 · 심장 소리 · 은신 ?→! · 수류탄 위험 · 외침 자막
    pg = fresh()
    J = pg.evaluate
    J("""() => { __ai.clearSquads(); __fps.teleportTo('t1.open'); __fps.look(0, 0); __fps.god(false); __fps.setHp(100);
        __fps.spawnEnemy({ id: 'Q1', group: 'Q', state: 'idle', pos: [-6, 0, -7], yaw: 180 }); __fps.step(0.6); }""")
    render(pg)
    hq = J("() => __fps.hud()")
    q1 = J("() => __ai.en('Q1')")
    J("() => { for (let k = 0; k < 60 && __ai.en('Q1').state !== 'engage'; k++) __fps.step(0.1); __fps.step(0.05); }")
    render(pg)
    hb = J("() => __fps.hud()")
    J("() => { for (let k = 0; k < 200 && __fps.state().hp >= 100; k++) __fps.step(0.05); }")
    render(pg)
    ha = J("() => __fps.hud()")
    J("() => { __fps.killAll(); __fps.step(2.2); __fps.setHp(18); }")
    render(pg, 1300)
    hl = J("() => __fps.hud()")
    au = J("() => __fps.audio()")
    J("() => { const p = __fps.state().pos; __fps.spawnProjectile('grenade', [p[0] + 2, p[1] + 0.2, p[2] - 1], [0, 0, 0], 2.5); __fps.step(0.1); }")
    J("() => { __fps.spawnEnemy({ id: 'Q2', group: 'Q2', type: 'rusher', state: 'idle', pos: [0, 0, -1], yaw: 180 }); __fps.enemyCmd('Q2', 'engage'); __fps.step(0.6); }")
    render(pg)
    hd2 = J("() => __fps.hud()")
    pg.screenshot(path=str(out / "ai-hud.png"))
    ok &= _check(notes, hq["stealth"] and hq["stealth"][0]["ch"] == "?" and 0 < hq["stealth"][0]["k"] < 1 and hb["stealth"] and hb["stealth"][0]["ch"] == "!",
                 f"은신 표시: 보이기 시작하면 적 머리 위 「?」(게이지 {hq['stealth'][0]['k'] if hq['stealth'] else None} — {q1['gauge']}) → 교전 「!」")
    ok &= _check(notes, ha["arcs"] and ha["vig"] > 0 and hl["vig"] >= 0.9 and hl["grey"] > 0.3 and au["played"].get("heart", 0) >= 1,
                 f"맞음 → 피격 방향 호 {ha['arcs'][:1]} · 가장자리 {ha['vig']} · 체력 18 → 비네트 {hl['vig']} · 회색(채도) {hl['grey']} · 심장 소리 {au['played'].get('heart', 0)}번")
    ok &= _check(notes, len(hd2["danger"]) >= 1 and any("들어간다" in x for x in hd2["subs"]),
                 f"수류탄 위험 표시 {hd2['danger']} · 외침 자막 {hd2['subs']}")

    # ── 23) 결정성 — t3(적 4종 · 아군 2 · 민간인) 같은 씨앗 · 같은 입력 30초 step 두 번(새 화면 각각) → state() 같음
    runs = []
    for _ in range(2):
        pg = fresh("t3", 21)
        # 절대 시계(state().time · steps)는 출격 뒤 고리를 붙잡기까지 흐른 만큼 판마다 달라 — 지난 시간 · 단계 수로 비교, 장비를 다시 들어 흔들림 시계도 0 부터
        runs.append(pg.evaluate("""() => { __fps.setLoadout({}); __fps.god(false); __fps.teleportTo('t3.open'); __fps.look(0, 0); __fps.setSeed(21);
            const t0 = __fps.state().time, s0 = __fps.state().steps;
            __fps.setInput({ moveX: 1 }); __fps.step(2); __fps.setInput({ moveX: null, fire: true }); __fps.step(1.5); __fps.setInput({ fire: null });
            __fps.setInput({ moveZ: -1 }); __fps.step(2); __fps.setInput({ moveZ: null }); __fps.press('flash'); __fps.step(0.6);
            __fps.step(23.9);
            const st = __fps.state(); st.elapsed = +(st.time - t0).toFixed(6); st.stepsRun = st.steps - s0; delete st.time; delete st.steps;
            delete st.loop; delete st.fov; delete st.ui; delete st.input; delete st.locked; delete st.fallback;
            return JSON.stringify({ st, e: __fps.enemies(), a: __fps.allies(), ai: __fps.ai().stats }); }"""))
    same = runs[0] == runs[1]
    d0 = json.loads(runs[0])
    if not same:
        d1 = json.loads(runs[1])
        diff = [k for k in d0["st"] if d0["st"][k] != d1["st"].get(k)]
        notes.append((False, f"결정성 다른 칸: {diff[:8]} · 적 같음 {d0['e'] == d1['e']} · 아군 같음 {d0['a'] == d1['a']}"))
    ok &= _check(notes, same and d0["ai"]["shots"] > 0 and d0["st"]["elapsed"] > 29.9,
                 f"결정성: t3 같은 씨앗 · 같은 입력(걷기 · 사격 · 섬광) 30초 두 번 → state() · 적 · 아군 · 통계 같음({same}) · 적 사격 {d0['ai']['shots']} · 측면 {d0['ai']['flanks']} · 수류탄 {d0['ai']['grenades']} · 돌진 {d0['ai']['rushes']} · 관측 {d0['ai']['spotAims']} · 체력 {d0['st']['hp']}")
    summary["det"] = {"same": same, "stats": d0["ai"]}

    # ── 24) 실시간 — 적 4종 · 아군 · 민간인 그림(부위 InstancedMesh 19 · 호출) · 오류 0
    pg = fresh("t3")
    J = pg.evaluate
    J("""() => { __fps.teleport(0, 0, 4, 0); __fps.look(0, -3); FG.ai.clear(); FG.allies.clear();
        const row = [['rifle', -4.5], ['rusher', -1.5], ['heavy', 1.5], ['spotter', 4.5]];
        for (const [t, x] of row) __fps.spawnEnemy({ id: 'V' + t, group: 'V', type: t, state: 'idle', pos: [x, 0, -3], yaw: 180 });
        __fps.spawnAlly({ id: 'a1', call: 'bawi', pos: [-3, 0, 0.5], yaw: 160 }); __fps.spawnCiv({ id: 'c1', call: 'haram', pos: [3, 0, 0.5], yaw: 200 });
        __fps.allyCmd('a1', 'hold', [-3, 0, 0.5]); __fps.resumeLoop(); }""")
    pg.wait_for_timeout(1200)
    J("() => __fps.perfReset()")
    pg.wait_for_timeout(1500)
    pf = J("() => __fps.perf()")
    ppl = J("() => __fps.people()")
    pg.screenshot(path=str(out / "ai-types.png"))
    mats = J("() => Object.keys(FG.actors.people.meshes).length")
    mm = ppl["meshes"]
    ok &= _check(notes, mats == 19 and mm["plate"] == 1 and mm["brim"] == 1 and mm["vest"] == 1 and mm["bandana"] == 1 and mm["coat"] == 1 and mm["antenna"] == 1
                 and mm["beanie"] == 1 and mm["hood"] == 1 and mm["gun"] == 5 and mm["cap"] == 3 and mm["band"] == 4,
                 f"사람 그림 6종: 부위 InstancedMesh {mats}개 · 조끼 판 {mm['plate']} · 챙 덮개 {mm['brim']} · 짧은 조끼 {mm['vest']} · 두건 {mm['bandana']} · 긴 외투 {mm['coat']} · 안테나 {mm['antenna']} · 털모자 {mm['beanie']} · 총 {mm['gun']}(민간인 없음) · 작업모 {mm['cap']} · 팔띠 {mm['band']}")
    ok &= _check(notes, pf["callsMax"] <= 100, f"적 4 + 아군 + 민간인 화면 그리기 호출 최대 {pf['callsMax']} ≤ 100")
    ok &= _check(notes, not s.errors and not s.external and not s.missing, f"오류 0 · 바깥 요청 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
    return ok


# ───────────────────────────── mission · checkpoint (S8) ─────────────────────────────

MI_JS = r"""(() => {
  // 하네스 전용 도우미 — 임무 사건 고르기
  const H = window.__mi = {};
  H.mark = () => (window.FG.bus.count);
  H.ev = (since, types) => __fps.events(since).filter(e => types.indexOf(e.type) >= 0).map(e => ({ t: +e.t.toFixed(3), type: e.type, p: e.payload }));
  H.render = () => { __fps.step(1 / 60); return true; };
  return true;
})()"""


def _score_expect(sc, par, mult=1.0):
    """gdd-final §7-1 점수식을 파이썬으로 다시 셈(성공 판) — 본체 score() 와 같아야 한다."""
    t = sc["sec"]
    if t <= par:
        time_ = 40000
    elif t >= par * 1.8:
        time_ = 0
    else:
        time_ = int(40000 * (1 - (t - par) / (par * 0.8)))
    acc = int(min(1, sc["hits"] / sc["shots"]) * 30000) if sc["shots"] else 15000   # PM 임시 결정 1 — 0발이면 절반
    dmg = int(max(0, 20000 * (1 - sc["taken_raw"] / 600)))
    return time_, acc, dmg


def cmd_mission(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"id": args.id, "diff": args.diff}
    mid = args.id
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            def fresh():
                pg = s.page([HK_SPY])
                pg.goto(HOST + BODY_URL, wait_until="load")
                wait_ready(pg, 5000)
                pg.evaluate(MI_JS)
                return pg

            # ── 1) god · autopilot · fast(8) 로 결과까지
            pg = fresh()
            J = pg.evaluate
            d = J("(m) => __fps.missionDef(m)", mid)
            ok &= _check(notes, d and d.get("objectives"), f"임무 자료 {mid}: 목표 {[o['id'] + ':' + o['type'] for o in (d or {}).get('objectives', [])]} · 구역 {(d or {}).get('zones')}")
            if not d:
                return finish("mission", False, summary, notes)
            # fix3 — 벽시계 대신 sim 단계로 끝까지 돌림(기계가 무거우면 0.25초 넘는 프레임을 버려 fast(8) 이 거의 멈춰 거짓 실패하던 것).
            # 루프를 멈추고 0.5초씩 단계를 밟다가(한 번에 20번 = sim 10초) 임무가 끝나면 루프를 다시 켜 결과 화면을 기다림
            started = J("(a) => { const ok = __fps.startMission(a[0], { diff: a[1], seed: 5 }); __fps.god(true); __fps.infiniteAmmo(true); __fps.autopilot(true); __fps.pauseLoop(); return ok; }", [mid, args.diff])
            limit_sum = sum(o.get("limit", 120) for o in d["objectives"])
            t0 = time.time()
            sim_end = None
            for _ in range(int((limit_sum + 60) / 10) + 1):
                st = J("""() => { for (let k = 0; k < 20; k++) { const m = __fps.mission(); if (!m || m.state === 'end' || !m.autopilot.on) break; __fps.step(0.5); }
                    const m = __fps.mission(); return { st: m.state, ap: m.autopilot.on, t: m.t }; }""")
                sim_end = st
                if st["st"] == "end" or not st["ap"]:
                    break
            J("() => __fps.resumeLoop()")
            for _ in range(40):
                if J("() => __fps.state().phase") == "result":
                    break
                pg.wait_for_timeout(250)
            real = round(time.time() - t0, 1)
            try:
                load = os.getloadavg()[0]
            except OSError:
                load = None
            summary["real"] = {"sec": real, "load1": load, "sim": sim_end}
            pg.wait_for_timeout(300)
            res = J("""() => ({ st: __fps.state(), m: __fps.mission(), sc: __fps.score(),
                ev: __mi.ev(0, ['missionStart', 'objective', 'objDone', 'checkpoint', 'autopilotStuck', 'missionEnd', 'missionWarn']),
                screen: getComputedStyle(document.getElementById('scrResult')).display, rsScore: document.getElementById('rsScore').textContent })""")
            m, sc = res["m"], res["sc"]
            ids = [o["id"] for o in d["objectives"]]
            started_order = [e["p"]["id"] for e in res["ev"] if e["type"] == "objective"]
            done_order = [e["p"]["id"] for e in res["ev"] if e["type"] == "objDone"]
            stuck = [e["p"] for e in res["ev"] if e["type"] == "autopilotStuck"]
            elapsed = {e["p"]["id"]: e["p"]["elapsed"] for e in res["ev"] if e["type"] == "objDone"}
            over = [k for k, v in elapsed.items() if v > next(o.get("limit", 120) for o in d["objectives"] if o["id"] == k)]
            ok &= _check(notes, started and res["st"]["phase"] == "result" and m["result"] == "success",
                         f"god · autopilot · sim 단계(0.5초씩 — 벽시계 무관): phase {res['st']['phase']} · 결과 {m['result']} · 임무 시계 {m['t']}초(실시간 {real}초) · 결과 화면 {res['screen']}")
            ok &= _check(notes, started_order == ids and done_order == ids, f"목표 순서 = 자료 순서: 시작 {started_order} · 끝 {done_order}")
            ok &= _check(notes, not stuck and not over and not m["warn"], f"autopilotStuck 없음 {stuck[:2]} · 목표 시간 상한 안 {elapsed} · 자료 경고 {m['warn'][:3]}")
            ok &= _check(notes, isinstance(sc["total"], int) and 0 <= sc["total"] <= 250000 and res["rsScore"].replace(",", "") == str(sc["total"]),
                         f"점수 {sc['total']}(0~250,000 정수) · 기본 {sc['base']} × {sc['mult']} · 완수 {sc['complete']} · 시간 {sc['time']} · 명중 {sc['accuracy']}({sc['hits']}/{sc['shots']}) · 피해 {sc['damage']} · 보너스 {sc['bonus']} · 별 {sc['stars']} · 화면 「{res['rsScore']}」")
            # 점수식 다시 셈(gdd-final §7-1)
            raw_taken = J("() => FG.mission.M.sc.taken")
            exp_t, exp_a, exp_d = _score_expect(dict(sc, taken_raw=raw_taken), d["parTime"])
            mult = {"easy": 0.8, "normal": 1.0, "hard": 1.25}[args.diff]
            base = max(0, min(200000, 80000 + exp_t + exp_a + exp_d + sc["intel"] + sc["bonus"] - sc["downs"] * 8000))
            ok &= _check(notes, sc["time"] == exp_t and sc["accuracy"] == exp_a and sc["damage"] == exp_d and sc["base"] == base and sc["total"] == min(250000, int(base * mult)),
                         f"점수식(gdd-final §7-1) 다시 셈 = 본체: 시간 {exp_t} · 명중 {exp_a} · 피해 {exp_d} · 기본 {base} · 합 {min(250000, int(base * mult))}")
            fail = J("() => [__fps.score('quit'), __fps.score('fail')]")
            n_obj = len(ids)
            ok &= _check(notes, fail[0]["total"] == int(n_obj / n_obj * 30000) and fail[1]["total"] == fail[0]["total"],
                         f"그만두기 · 실패 규칙(끝낸 목표 ÷ 전체 × 30,000) = {fail[0]['total']}")
            pg.screenshot(path=str(out / f"mission-{mid}-result.png"))
            if mid == "m1":   # S10b — 아군 구역 건너기 · 떨어짐 · 첫 처치(이 판 사건)
                summary["ally"] = J("() => { const a = __fps.allies().allies[0]; const p = __fps.state().pos; const st = FG.allies.stats; return a ? { d: +Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]).toFixed(1), crosses: st.crosses, catchups: st.catchups } : null; }")
                ok &= _check(notes, summary["ally"] and summary["ally"]["d"] <= 20 and summary["ally"]["crosses"] >= 4,
                             f"물총새가 구역 다섯을 따라옴: 구역 건너기 {summary['ally'] and summary['ally']['crosses']}번 · 따라붙기(안 보일 때 뒤로) {summary['ally'] and summary['ally']['catchups']}번 · 끝날 때 플레이어와 {summary['ally'] and summary['ally']['d']}m")
                ok &= _check(notes, m.get("falls", 0) == 0, f"떨어짐(맵 밖) {m.get('falls', 0)}번 = 0")
                fk = J("() => { const ev = __mi.ev(0, ['missionStart', 'enemyDown']); const s0 = ev.filter(e => e.type === 'missionStart').pop(); const e = ev.find(x => x.type === 'enemyDown' && x.t >= s0.t); return e ? +(e.t - s0.t).toFixed(3) : null; }")
                summary["firstKill"] = fk
                ok &= _check(notes, fk is not None and fk <= 20, f"첫 처치까지 {fk}초 ≤ 20(자동 조종 · 연출 건너뜀 — 연출 포함 판은 아래 첫 30초 검사)")
            if mid == "m2":   # S11b — 바위가 구역 넷을 따라옴 · 떨어짐 0 · 정보 조각 둘(자동 조종 경로)
                summary["ally"] = J("() => { const a = __fps.allies().allies.find(x => x.id === 'bawi'); const p = __fps.state().pos; const st = FG.allies.stats; return a ? { d: +Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]).toFixed(1), crosses: st.crosses, catchups: st.catchups } : null; }")
                ok &= _check(notes, summary["ally"] and summary["ally"]["d"] <= 20 and summary["ally"]["crosses"] >= 3,
                             f"바위가 구역 넷을 따라옴: 구역 건너기 {summary['ally'] and summary['ally']['crosses']}번 · 따라붙기 {summary['ally'] and summary['ally']['catchups']}번 · 끝날 때 플레이어와 {summary['ally'] and summary['ally']['d']}m")
                ok &= _check(notes, m.get("falls", 0) == 0 and sorted(m["intel"]) == ["0", "1"] and sc["intel"] == 20000,
                             f"떨어짐 {m.get('falls', 0)}번 = 0 · 정보 조각 {m['intel']}(칠판 「배 시간표」 · 책상 「무전 암호표」) → {sc['intel']}점")
            summary["run"] = {"t": m["t"], "real": real, "score": sc["total"], "elapsed": elapsed, "shots": sc["shots"], "hits": sc["hits"], "kills": sc["kills"]}
            # 난이도별 적 수(gdd-final §5-2): 쉬움 무리마다 −20%(반올림 · 최소 1) · 보통 기준 · 어려움 기준 + 마지막 웨이브(last:true) +2
            pgc = fresh()
            cnt = pgc.evaluate("""(a) => { const out = {}, sq = {};
                for (const df of ['easy', 'normal', 'hard']) { __fps.startMission(a, { diff: df, seed: 5 }); const c = {};
                    for (const e of __fps.enemies()) c[e.group] = (c[e.group] || 0) + 1; out[df] = c; }
                const types = {};
                for (const df of ['easy', 'normal']) { types[df] = {}; __fps.startMission(a, { diff: df, seed: 5 }); for (const e of __fps.enemies()) types[df][e.type] = (types[df][e.type] || 0) + 1; }
                if (!FG.missions[a].noActors) for (const z of FG.missions[a].zones) for (const g of (FG.maps[z].squads || [])) sq[g.id] = { n: g.spawn.length, last: !!g.last, types: g.spawn.map((s) => s[4] || g.type) };
                return { out, sq, types }; }""", mid)
            exp = {"easy": _easy_counts(cnt["sq"])}
            for df in ("normal", "hard"):
                exp[df] = {g: v["n"] + (2 if df == "hard" and v["last"] else 0) for g, v in cnt["sq"].items()}
            # fix3: 쉬움은 임무 전체 인원 × 0.8(반올림) · 빼는 사람은 소총수부터 — 특수 종류(돌격수 · 방탄 · 관측수) 수는 보통과 같아야
            sp_e = {k: v for k, v in cnt["types"]["easy"].items() if k != "rifle"}
            sp_n = {k: v for k, v in cnt["types"]["normal"].items() if k != "rifle"}
            ok &= _check(notes, sp_e == sp_n and (not cnt["sq"] or sum(cnt["out"]["easy"].values()) == int(sum(v["n"] for v in cnt["sq"].values()) * 0.8 + 0.5)),
                         f"쉬움 = 임무 전체 × 0.8 → {sum(cnt['out']['easy'].values())}명(보통 {sum(cnt['out']['normal'].values())}), 특수 종류 쉬움 {sp_e} = 보통 {sp_n}(소총수부터 뺌)")
            lasts = [g for g, v in cnt["sq"].items() if v["last"]]
            ok &= _check(notes, cnt["out"] == exp,
                         f"난이도별 적 수 = 자료 × 배율(+어려움 마지막 웨이브 {lasts} +2): " + " · ".join(f"{df} {sum(cnt['out'][df].values())}명 {cnt['out'][df]}" for df in ("easy", "normal", "hard"))
                         + ("" if cnt["out"] == exp else f" / 기대 {exp}"))
            summary["enemies"] = {df: sum(v.values()) for df, v in cnt["out"].items()}

            if mid == "m1" and args.diff == "normal":
                ok &= _mission_m1_extra(s, fresh, out, notes, summary)
            if mid == "m2" and args.diff == "normal":
                ok &= _mission_m2_extra(s, fresh, out, notes, summary)
            if mid == "m2w":
                ok &= _mission_m2w_extra(s, fresh, out, notes, summary)
            if mid == "t2":
                ok &= _mission_t2_extra(s, fresh, out, notes, summary)
            elif mid == "t0":
                ok &= _mission_t0_keys(s, fresh, out, notes, summary)
            ok &= _check(notes, not s.errors and not s.external and not s.missing, f"오류 0 · 바깥 요청 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("mission", ok, summary, notes)


def _mission_m1_extra(s, fresh, out, notes, summary):
    """S10b — 임무 1 「첫 불빛」: 첫 30초 약속(시작 연출 포함 · 첫 사격 15초 · 첫 처치 20초), 바탕 소리 · 음악 상태(은신 → 등대 곡 → 전투 곡),
    등대 켜짐(소품 · 체크포인트 복원), 동굴 어둠 · 야간투시경(밝은 곳 눈부심 · 동굴 증폭 — PM 임시 결정 3), 발견 게이지 밝기 배수,
    0발 명중 절반(PM 임시 결정 1), 어려움 트인 곳 첫 적 탄 → 쓰러짐 ≥ 1.2초(PM 임시 결정 2)."""
    ok = True
    # 1) 첫 30초 — 시작 연출(3초)을 건너뛰지 않고 자동 조종(보통) · 실시간에 가까운 fast(2)
    pg = fresh(); J = pg.evaluate
    # 추천 장비(물수제비 + 솜방망이 소음기 — 고르기 카드 rec) 그대로 = 처음 온 회원이 「바로 출격」으로 받는 장비
    J("() => { const r = FG.missions.catalog[0].rec; __fps.startMission('m1', { diff: 'normal', seed: 5, skipIntro: false, loadout: { primary: r.primary, secondary: r.secondary, attach: { primary: { optic: r.optic, muzzle: r.muzzle, mag: r.mag } } } });"
      " __fps.god(true); __fps.autopilot(true, { skipCine: false }); __fps.pauseLoop(); }")
    first = None
    for _ in range(80):   # fix3 — sim 단계(0.25초 × 4)로 — 기계가 무거워도 같은 결과
        J("() => { for (let k = 0; k < 4; k++) __fps.step(0.25); }")
        first = J("() => { const all = __mi.ev(0, ['missionStart', 'cine', 'cineEnd', 'shot', 'enemyDown', 'objDone', 'aiState']); const s0 = all.filter(e => e.type === 'missionStart').pop(); const ev = all.filter(e => e.t >= s0.t); const T = (e) => e ? +(e.t - s0.t).toFixed(3) : null;"
                  " const sh = ev.find(e => e.type === 'shot' && e.p.by === 'player'); const k = ev.find(e => e.type === 'enemyDown');"
                  " const o1 = ev.find(e => e.type === 'objDone' && e.p.id === 'o1'); const fight = ev.find(e => e.type === 'aiState' && /^g_beach/.test((FG.ai.get(e.p.id) || { group: 'g_beach' }).group) && ['engage', 'cover'].indexOf(e.p.to) >= 0);"
                  " return { cine: ev.filter(e => e.type === 'cine').map(e => e.p.name), cineEnd: T(ev.find(e => e.type === 'cineEnd')),"
                  " shot: T(sh), silenced: sh ? sh.p.silenced : null, kill: T(k), o1: T(o1), guardFight: T(fight), mt: __fps.mission().t }; }")
        if first["o1"] is not None or first["mt"] > 40:
            break
    J("() => __fps.resumeLoop()")
    summary["first30"] = first
    ok &= _check(notes, first["cine"] == ["intro"] and first["shot"] is not None and (first["cineEnd"] or 0) <= first["shot"] <= 15 and first["kill"] is not None and first["kill"] <= 20,
                 f"첫 30초 약속(시작 연출 {first['cine']} 끝 {first['cineEnd']}초 포함 · 추천 장비): 첫 사격 {first['shot']}초 ≤ 15(연출 뒤 — 소음기 {first['silenced']}) · 첫 처치 {first['kill']}초 ≤ 20 · 해변 경비 둘 끝 {first['o1']}초(임무 시계, 자동 조종 · 보통)")
    ok &= _check(notes, first["silenced"] and first["guardFight"] is None,
                 f"소음기로 둘 다 처리하면 경비가 교전에 들어가지 않음(교전 시작 {first['guardFight']}) — 은신 유지")
    pg.screenshot(path=str(out / "mission-m1-first30.png"))

    # 2) 소리 · 음악 상태 · 등대 켜짐 · 체크포인트 복원 · 동굴 · 야간투시경 — 고리는 실시간(화면 쪽 분위기 · 소리가 실제 프레임 간격으로 바뀜)
    pg = fresh(); J = pg.evaluate
    J("() => { FG.audio.unlock(); FG.music.unlock(); __fps.startMission('m1', { diff: 'normal', seed: 5 }); __fps.god(true); }")
    pg.wait_for_timeout(700)
    r = J("""() => { const a = __fps.audio().amb, mu = __fps.music();
        return { amb: a, mState: FG.mission.M.music, want: mu.want, mixT: mu.mixTarget, duck: mu.duck ? FG.cfg.MUSIC.DUCK_RADIO : 1, preload: !!mu.tracks.lighthouse, music0: FG.cfg.AUDIO.MUSIC, stealthK: FG.cfg.MUSIC.STEALTH,
          props: FG.props.state() }; }""")
    ok &= _check(notes, r["amb"]["kind"] == "sea" and r["amb"]["loops"] == 2,
                 f"바탕 소리: 새벽 파도 · 바람 고리 {r['amb']['loops']}개 재생(kind {r['amb']['kind']}) · 무적은 26~38초마다(등대가 켜질 때 한 번 더)")
    ok &= _check(notes, r["mState"] == "stealth" and r["want"] == "combat" and abs(r["mixT"] - r["music0"] * r["stealthK"] * r["duck"]) < 1e-3 and r["preload"],
                 f"음악: 시작 = 은신(전투 곡 × {r['stealthK']}{' × 무전 중 ' + str(r['duck']) if r['duck'] != 1 else ''} → 목표 크기 {r['mixT']}) · 등대 장면 곡 미리 받기 {r['preload']}")
    ok &= _check(notes, not r["props"]["on"] and not r["props"]["visible"] and r["props"]["lights"] == 4,
                 f"등대 켜지기 전: 빛줄기 · 렌즈 꺼짐(보임 {r['props']['visible']}) · 보트 불빛 자리 {r['props']['lights']}개 준비")
    put = "(a) => { __fps.teleport(a[0], FG.nav.heightAt(a[0], a[1], 0) + 0.05, a[1], a[2]); __fps.look(a[2], 0); FG.weapons.nvg = a[3]; }"
    J("() => { __fps.killGroup('g_beach'); }")
    J(put, [0, 6, 0, True]); pg.wait_for_timeout(1600)
    bright = J("() => ({ light: FG.map.lightAt(0, 1.5, 6), env: FG.gfx.envState(), nvg: __fps.nvg() })")
    J(put, [-37, 2, 270, False]); pg.wait_for_timeout(2200)
    caveEye = J("() => ({ light: FG.map.lightAt(-37, 1.3, 2), env: FG.gfx.envState() })")
    J(put, [-37, 2, 270, True]); pg.wait_for_timeout(1600)
    caveNvg = J("() => ({ env: FG.gfx.envState(), nvg: __fps.nvg(), amb: __fps.audio().amb })")
    pg.screenshot(path=str(out / "mission-m1-cave-nvg.png"))
    J("() => { FG.weapons.nvg = false; }")
    b, ce, cn = bright, caveEye, caveNvg
    summary["nvg"] = {"bright": [b["env"]["exposure"], b["nvg"]["glare"]], "cave": [cn["env"]["exposure"], cn["nvg"]["glare"], cn["env"]["fog"][:2]]}
    ok &= _check(notes, ce["light"] <= 0.55 and ce["env"]["f"] <= 0.75 and b["light"] == 1,
                 f"동굴 어둠: 그 자리 밝기 배수 {ce['light']}(발견 게이지도 이만큼 느림) · 화면 빛 배수 {ce['env']['f']} / 해변 {b['light']}")
    ok &= _check(notes, b["nvg"]["on"] and b["nvg"]["glare"] >= 0.6 and b["env"]["exposure"] <= 1.4 and cn["nvg"]["glare"] <= 0.05 and cn["env"]["exposure"] >= 1.85 and cn["env"]["fog"][1] <= 60,
                 f"야간투시경(PM 임시 결정 3): 밝은 해변 = 눈부심 덮개 {b['nvg']['glare']} · 노출 {b['env']['exposure']}(하얗게 날아가지 않게) / 동굴 = 눈부심 {cn['nvg']['glare']} · 노출 {cn['env']['exposure']} · 빛 증폭(반구광 {cn['env']['hemi']}) · 안개 {cn['env']['fog'][:2]}(굴 안쪽이 어둡게 가라앉는 깊이)")
    ok &= _check(notes, cn["amb"]["lp"] is not None and cn["amb"]["lp"] < 3000, f"동굴 안 파도 소리 먹먹하게(저역 통과 {cn['amb']['lp']}Hz)")
    # 등대 켜짐 → 등대 곡 · 연출 · 무적 · 빛줄기 회전 → 체크포인트 cp5 복원도 켜진 채 → 내리막 가운데에서 전투 곡
    h0 = J("""() => { __fps.skipTo('o5'); const m = FG.map.mark('m1z4.genFront'); __fps.teleport(m[0], m[1] + 0.05, m[2], 0); return __fps.audio().amb.horns; }""")
    pg.wait_for_timeout(300)
    J("() => { FG.mission.M.skipCine = false; FG.mission.completeObjective(); }")
    mu = []
    for _ in range(8):
        pg.wait_for_timeout(250)
        mu.append(J("() => FG.music.state().want"))
    p1 = J("() => FG.props.state()")
    pg.wait_for_timeout(600)
    p2 = J("() => FG.props.state()")
    pg.screenshot(path=str(out / "mission-m1-lighthouse-cine.png"))
    cine = J("() => (__mi.ev(0, ['cine']).pop() || {}).p || null")
    hornsAdd = J("() => __fps.audio().amb.horns") - h0
    pg.wait_for_timeout(4500)
    cp = J("() => __fps.mission().checkpoint")
    J("() => __fps.killPlayer()")
    pg.wait_for_timeout(2200)
    p3 = J("() => FG.props.state()")
    st3 = J("() => __fps.mission()")
    J("() => { const d1 = FG.map.mark('m1z5.d1mid'); __fps.teleport(d1[0], d1[1] + 0.05, d1[2], 90); }")
    pg.wait_for_timeout(900)
    after = J("() => ({ want: FG.music.state().want, m: FG.mission.M.music })")
    ok &= _check(notes, cine and cine["name"] == "lighthouseOn" and "lighthouse" in mu and hornsAdd >= 1,
                 f"레버 → 등대 켜짐 연출 {cine} · 음악 {sorted(set(mu))}(등대 장면 곡) · 무적 한 번 울림 {hornsAdd}")
    ok &= _check(notes, p1["on"] and p2["visible"] and p2["k"] == 1 and p2["beams"] == 2 and p2["ang"] != p1["ang"],
                 f"등대 소품: 렌즈 · 빛 번짐 · 회전 빛줄기 {p2['beams']}개(밝기 {p2['k']}, 각도 {p1['ang']} → {p2['ang']} — 9초에 한 바퀴) · 보트 불빛 {p2['lights']}")
    ok &= _check(notes, cp == "cp5" and p3["on"] and st3["flags"].get("lhOn") and st3["objective"] and st3["objective"]["id"] == "o6",
                 f"체크포인트 {cp} 에서 쓰러졌다 복원 → 등대는 켜진 채(깃발 lhOn {st3['flags'].get('lhOn')}) · 목표 {st3['objective'] and st3['objective']['id']}")
    ok &= _check(notes, after["want"] == "combat" and after["m"] == "combat",
                 f"선착장 내리막 가운데 → 전투 곡으로 겹쳐 넘김(음악 상태 {after['m']} · 곡 {after['want']})")

    # 3) 0발로 끝낸 판 명중률 = 절반(PM 임시 결정 1) — 시험 작전 t0(키 W 만으로 걷기)
    pg = fresh(); J = pg.evaluate
    r = J("() => { __fps.startMission('t0', { seed: 3 }); __fps.autopilot(true); __fps.pauseLoop(); for (let k = 0; k < 60 && __fps.mission().state !== 'end'; k++) __fps.step(0.5); return __fps.score(); }")
    ok &= _check(notes, r["result"] == "success" and r["shots"] == 0 and r["accuracy"] == 15000,
                 f"한 발도 안 쏜 판(t0) 명중률 점수 {r['accuracy']} = 30,000 의 절반(PM 임시 결정 1) · 쏜 탄 {r['shots']}")

    # 4) 어려움 — 트인 마당(t2)에 가만히 서 있을 때 첫 적 탄 → 쓰러짐 ≥ 1.2초(PM 임시 결정 2), 씨앗 8개
    pg = fresh(); J = pg.evaluate
    JS = """(a) => { __fps.startMission('t2', { diff: a[0], seed: a[1] }); __fps.pauseLoop(); __fps.god(false); __fps.step(1);
      __fps.teleport(0, 0, 6, 0); const m0 = __mi.mark(); let tFirst = null, tDown = null;
      for (let k = 0; k < 600 && tDown === null; k++) { __fps.step(0.05); const ev = __mi.ev(m0, ['enemyShot', 'playerDown']);
        const f = ev.find(e => e.type === 'enemyShot'); if (f && tFirst === null) tFirst = f.t; const dn = ev.find(e => e.type === 'playerDown'); if (dn) tDown = dn.t; }
      return tFirst !== null && tDown !== null ? +(tDown - tFirst).toFixed(2) : null; }"""
    hard = [J(JS, ["hard", sd]) for sd in (3, 5, 7, 11, 13, 17, 19, 23)]
    norm = [J(JS, ["normal", sd]) for sd in (3, 5, 7, 11)]
    hv = [x for x in hard if x is not None]
    summary["idleDown"] = {"hard": hard, "normal": norm}
    ok &= _check(notes, len(hv) == len(hard) and min(hv) >= 1.2,
                 f"어려움 트인 곳 첫 적 탄 → 쓰러짐(PM 임시 결정 2): 씨앗 8개 {hard} → 최소 {min(hv) if hv else None}초 ≥ 1.2 · 가운데 {sorted(hv)[len(hv) // 2] if hv else None}초 (보통 참고 {norm})")
    cfg = J("() => FG.cfg.DIFF.hard")
    ok &= _check(notes, cfg["react"] == 0.35 and cfg["acc"] == 0.45 and cfg["playerDmg"] == 1.5,
                 f"반응 · 명중 · 피해 표는 그대로(gdd §5-2): 반응 {cfg['react']} · 명중 {cfg['acc']} · 피해 × {cfg['playerDmg']} — 바꾼 것은 연사 첫 {cfg.get('openN')}발 간격 × {cfg.get('openK')} · 연사 보정 상한 {cfg.get('rampMax')}")
    ok &= _fix3_m1(fresh, notes, summary)
    return ok


def _fix3_m1(fresh, notes, summary):
    """fix3 — 임무 1: 구역 이음 따라 걷기(떨어짐 0) · 가장자리 12방향 걷기(맵 밖 0) · 구역 막이(동굴 = o1 뒤 · 선착장 길 = o5 뒤, 탄은 지나감) ·
    물에 빠짐 = 체크포인트로(쓰러짐 감점 없음) · 잠든 선착장 무리는 탄 · 폭발에 안 맞음."""
    ok = True
    pg = fresh(); J = pg.evaluate
    J("() => { __fps.startMission('m1', { diff: 'normal', seed: 5 }); __fps.god(true); __fps.pauseLoop(); __fps.step(0.3); }")
    r = J("""() => { const P = FG.player, out = []; let fell = 0; FG.bus.on('fell', () => fell++);
        const ai = FG.ai.ents.map(e => [e, e.pos.clone()]);
        const walk = (x, y, z, yaw, sec) => { __fps.teleport(x, y, z, yaw); __fps.clearInput(); __fps.step(0.4); __fps.setInput({ moveZ: 1 }); __fps.step(sec); __fps.clearInput(); __fps.step(0.3); };
        // ② 구역 막이(먼저 — 오래 걸으면 물총새가 해변 경비를 잡아 o1 이 끝날 수 있음) — o1 전 동굴 입구로 걸으면 막힘, 막이를 지나는 광선은 막히지 않음
        const obj0 = __fps.mission().objective.id;
        const cm = FG.map.mark('m1z1.caveMouth'); walk(cm[0], cm[1] + 0.2, cm[2], 270, 3); const caveBefore = +P.pos.x.toFixed(2);
        const T = THREE; const h = FG.world.ray(new T.Vector3(-17, 1.4, 2), new T.Vector3(-1, 0, 0), 6);
        const ex = FG.map.mark('m1z4.exitE'); walk(ex[0], ex[1] + 0.2, ex[2], 90, 3); const dockBefore = +P.pos.x.toFixed(2);
        // ① 절벽 길(m1z3) ↔ 고원(m1z4) 이음: z -58 ~ -22 를 2m 간격으로 동쪽 · 서쪽으로 3초씩
        for (let z = -58; z <= -22; z += 2) { const f0 = fell; walk(-24, 20, z, 90, 3); if (fell > f0) out.push(['east', z]); }
        for (let z = -58; z <= -22; z += 2) { const f0 = fell; walk(-16, 30, z, 270, 3); if (fell > f0) out.push(['west', z]); }
        // ③ 잠든 선착장 무리(g_dock) — 탄 · 폭발에 안 맞음
        const e = FG.ai.ents.find(x => x.group === 'g_dock'); const hp0 = e.hp;
        __fps.teleport(e.pos.x - 6, e.pos.y + 0.1, e.pos.z, 90); __fps.step(0.1); __fps.infiniteAmmo(true); __fps.aimAt(e.id, 'torso'); __fps.fireFor(0.5);
        __fps.explodeAt([e.pos.x + 1, e.pos.y + 0.3, e.pos.z]); __fps.step(0.2); const hp1 = e.hp;
        // ④ 물에 빠짐 — 맵 밖으로 떨어뜨리면 체크포인트로 · 쓰러짐(downs) 그대로
        const d0 = FG.mission.M.sc.downs, f0 = FG.mission.M.falls || 0; __fps.teleport(30, -30, 30, 0); __fps.step(3);
        const d1 = FG.mission.M.sc.downs, f1 = FG.mission.M.falls || 0;
        return { seam: out, obj0, caveBefore, rayGate: h ? +h.dist.toFixed(2) : null, dockBefore, hp0, hp1, downs: [d0, d1], falls: [f0, f1], state: __fps.mission().state }; }""")
    summary["fix3m1"] = r
    ok &= _check(notes, not r["seam"], f"절벽 길 ↔ 고원 이음 따라 걷기(동 · 서 각 19줄, 3초씩): 떨어짐 {r['seam'] or 0}")
    ok &= _check(notes, r["obj0"] == "o1" and r["caveBefore"] > -20.6 and r["rayGate"] is None and r["dockBefore"] < 20.2,
                 f"구역 막이({r['obj0']} 중): 해변 경비 전 동굴 입구 막힘(멈춘 x {r['caveBefore']} > -20.6) · 막이 너머 광선 안 막힘({r['rayGate']}) · 레버 전 선착장 길 막힘(x {r['dockBefore']} < 20.2)")
    ok &= _check(notes, r["hp1"] == r["hp0"], f"잠든 선착장 적은 탄 · 수류탄에 안 맞음: 체력 {r['hp0']} → {r['hp1']}")
    ok &= _check(notes, r["falls"][1] == r["falls"][0] + 1 and r["downs"][1] == r["downs"][0],
                 f"물에 빠짐 → 체크포인트로(떨어짐 {r['falls'][0]} → {r['falls'][1]}) · 쓰러짐 감점 없음(downs {r['downs'][0]} → {r['downs'][1]})")
    # ⑤ 가장자리 — 표식마다 12방향 7초(달리기 · 1초마다 뛰기) 걸어도 구역 밖 · 아래로 떨어짐 0
    edge = _edge_walk(fresh, 'm1')
    summary["edge"] = summary.get("edge", {}); summary["edge"]["m1"] = edge
    ok &= _check(notes, edge["n"] == 0, f"임무 1 가장자리 걷기: 표식 {edge['marks']}개 × 12방향 = {edge['runs']}번 → 구역 밖 · 바다로 떨어짐 {edge['n']}번 {edge['out'][:3]}")
    return ok


EDGE_JS = """(mid) => { __fps.startMission(mid, { diff: 'normal', seed: 5 }); __fps.god(true); __fps.pauseLoop(); __fps.step(0.3);
  const d = __fps.missionDef(); __fps.killAll();
  for (const id of ['gateL', 'gateR', 'blast', 'gen', 'caveGate', 'dockGate']) try { __fps.door(id, true); } catch (e) {}
  const Z = d.zones.map(z => { const D = FG.maps[z]; return { cx: D.origin[0], cz: D.origin[2], hw: D.size[0] / 2, hd: D.size[1] / 2 }; });
  const inside = (x, z, m) => Z.some(r => Math.abs(x - r.cx) <= r.hw + m && Math.abs(z - r.cz) <= r.hd + m);
  let fell = 0; FG.bus.on('fell', () => { fell++; });
  const P = FG.player, M = __fps.marks();
  const names = Object.keys(M).filter(n => d.zones.some(z => n.startsWith(z + '.')) && !/cam|lamp|boat|gull|look|Look|chimney|leak|vent|roof\\b|roofView|lh\\./.test(n));
  const out = []; let runs = 0;
  for (const n of names) { const m = M[n];
    for (let k = 0; k < 12; k++) { const yaw = k * 30; __fps.teleport(m[0], m[1] + 0.3, m[2], yaw); __fps.clearInput(); __fps.step(0.5); if (!P.onGround) continue;
      const f0 = fell; runs++; __fps.setInput({ moveZ: 1, sprint: true }); let bad = null;
      for (let t = 0; t < 28; t++) { if (t % 4 === 1) __fps.press('jump'); __fps.step(0.25);
        if (!inside(P.pos.x, P.pos.z, 0.5)) { bad = 'outside'; break; } if (P.pos.y < -6) { bad = 'below'; break; } }
      __fps.clearInput(); __fps.step(0.3); if (fell > f0) bad = bad || 'fell';
      if (bad) out.push([n, yaw, bad]); } }
  return { marks: names.length, runs, n: out.length, out: out.slice(0, 10) }; }"""


def _edge_walk(fresh, mid):
    pg = fresh()
    return pg.evaluate(EDGE_JS, mid)



def _mission_m2_extra(s, fresh, out, notes, summary):
    """S11b — 임무 2 「짠물 밸브」: 시작(공장 소리 · 정문 닫힘 · 바위) → 바위가 정문을 엶(마당 무리 깸) → 돌격수 · 방탄 경비 첫 등장 한 줄 안내 →
    밸브 A · B(F 길게 2초 — 떼면 0.5초 유지 뒤 줄어듦 · 돌리기 시작하면 북문 무리 깸) → 증기 기둥 10초(눈 시선 막음 · 체크포인트 복원에도 남음) →
    45초 버티기(세 방향 웨이브 시각 · 지붕 위 사수 · 바위 작업 자리) → 폭파 문(바위 기폭 — 문 열림 · 문 안쪽 적 맞음 · 플레이어 안 다침 · 창고 무리 깸) → 정보 조각."""
    ok = True
    pg = fresh()
    J = pg.evaluate
    say = "(m) => __mi.ev(m, ['say']).map(e => e.p.who + ':' + e.p.text)"
    hint = "(m) => __mi.ev(m, ['hint']).map(e => e.p.text)"
    # 0) 시작
    r = J("""() => { FG.audio.unlock(); __fps.startMission('m2', { diff: 'normal', seed: 5 }); __fps.god(true); __fps.pauseLoop(); __fps.step(0.5);
        const d = (id) => { const x = FG.world.dynGet(id); return x ? x.enabled : null; };
        const roof = __fps.enemies().filter(e => e.group === 'g_wRoof');
        return { amb: FG.mission.M.amb, ambKind: __fps.audio().amb.kind, music: FG.mission.M.music, gateL: d('gateL'), gateR: d('gateR'), blast: d('blast'),
            ally: (__fps.allies().allies || []).map(a => a.id), roof: roof.map(e => [e.pos[1], e.state]), roofFixed: FG.ai.ents.filter(e => e.group === 'g_wRoof').every(e => e.fixed),
            dormant: Object.keys(FG.ai.groups).filter(k => FG.ai.groups[k].dormant).sort(), cine: !!FG.missions.m2.cinematics.intro }; }""")
    ok &= _check(notes, r["amb"] == "factory" and r["gateL"] and r["gateR"] and r["blast"] and r["ally"] == ["bawi"] and r["music"] == "calm",
                 f"시작: 바탕 소리 {r['amb']}({r['ambKind']}) · 음악 {r['music']} · 정문 문짝 닫힘 {r['gateL']}/{r['gateR']} · 폭파 문 닫힘 {r['blast']} · 아군 {r['ally']} · 시작 연출 {r['cine']}")
    ok &= _check(notes, r["dormant"] == sorted(["g_yard", "g_valve", "g_wSW", "g_wRoof", "g_wStair", "g_wN", "g_wh"]) and r["roofFixed"] and all(abs(y - 4.5) < 0.2 for y, _ in r["roof"]),
                 f"잠든 무리 {r['dormant']} · 여과동 지붕 위 사수 {r['roof']}(높이 4.5 · 제자리)")
    # 1) 정문 — 경비 둘을 치우면 바위가 엶
    m0 = J("() => __mi.mark()")
    g = J("""() => { __fps.killGroup('g_cause'); __fps.step(1); const a = FG.allies.ents[0]; const at0 = [a.pos.x, a.pos.z]; __fps.step(4.5);
        const d = (id) => FG.world.dynGet(id).enabled; return { gateL: d('gateL'), gateR: d('gateR'), flag: !!__fps.mission().flags.gateOpen, yardAwake: !FG.ai.groups.g_yard.dormant,
          cp: __fps.mission().checkpoint, obj: __fps.mission().objective.id, bawi: [+FG.allies.ents[0].pos.x.toFixed(1), +FG.allies.ents[0].pos.z.toFixed(1)] }; }""")
    sd = J(say, m0)
    ok &= _check(notes, not g["gateL"] and not g["gateR"] and g["flag"] and g["yardAwake"] and g["cp"] == "cp1" and g["obj"] == "o2" and any("정문은 내가 연다" in x for x in sd),
                 f"정문: 경비 둘 처리 → 체크포인트 {g['cp']} · 바위 「정문은 내가 연다…」 → 문짝 열림 · 마당 무리 깸 {g['yardAwake']} · 바위 자리 {g['bawi']}")
    # 2) 처음 만남 — 돌격수(마당) · 방탄 경비(펌프동): 그 종류가 싸우기 시작하면 바위 한 줄 + 안내 한 줄(한 번만)
    m1 = J("() => __mi.mark()")
    J("() => { const m = FG.map.mark('m2z1.gateIn'); __fps.teleport(m[0], m[1] + 0.05, m[2] - 4, 0); __fps.look(0, 0); for (let k = 0; k < 40 && !__mi.ev(__mi.mark() - 400, ['say']).some(e => /두건/.test(e.p.text)); k++) __fps.step(0.25); }")
    J("() => { __fps.killGroup('g_yard'); __fps.killGroup('g_yardN'); __fps.step(1); const m = FG.map.mark('m2z2.doorS'); __fps.teleport(m[0], m[1] + 0.05, m[2] - 5, 0); __fps.look(0, 0); for (let k = 0; k < 40; k++) __fps.step(0.25); }")
    sd = J(say, m1); hd = J(hint, m1)
    rush = [x for x in sd if "두건" in x]; heavy = [x for x in sd if "판때기" in x]
    ok &= _check(notes, len(rush) == 1 and len(heavy) == 1 and any("돌격수" in x for x in hd) and any("방탄 경비" in x for x in hd),
                 f"첫 등장 한 줄 안내(gdd §5): 돌격수 — {rush} · 방탄 경비 — {heavy} · 안내 {[x[:18] for x in hd if '돌격수' in x or '방탄' in x]}")
    # 3) 밸브 A · B — F 길게 2초(떼면 0.5초 유지 뒤 줄어듦), 돌리기 시작하면 북문 무리 깸
    v = J("""() => { __fps.killGroup('g_pump'); __fps.killGroup('g_pumpH'); __fps.step(1); const o = __fps.mission().objective.id;
        const f = FG.map.mark('m2z2.valveA.front'); __fps.teleport(f[0], f[1] + 0.05, f[2], 0); __fps.look(0, -15); __fps.step(0.1);
        const near = __fps.mission().objective.near;
        __fps.setInput({ interact: true }); __fps.step(1.0); const p1 = __fps.mission().objective.progress; const woke = !FG.ai.groups.g_valve.dormant;
        __fps.setInput({ interact: false }); __fps.step(0.4); const pKeep = __fps.mission().objective.progress; __fps.step(0.6); const pDrop = __fps.mission().objective.progress;
        __fps.setInput({ interact: true }); __fps.step(1.8); const oA = __fps.mission().objective.id; __fps.setInput({ interact: false });
        const fb = FG.map.mark('m2z2.valveB.front'); __fps.teleport(fb[0], fb[1] + 0.05, fb[2], 0); __fps.look(0, -15); __fps.step(0.1);
        __fps.setInput({ interact: true }); __fps.step(2.2); __fps.setInput({ interact: false }); const oB = __fps.mission().objective.id;
        __fps.step(0.6); const s0 = FG.world.smoke.length; __fps.step(1.4);
        const vent = FG.map.mark('m2z3.vent'); const V = THREE.Vector3; const a = new V(vent[0] - 5, 1.6, vent[2]), b = new V(vent[0] + 5, 1.6, vent[2]);
        return { o, near, p1, woke, pKeep, pDrop, oA, oB, s0, smoke: FG.world.smoke.map(q => [q.id, +(q.t1 - q.t0).toFixed(2)]), los: FG.world.losClear(a, b), sight: FG.world.sightClear(a, b),
          cp: __fps.mission().checkpoint, props: FG.props.state().steam }; }""")
    summary["valves"] = v
    ok &= _check(notes, v["o"] == "o4" and v["near"] and 0.45 <= v["p1"] <= 1.05 and v["woke"] and abs(v["pKeep"] - v["p1"]) < 1e-6 and v["pDrop"] < v["pKeep"] and v["oA"] == "o5" and v["oB"] == "o6",
                 f"밸브: 앞에서 바라보면 안내(near {v['near']}) · F 1초 = {v['p1']} / 2 · 돌리기 시작 → 북문 무리 깸 {v['woke']} · 떼고 0.4초 유지 {v['pKeep']} → 0.6초 더 지나 {v['pDrop']} · 마저 돌리면 A 끝(→ {v['oA']}) · B 2초 → {v['oB']}")
    ok &= _check(notes, v["s0"] == 0 and v["smoke"] == [["m2z3.vent", 10.0]] and v["los"] and not v["sight"] and v["cp"] == "cp4",
                 f"밸브 둘 → 바위 대사 뒤 증기 기둥 {v['smoke']}(10초) · 기둥 너머 탄 시선 {v['los']} / 눈 시선 {v['sight']} · 체크포인트 {v['cp']} · 화면 증기 {v['props']}")
    # 4) 증기 기둥이 떠 있는 동안 잡은 체크포인트 → 쓰러져 복원해도 같은 남은 시간으로 남음
    c = J("""() => { FG.mission.M.cp = FG.mission.capture(); const s0 = FG.mission.M.cp.smoke; __fps.step(1); __fps.killPlayer(); __fps.step(2);
        const st = __fps.mission(); return { snap: s0, now: FG.world.smoke.map(q => [q.id, +(q.t1 - FG.sim.time).toFixed(2)]), restores: st.restores, cap: FG.mission.M.restoreCap.smoke }; }""")
    ok &= _check(notes, c["snap"] and len(c["snap"]) == 1 and c["restores"] >= 1 and c["cap"] == c["snap"] and c["now"] and abs(c["now"][0][1] - (c["snap"][0][7] - 0.5)) < 0.1,
                 f"체크포인트 스냅숏에 증기 기둥(남은 {c['snap'] and c['snap'][0][7]}초) · 1초 뒤 쓰러짐 → 1.5초 뒤 복원 = 같은 값 {c['cap'] == c['snap']} · 복원 0.5초 뒤 남은 {c['now']}(되감김)")
    # 5) 45초 버티기 — 세 방향 웨이브(남서 길 → 지붕 · 계단 13초 → 북쪽 27초, 마지막), 바위는 작업 자리
    w = J("""() => { __fps.skipTo('o7'); __fps.step(0.2); const d = FG.map.mark('m2z3.defend'); __fps.teleport(d[0], d[1] + 0.05, d[2], 0); __fps.look(0, 0);
        const awake = (g) => FG.ai.groups[g] && !FG.ai.groups[g].dormant; const T = {}; const t0 = __fps.mission().t;
        for (let k = 0; k < 200 && __fps.mission().objective && __fps.mission().objective.id === 'o7'; k++) { __fps.step(0.25);
            for (const g of ['g_wSW', 'g_wRoof', 'g_wStair', 'g_wN']) if (T[g] === undefined && awake(g)) T[g] = +(__fps.mission().t - t0).toFixed(2); }
        const wk = FG.map.mark('m2z3.work'), b = FG.allies.ents[0];
        return { T, obj: __fps.mission().objective.id, t: +(__fps.mission().t - t0).toFixed(2), cp: __fps.mission().checkpoint,
            bawi: +Math.hypot(b.pos.x - wk[0], b.pos.z - wk[2]).toFixed(2), nN: FG.ai.ents.filter(e => e.group === 'g_wN').length }; }""")
    summary["defend"] = w
    ok &= _check(notes, 1 <= w["T"].get("g_wSW", 99) <= 2.5 and 12.5 <= w["T"].get("g_wRoof", 99) <= 14 and 12.5 <= w["T"].get("g_wStair", 99) <= 14 and 26.5 <= w["T"].get("g_wN", 99) <= 28
                 and w["obj"] == "o8" and 44.5 <= w["t"] <= 46 and w["cp"] == "cp6" and w["bawi"] <= 1.6 and w["nN"] == 3,
                 f"버티기 45초: 웨이브 깨는 시각 {w['T']}(남서 길 · 지붕 · 계단 · 북쪽 — 마지막 웨이브 보통 {w['nN']}명) · {w['t']}초에 끝 → {w['obj']} · 체크포인트 {w['cp']} · 바위는 작업 자리 {w['bawi']}m")
    # 6) 폭파 문 — 폭약(F 길게 1.5초) → 「귀 막아」 → 2.4초 뒤 문 열림 · 폭발 · 문 안쪽 적 맞음 · 플레이어 안 다침 · 창고 무리 깸
    m3 = J("() => __mi.mark()")
    b = J("""() => { for (const g of ['g_wSW', 'g_wRoof', 'g_wStair', 'g_wN', 'g_valve', 'g_tank']) __fps.killGroup(g); __fps.step(2.5); __fps.skipTo('o9'); __fps.step(0.2); const f = FG.map.mark('m2z4.blastFront'), ch = FG.map.mark('m2z4.charge'); __fps.teleport(f[0], f[1] + 0.05, ch[2] + 1.3, 0); __fps.look(0, -5);
        const hp0 = FG.player.hp; const e0 = FG.ai.ents.filter(e => e.group === 'g_wh').map(e => [e.id, e.hp]);
        __fps.setInput({ interact: true }); __fps.step(1.7); __fps.setInput({ interact: false }); const o = __fps.mission().objective.id; const closed = FG.world.dynGet('blast').enabled;
        __fps.step(2.2); FG.player.god = false; __fps.step(0.4); FG.player.god = true; __fps.step(0.4);   // 터지는 순간만 god 끔(폭발이 플레이어를 다치게 하는지)
        const e1 = FG.ai.ents.filter(e => e.group === 'g_wh').map(e => [e.id, e.hp, e.down]);
        return { o, closedAfterPlant: closed, open: !FG.world.dynGet('blast').enabled, flag: !!__fps.mission().flags.blastOpen, awake: !FG.ai.groups.g_wh.dormant, hp0, hp1: FG.player.hp, e0, e1, cp: __fps.mission().checkpoint }; }""")
    ex = J("(m) => __mi.ev(m, ['explode', 'playerHurt']).map(e => [e.type, e.p.kind || null])", m3)
    sd = J(say, m3)
    hurt = [e0 for e0, e1 in zip(b["e0"], b["e1"]) if e1[1] < e0[1]]
    summary["blastDoor"] = {k: b[k] for k in ("o", "open", "awake", "hp0", "hp1")}
    ok &= _check(notes, b["o"] == "o10" and b["closedAfterPlant"] and b["open"] and b["flag"] and b["awake"] and ["explode", "breach"] in ex and not any(x[0] == "playerHurt" for x in ex)
                 and b["hp1"] == b["hp0"] and len(hurt) >= 1 and any("귀 막아" in x for x in sd) and b["cp"] == "cp7",
                 f"폭파 문: 폭약 붙임(→ {b['o']}, 아직 닫힘 {b['closedAfterPlant']}) · 바위 「귀 막아.」 → 문 열림 {b['open']} · 폭발 {[x for x in ex if x[0] == 'explode']} · 문 안쪽 적 맞음 {len(hurt)}명 · 플레이어 체력 {b['hp0']} → {b['hp1']} · 창고 무리 깸 {b['awake']} · 체크포인트 {b['cp']}")
    # 7) 정보 조각 — 칠판 · 책상 앞에서 바라보고 F 한 번
    it = J("""() => { const res = []; for (const [mk, at] of [['m2z2.board', 'm2z2.board'], ['m2z4.deskFront', 'm2z4.desk']]) { const m = FG.map.mark(at), f = FG.map.mark(mk);
            const yaw = mk === at ? 270 : 0; const px = mk === at ? m[0] + 1.4 : f[0], pz = mk === at ? m[2] : f[2];
            __fps.teleport(px, FG.nav.heightAt(px, pz, 0) + 0.05, pz, 0); __fps.look(Math.atan2(m[0] - px, -(m[2] - pz)) * 180 / Math.PI, -10); __fps.step(0.1);
            const pr = FG.mission.hudState().intel; __fps.press('interact'); __fps.step(0.1); res.push([at, pr, __fps.mission().intel.slice()]); } return res; }""")
    ok &= _check(notes, it[0][1] and "배 시간표" in it[0][1] and it[1][1] and "암호표" in it[1][1] and it[1][2] == ["0", "1"],
                 f"정보 조각: 칠판 「{it[0][1]}」 · 책상 「{it[1][1]}」 → 챙김 {it[1][2]}")
    # fix3 — 잠든 웨이브 무리(지붕 · 계단)는 o7 전에 탄 · 수류탄에 안 맞음 / 버티기는 작업 자리 반경 밖이면 시간이 멈춤 / 가장자리 걷기
    pg = fresh(); J = pg.evaluate
    dm = J("""() => { __fps.startMission('m2', { seed: 5, diff: 'normal' }); __fps.god(true); __fps.infiniteAmmo(true); __fps.pauseLoop();
        for (const g of ['g_cause', 'g_yard', 'g_yardN', 'g_pump', 'g_pumpH']) __fps.killGroup(g); __fps.skipTo('o6'); __fps.step(0.3);
        const d = FG.map.mark('m2z3.defend'); __fps.teleport(d[0] - 1.5, FG.nav.heightAt(d[0] - 1.5, d[2] + 1.5, 0) + 0.05, d[2] + 1.5, 70);
        const e18 = FG.ai.ents.find(x => x.group === 'g_wRoof'), e20 = FG.ai.ents.find(x => x.group === 'g_wStair');
        const h0 = [e18.hp, e20.hp]; __fps.aimAt(e18.id, 'torso'); __fps.fireFor(0.6); __fps.explodeAt([e20.pos.x + 1, e20.pos.y + 0.3, e20.pos.z]); __fps.step(0.3);
        const h1 = [e18.hp, e20.hp];
        __fps.skipTo('o7'); __fps.step(0.2); __fps.teleport(0, 0.2, 20, 0); __fps.step(0.1); const t0 = __fps.mission().objective.defendT; const m0 = __mi.mark(); __fps.step(10);
        const far = __fps.mission().objective; const hints = __mi.ev(m0, ['hint']).map(e => e.p.text);
        return { h0, h1, farT0: t0, farT: far.defendT, away: far.away, obj: far.id, hints }; }""")
    summary["fix3m2"] = dm
    ok &= _check(notes, dm["h1"] == dm["h0"], f"잠든 웨이브(지붕 사수 · 계단) o7 전 탄 · 수류탄에 안 맞음: 체력 {dm['h0']} → {dm['h1']}")
    ok &= _check(notes, dm["obj"] == "o7" and dm["farT"] == dm["farT0"] and dm["away"] and any("작업 자리" in x for x in dm["hints"]),
                 f"버티기: 작업 자리 반경(16m) 밖 둑길에서 10초 → 시간 {dm['farT0']} → {dm['farT']}초 그대로(멈춤 {dm['away']}) · 안내 {dm['hints'][:1]}")
    edge = _edge_walk(fresh, 'm2')
    summary["edge"] = summary.get("edge", {}); summary["edge"]["m2"] = edge
    ok &= _check(notes, edge["n"] == 0, f"임무 2 가장자리 걷기: 표식 {edge['marks']}개 × 12방향 = {edge['runs']}번 → 구역 밖 · 바다로 떨어짐 {edge['n']}번 {edge['out'][:3]}")
    return ok


def _mission_m2w_extra(s, fresh, out, notes, summary):
    """S11a — 임무 2 지형: 구역 · 흐린 하늘 · 공장 바탕 소리 · 늘 피는 김, 배관 밑 통로(서서 · 앉아서는 막힘 · 달리다 C 슬라이딩으로 들어가 기어서 나옴 ·
    적 길찾기 칸 막힘), 증기 기둥(적 시야를 막음 — 게이지 그대로 · 기둥이 사라지면 다시 봄 · 탄 · 폭발은 지나감), 폭파 문(닫힘 = 충돌 · 열면 지나감)."""
    ok = True
    pg = fresh()
    J = pg.evaluate
    info = J("""() => { __fps.startMission('m2w', { seed: 5 }); __fps.god(true); __fps.pauseLoop(); __fps.step(0.5);
        return { zones: FG.map.loaded.slice(), sky: __fps.assets().sky.name, amb: FG.mission.M.amb, fog: FG.gfx.envState().fog, wisps: FG.props ? FG.props.state().steam.wisps : null,
            card: !!(FG.missions.m2 && FG.missions.m2.objectives), errs: FG.map.loaded.map(id => FG.map.built[id].errors.length) }; }""")
    ok &= _check(notes, info["zones"] == ["m2z1", "m2z2", "m2z3", "m2z4"] and info["sky"] == "overcast" and info["amb"] == "factory" and info["card"] and not any(info["errs"]),
                 f"임무 2 구역 {info['zones']} · 하늘 {info['sky']} · 바탕 소리 {info['amb']}(공장) · 안개 {info['fog']} · 임무 2 정식 자료 있음(S11b — 카드 열림) {info['card']}")
    # 1) 배관 밑 통로 — 안쪽 높이 1.0m · 길이 4m(펌프동 남쪽 벽)
    sl = J("""() => { const out = {}; const o = FG.maps.m2z2.origin, mouth = o[2] + 14.2, inner = o[2] + 9.6;
        const put = (dz) => { __fps.clearInput(); __fps.teleport(o[0] + 8, 0.02, mouth + dz, 0); __fps.look(0, 0); __fps.step(0.05);
            for (let k = 0; k < 3 && __fps.state().stance !== 'stand'; k++) { __fps.press(__fps.state().stance === 'prone' ? 'prone' : 'crouch'); __fps.step(0.1); } __fps.step(0.2); };
        put(2); __fps.setInput({ moveZ: 1 }); __fps.step(4); out.walk = +(__fps.state().pos[2] - mouth).toFixed(2);
        put(2); __fps.press('crouch'); __fps.step(0.4); __fps.setInput({ moveZ: 1 }); __fps.step(5); out.crouch = +(__fps.state().pos[2] - mouth).toFixed(2); out.crouchSt = __fps.state().stance;
        put(4.2); const n0 = FG.bus.count; __fps.setInput({ moveZ: 1, sprint: true }); __fps.step(0.5); __fps.setInput({ sprint: null }); __fps.press('crouch');
        __fps.step(1.0); out.slideAt = +(__fps.state().pos[2] - mouth).toFixed(2); out.afterSlide = __fps.state().stance;
        out.slid = __fps.events(n0).some(e => e.type === 'slide');
        __fps.setInput({ moveZ: 1 }); __fps.step(4); out.end = +(__fps.state().pos[2] - inner).toFixed(2); out.endSt = __fps.state().stance;
        out.navMid = FG.nav.walkable(o[0] + 8, mouth - 2); out.navOut = FG.nav.walkable(o[0] + 8, mouth + 2); __fps.clearInput();
        for (let k = 0; k < 4 && __fps.state().stance !== 'stand'; k++) { __fps.press(__fps.state().stance === 'prone' ? 'prone' : 'crouch'); __fps.step(0.3); }   // 다음 시험은 서서
        out.stand = __fps.state().stance;
        return out; }""")
    summary["slide"] = sl
    ok &= _check(notes, sl["walk"] >= 0.2 and sl["crouch"] >= 0.2,
                 f"배관 밑 통로: 서서 걷기 → 입구 앞에서 멈춤({sl['walk']}m) · 앉아 걷기 → 멈춤({sl['crouch']}m, 자세 {sl['crouchSt']}) — 안쪽 높이 1.0 < 앉은 키 1.1")
    ok &= _check(notes, sl["slid"] and sl["slideAt"] < -0.5 and sl["end"] < 0,
                 f"달리다 C → 슬라이딩으로 통로 안({sl['slideAt']}m — 슬라이딩 뒤 자세 {sl['afterSlide']}) → 기어서 펌프동 안으로({sl['end']}m 안쪽 · 자세 {sl['endSt']})")
    ok &= _check(notes, not sl["navMid"] and sl["navOut"], f"길찾기 격자: 통로 안 칸 막힘({sl['navMid']} — 적 · 자동 조종은 문으로) · 입구 앞 칸 걸을 수 있음({sl['navOut']})")
    # 2) 증기 기둥 — 적 시야 막음(탱크 마당). 적은 남쪽을 보고 서 있고 플레이어는 14m 앞(가운데 증기 구멍)
    sm = J("""() => { const o = FG.maps.m2z3.origin, V = THREE.Vector3; const vent = FG.map.mark('m2z3.vent');
        const E = [o[0] - 3, 0, o[2] + 2], P = [o[0] - 1, 0, o[2] + 16];
        const run = (steam, sec) => { __fps.killAll(); __fps.step(2.3); FG.world.smokeClear();
            __fps.teleport(P[0], 0.02, P[2], 180); __fps.look(180, 0);
            if (steam) { FG.world.smokeAdd({ id: 'test', x: vent[0], y: vent[1], z: vent[2], r: 3.4, h: 11, dur: steam }); __fps.step(0.6); }   // 짙어진 뒤
            const id = __fps.spawnEnemy({ group: 'S', state: 'idle', pos: E, yaw: 180 }); __fps.step(0.05);
            const g = []; for (let k = 0; k < sec * 4; k++) { __fps.step(0.25); const e = __fps.enemies().find(x => x.id === id); g.push(e ? e.gauge : -1); if (e && e.state !== 'idle' && e.state !== 'alert') break; }
            const e = __fps.enemies().find(x => x.id === id);
            return { gauge: g[g.length - 1], max: Math.max(...g), state: e && e.state, n: g.length }; };
        const a = new V(E[0], 1.6, E[2]), b = new V(P[0], 1.6, P[2]);
        const out = { open: run(0, 3), steam: run(8, 3) };
        out.losThrough = FG.world.losClear(a, b); out.sightThrough = FG.world.sightClear(a, b);
        __fps.step(6); const e2 = __fps.enemies().find(x => x.group === 'S'); out.after = e2 ? { gauge: e2.gauge, state: e2.state } : null;
        out.smoke = FG.world.smoke.length; return out; }""")
    summary["steam"] = sm
    ok &= _check(notes, sl.get("stand") == "stand" and (sm["open"]["max"] >= 0.3 or sm["open"]["state"] not in ("idle", None)),
                 f"증기 없음: 14m 앞 적이 플레이어를 봄 — 게이지 최대 {sm['open']['max']} · 상태 {sm['open']['state']}")
    ok &= _check(notes, sm["steam"]["max"] < 0.05 and sm["steam"]["state"] == "idle" and sm["losThrough"] and not sm["sightThrough"],
                 f"증기 기둥 사이: 3초 동안 못 봄 — 게이지 최대 {sm['steam']['max']} · 상태 {sm['steam']['state']} · 맵 시선 {sm['losThrough']}(탄은 지나감) · 눈 시선 {sm['sightThrough']}")
    ok &= _check(notes, sm["after"] and (sm["after"]["gauge"] >= 0.3 or sm["after"]["state"] not in ("idle",)),
                 f"증기가 걷힌 뒤(8초) 다시 봄 — {sm['after']}")
    # 3) 폭파 문 — 닫힘이면 막힘, 열면 지나감
    bd = J("""() => { const m = FG.map.mark('m2z4.blastFront'), d = FG.world.dynGet('blast'); const res = { exists: !!d, closed: d && d.enabled };
        const go = () => { __fps.clearInput(); __fps.teleport(m[0], m[1] + 0.02, m[2], 0); __fps.look(0, 0); __fps.step(0.2); __fps.setInput({ moveZ: 1 }); __fps.step(3); __fps.clearInput(); return +__fps.state().pos[2].toFixed(2); };
        res.zClosed = go(); FG.world.setDoor('blast', true); __fps.step(0.8); res.zOpen = go(); res.doorZ = FG.map.mark('m2z4.door.blast')[2]; return res; }""")
    summary["blast"] = bd
    ok &= _check(notes, bd["exists"] and bd["closed"] and bd["zClosed"] > bd["doorZ"] and bd["zOpen"] < bd["doorZ"] - 2,
                 f"폭파 문(창고 남쪽): 처음 닫힘 → 앞에서 멈춤(z {bd['zClosed']} · 문 {bd['doorZ']}) · 열면 안으로(z {bd['zOpen']})")
    for name, (x, z, yaw, pitch, js) in {"m2-causeway": (0, 29.5, 0, 3, ""), "m2-steam": (6, -76, 345, 8, "FG.world.smokeAdd({ id: 'shot', x: 1, y: 0, z: -81.4, r: 3.4, h: 11, dur: 30 });")}.items():
        J("""(a) => { const [x, z, yaw, pitch, js] = a; __fps.resumeLoop(); __fps.killAll(); __fps.clearInput(); if (js) (new Function(js))();
            __fps.teleport(x, FG.nav.heightAt(x, z, 0) + 0.05, z, yaw); __fps.look(yaw, pitch); }""", [x, z, yaw, pitch, js])
        pg.wait_for_timeout(2200)
        pg.screenshot(path=str(out / f"mission-{name}.png"))
    return ok


def _mission_t0_keys(s, fresh, out, notes, summary):
    """t0 — 시험 손잡이 없이 실제 키 W 만으로 「표식까지 걷기」 끝(S9 arcade 시험이 쓸 길 미리 확인)."""
    ok = True
    pg = fresh()
    J = pg.evaluate
    J("() => __fps.startMission('t0', {})")
    pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW")
    t0 = time.time()
    while time.time() - t0 < 8 and J("() => __fps.state().phase") != "result":
        pg.wait_for_timeout(200)
    pg.keyboard.up("KeyW")
    m = J("() => __fps.mission()")
    ok &= _check(notes, m["result"] == "success" and m["done"] == ["o1"] and time.time() - t0 < 8,
                 f"t0: 키 W 만 눌러 「표식까지 걷기」 끝 → {m['result']} · 임무 시계 {m['t']}초")
    return ok


def _mission_t2_extra(s, fresh, out, notes, summary):
    """t2 — 시작 연출(입력 버림 · Enter/클릭 건너뛰기) · 목표 HUD · 나침반 · 마커 · 화면 밖 화살표 · 자막 · 무전 · 상호작용(유지 · 줄어듦) · 버티기 · 웨이브 · 체크포인트 알림."""
    ok = True
    pg = fresh()
    J = pg.evaluate
    # ── 시작 연출 — skipIntro:false
    J("() => { __fps.startMission('t2', { skipIntro: false, seed: 5 }); __fps.pauseLoop(); return true; }")
    J("() => __fps.step(0.2)")
    c0 = J("() => ({ m: __fps.mission(), pos: __fps.state().pos, yaw: __fps.state().yaw })")
    J("() => { __fps.setInput({ moveZ: 1, jump: true }); __fps.step(1.0); __fps.setInput({ moveZ: null, jump: null }); }")
    pg.wait_for_timeout(150)
    c1 = J("() => ({ m: __fps.mission(), pos: __fps.state().pos, hud: __fps.hud() })")
    pg.screenshot(path=str(out / "mission-cine.png"))
    moved = H_dist(c0["pos"], c1["pos"])
    ok &= _check(notes, c0["m"]["cine"] and c0["m"]["cine"]["name"] == "intro" and c1["m"]["cine"] and moved < 0.02 and c1["hud"]["cine"],
                 f"시작 연출 intro {c0['m']['cine']} → 1초 동안 W · Space 눌러도 제자리(움직임 {moved:.3f}m) · 화면 띠(html.cine) {c1['hud']['cine']}")
    m0 = J("() => __mi.mark()")
    J("() => { __fps.press('skip'); __fps.step(1 / 60); }")
    c2 = J("(m) => ({ m: __fps.mission(), ev: __mi.ev(m, ['cineEnd']), yaw: __fps.state().yaw, stance: __fps.state().stance, vy: __fps.state().vel[1] })", m0)
    ok &= _check(notes, not c2["m"]["cine"] and c2["ev"] and c2["ev"][0]["p"]["skipped"] and abs(c2["yaw"] - c0["yaw"]) < 1e-3 and abs(c2["vy"]) < 0.5,
                 f"Enter(skip) → 연출 바로 끝 {c2['ev'][:1]} · 시점 그대로 {c2['yaw']}° · 연출 중 누른 Space 가 끝에 점프로 안 나옴(vy {c2['vy']})")
    # 왼쪽 클릭으로도 건너뜀(새 판)
    J("() => { __fps.startMission('t2', { skipIntro: false, seed: 5 }); __fps.step(0.3); __fps.press('fire'); __fps.step(1 / 60); }")
    c3 = J("() => ({ m: __fps.mission(), shots: __fps.weapon().shots })")
    ok &= _check(notes, not c3["m"]["cine"] and c3["shots"] == 0, f"왼쪽 클릭 → 연출 건너뜀 · 그 클릭은 총을 쏘지 않음(발사 {c3['shots']})")
    # ── 목표 HUD · 나침반 · 마커 · 자막 · 무전
    # 적 외침 자막이 끼지 않게 마당 경비를 먼저 치움(목표 1 진행 중이라 정리 목표는 아직 아님)
    J("() => { __fps.killGroup('g_yard'); __fps.step(2.0); __fps.look(0, 0); __fps.step(1 / 60); }")
    pg.wait_for_timeout(200)
    h = J("() => ({ hud: __fps.hud(), au: __fps.audio(), st: __fps.state() })")
    hd = h["hud"]
    ok &= _check(notes, hd["obj"]["on"] and "마당 가운데 표식" in hd["obj"]["text"] and hd["compass"]["on"] and "N" in hd["compass"]["labels"] and hd["compass"]["mk"],
                 f"좌상단 목표 「{hd['obj']['text']}」 · 나침반 띠 {hd['compass']['labels']} · 목표 마름모 {hd['compass']['mk']}")
    ok &= _check(notes, hd["marker"]["on"] and hd["marker"]["dist"] == f"{round(h['st']['objDist'])}m" and h["st"]["objDist"] > 5,
                 f"월드 마커 + 거리 「{hd['marker']['dist']}」(objDist {h['st']['objDist']}) · 화면 자리 {hd['marker']['tf']}")
    subs = hd["subs"]
    known = ("◆ 나침", "● 물총새", "▲ 바위", "■ 갈매기")
    ok &= _check(notes, len(subs) == 2 and all(x.startswith(known) for x in subs) and any(x.startswith("● 물총새") for x in subs) and h["st"]["mission"]["state"] == "run",
                 f"자막 2줄(호출 부호 기호 + 이름 — 새 줄이 아래) {subs}")
    ok &= _check(notes, h["au"]["radios"] >= 2, f"무전 소리(audio.radio) {h['au']['radios']}번 — 「삑」 · 잡음 · 웅얼임 · 음악 낮춤")
    J("() => { __fps.look(180, 0); __fps.step(1 / 60); }")
    pg.wait_for_timeout(150)
    ha = J("() => __fps.hud()")
    ok &= _check(notes, ha["arrow"]["on"] and not ha["marker"]["on"], f"뒤돌면 마커 대신 화면 가장자리 화살표 {ha['arrow']['tf']}")
    pg.screenshot(path=str(out / "mission-hud-arrow.png"))
    J("() => { __fps.look(0, 0); __fps.step(1 / 60); }")
    pg.wait_for_timeout(150)
    pg.screenshot(path=str(out / "mission-hud.png"))
    # ── 상호작용 o3 — 앞에서 F 길게(떼면 0.5초 유지 뒤 줄어듦)
    J("() => { __fps.god(true); __fps.killGroup('g_yard'); __fps.step(0.1); __fps.skipTo('o3'); __fps.step(0.2); __fps.teleportTo('t2b.valveFront'); __fps.look(0, -10); __fps.step(0.1); }")
    pg.wait_for_timeout(150)
    i0 = J("() => ({ m: __fps.mission(), hud: __fps.hud() })")
    ok &= _check(notes, i0["m"]["objective"]["id"] == "o3" and i0["m"]["objective"]["near"] and i0["hud"]["act"]["on"] and "F 길게" in i0["hud"]["act"]["text"] and i0["hud"]["checkpoint"],
                 f"밸브 앞 → 안내 「{i0['hud']['act']['text']}」 · 체크포인트 알림 {i0['hud']['checkpoint']}(cp1)")
    J("() => { __fps.setInput({ interact: true }); __fps.step(1.0); __fps.setInput({ interact: null }); }")
    p1 = J("() => __fps.mission().objective.progress")
    J("() => __fps.step(0.4)")
    p2 = J("() => __fps.mission().objective.progress")
    J("() => __fps.step(0.6)")
    p3 = J("() => __fps.mission().objective.progress")
    J("() => { __fps.look(180, 0); __fps.setInput({ interact: true }); __fps.step(0.5); __fps.setInput({ interact: null }); }")
    p4 = J("() => __fps.mission().objective")
    ok &= _check(notes, abs(p1 - 1.0) < 0.03 and abs(p2 - p1) < 1e-6 and p3 < p2 - 0.05 and p4["progress"] <= p3 + 1e-6 and not p4["near"],
                 f"F 1초 → 진행 {p1}/2 · 뗀 뒤 0.4초 그대로 {p2} · 1초 뒤 줄어듦 {p3} · 등 돌리면 안 됨(near {p4['near']})")
    m0 = J("() => __mi.mark()")
    J("() => { __fps.look(0, -10); __fps.setInput({ interact: true }); __fps.step(2.2); __fps.setInput({ interact: null }); __fps.step(0.1); }")
    ev = J("(m) => __mi.ev(m, ['interactStart', 'objDone', 'checkpoint', 'objective', 'aiHeard'])", m0)
    m4 = J("() => ({ m: __fps.mission(), g: __fps.ai().groups })")
    ok &= _check(notes, any(e["type"] == "objDone" and e["p"]["id"] == "o3" for e in ev) and any(e["type"] == "checkpoint" and e["p"]["id"] == "cp2" for e in ev)
                 and m4["m"]["objective"]["id"] == "o4" and not m4["g"]["g_wave"]["dormant"] and m4["g"]["g_wave2"]["dormant"],
                 f"밸브 끝 → 체크포인트 cp2 · 목표 o4(버티기) · 웨이브 g_wave 깨어남(dormant {m4['g']['g_wave']['dormant']}) · g_wave2 아직 잠듦")
    J("() => __fps.step(8.2)")
    m5 = J("() => ({ m: __fps.mission(), g: __fps.ai().groups, hud: __fps.hud() })")
    pg.wait_for_timeout(120)
    hud5 = J("() => __fps.hud()")
    ok &= _check(notes, not m5["g"]["g_wave2"]["dormant"] and "초)" in hud5["obj"]["text"] and 8.0 <= m5["m"]["objective"]["defendT"] <= 10.5,
                 f"버티기 8초 → 타이머 트리거로 g_wave2 깨어남 · 목표 줄 「{hud5['obj']['text']}」 · 버틴 시간 {m5['m']['objective']['defendT']}")
    pg.screenshot(path=str(out / "mission-defend.png"))
    J("() => __fps.step(12.5)")
    m6 = J("() => ({ m: __fps.mission(), ph: __fps.state().phase })")
    ok &= _check(notes, m6["m"]["result"] == "success" and m6["ph"] == "result", f"버티기 20초 → 임무 끝 {m6['m']['result']} · phase {m6['ph']}")
    summary["t2extra"] = {"progress": [p1, p2, p3], "subs": subs}
    return ok


def cmd_checkpoint(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            wait_ready(pg, 5000)
            pg.evaluate(MI_JS)
            J = pg.evaluate
            # 시작 · 목표 1 끝 → 무리가 교전 중인 채로 목표 2 끝 → cp1(교전 → 경계로 낮춤)
            J("""() => { __fps.startMission('t2', { seed: 9 }); __fps.pauseLoop(); __fps.god(true); __fps.step(0.2);
                __fps.completeObjective(); __fps.step(0.1);
                for (const e of __fps.enemies()) if (e.group === 'g_yard') __fps.enemyCmd(e.id, 'engage');
                __fps.step(0.5); __fps.setInput({ fire: true }); __fps.step(0.3); __fps.setInput({ fire: null }); __fps.step(0.1); return true; }""")
            pre = J("() => __fps.enemies().filter(e => e.group === 'g_yard').map(e => e.state)")
            J("() => { __fps.completeObjective(); __fps.step(0.1); }")
            S = J("() => __fps.checkpoint()")
            ok &= _check(notes, S and S["cpId"] == "cp1" and S["objIdx"] == 2, f"체크포인트 cp1 — 목표 번호 {S and S['objIdx']} · JSON 값만(크기 {len(json.dumps(S))}자)")
            ok &= _check(notes, all(x in ("engage", "cover", "rush", "flank", "grenade") for x in pre) and all(e["state"] == "alert" for e in S["ai"]["ents"] if e["group"] == "g_yard"),
                         f"싸우던 적(스냅숏 전 {pre}) → 스냅숏에서는 경계 {[e['state'] for e in S['ai']['ents']]}")
            # 바꿈: 탄 쓰기 · 자리 옮기기 · 적 하나 처치 · 상호작용 조금 · 아군 대본
            J("""() => { __fps.teleportTo('t2b.valveFront'); __fps.look(0, -70);
                __fps.setInput({ fire: true }); __fps.step(0.5); __fps.setInput({ fire: null });
                const e = __fps.enemies().find(x => x.group === 'g_yard'); __fps.killEnemy(e.id); __fps.step(2.4);
                __fps.look(0, -10); __fps.setInput({ interact: true }); __fps.step(0.6); __fps.setInput({ interact: null }); return true; }""")
            B = J("() => ({ snap: __fps.snapshot(), en: __fps.enemies().length, w: __fps.weapon(), m: __fps.mission() })")
            ok &= _check(notes, B["en"] == len(S["ai"]["ents"]) - 1 and B["w"]["mag"] != S["weapons"]["slots"][0]["mag"] and B["m"]["objective"]["progress"] > 0,
                         f"체크포인트 뒤 바뀜: 적 {len(S['ai']['ents'])} → {B['en']} · 탄창 {S['weapons']['slots'][0]['mag']} → {B['w']['mag']} · 밸브 진행 {B['m']['objective']['progress']}")
            m0 = J("() => __mi.mark()")
            alive = J("() => __fps.killPlayer()")
            J("() => __fps.step(0.05)")
            d0 = J("() => ({ m: __fps.mission(), hp: __fps.state().hp })")
            J("() => __fps.step(0.5)")
            pg.wait_for_timeout(150)
            hdn = J("() => __fps.hud()")
            pg.screenshot(path=str(out / "checkpoint-down.png"))
            J("() => __fps.step(1.1)")
            ev = J("(m) => __mi.ev(m, ['playerDown', 'missionDown', 'checkpointRestore', 'spawn'])", m0)
            R = J("() => __fps.restoreCapture()")
            tdown = next((e["t"] for e in ev if e["type"] == "missionDown"), None)
            trest = next((e["t"] for e in ev if e["type"] == "checkpointRestore"), None)
            ok &= _check(notes, alive is False and d0["m"]["state"] == "down" and hdn["down"] and tdown is not None and trest is not None and abs(trest - tdown - 1.5) < 0.05,
                         f"hp 0 → 쓰러짐(state {d0['m']['state']} · 덮개 {hdn['down']}) → {trest - tdown if trest and tdown else None:.2f}초 뒤 체크포인트 복원 {[e['p'] for e in ev if e['type'] == 'checkpointRestore']}")
            # 복원 직후 상태 = 스냅숏
            keys = ["objIdx", "done", "flags", "fired", "runners", "kills", "intel", "alarm", "player", "weapons", "ai", "allies", "doors", "rng", "progress", "defendT"]
            diff = [k for k in keys if R.get(k) != S.get(k)]
            ok &= _check(notes, R is not None and not diff,
                         f"복원 직후 = 스냅숏(같지 않은 칸 {diff}) — 위치 {R['player']['pos']} · 탄 {[x and (x['mag'], x['reserve']) for x in R['weapons']['slots']]} · 적 {len(R['ai']['ents'])}명 · 목표 번호 {R['objIdx']}")
            if diff:
                for k in diff[:3]:
                    notes.append((False, f"  {k}: 스냅숏 {json.dumps(S.get(k), ensure_ascii=False)[:300]} / 복원 {json.dumps(R.get(k), ensure_ascii=False)[:300]}"))
            J("() => __fps.step(0.5)")
            A = J("() => ({ st: __fps.state(), en: __fps.enemies(), w: __fps.weapon(), m: __fps.mission(), sc: __fps.score('success') })")
            pd = H_dist(A["st"]["pos"], S["player"]["pos"])
            ok &= _check(notes, pd < 0.1 and len(A["en"]) == len(S["ai"]["ents"]) and A["w"]["mag"] == S["weapons"]["slots"][0]["mag"] and A["m"]["objective"]["idx"] == S["objIdx"]
                         and A["st"]["hp"] > 99 and A["m"]["objective"]["progress"] == 0,
                         f"0.5초 뒤에도: 위치 차 {pd:.3f}m · 적 {len(A['en'])}명 · 탄창 {A['w']['mag']} · 목표 {A['m']['objective']['id']} · 체력 {A['st']['hp']} · 밸브 진행 {A['m']['objective']['progress']}")
            ok &= _check(notes, A["m"]["sc"]["downs"] == 1 and A["sc"]["downs"] == 1 and A["m"]["restores"] == 1 and A["m"]["sc"]["shots"] >= B["w"]["shots"] - 0,
                         f"점수 누적은 되돌리지 않음: 쓰러짐 {A['m']['sc']['downs']} · 쏜 탄 {A['m']['sc']['shots']} · 받은 피해 {round(A['m']['sc']['taken'])}")
            # 두 번째 체크포인트(cp2 — 버티기 중 쓰러짐) → 목표 o4 · 웨이브 깨어 있음 그대로
            J("""() => { __fps.killGroup('g_yard'); __fps.step(0.1); __fps.teleportTo('t2b.valveFront'); __fps.look(0, -10);
                __fps.setInput({ interact: true }); __fps.step(2.2); __fps.setInput({ interact: null }); __fps.step(3.0); return true; }""")
            S2 = J("() => __fps.checkpoint()")
            J("() => { __fps.killPlayer(); __fps.step(1.7); }")
            R2 = J("() => ({ m: __fps.mission(), g: __fps.ai().groups, cap: __fps.restoreCapture() })")
            ok &= _check(notes, S2["cpId"] == "cp2" and R2["m"]["objective"]["id"] == "o4" and R2["m"]["checkpoint"] == "cp2" and not R2["g"]["g_wave"]["dormant"]
                         and R2["cap"]["ai"] == S2["ai"] and R2["m"]["sc"]["downs"] == 2,
                         f"cp2(버티기 시작) 뒤 쓰러짐 → 목표 {R2['m']['objective']['id']} · 버틴 시간 {R2['m']['objective']['defendT']} · 깨운 웨이브 그대로 · 쓰러짐 {R2['m']['sc']['downs']}")
            # 같은 구역으로 다시 하기 — 앞 판에 연 문이 남지 않음(문 처음 상태 → 'start' 체크포인트도 닫힘)
            D = J("""() => { const en = () => FG.world.dynGet('d1').enabled, ang = () => FG.map.built.t0.doors.d1.ang;
                __fps.startMission('t0', { seed: 3 }); __fps.step(0.1);
                const a = en(); __fps.door('d1', true); __fps.step(0.1); FG.map.update(1);
                const b = en(), bAng = ang();
                __fps.startMission('t0', { seed: 3 }); __fps.step(0.1);
                return { a, b, bAng, c: en(), cAng: ang(), cp: __fps.checkpoint().doors, cpId: __fps.checkpoint().cpId }; }""")
            dcp = dict((x[0], x[1]) for x in D["cp"])
            ok &= _check(notes, D["a"] is True and D["b"] is False and D["c"] is True and D["cAng"] == 0 and dcp.get("d1") is False and D["cpId"] == "start",
                         f"문 연 판 → 다시 하기(같은 구역 t0): 문 d1 닫힘 {D['a']} → 열기 {D['b']}(각도 {D['bAng']:.2f}) → 다시 하기 뒤 닫힘 {D['c']}(각도 {D['cAng']}) · 'start' 체크포인트 문 {D['cp']}")
            # 'start' 체크포인트로 돌아가도 시작 무전이 다시 나오지 않음(목표 줄만)
            W = J("""() => { const m0 = __mi.mark(); __fps.startMission('t2', { seed: 4 }); __fps.step(4);
                const said0 = __mi.ev(m0, ['say']).map(e => e.p.text); const m1 = __mi.mark();
                __fps.killPlayer(); __fps.step(1.7); __fps.step(4);
                return { said0, said1: __mi.ev(m1, ['say']).map(e => e.p.text), rest: __mi.ev(m1, ['checkpointRestore']).map(e => e.p.id),
                    obj: __fps.mission().objective && __fps.mission().objective.id, hud: document.querySelector('#hud') ? (document.querySelector('.ob-t') || {}).textContent || null : null }; }""")
            start_lines = [a_[2] for t_ in J("() => FG.missions.t2.triggers") if t_["when"].get("start") for a_ in t_["do"] if a_[0] == "say"]
            again = [x for x in W["said1"] if x in start_lines]
            ok &= _check(notes, all(x in W["said0"] for x in start_lines) and W["rest"] == ["start"] and not again and W["obj"] == "o1",
                         f"'start' 체크포인트 복원 뒤 시작 무전 되풀이 없음: 첫 판 {len(W['said0'])}줄 → 복원 {W['rest']} 뒤 {W['said1']} · 목표 {W['obj']}")
            summary["snap"] = {"bytes": len(json.dumps(S)), "ents": len(S["ai"]["ents"]), "objIdx": S["objIdx"]}
            ok &= _check(notes, not s.errors and not s.external and not s.missing, f"오류 0 · 바깥 요청 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("checkpoint", ok, summary, notes)


# ───────────────────────────── ui (S9) ─────────────────────────────

UI_JS = r"""(() => {
  const H = window.__ui = {};
  H.vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  H.setRange = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); return +e.value; };
  H.next = () => { const b = window.HKNextKey && window.HKNextKey.find(); return b ? (b.innerText || b.textContent).trim() : null; };
  H.btns = (id) => Array.prototype.filter.call(document.querySelectorAll('#' + id + ' button'), b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim());
  return true;
})()"""


def cmd_ui(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"shots": []}

    def shot(pg, name):
        p = out / f"ui-{name}.png"
        pg.screenshot(path=str(p))
        summary["shots"].append(str(p))
        return p

    with sync_playwright() as pw:
        s = Session(pw)
        try:
            def fresh(init=()):
                pg = s.page([HK_SPY] + list(init))
                pg.goto(HOST + BODY_URL, wait_until="load")
                wait_ready(pg, 5000)
                pg.evaluate(UI_JS)
                return pg

            pg = fresh()
            J = pg.evaluate
            # ── 1) 타이틀(처음 온 회원) · 음악은 첫 클릭 뒤
            pg.wait_for_timeout(1800)   # 음악 뒤에서 불러오기(준비 + 1.2초)
            v = J("() => ({ ui: __fps.ui(), mu: __fps.music(), title: __ui.btns('scrTitle'), quickCls: document.getElementById('btnQuick').className })")
            ok &= _check(notes, v["ui"]["firstVisit"] and v["title"][:2] == ["바로 출격", "작전 고르기"] and "big" in v["quickCls"] and "시험 구역" in v["title"],
                         f"타이틀(처음): 단추 {v['title']} · 「바로 출격」 큰 단추 · 시험 구역은 손잡이 있는 화면만")
            mu = v["mu"]
            ok &= _check(notes, not mu["unlocked"] and mu["want"] is None and "menu" in mu["tracks"] and mu["tracks"]["menu"]["plays"] == 0,
                         f"음악: 첫 클릭 전 재생 안 함 · 메뉴 곡은 뒤에서 불러오는 중({mu['tracks'].get('menu', {}).get('state')}) · 처음 화면 안 막음")
            shot(pg, "title")
            pg.mouse.click(1000, 620)   # 타이틀 빈 곳 첫 클릭 → 소리 켬
            pg.wait_for_timeout(1300)
            mu = J("() => __fps.music()")
            mv = mu["tracks"]["menu"]["voices"][0]
            ok &= _check(notes, mu["unlocked"] and mu["want"] == "menu" and mu["tracks"]["menu"]["plays"] == 1 and mv["playing"] and abs(mv["vol"] - 0.5 * 0.8) < 0.03,
                         f"첫 클릭 뒤 메뉴 곡 재생 요청 · 크기 {mv['vol']}(설정 50 × 곡 0.8) · 1초 겹쳐 올림(g {mv['g']}) · 상태 {mu['tracks']['menu']['state']} · 기록 {mu['log'][-1]}")
            # ── 2) 설정(타이틀에서)
            pg.click("#btnSettings")
            pg.wait_for_timeout(150)
            ok &= _check(notes, J("() => __ui.vis('scrSettings') && !__ui.vis('scrTitle')"), "설정 덮개 열림(타이틀 숨김)")
            shot(pg, "settings")
            J("() => __ui.setRange('st_sens', 2.5)")
            pg.click("#scrSettings .seg[data-key='invertY'] button[data-v='true']")
            pg.click("#scrSettings .seg[data-key='adsMode'] button[data-v='toggle']")
            pg.click("#scrSettings .seg[data-key='crouchMode'] button[data-v='hold']")
            pg.click("#scrSettings .seg[data-key='subSize'] button[data-v='xl']")
            pg.click("#scrSettings .seg[data-key='xhColor'] button[data-v='yellow']")
            pg.click("#scrSettings .seg[data-key='crouchCtrl'] button[data-v='true']")
            warn = J("() => document.querySelector(\"#scrSettings .seg[data-key='crouchCtrl']\").parentNode.querySelector('small').textContent")
            J("() => __ui.setRange('st_fov', 90)")
            J("() => __ui.setRange('st_music', 0)")
            pg.wait_for_timeout(1200)
            c = J("() => __fps.cfgView()")
            mu = J("() => __fps.music()")
            ok &= _check(notes, c["sens"] == 2.5 and c["invertY"] and c["controls"]["adsToggle"] and c["controls"]["crouchHold"] and c["controls"]["crouchCtrl"] and "sub-xl" in c["cls"] and "xh-yellow" in c["cls"]
                         and abs(c["fov"] - 58.72) < 0.05 and "Ctrl+W" in warn,
                         f"설정 반영: 감도 {c['sens']} · 상하 반전 · 조준 토글 · 앉기 누르는 동안 · 앉기 Ctrl(경고 「{warn[:20]}…」) · 자막 아주 크게 · 십자선 노랑 · 시야각 90° → 세로 {c['fov']}°")
            def _quiet(m):   # 재생 중이던 요소가 모두 크기 0 · 멈춤(held) — 0.001 로 남아 계속 재생되지 않음
                vs = [v for t in m["tracks"].values() for v in t["voices"] if v["playing"]]
                return m["silent"] and m["mix"] == 0 and vs and all(v["vol"] == 0 and v["paused"] and v["held"] for v in vs)
            def _loud(m):
                vs = [v for t in m["tracks"].values() for v in t["voices"] if v["playing"]]
                return not m["silent"] and vs and all(not v["paused"] and not v["held"] for v in vs)
            ok &= _check(notes, mu["mixTarget"] == 0 and _quiet(mu),
                         f"음악 크기 0 → 메뉴 곡 크기 {mu['tracks']['menu']['voices'][0]['vol']} · 멈춰 둠 {mu['tracks']['menu']['voices'][0]['paused']}(효과음 {c['audio']['SFX']} 그대로 — 따로)")
            J("() => __ui.setRange('st_music', 50)")
            pg.wait_for_timeout(500)
            mu = J("() => __fps.music()")
            t_back = mu["tracks"]["menu"]["voices"][0]["t"]
            ok &= _check(notes, _loud(mu) and mu["mix"] > 0.05, f"음악 50 으로 → 그 자리에서 이어서 재생(곡 위치 {t_back}초 · 크기 {mu['mix']})")
            pg.click("#scrSettings .seg[data-key='mute'] button[data-v='true']")
            pg.wait_for_timeout(1200)
            mu = J("() => __fps.music()")
            ok &= _check(notes, mu["mixTarget"] == 0 and J("() => __fps.cfgView().audio.MUTE") and _quiet(mu), "소리 전체 끄기 → 음악 0 · 요소 크기 0 · 멈춰 둠 · 효과 버스 끔")
            pg.click("#scrSettings .seg[data-key='mute'] button[data-v='false']")
            pg.wait_for_timeout(400)
            ok &= _check(notes, _loud(J("() => __fps.music()")), "전체 끄기 풀면 → 다시 재생")
            pg.click("#btnStBack")
            ok &= _check(notes, J("() => __ui.vis('scrTitle') && !__ui.vis('scrSettings')"), "「돌아가기」 → 타이틀")
            # 다시 열기 — 설정 유지
            pg.reload(wait_until="load"); wait_ready(pg, 5000); J(UI_JS)
            c = J("() => __fps.cfgView()")
            st = J("() => __fps.store().settings")
            ok &= _check(notes, c["sens"] == 2.5 and c["invertY"] and c["controls"]["adsToggle"] and "sub-xl" in c["cls"] and st["music"] == 50,
                         f"다시 열어도 설정 유지(fogisle.settings.v1): 감도 {c['sens']} · 반전 {c['invertY']} · 음악 {st['music']}")
            # 조작 방식 실제 동작 — 조준 토글 · 앉기 누르는 동안
            pg.click("#btnSortie"); _phase_wait(pg, "play")
            pg.wait_for_timeout(200)
            pg.mouse.click(640, 360, button="right"); pg.wait_for_timeout(120)
            a1 = J("() => __fps.state().input.ads")
            pg.mouse.click(640, 360, button="right"); pg.wait_for_timeout(120)
            a2 = J("() => __fps.state().input.ads")
            pg.keyboard.down("ControlLeft"); pg.wait_for_timeout(200)
            s1 = J("() => __fps.state().stance")
            pg.keyboard.up("ControlLeft"); pg.wait_for_timeout(250)
            s2 = J("() => __fps.state().stance")
            ok &= _check(notes, a1 is True and a2 is False and s1 == "crouch" and s2 == "stand",
                         f"조준 토글: 우클릭 → {a1} → 다시 → {a2} · 앉기(Ctrl, 누르는 동안): 누름 {s1} → 뗌 {s2}")
            _to_title(pg)
            J("() => { for (const [k, v] of Object.entries({sens: 1, invertY: false, adsMode: 'hold', crouchMode: 'toggle', crouchCtrl: false, subSize: 'm', xhColor: 'white', fov: FG.store.SDEF.fov[0]})) __fps.setSetting(k, v); }")
            c = J("() => __fps.cfgView()")
            ok &= _check(notes, c["fov"] == 75 and c["sens"] == 1 and not c["controls"]["crouchCtrl"], f"설정 기본값으로 되돌림 — 시야각 기본 = 지금 화면 그대로(세로 {c['fov']}°)")
            # 손상된 저장 → 기본값
            J("""() => { localStorage.setItem('fogisle.progress.v1', '{bad json'); localStorage.setItem('fogisle.settings.v1', JSON.stringify({ sens: 'abc', fov: 999, quality: 'ultra', music: -5, mute: 'yes' })); }""")
            pg.reload(wait_until="load"); r_ok, _ = wait_ready(pg, 5000); J(UI_JS)
            st = J("() => __fps.store()")
            ok &= _check(notes, r_ok and st["settings"]["sens"] == 1 and st["settings"]["fov"] == J("() => FG.store.SDEF.fov[0]") and st["settings"]["quality"] == "auto"
                         and st["settings"]["music"] == 50 and st["settings"]["mute"] is False and st["progress"]["missions"] == {} and not s.errors,
                         f"손상된 저장 → 기본값(감도 {st['settings']['sens']} · 시야각 {st['settings']['fov']} · 화질 {st['settings']['quality']} · 음악 {st['settings']['music']}) · 진행 빈 값 · 오류 0")
            # 손댄 저장(칸끼리 안 맞음) → 맞춰서 받음
            J("""() => localStorage.setItem('fogisle.progress.v1', JSON.stringify({ v: 1, missions: {
                m1: { cleared: 'yes', best: 99999999, stars: 7, bestTime: -5 }, m2: { cleared: true, best: 120000, stars: 0, bestTime: 0 } } }))""")
            pg.reload(wait_until="load"); r_ok, _ = wait_ready(pg, 5000); J(UI_JS)
            pm = J("() => __fps.store().progress.missions")
            m1, m2 = pm.get("m1") or {}, pm.get("m2") or {}
            ok &= _check(notes, r_ok and m1.get("cleared") is False and m1.get("stars") == 0 and m1.get("bestTime") is None and m1.get("best") == 30000
                         and m2.get("cleared") is True and m2.get("stars") == 1 and m2.get("bestTime") is None and m2.get("best") == 120000 and not s.errors,
                         f"손댄 저장: 안 깬 임무 별 0 · 시간 없음 · 최고 ≤ 실패 상한 {m1} / 깬 임무 별 ≥ 1 · 시간 0 이하 → 없음 {m2}")
            J("() => localStorage.removeItem('fogisle.progress.v1')")
            pg.reload(wait_until="load"); wait_ready(pg, 5000); J(UI_JS)

            # ── 3) 작전 고르기 · 장비 · 브리핑
            pg.mouse.click(1000, 620); pg.wait_for_timeout(200)
            pg.click("#btnSelect")
            ok &= _check(notes, _phase_wait(pg, "select"), "「작전 고르기」 → select")
            pg.wait_for_timeout(500)
            v = J("() => __fps.ui()")
            cards = v["cards"]
            m_cards = [c for c in cards if c["id"].startswith("m")]
            # S10b — 임무 1 자료가 생겨 m1 카드는 열림(「준비 중」 아님). S11b — 임무 2 자료가 생겨 m2 는 「잠김」(임무 1 을 끝내면 열림), m3 · m4 는 자료 없음 「준비 중」
            m1c = next((c for c in m_cards if c["id"] == "m1"), None)
            m2c = next((c for c in m_cards if c["id"] == "m2"), None)
            ok &= _check(notes, len(m_cards) == 4 and m1c and not m1c["locked"] and "준비 중" not in m1c["text"]
                         and m2c and m2c["locked"] and "잠김" in m2c["text"]
                         and all(c["locked"] and "준비 중" in c["text"] for c in m_cards if c["id"] in ("m3", "m4")) and any(c["id"] == "tr" and not c["locked"] for c in cards)
                         and v["unlock"] == {"m1": True, "m2": False, "m3": False, "m4": False},
                         f"임무 카드 4개: m1 열림 「{m1c and m1c['text'][:20]}」 · m2 「{m2c and m2c['text'][:24]}」 · m3 · m4 자료 없음 「준비 중」 · 훈련장 카드 · 해금 {v['unlock']} · 섬 지도 그림")
            try:   # 그림은 FG.assets.paint 의 그림 층(.fg-art)에 — 받은 뒤 나타남
                pg.wait_for_function("() => { const a = document.querySelector('#selMap > .fg-art'); return !!a && a.classList.contains('on'); }", timeout=4000)
            except Exception:  # noqa: BLE001
                pass
            mbg = J("() => { const a = document.querySelector('#selMap > .fg-art'); return a ? getComputedStyle(a).backgroundImage : 'none'; }")
            ok &= _check(notes, "map-v1.webp" in mbg and J("() => FG.music.want") == "menu", f"섬 지도 그림 {mbg[-40:]} · 메뉴 곡 그대로")
            pg.click("#selDiff button[data-v='hard']")
            ok &= _check(notes, J("() => __fps.ui().sel.diff") == "hard" and J("() => __fps.store().progress.diff") == "hard", "난이도 「어려움」 고름 · 저장")
            shot(pg, "select")
            pg.click("#selTest button[data-id='t0']")
            ok &= _check(notes, _phase_wait(pg, "loadout"), "시험 작전 카드 → 장비")
            pg.click("#loPrimary button[data-v='meondeung']")
            v = J("""() => ({ secDis: document.querySelector("#loSecondary button[data-v='meondeung']").disabled, opt: Array.prototype.map.call(document.querySelectorAll('#loOptic button'), b => b.disabled),
                bars: document.querySelectorAll('#loBars .lo-bar').length, name: document.getElementById('loWName').textContent, sel: __fps.ui().sel.lo })""")
            ok &= _check(notes, v["secDis"] and v["opt"] == [False, True, True] and v["bars"] == 5 and v["name"] == "먼등불" and v["sel"]["secondary"] == "sondeung",
                         f"장비: 먼등불 → 보조 먼등불 못 고름 · 조준경 칸 없음 {v['opt']} · 수치 막대 {v['bars']}개")
            pg.click("#btnRec")
            v = J("() => __fps.ui().sel.lo")
            ok &= _check(notes, v["primary"] == "nuwool", f"「추천 장비」 → {v}")
            pg.click("#loMag button[data-v='gotgan']")
            shot(pg, "loadout")
            pg.click("#btnLoBrief")
            ok &= _check(notes, _phase_wait(pg, "briefing"), "「브리핑 보기」 → 브리핑")
            v = J("() => ({ g: document.querySelectorAll('#bfGoals li').length, r: document.querySelectorAll('#bfRadio p').length, t: document.getElementById('bfTitle').textContent, b: __ui.btns('scrBriefing') })")
            ok &= _check(notes, v["g"] >= 1 and v["r"] >= 1 and v["b"] == ["출격", "장비 바꾸기", "임무 고르기"], f"브리핑: 「{v['t']}」 목표 {v['g']}줄 · 무전 {v['r']}줄 · 단추 {v['b']}")
            shot(pg, "briefing")
            # ── 4) 출격 → 놀이
            pg.click("#btnBfGo")
            ok &= _check(notes, _phase_wait(pg, "play"), "브리핑 「출격」 → play")
            pg.wait_for_timeout(400)
            v = J("() => ({ m: __fps.mission(), st: __fps.state(), w: __fps.weapon(), nx: __ui.next(), act: document.activeElement.id, st2: __fps.store().progress.loadout })")
            ok &= _check(notes, v["m"]["id"] == "t0" and v["st"]["difficulty"] == "hard" and v["w"]["slots"][0]["id"] == "nuwool" and v["w"]["slots"][0]["att"]["mag"] == "gotgan"
                         and v["st2"]["mag"] == "gotgan" and v["act"] == "gl",
                         f"고른 난이도 · 장비로 출격(어려움 · 너울 + 곳간) · 장비 저장 · 초점 캔버스")
            ok &= _check(notes, v["nx"] is None, f"놀이 중 Space 로 눌릴 「다음 …」 · 「계속하기」 단추 0(찾은 것 {v['nx']})")
            pg.wait_for_timeout(1300)
            mu = J("() => __fps.music()")
            ok &= _check(notes, mu["want"] == "combat" and mu["tracks"]["combat"]["voices"][0]["playing"] and not mu["tracks"]["menu"]["voices"][0]["playing"],
                         f"놀이 → 전투 곡 · 메뉴 곡은 1초 겹쳐 내려 멈춤(기록 {[str(x['track']) + ':' + x['act'] for x in mu['log'][-4:]]})")
            shot(pg, "play")
            # Tab 엿보기
            pg.keyboard.down("Tab"); pg.wait_for_timeout(150)
            v = J("() => ({ on: __ui.vis('scrHelp'), peek: document.getElementById('scrHelp').classList.contains('peek'), rows: document.querySelectorAll('#hpRows tr').length, nx: __ui.next(), ph: FG.game.phase })")
            shot(pg, "help-peek")
            pg.keyboard.up("Tab"); pg.wait_for_timeout(120)
            off = J("() => __ui.vis('scrHelp')")
            ok &= _check(notes, v["on"] and v["peek"] and v["rows"] >= 15 and v["nx"] is None and v["ph"] == "play" and not off,
                         f"Tab 누르는 동안 조작 보기({v['rows']}줄 · 단추 없음 · 놀이 그대로) → 떼면 닫힘")
            # 야간투시경
            e0 = J("() => __fps.nvg()")
            pg.keyboard.press("KeyN"); pg.wait_for_timeout(100)
            u0 = J("() => __fps.nvg().updates")
            pg.wait_for_timeout(1000)
            e1 = J("() => __fps.nvg()")
            shot(pg, "nvg")
            hz = e1["updates"] - u0
            ok &= _check(notes, e1["on"] and e1["overlay"] and e1["exposure"] > e0["exposure"] * 1.5 and 11 <= hz <= 17 and J("() => __ui.next()") is None,
                         f"N → 야간투시경: 덮개 · 노출 {e0['exposure']} → {e1['exposure']} · 안개 {e1['fog']} · 잡음 1초에 {hz}번(≈15)")
            pg.keyboard.press("KeyN"); pg.wait_for_timeout(150)
            e2 = J("() => __fps.nvg()")
            ok &= _check(notes, not e2["on"] and not e2["overlay"] and e2["exposure"] == e0["exposure"] and e2["fog"] == e0["fog"], f"다시 N → 끔 · 노출 · 안개 되돌림({e2['exposure']} · {e2['fog']})")
            # 음악 — 무전 낮춤 · 은신 · 장면 곡
            J("() => { FG.bus.emit('say', { who: 'nachim', text: '시험 무전', dur: 2 }); FG.bus.flush(); }")
            pg.wait_for_timeout(700)
            mu = J("() => __fps.music()")
            ok &= _check(notes, mu["duck"] and abs(mu["mixTarget"] - 0.5 * 0.4) < 1e-3 and abs(mu["tracks"]["combat"]["voices"][0]["vol"] - 0.2 * 0.75) < 0.03,
                         f"무전 대사 중 음악 낮춤: 배율 {mu['mixTarget']}(0.5 × 0.4) · 전투 곡 크기 {mu['tracks']['combat']['voices'][0]['vol']}")
            pg.wait_for_timeout(1800)
            J("() => { FG.mission.M.music = 'stealth'; }")
            pg.wait_for_timeout(900)
            mu = J("() => __fps.music()")
            ok &= _check(notes, not mu["duck"] and abs(mu["mixTarget"] - 0.5 * 0.55) < 1e-3, f"은신 상태 → 전투 곡 더 낮게(배율 {mu['mixTarget']} = 0.5 × 0.55)")
            J("() => { FG.mission.M.music = 'lighthouse'; }")
            pg.wait_for_timeout(1300)
            mu = J("() => __fps.music()")
            lh = mu["tracks"].get("lighthouse", {})
            ok &= _check(notes, mu["want"] == "lighthouse" and lh.get("plays") == 1 and not mu["tracks"]["combat"]["voices"][0]["playing"],
                         f"임무 행동 ['music', 'lighthouse'] → 등대 장면 곡(재생 {lh.get('plays')}, 상태 {lh.get('state')}) · 전투 곡 겹쳐 내림")
            J("() => { FG.mission.M.music = 'combat'; }")
            pg.wait_for_timeout(1300)
            # 반복 겹침 — 끝 무음 앞에서 처음과 섞음
            J("() => __fps.musicSeekEnd(3.6)")
            pg.wait_for_timeout(1500)
            mu = J("() => __fps.music()")
            cb = mu["tracks"]["combat"]
            both = [v_["playing"] for v_ in cb["voices"]]
            pg.wait_for_timeout(3600)
            mu2 = J("() => __fps.music()")
            cb2 = mu2["tracks"]["combat"]
            ok &= _check(notes, cb["loops"] == 1 and all(both) and cb2["voices"][cb2["cur"]]["playing"] and not cb2["voices"][1 - cb2["cur"]]["playing"] and cb2["voices"][cb2["cur"]]["t"] < 10,
                         f"전투 곡 끝 무음(162초) 앞 3초 겹쳐 처음부터 반복: 겹치는 동안 두 요소 {both} → 뒤 {[v_['playing'] for v_ in cb2['voices']]} · 새 위치 {cb2['voices'][cb2['cur']]['t']}초")
            # ── 5) 멈춤 메뉴 · 조작 보기 · 확인 창
            pg.keyboard.press("Escape")
            ok &= _check(notes, _phase_wait(pg, "paused"), "Esc(대체 조작) → 멈춤")
            pg.wait_for_timeout(700)
            v = J("() => ({ b: __ui.btns('scrPause'), mu: __fps.music(), obj: document.getElementById('pauseObj').textContent })")
            ok &= _check(notes, v["b"] == ["계속하기", "설정", "조작 보기", "체크포인트에서 다시", "임무 그만두기"] and v["mu"]["want"] == "combat" and abs(v["mu"]["mixTarget"] - 0.5 * 0.4) < 1e-3,
                         f"멈춤 메뉴 {v['b']} · 목표 「{v['obj']}」 · 음악은 전투 곡 그대로 낮게(배율 {v['mu']['mixTarget']})")
            shot(pg, "pause")
            pg.click("#btnPzHelp")
            ok &= _check(notes, J("() => __ui.vis('scrHelp') && !__ui.vis('scrPause') && FG.game.phase === 'paused'"), "멈춤 「조작 보기」 → 조작 보기(돌아가기 단추)")
            shot(pg, "help")
            pg.click("#btnHpBack")
            ok &= _check(notes, J("() => __ui.vis('scrPause')"), "「돌아가기」 → 멈춤 메뉴")
            pg.click("#btnPzQuit")
            v = J("() => ({ open: !document.getElementById('dlg').hidden, nx: __ui.next(), cls: document.getElementById('dlg').className })")
            shot(pg, "dialog")
            ok &= _check(notes, v["open"] and v["nx"] is None and "hk-dialog__overlay" in v["cls"], "「임무 그만두기」 → 게임 안 확인 창(alert/confirm 아님 · Space 로 눌릴 단추 없음)")
            pg.keyboard.press("Escape")
            ok &= _check(notes, J("() => document.getElementById('dlg').hidden && FG.game.phase === 'paused'"), "확인 창 Esc → 닫힘 · 멈춤 그대로")
            pg.click("#btnPzQuit"); pg.click("#dlgYes")
            ok &= _check(notes, _phase_wait(pg, "result"), "그만두기 확인 → 결과")
            pg.wait_for_timeout(1400)
            v = J("() => ({ ui: __fps.ui(), mu: __fps.music(), b: __ui.btns('scrResult'), title: document.getElementById('rsTitle').textContent, st: __fps.store().progress })")
            ok &= _check(notes, v["b"] == ["다시 하기", "다음 작전", "임무 고르기"] and v["title"] == "임무 그만둠" and v["mu"]["want"] == "menu" and v["st"]["tutorialDone"],
                         f"결과 단추 {v['b']} · 「{v['title']}」 · 메뉴 곡으로 · 첫 판 끝 표시")
            shot(pg, "result")
            # 결과에서 Space → 「다음 작전」
            nx = J("() => __ui.next()")
            pg.keyboard.press("Space")
            ok &= _check(notes, nx == "다음 작전" and _phase_wait(pg, "play", 3000) and J("() => __fps.mission().id") == "t2" and J("() => __fps.ui().counts.next") == 1,
                         f"결과에서 Space → no-zoom 이 「{nx}」 누름 → 다음 임무 t2")
            pg.wait_for_timeout(300)
            ok &= _check(notes, J("() => __ui.next()") is None, "다음 작전 뒤 놀이 중에도 NEXT 단추 0")
            # 첫 쓰러짐 안내 한 번
            J("() => __fps.killPlayer()")
            pg.wait_for_timeout(2200)
            h1 = J("() => document.getElementById('hint').textContent")
            J("() => FG.ui.hint('')")
            J("() => __fps.killPlayer()")
            pg.wait_for_timeout(2200)
            h2 = J("() => document.getElementById('hint').textContent")
            tips = J("() => FG.missions.tips")
            seen = J("() => __fps.store().progress.seen")
            ok &= _check(notes, h1 == tips["down"] and h2 != tips["down"] and seen.get("tip.down") == 1, f"첫 쓰러짐 안내 한 번만(1번째 「{h1[:18]}…」 · 2번째 다른 글 · 저장 seen)")
            J("() => { FG.game.pause('test'); }")
            pg.click("#btnPzQuit"); pg.click("#dlgYes")
            _phase_wait(pg, "result")
            pg.wait_for_timeout(200)
            v = J("() => ({ b: __ui.btns('scrResult'), t: __fps.state().tainted, test: __fps.ui().visible.test })")
            ok &= _check(notes, v["b"] == ["다시 하기", "임무 고르기"] and v["t"] and v["test"], f"다음 임무가 없으면 「다음 작전」 숨김 {v['b']} · 손잡이 쓴 판 「시험 판」")
            pg.keyboard.press("Space"); pg.wait_for_timeout(300)
            ok &= _check(notes, J("() => FG.game.phase") == "result", "「다음 작전」 없으면 Space 로 넘어가지 않음")
            shot(pg, "result-no-next")
            # ── 6) 기록 · 다시 온 회원 타이틀 · 진행 초기화
            pg.click("#btnToSelect"); _phase_wait(pg, "select")
            _to_title(pg)
            pg.wait_for_timeout(150)
            v = J("() => ({ title: __ui.btns('scrTitle'), first: __fps.ui().firstVisit, sel: document.getElementById('btnSelect').className })")
            ok &= _check(notes, not v["first"] and v["title"][0].startswith("이어서") and "big" in v["sel"], f"다시 온 회원 타이틀: {v['title'][:2]} · 「작전 고르기」 큰 단추")
            shot(pg, "title-returning")
            # S10b — 임무 1 자료가 생겨 「바로 출격」 대상 = 안 깬 첫 임무 m1(S9 설계대로). 완수 기록은 시험 작전 t0 를 고르기 화면에서(키 W 만)
            qt = J("() => __fps.ui().quickTarget")
            ok &= _check(notes, qt == "m1", f"「바로 출격」 대상 = 안 깬 첫 임무 {qt}(S10b 부터 임무 1)")
            pg.click("#btnSelect"); _phase_wait(pg, "select")
            pg.click("#selTest button[data-id='t0']"); _phase_wait(pg, "loadout")
            pg.click("#btnLoGo"); _phase_wait(pg, "play")
            pg.keyboard.down("KeyW")
            t0 = time.time()
            while time.time() - t0 < 8 and J("() => FG.game.phase") != "result":
                pg.wait_for_timeout(100)
            pg.keyboard.up("KeyW")
            pg.wait_for_timeout(200)
            v = J("() => ({ p: __fps.store().progress.missions.t0, rs: document.getElementById('rsBest').textContent, sc: __fps.score().total })")
            ok &= _check(notes, v["p"] and v["p"]["cleared"] and v["p"]["best"] == v["sc"] and v["p"]["stars"] >= 1 and v["p"]["bestTime"] is not None,
                         f"완수 기록(fogisle.progress.v1): t0 최고 {v['p']['best'] if v['p'] else None} · 별 {v['p']['stars'] if v['p'] else None} · 걸린 시간 {v['p']['bestTime'] if v['p'] else None}초 · 「{v['rs']}」")
            pg.click("#btnToSelect"); _phase_wait(pg, "select")
            pg.click("#btnSelSettings")
            pg.click("#btnStReset")
            ok &= _check(notes, J("() => !document.getElementById('dlg').hidden"), "「진행 초기화」 → 확인 창")
            pg.click("#dlgYes")
            pg.wait_for_timeout(150)
            v = J("() => ({ p: __fps.store().progress, first: __fps.ui().firstVisit, ls: localStorage.getItem('fogisle.progress.v1'), set: __fps.store().settings.sens })")
            ok &= _check(notes, v["p"]["missions"] == {} and v["first"] and v["ls"] is None and v["set"] == 1, "진행 초기화 → 기록 지움 · 처음 온 회원 · 설정은 남음")
            keys = J("() => Object.keys(localStorage)")
            ok &= _check(notes, all(k.startswith("fogisle.") for k in keys), f"저장 키 모두 fogisle. 접두 {keys}")
            ok &= _check(notes, not s.errors and not s.external and not s.missing, f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")

            # ── 7) 저장이 막힌 브라우저 — 진행 없이 · 임무 모두 열림 · 오류 0
            blocked = "Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘', 'SecurityError'); } });"
            pg = fresh([blocked])
            J = pg.evaluate
            v = J("() => ({ ui: __fps.ui(), note: document.getElementById('titleNote').textContent })")
            ok &= _check(notes, v["ui"]["blocked"] and all(v["ui"]["unlock"].values()) and "저장이 막혀" in v["note"] and not s.errors,
                         f"저장 막힘: blocked · 임무 모두 열림 {v['ui']['unlock']} · 타이틀 안내 · 오류 0 {s.errors[:2]}")
            shot(pg, "title-blocked")
            pg.click("#btnQuick"); ok &= _check(notes, _phase_wait(pg, "play"), "저장 막혀도 「바로 출격」 → play")

            # ── 8) 음악 파일을 못 불러와도 게임 진행
            s.block_music = True
            pg = fresh()
            J = pg.evaluate
            pg.wait_for_timeout(1800)
            pg.mouse.click(1000, 620)
            pg.wait_for_timeout(500)
            pg.click("#btnQuick")
            ok_play = _phase_wait(pg, "play")
            pg.wait_for_timeout(2500)
            mu = J("() => __fps.music()")
            errs = [e for e in s.errors if ".mp3" not in e and "404" not in e]
            ok &= _check(notes, ok_play and J("() => __fps.mission().active") and mu["tracks"]["menu"]["state"] == "error" and mu["tracks"]["combat"]["state"] == "error"
                         and mu["tracks"]["combat"]["plays"] <= 1 and not errs,
                         f"음악 파일 404 → 게임 그대로(play · 임무 진행) · 곡 상태 {mu['tracks']['menu']['state']}/{mu['tracks']['combat']['state']} · 재생 반복 시도 없음 · 게임 코드 오류 0(브라우저 404 줄 제외) {errs[:2]}")
            s.block_music = False
        finally:
            s.close()
    return finish("ui", ok, summary, notes)


# ───────────────────────────── assets(생성 자산 붙이기) ─────────────────────────────

# 파일마다 용량 상한(KiB — fps-build/asset-manifest.md 「상한」 열)
ASSET_CAP_KB = {
    "art/title-v1.webp": 350, "art/map-v1.webp": 350, "art/m1-v1.webp": 250, "art/m2-v1.webp": 250, "art/m3-v1.webp": 250, "art/m4-v1.webp": 250,
    "art/range-v1.webp": 150, "art/ending-v1.webp": 250,
    "sky/dawn-v1.webp": 250, "sky/overcast-v1.webp": 200, "sky/duskrain-v1.webp": 250, "sky/storm-v1.webp": 250,
    "tex/burlap-v1.jpg": 100, "tex/cloth-enemy-v1.jpg": 50, "tex/cloth-ally-v1.jpg": 50, "tex/vest-v1.jpg": 50,
    "tex/decal-enemy-v1.png": 40, "tex/decal-ally-v1.png": 40,
}
for _k in ("concrete", "rustplate", "corrugated", "planks", "rock", "wetground", "pebbles", "salt", "quarry", "plaster", "turf"):
    ASSET_CAP_KB[f"tex/{_k}-v1.jpg"] = 120
ASSET_MAGIC = {".webp": b"RIFF", ".jpg": b"\xff\xd8\xff", ".png": b"\x89PNG"}

AS_JS = """(() => {
  window.__as = {
    settled: () => { const a = __fps.assets(); return a.started && !a.queue && !a.running && !Object.values(a.items).some((x) => x.state === 'pending'); },
    urls: () => { const S = FG.ASSETS, out = [];
      const add = (k, u) => { if (u) out.push([k, u]); };
      add('art.title', S.titleArt); add('art.map', S.mapArt); add('art.range', S.rangeArt); add('art.ending', S.endingArt);
      for (const k in S.briefingArt || {}) add('art.' + k, S.briefingArt[k]);
      for (const k in S.sky || {}) add('sky.' + k, S.sky[k].url);
      for (const k in S.textures || {}) add('tex.' + k, S.textures[k].url);
      for (const k in S.cloth || {}) add('cloth.' + k, S.cloth[k]);
      for (const k in S.decals || {}) add('decal.' + k, S.decals[k]);
      return out; },
    artOn: (sel) => { const e = document.querySelector(sel); return !!(e && e.classList.contains('on')); },
    mapTex: (zone) => { const b = FG.map.built[zone]; if (!b) return null; const o = {};
      b.group.traverse((m) => { if (m.material && m.material.map) o[m.name] = [m.material.map.name, m.material.map.image && m.material.map.image.width]; }); return o; },
    fog: () => '#' + FG.gfx.world.fog.color.getHexString(),
    skyCol: () => FG.assets.sky.mesh ? '#' + FG.assets.sky.mesh.material.color.getHexString() : null,
    mem: () => Object.assign({ programs: FG.gfx.renderer.info.programs.length }, FG.gfx.renderer.info.memory),
  };
})()"""


def cmd_assets(args):
    """생성 자산(asset-manifest) — 파일 · 상한, 처음 화면을 안 막음, 갈아 끼움, 쌓이지 않음, 하늘 · 야간투시경, 낮음 화질, ?noart=1, 못 불러와도 진행(404)."""
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"shots": []}

    def shot(pg, name):
        p = out / f"assets-{name}.png"
        pg.screenshot(path=str(p))
        summary["shots"].append(str(p))
        return p

    def settle(pg, ms=9000):
        try:
            pg.wait_for_function("() => window.__as && __as.settled()", timeout=ms)
            return True
        except Exception:  # noqa: BLE001
            return False

    with sync_playwright() as pw:
        s = Session(pw)
        try:
            # ── 0) 파일 — 본체가 부르는 그림이 모두 있고 형식 · 용량 상한 안
            pg = s.page([HK_SPY])
            asset_req = []
            pg.on("request", lambda r: asset_req.append(r.url.replace(HOST, "")) if ASSET_DIR in r.url else None)
            t0 = time.time()
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, r_ms = wait_ready(pg, 5000)
            ready_ms = int((time.time() - t0) * 1000)
            pg.evaluate(AS_JS)
            J = pg.evaluate
            try:
                pg.wait_for_function("() => FG.assets.startedAt !== null", timeout=3000)
            except Exception:  # noqa: BLE001
                pass
            v = J("""() => { const s0 = FG.assets.startedAt; return { title: getComputedStyle(document.getElementById('scrTitle')).display, btn: document.getElementById('btnQuick').textContent.trim(),
                start: s0 === null ? null : Math.round(s0), early: performance.getEntriesByType('resource').filter((e) => e.name.indexOf('/assets/games/') >= 0 && !/\\.mp3$/.test(e.name) && (s0 === null || e.startTime < s0))
                  .map((e) => e.name.replace(location.origin, '')) }; }""")
            early = [u for u in v["early"] if not u.endswith("title-v1.webp")]
            ok &= _check(notes, r_ok and v["title"] != "none" and v["btn"] and v["start"] is not None and not early,
                         f"처음 화면을 안 막음: ready {ready_ms}ms · 타이틀 보임 · 나머지 그림은 준비 끝 뒤 쉬는 틈({v['start']}ms)부터 — 그 전에 받은 것 = 타이틀 그림만 {v['early']}")
            urls = J("() => __as.urls()")
            bad = []
            total = 0
            for key, u in urls:
                rel = u.replace(ASSET_DIR, "")
                f = WEB / u.lstrip("/")
                if not f.is_file():
                    bad.append(f"{key} 없음 {u}")
                    continue
                b = f.read_bytes()
                total += len(b)
                cap = ASSET_CAP_KB.get(rel)
                if cap is None or len(b) > cap * 1024:
                    bad.append(f"{key} {len(b) / 1024:.1f}KB > 상한 {cap}")
                if not b.startswith(ASSET_MAGIC.get(f.suffix, b"?")):
                    bad.append(f"{key} 형식 {f.suffix} 아님")
            summary["files"] = len(urls)
            summary["bytes"] = total
            ok &= _check(notes, len(urls) == 29 and not bad, f"FG.ASSETS 그림 {len(urls)}개 — 파일 있음 · 형식 · 상한 이하(합 {total / 1048576:.2f}MB) {bad[:4]}")

            # ── 1) 보통 — 타이틀 그림이 나타나고, 쉬는 틈에 P 묶음, 모두 ok
            try:
                pg.wait_for_function("() => __as.artOn('#scrTitle > .fg-art')", timeout=3000)
                t_on = True
            except Exception:  # noqa: BLE001
                t_on = False
            st = settled = settle(pg)
            a = J("() => __fps.assets()")
            states = {k: x["state"] for k, x in a["items"].items()}
            notok = {k: x for k, x in states.items() if x != "ok"}
            need = {"art.title", "art.map", "art.m1", "art.range", "sky.overcast", "tex.concrete", "tex.planks", "cloth.enemy", "cloth.ally", "cloth.vest", "decal.enemy", "decal.ally"}
            ok &= _check(notes, t_on and st and not notok and need <= set(states) and all(a["items"][k].get("applied") for k in a["items"] if k.split(".")[0] in ("tex", "cloth", "decal")),
                         f"타이틀 그림 나타남 {t_on} · 쉬는 틈에 받기 끝 {settled} · 받은 {len(states)}개 모두 ok · 무늬 · 천 · 휘장 갈아 끼움 {sorted(states)}")
            summary["loaded"] = {k: [x["state"], x["ms"]] for k, x in a["items"].items()}
            pg.wait_for_timeout(600)   # 나타남 전환(0.4초) 끝난 뒤
            shot(pg, "title")

            # ── 2) 고르기 화면 — 지도 · 훈련장 카드 썸네일
            J("() => FG.game.setPhase('select', { why: 'test' })")
            pg.wait_for_timeout(700)
            v = J("() => ({ map: __as.artOn('#selMap > .fg-art'), th: __as.artOn('.fg-card.range .th > .fg-art'), cards: document.querySelectorAll('#selMap .fg-card').length })")
            ok &= _check(notes, v["map"] and v["th"], f"작전 고르기: 섬 지도 그림 · 훈련장 카드 썸네일 {v}")
            shot(pg, "select")
            J("() => FG.game.setPhase('title', { why: 'test' })")

            # ── 3) 놀이 — 시험 구역 t0: 생성 무늬 · 하늘 · 안개색 · 사람 무늬판
            pg.click("#btnSortie")
            _phase_wait(pg, "play")
            pg.wait_for_timeout(900)
            m0 = J("() => __as.mem()")
            v = J("() => ({ tex: __as.mapTex('t0'), sky: __fps.assets().sky, fog: __as.fog(), people: FG.actors.people.mat.map && FG.actors.people.mat.map.image.width })")
            sk = J("() => FG.ASSETS.sky.overcast.fog.toString(16)")
            ok &= _check(notes, all(t[0].startswith("fg-look-") and t[1] in (256, 512) for t in v["tex"].values() if t) and v["sky"]["shown"] == "overcast" and v["sky"]["visible"]
                         and v["fog"] == "#" + sk.rjust(6, "0") and v["people"] in (256, 512),
                         f"t0 표면 = 생성 무늬 {v['tex']} · 하늘 {v['sky']} · 안개 {v['fog']}(하늘 아래 띠 평균) · 사람 무늬판 {v['people']}²")
            J("() => { __fps.teleportTo('t0.spawn'); __fps.look(180, 2); __fps.step(0.1); }")
            pg.wait_for_timeout(300)
            shot(pg, "t0")
            # 야간투시경 — 하늘도 어두운 녹색, 끄면 하늘 안개색으로
            J("() => { FG.weapons.nvg = true; }")
            pg.wait_for_timeout(300)
            n1 = J("() => ({ nvg: __fps.nvg(), sky: __as.skyCol() })")
            J("() => { FG.weapons.nvg = false; }")
            pg.wait_for_timeout(300)
            n2 = J("() => ({ nvg: __fps.nvg(), sky: __as.skyCol(), fog: __as.fog() })")
            ok &= _check(notes, n1["nvg"]["on"] and n1["sky"] == "#2c5a36" and not n2["nvg"]["on"] and n2["sky"] == "#ffffff" and n2["fog"] == v["fog"],
                         f"야간투시경: 하늘 {n1['sky']} · 안개 {n1['nvg']['fog']} → 끔: 하늘 {n2['sky']} · 안개 {n2['fog']}")
            # 다른 하늘(임무 시간대) — 폭풍 → 기본
            J("() => FG.assets.useSky('storm')")
            try:
                pg.wait_for_function("() => __fps.assets().sky.shown === 'storm'", timeout=4000)
            except Exception:  # noqa: BLE001
                pass
            s1 = J("() => ({ sky: __fps.assets().sky, fog: __as.fog() })")
            J("() => { __fps.look(30, 12); __fps.step(0.05); }")
            pg.wait_for_timeout(250)
            shot(pg, "sky-storm")
            J("() => FG.assets.useSky(null)")
            pg.wait_for_timeout(600)
            s2 = J("() => ({ sky: __fps.assets().sky, fog: __as.fog() })")
            ok &= _check(notes, s1["sky"]["shown"] == "storm" and s1["fog"] == "#435b77" and s2["sky"]["shown"] == "overcast" and s2["fog"] == "#c1c4c8",
                         f"임무 하늘 바꾸기: 폭풍 {s1} → 기본(흐림) {s2}")
            # 훈련장 · 사람 그림
            J("() => { __fps.loadZone('tr'); __fps.teleportTo('tr.range'); __fps.look(0, 0); __fps.step(0.2); }")
            pg.wait_for_timeout(900)
            shot(pg, "range")
            J("""() => { __fps.loadZone('t0'); __fps.teleportTo('t0.spawn'); __fps.look(0, 0); __fps.step(0.2); const p = FG.player.pos;
                __fps.actorsDemo([{ team: 'enemy', type: 'rifle', pos: [p.x - 0.9, p.y, p.z - 2.6], yaw: 150 }, { team: 'ally', pos: [p.x + 0.9, p.y, p.z - 2.6], yaw: 210 },
                  { team: 'enemy', type: 'heavy', pos: [p.x + 2.4, p.y, p.z - 5], yaw: 200 }]); }""")
            pg.wait_for_timeout(700)
            shot(pg, "people")
            J("() => __fps.actorsDemo([])")
            # ── 4) 쌓이지 않음 — 구역 바꾸기 · 다시 시작 여러 번 뒤 텍스처 · 형상 · 셰이더 수 그대로
            cyc = []
            for i in range(4):
                J("() => { __fps.loadZone('tr'); __fps.step(0.05); }"); pg.wait_for_timeout(120)
                J("() => { __fps.loadZone('t1'); __fps.step(0.05); }"); pg.wait_for_timeout(120)
                J("() => { __fps.loadZone('t0'); __fps.loadZone('t0'); __fps.step(0.05); }"); pg.wait_for_timeout(120)
                settle(pg, 3000)
                pg.wait_for_timeout(300)
                cyc.append(J("() => Object.assign(__as.mem(), { looks: __fps.assets().looks.length })"))
            ok &= _check(notes, cyc[1]["textures"] == cyc[3]["textures"] and cyc[1]["geometries"] == cyc[3]["geometries"] and cyc[1]["programs"] == cyc[3]["programs"] and cyc[3]["looks"] <= 12,
                         f"구역 tr · t1 · t0 를 4번 돌고 다시 시작해도 안 쌓임: 텍스처 {[c['textures'] for c in cyc]} · 형상 {[c['geometries'] for c in cyc]} · 셰이더 {[c['programs'] for c in cyc]} · 무늬 {cyc[3]['looks']}종 (처음 t0 {m0})")
            summary["mem"] = cyc[-1]
            # 텍스처 메모리 추정(GPU, 밉맵 포함 4/3)
            gm = J("""() => { let b = 0; const seen = new Set(); const add = (t, mip) => { if (!t || seen.has(t)) return; seen.add(t); const i = t.image; if (!i || !i.width) return; b += i.width * i.height * 4 * (mip ? 4 / 3 : 1); };
                for (const k in FG.assets.looks) add(FG.assets.looks[k], true); add(FG.assets._pp, true); if (FG.assets.sky.shown) add(FG.assets.sky.tex, false); return Math.round(b / 1048576 * 10) / 10; }""")
            summary["gen_tex_mb"] = gm
            ok &= _check(notes, gm <= 28, f"생성 텍스처 GPU 추정 {gm}MB(무늬 · 사람 무늬판 · 하늘, 밉맵 포함) ≤ 28MB(asset-plan §3-2 제안 · S14 실측)")
            c = not s.errors and not s.external and not s.missing
            ok &= _check(notes, c, f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:3]} {s.external[:3]} {s.missing[:3]}")

            # ── 5) 낮음 화질 — 무늬 256² · 하늘 그림 안 씀(같은 브라우저 저장으로 다시 열기)
            J("() => __fps.setSetting('quality', 'low')")
            pg.reload(wait_until="load")
            wait_ready(pg, 5000)
            pg.evaluate(AS_JS)
            pg.click("#btnSortie")
            _phase_wait(pg, "play")
            settle(pg)
            pg.wait_for_timeout(700)
            v = J("() => ({ q: FG.perf.quality, tex: __as.mapTex('t0'), sky: __fps.assets().sky, fog: __as.fog(), pp: FG.actors.people.mat.map.image.width })")
            ok &= _check(notes, v["q"] == "low" and all(t[1] == 256 for t in v["tex"].values() if t) and not v["sky"]["visible"] and v["fog"] == "#a9c6d4" and v["pp"] == 256,
                         f"낮음 화질: 무늬 256² {v['tex']} · 하늘 그림 안 씀 {v['sky']} · 안개 코드 색 {v['fog']} · 사람 무늬판 {v['pp']}²")
            shot(pg, "low")

            # ── 6) ?noart=1 — 그림을 하나도 안 받음(음악은 따로)
            pg = s.page([HK_SPY])
            asset_req.clear()
            pg.on("request", lambda r: asset_req.append(r.url.replace(HOST, "")) if ASSET_DIR in r.url else None)
            pg.goto(HOST + BODY_URL + "?noart=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            pg.evaluate(AS_JS)
            J = pg.evaluate
            pg.wait_for_timeout(2200)
            pg.click("#btnSortie")
            _phase_wait(pg, "play")
            pg.wait_for_timeout(600)
            img_req = [u for u in asset_req if not u.endswith(".mp3")]
            a = J("() => __fps.assets()")
            v = J("() => ({ tex: __as.mapTex('t0'), title: __as.artOn('#scrTitle > .fg-art') })")
            ok &= _check(notes, r_ok and not img_req and all(x["state"] == "off" for x in a["items"].values()) and not v["title"] and not a["sky"]["visible"] and not s.errors,
                         f"?noart=1: 그림 요청 0 {img_req[:3]} · 상태 모두 off · 코드 무늬 {v['tex']} · 하늘 숨김")
            shot(pg, "noart")

            # ── 7) 못 불러와도 진행 — 자산 폴더 전부 404(그림 · 음악): smoke · 훈련장 · 임무
            s.block_assets = True
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, r_ms = wait_ready(pg, 5000)
            pg.evaluate(AS_JS)
            J = pg.evaluate
            pg.wait_for_timeout(1500)
            info = J("""() => ({ st: __fps.state(), rev: THREE.REVISION, titleOn: getComputedStyle(document.getElementById('scrTitle')).display !== 'none',
                btn: document.getElementById('btnQuick').textContent.trim(), fatal: getComputedStyle(document.getElementById('fatal')).display !== 'none',
                art: __as.artOn('#scrTitle > .fg-art') })""")
            ok &= _check(notes, r_ok and info["rev"] == "160" and info["st"]["phase"] == "title" and info["titleOn"] and info["btn"] == "바로 출격" and not info["fatal"] and not info["art"],
                         f"[404] ready {r_ms}ms · r160 · 타이틀 · 「바로 출격」 · 실패 안내 숨김 · 타이틀 그림 없이 코드 장면")
            shot(pg, "404-title")
            settle(pg, 9000)
            a = J("() => __fps.assets()")
            states = {k: x["state"] for k, x in a["items"].items()}
            ok &= _check(notes, states and all(x == "fail" for x in states.values()),
                         f"[404] 받으려던 {len(states)}개 모두 fail(다시 시도 없음 · 기다림 없음) {sorted(set(states.values()))}")
            # 고르기 → 훈련장 카드 클릭 → 놀이 · 사격
            J("() => FG.game.setPhase('select', { why: 'test' })")
            pg.wait_for_timeout(400)
            sel = J("() => ({ map: __as.artOn('#selMap > .fg-art'), bg: getComputedStyle(document.querySelector('#selMap')).backgroundColor })")
            shot(pg, "404-select")
            pg.click(".fg-card.range")
            p_ok = _phase_wait(pg, "play")
            pg.wait_for_timeout(500)
            r = J("""() => { __fps.teleportTo('tr.range'); __fps.aimAt('buoy1'); const a0 = __fps.weapon().mag; __fps.fireFor(0.4); __fps.step(0.3);
                return { zone: __fps.state().zones, fired: a0 - __fps.weapon().mag, sky: __fps.assets().sky, fog: __as.fog(), tex: __as.mapTex('tr'), drill: !!__fps.drill() }; }""")
            pg.wait_for_timeout(400)
            shot(pg, "404-range")
            ok &= _check(notes, p_ok and r["zone"] == ["tr"] and r["fired"] > 0 and not r["sky"]["visible"] and r["fog"] == "#a9c6d4" and not sel["map"],
                         f"[404] 고르기(지도 그림 없이 코드 바탕 {sel['bg']}) → 「부표 사격장」 클릭 → play · 쏨 {r['fired']}발 · 하늘 숨김 · 안개 코드 색 {r['fog']}")
            # 임무(시험 작전 t0) 시작 · 진행
            J("() => FG.game.setPhase('title', { why: 'test' })")
            pg.click("#btnQuick")
            q_ok = _phase_wait(pg, "play")
            pg.wait_for_timeout(1500)
            m = J("() => ({ mi: __fps.mission(), music: __fps.music() })")
            mus = {k: x["state"] for k, x in (m["music"] or {}).get("tracks", {}).items()}
            ok &= _check(notes, q_ok and m["mi"] and m["mi"]["active"], f"[404] 「바로 출격」 → 임무 {m['mi'] and m['mi']['id']} 진행 · 음악 {mus}")
            errs = [e for e in s.errors if "404" not in e and "Failed to load resource" not in e]
            n404 = len(s.errors) - len(errs)
            ok &= _check(notes, not errs and not s.external,
                         f"[404] 게임 코드 오류 0(브라우저가 낸 「Failed to load resource … 404」 {n404}줄은 일부러 끊은 자산이라 뺌 — 콘솔에는 빨간 줄로 보임) · 바깥 요청 0 {errs[:3]} (없는 파일 {len(s.missing)}건)")
            s.block_assets = False
        finally:
            s.close()
    return finish("assets", ok, summary, notes)



def H_dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def main():
    ap = argparse.ArgumentParser(description="안개 군도 FPS 시험 하네스")
    ap.add_argument("--out", default=None, help="산출물 폴더(기본 FOGISLE_OUT 또는 /tmp/fogisle-check)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("lint", help="문법 · 금지 문자열 · 금지어 · sim 규칙 · 크기").add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("smoke", help="단독으로 열어 오류 0 · ready · r160 · 타이틀 스크린샷")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("arcade", help="--frame: 잠금 · Esc · 멈춤 · hk 신호 규약(가짜 부모 창) / 없이(S9): + 점수 신호 hk:start · live · score · Space 초점 · 그만두기 · tainted")
    p.add_argument("--frame", action="store_true", help="가짜 부모 창 안에서 멈춤 규약만(S1)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("move", help="시험 구역 t0 이동 · 충돌 + 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기(S3) / --basic: S2 항목만")
    p.add_argument("--basic", action="store_true", help="걷기 · 벽 · 경사판 · 계단 · 앉기 · 엎드리기 · 점프(S2)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("perf", help="실시간 고리 측정(중앙값 · 95번째 · 33ms 초과 · 호출 · 삼각형 · ?dbg=1 표) — S3: 시험 구역 t0 · 보통 화질")
    p.add_argument("--sec", type=float, default=20, help="측정 시간(초, 몸풀기 3초 뒤)")
    p.add_argument("--mission", default=None, help="임무 — t0 · m1(S10b 임무 1 실제 판 + 등대 · 선착장 구간, --sec 60 권장) · m2(S11b 임무 2 실제 판 + 증기 · 버티기 · 창고 구간). m4 는 S13")
    p.add_argument("--quality", default="mid", help="화질(S14 부터 high · low · auto). 지금은 mid 만")
    p.add_argument("--fire", action="store_true", help="걸으며 연사(S4 — 그리기 호출 ≤ 60)")
    p.add_argument("--blast", action="store_true", help="걸으며 0.7초마다 폭발(S5 — 33ms 넘는 프레임 0 · 호출 ≤ 60 · 셰이더 새로 안 만듦)")
    p.add_argument("--ai", action="store_true", help="시험 구역 t1 에서 적 14명 깨어 있음(S6 — AI ≤ 1.2ms · 호출 ≤ 100)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("shoot", help="--core: 무기 6종 · 반동 = 판정 · 재장전 · 교체 · 조준 · 산탄 · 피해 · HUD 맞힘 표시 · 소리(S4) / 없이: S4 + 장비 · 관통 · 효과 · 훈련장(S5)")
    p.add_argument("--core", action="store_true", help="S4 사격 핵심")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("ai", help="(S7) 없이: S6 + 적 4종 · 아군 · 난이도 · 전투 HUD · 결정성 / --core: 시험 구역 t1 — 순찰 · 소리 경계 · 시야 게이지 → 교전 · 첫 발 빗나감 · 맞으면 엄폐 · 놓치면 추격 → 순찰 · 쓰러짐 2.1초 · 엄폐 뒤 못 맞힘 · 길찾기 · 끼임(S6)")
    p.add_argument("--core", action="store_true", help="S6 적 AI 기본만(없이: + S7 적 4종 · 섬광 · 수류탄 · 측면 · 난이도 · 아군 · 민간인 · 전투 HUD · 결정성)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("mission", help="(S8) 임무를 god · autopilot · fast(8) 로 결과까지 — 목표 순서 · 시간 상한 · autopilotStuck 없음 · 점수 0~250,000(+ t2: 연출 · 임무 HUD · 상호작용 · 버티기)")
    p.add_argument("--id", default="t2", help="임무 키(t2 · t0 — S10 부터 m1 …)")
    p.add_argument("--diff", default="normal", choices=["easy", "normal", "hard"])
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("checkpoint", help="(S8) 체크포인트 뒤 hp 0 → 1.5초 뒤 복원 = 스냅숏(위치 · 탄 · 적 · 목표 번호)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("ui", help="(S9) 화면 전환 스크린샷 · 놀이 중 NEXT 단추 0 · 결과 Space → 다음 작전 · 저장 · 음악 요청 상태 · 야간투시경 · 설정 반영")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("assets", help="(생성 자산) 파일 · 상한 · 처음 화면 안 막음 · 갈아 끼움 · 안 쌓임 · 하늘 · 낮음 화질 · ?noart=1 · 자산 404 여도 smoke · 훈련장 · 임무")
    p.add_argument("--out", default=argparse.SUPPRESS)
    args = ap.parse_args()
    fn = {"lint": cmd_lint, "smoke": cmd_smoke, "arcade": cmd_arcade, "move": cmd_move, "perf": cmd_perf, "shoot": cmd_shoot, "ai": cmd_ai,
          "mission": cmd_mission, "checkpoint": cmd_checkpoint, "ui": cmd_ui, "assets": cmd_assets}[args.cmd]
    sys.exit(fn(args))


if __name__ == "__main__":
    main()
