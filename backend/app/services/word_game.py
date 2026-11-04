"""2인 협동 「말해 봐 맞혀 봐」 — 한 사람이 제시어를 설명하고, 다른 사람이 맞힌다. 3분 동안 몇 개나 맞히나.

설명하는 사람만 제시어와 금지어 3개를 본다. 설명에 제시어나 금지어가 들어가면 보낼 수 없다.
한 단어가 끝나면(맞히거나 넘기면) 설명하는 사람과 맞히는 사람이 바뀐다. 둘이 함께 점수를 쌓는 협동 게임.
"""

from __future__ import annotations

import random
import re
from typing import Optional

from app.core.errors import raise_app_error

ROUND_SEC = 180
CLUE_MAX = 40
CLUE_GAP = 0.8
GUESS_GAP = 0.6
KEEP = 30  # 한 단어에 남기는 설명·답 수

# (제시어, 금지어 3개, 같은 말로 쳐 주는 답)
WORDS = (
    # 회사 생활
    ("출근", ("회사", "아침", "지각"), ()),
    ("퇴근", ("집", "저녁", "칼퇴"), ()),
    ("야근", ("밤", "늦게", "초과"), ()),
    ("회의", ("미팅", "회의실", "안건"), ()),
    ("월급", ("돈", "통장", "급여"), ()),
    ("연차", ("휴가", "쉬다", "하루"), ()),
    ("점심시간", ("밥", "12시", "식사"), ()),
    ("회식", ("술", "저녁", "단체"), ()),
    ("보고서", ("문서", "작성", "상사"), ()),
    ("결재", ("도장", "승인", "서명"), ()),
    ("명함", ("이름", "종이", "교환"), ()),
    ("엘리베이터", ("층", "버튼", "계단"), ("승강기",)),
    ("프린터", ("출력", "종이", "인쇄"), ("프린트", "복합기")),
    ("탕비실", ("커피", "간식", "정수기"), ()),
    ("메신저", ("채팅", "메시지", "팀즈"), ()),
    ("화상회의", ("카메라", "온라인", "마이크"), ("화상 회의",)),
    ("사원증", ("카드", "출입", "목걸이"), ()),
    ("퇴사", ("그만두다", "회사", "사표"), ()),
    ("신입사원", ("입사", "처음", "막내"), ("신입",)),
    ("팀장", ("리더", "상사", "팀"), ()),
    ("마감", ("기한", "날짜", "끝"), ()),
    ("키보드", ("타자", "자판", "컴퓨터"), ()),
    ("모니터", ("화면", "컴퓨터", "보다"), ()),
    ("마우스", ("클릭", "컴퓨터", "쥐"), ()),
    ("택배", ("상자", "배달", "주문"), ()),
    ("출장", ("지방", "해외", "업무"), ()),
    ("재택근무", ("집", "원격", "출근"), ("재택",)),
    ("엑셀", ("표", "셀", "계산"), ()),
    ("비밀번호", ("암호", "로그인", "숫자"), ("패스워드",)),
    ("이메일", ("메일", "편지", "보내다"), ()),
    ("워크숍", ("교육", "단체", "1박"), ("워크샵",)),
    ("자판기", ("동전", "음료", "버튼"), ()),
    ("주차장", ("자동차", "자리", "지하"), ()),
    ("커피", ("카페인", "아메리카노", "원두"), ()),
    # 건강
    ("거북목", ("목", "자세", "스마트폰"), ()),
    ("스트레칭", ("늘리다", "몸", "운동"), ()),
    ("안마", ("마사지", "어깨", "주무르다"), ()),
    ("두통", ("머리", "아프다", "약"), ()),
    ("감기", ("기침", "콧물", "몸살"), ()),
    ("비타민", ("영양제", "과일", "알약"), ()),
    ("건강검진", ("병원", "검사", "내시경"), ("건강 검진",)),
    ("헬스장", ("운동", "기구", "근육"), ("헬스", "체육관")),
    ("만보기", ("걸음", "숫자", "걷기"), ()),
    ("수면", ("잠", "침대", "밤"), ()),
    ("안약", ("눈", "건조", "떨어뜨리다"), ()),
    ("마스크", ("얼굴", "입", "코"), ()),
    ("체온계", ("온도", "재다", "겨드랑이"), ()),
    ("양치질", ("칫솔", "치약", "입"), ("양치",)),
    ("요가", ("매트", "자세", "명상"), ()),
    ("줄넘기", ("줄", "뛰다", "운동"), ()),
    ("체중계", ("몸무게", "저울", "재다"), ()),
    ("반창고", ("상처", "붙이다", "밴드"), ()),
    ("안경", ("눈", "렌즈", "쓰다"), ()),
    ("산책", ("걷다", "공원", "바람"), ()),
    ("낮잠", ("잠", "오후", "졸리다"), ()),
    ("하품", ("입", "졸리다", "피곤"), ()),
    ("딸꾹질", ("소리", "멈추다", "놀라게"), ()),
    ("어깨", ("몸", "팔", "결리다"), ()),
    # 음식
    ("떡볶이", ("떡", "매운", "분식"), ()),
    ("김밥", ("김", "밥", "소풍"), ()),
    ("라면", ("면", "끓이다", "봉지"), ()),
    ("짜장면", ("중국집", "검은", "춘장"), ("자장면",)),
    ("삼겹살", ("돼지", "고기", "굽다"), ()),
    ("치킨", ("닭", "튀기다", "배달"), ("통닭",)),
    ("피자", ("치즈", "조각", "도우"), ()),
    ("아이스크림", ("차갑다", "콘", "녹다"), ()),
    ("도시락", ("반찬", "밥", "싸다"), ()),
    ("편의점", ("24시간", "가게", "삼각김밥"), ()),
    ("수박", ("여름", "초록", "줄무늬"), ()),
    ("귤", ("겨울", "주황", "껍질"), ("감귤",)),
    ("붕어빵", ("팥", "겨울", "물고기"), ()),
    ("비빔밥", ("섞다", "고추장", "나물"), ()),
    ("김치", ("배추", "빨간", "발효"), ()),
    ("샌드위치", ("빵", "햄", "사이"), ()),
    ("팝콘", ("영화", "옥수수", "터지다"), ()),
    ("초콜릿", ("달다", "카카오", "갈색"), ("초콜렛", "쪼꼬렛")),
    ("우유", ("흰색", "젖소", "마시다"), ()),
    ("계란", ("닭", "노른자", "프라이"), ("달걀",)),
    ("국밥", ("국물", "밥", "뜨끈"), ()),
    ("떡국", ("설날", "떡", "나이"), ()),
    ("송편", ("추석", "떡", "반달"), ()),
    ("탕후루", ("과일", "설탕", "꼬치"), ()),
    # 생활
    ("우산", ("비", "쓰다", "펴다"), ()),
    ("지하철", ("역", "노선", "열차"), ("전철",)),
    ("버스", ("정류장", "타다", "기사"), ()),
    ("택시", ("기사", "요금", "부르다"), ()),
    ("스마트폰", ("전화", "앱", "화면"), ("핸드폰", "휴대폰", "휴대전화", "폰")),
    ("충전기", ("배터리", "전기", "꽂다"), ()),
    ("이어폰", ("귀", "음악", "듣다"), ()),
    ("알람", ("시계", "아침", "울리다"), ("알람시계",)),
    ("달력", ("날짜", "월", "일정"), ()),
    ("냉장고", ("차갑다", "음식", "문"), ()),
    ("에어컨", ("시원하다", "여름", "바람"), ()),
    ("선풍기", ("바람", "날개", "여름"), ()),
    ("세탁기", ("빨래", "옷", "돌리다"), ()),
    ("노래방", ("노래", "마이크", "점수"), ()),
    ("영화관", ("영화", "팝콘", "스크린"), ("극장",)),
    ("주말", ("토요일", "일요일", "쉬다"), ()),
    ("생일", ("케이크", "축하", "태어나다"), ()),
    ("크리스마스", ("산타", "12월", "선물"), ("성탄절",)),
    ("눈사람", ("눈", "겨울", "만들다"), ()),
    ("단풍", ("가을", "나뭇잎", "빨간"), ()),
    ("벚꽃", ("봄", "분홍", "꽃"), ()),
    ("캠핑", ("텐트", "야외", "불"), ()),
    ("여권", ("해외", "여행", "비행기"), ()),
    ("비행기", ("하늘", "공항", "날다"), ()),
    ("자전거", ("페달", "바퀴", "타다"), ()),
    ("강아지", ("개", "멍멍", "반려동물"), ("개",)),
    ("고양이", ("야옹", "냥이", "반려동물"), ()),
    ("신호등", ("빨간불", "초록불", "건너다"), ()),
    ("편지", ("우표", "쓰다", "봉투"), ()),
    ("사진", ("카메라", "찍다", "앨범"), ()),
    ("거울", ("비추다", "얼굴", "보다"), ()),
    ("쓰레기통", ("버리다", "휴지", "분리수거"), ()),
)


class WordRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "words"
    title = "말해 봐 맞혀 봐"
    label = "협동 게임"
    page = "words"
    game = "words"
    blurb = "둘이 번갈아 설명하고 맞히며 3분 동안 낱말을 최대한 많이 맞히는 협동 게임이에요."
    intro = (
        "한 사람이 제시어를 설명하면 다른 사람이 맞혀요. 설명할 때는 제시어와 금지어 3개를 쓸 수 없어요. "
        "한 낱말이 끝나면 설명하는 사람이 바뀌어요. 3분 동안 둘이 함께 최대한 많이 맞혀 보세요."
    )
    outro = "둘이 손발이 척척 맞았어요!"
    # 쪽 이름은 '처음에 맡는 일' — 낱말마다 서로 바뀐다
    sides = {"first": "먼저 설명", "second": "먼저 맞히기"}
    limit_sec = ROUND_SEC


ROOM = WordRoom()


def _norm(text: str) -> str:
    """띄어쓰기 · 문장부호 · 대소문자를 빼고 비교한다."""
    return re.sub(r"[\s\W_]+", "", (text or "").lower())


def _explainer(k: dict) -> str:
    return "first" if k["turn"] % 2 == 0 else "second"


def _word(k: dict) -> tuple:
    return WORDS[k["order"][k["i"] % len(k["order"])]]


def _next(k: dict, ok: bool, now: float) -> None:
    word = _word(k)[0]
    k["done"].append({"word": word, "ok": ok, "by": _explainer(k), "t": now})
    if ok:
        k["score"] += 1
    else:
        k["passed"] += 1
    k["i"] += 1
    k["turn"] += 1
    k["clues"], k["guesses"] = [], []
    k["wordAt"] = now


def start(st: dict, now: float) -> None:
    order = list(range(len(WORDS)))
    random.shuffle(order)
    st["k"] = {
        "start": now, "end": now + ROUND_SEC, "order": order, "i": 0, "turn": 0, "wordAt": now,
        "score": 0, "passed": 0, "clues": [], "guesses": [], "done": [], "over": False, "reason": None, "gap": {},
    }


def advance(st: dict, now: float) -> bool:
    k = st["k"]
    if k["over"] or now < k["end"]:
        return False
    k["over"], k["reason"] = True, "time"
    return True


def next_event(st: dict) -> Optional[float]:
    k = st["k"]
    return None if k["over"] else k["end"]


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    k = st["k"]
    if k["over"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    explaining = side == _explainer(k)
    word, banned, alias = _word(k)
    gap = k.setdefault("gap", {})
    last = gap.get(f"{member_id}:{action}", 0)

    if action == "clue":
        if not explaining:
            raise_app_error("WORDS_NOT_YOUR_TURN")
        if now - last < CLUE_GAP:
            raise_app_error("ESCAPE_TOO_FAST", 429)
        text = re.sub(r"\s+", " ", str(arg or "")).strip()[:CLUE_MAX]
        if not text:
            raise_app_error("ESCAPE_CHAT_EMPTY")
        flat = _norm(text)
        if any(_norm(w) and _norm(w) in flat for w in (word, *alias, *banned)):
            raise_app_error("WORDS_BANNED")
        gap[f"{member_id}:{action}"] = now
        k["clues"] = [*k["clues"], {"t": now, "text": text}][-KEEP:]
        return
    if action == "guess":
        if explaining:
            raise_app_error("WORDS_NOT_YOUR_TURN")
        if now - last < GUESS_GAP:
            raise_app_error("ESCAPE_TOO_FAST", 429)
        text = re.sub(r"\s+", " ", str(arg or "")).strip()[:20]
        if not text:
            raise_app_error("ESCAPE_CHAT_EMPTY")
        gap[f"{member_id}:{action}"] = now
        ok = _norm(text) in {_norm(w) for w in (word, *alias)}
        k["guesses"] = [*k["guesses"], {"t": now, "text": text, "ok": ok}][-KEEP:]
        if ok:
            _next(k, True, now)
        return
    if action == "pass":
        if not explaining:
            raise_app_error("WORDS_NOT_YOUR_TURN")
        if now - k.get("wordAt", 0) < 1.0:
            raise_app_error("ESCAPE_TOO_FAST", 429)
        _next(k, False, now)
        return
    raise_app_error("KITCHEN_BAD_ACTION")


START_TEXT = f"시작! {ROUND_SEC // 60}분 동안 최대한 많이 맞혀 보세요."


def end_code(st: dict) -> str:
    return "TIME"


def score(st: dict) -> int:
    return st["k"]["score"]


def summary(st: dict) -> str:
    k = st["k"]
    return f"시간 끝! {k['score']}개를 맞혔어요."


def view(st: dict, side: Optional[str], now: float) -> dict:
    k = st["k"]
    explaining = side == _explainer(k)
    word, banned, _ = _word(k)
    show = explaining or k["over"]
    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st),
        "over": k["over"], "score": k["score"], "passed": k["passed"],
        "role": "explain" if explaining else "guess",
        "word": word if show else None,
        "banned": list(banned) if show else None,
        "letters": len(word),  # 맞히는 사람에게는 글자 수만
        "clues": k["clues"], "guesses": k["guesses"],
        "done": k["done"][-12:], "clueMax": CLUE_MAX,
    }
