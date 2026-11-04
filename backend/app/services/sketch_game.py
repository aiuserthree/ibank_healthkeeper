"""2인 협동 「화이트보드 그림 퀴즈」 — 한 사람이 제시어를 화이트보드에 그리고, 다른 사람이 그림을 보고 맞힌다. 3분 동안 몇 점이나.

그리는 사람만 제시어를 본다. 맞히는 사람은 분야 · 글자 수를 보고, 한 낱말에 40초가 지나면 초성 힌트를 본다.
한 낱말이 끝나면(맞히거나 넘기면) 그리는 사람과 맞히는 사람이 바뀌고 화이트보드는 깨끗이 지운다.
고른 분야의 낱말을 한 바퀴 다 쓰면(넘기기만 거듭한 경우) 판이 끝난다 — 같은 낱말이 같은 순서로 다시 나오지 않게.
그림에 글자 · 숫자를 쓰는 건 서버가 알아낼 수 없어서 '글자를 쓰면 반칙' 약속으로 둔다.

그림은 획 단위 — 좌표는 0~1000 정수(가로세로 4:3 칸 기준), 한 번에 80점까지 조각으로 보낸다.
조각에는 낱말 번호(n) · 획 id · 조각 순서(seq)가 꼭 있어야 한다.
같은 획 id 의 다음 조각(seq 가 커짐)은 이어 붙이고, 지금까지보다 큰 id(한 번에 ID_JUMP 까지)는 새 획이 된다.
되돌린 획 · 지난 낱말의 늦게 온 조각 · 같은 조각 다시 보내기는 받지 않는다(SKETCH_STALE — 화면은 조용히 버린다).
새 획인데 id 가 지난 번호면 SKETCH_RESYNC — 화면이 lastId 를 다시 받아 번호를 맞춘다.
상태는 DB JSON 칸에 들어가고 바뀔 때마다 둘에게 가므로 작게 둔다 — 좌표는 [x, y, x, y, …] 한 줄, 낱말이 바뀌면 획은 비운다.

'거의 맞았어요(near)'는 오타 · 조각 답만 알려 준다 — 답이 정답의 일부이거나, 정답에 한 글자쯤 덧붙였거나,
자모 한두 개만 다를 때. 다른 제시어(별칭)와 똑같은 답은 near 로 치지 않는다(목록을 아는 사람이 후보를 좁히는 데 못 쓰게).
답은 사람마다 통(token bucket)으로 세서, 목록을 대 보는 것도 사람 손 빠르기를 넘지 못한다.
한 낱말에 틀릴 수 있는 답은 초성 힌트 전 10번, 힌트가 열리면 다시 10번이다(SKETCH_NO_TRIES).
연달아 넘기면 넘기기까지 기다리는 시간이 2초씩 늘어난다(쉬운 낱말만 골라 받기 막기).
"""

from __future__ import annotations

import math
import random
import re
from functools import lru_cache
from typing import Optional

from app.core.errors import raise_app_error, register_messages

ROUND_SEC = 180
HINT_SEC = 40  # 한 낱말에 이만큼 지나면 맞히는 사람에게 초성을 보여 준다
PASS_MIN = 2.0  # 낱말이 나오고 이만큼은 그려 본 뒤에 넘길 수 있다
PASS_STEP, PASS_STEP_MAX = 2.0, 4  # 연달아 넘기면 한 번마다 2초씩 더 그려 봐야 한다(최대 10초) — 쉬운 낱말 고르기 막기
GUESS_MAX = 20
GUESS_GAP, UNDO_GAP, CLEAR_GAP, REACT_GAP = 0.6, 0.15, 0.5, 1.0  # 연타 막기(초)
GUESS_RATE, GUESS_BURST = 0.5, 4.0  # 답 — 한꺼번에 4개, 그 뒤로는 2초에 하나
MISS_MAX = 10  # 한 낱말에 틀릴 수 있는 답 — 초성 힌트 전 10번, 힌트가 열리면 다시 10번(목록을 줄줄이 대 보기 막기)
INK_RATE, INK_BURST = 10.0, 12.0  # 그림 조각 — 초당 10개, 한꺼번에 12개까지
CHUNK_MAX = 80  # 조각 하나의 점 수
POINTS_MAX = 4000  # 한 낱말의 점 수
STROKES_MAX = 200  # 한 낱말의 획 수
MIN_STEP = 3  # 바로 앞 점과 이만큼도 안 떨어진 점은 버린다(좌표 단위)
ID_MAX = 2**31 - 1
ID_JUMP = 1000  # 새 획 id 는 lastId 보다 크고 lastId + ID_JUMP 이하 — 큰 id 하나로 판 전체가 막히지 않게
GUESS_KEEP = 12  # 한 낱말에 남기는 답
DONE_KEEP = 40
ART_KEEP, ART_POINTS, ART_STROKES, ART_SCALE = 8, 160, 60, 4  # 끝 화면 그림첩 — 최근 8장, 점을 줄이고 좌표는 4로 나눠 둔다
RIGHT_PTS = 2  # 정답 기본 점수

# 마커 색 — 마지막은 지우개(보드 바탕색으로 덧칠)
PALETTE = ("#1f2937", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#92400e", "#ffffff")
PALETTE_NAMES = ("검정", "빨강", "파랑", "초록", "주황", "갈색", "지우개")
WIDTHS = (4, 9, 18, 36)  # 굵기 — 가로 1000 기준

CATEGORIES = {"all": "전체", "office": "사무실 물건", "food": "음식", "animal": "동물", "sport": "운동·건강", "life": "생활"}

# 반응 — 게임 중엔 대화창이 닫혀 있어서 정해 둔 말만 주고받는다(제시어가 새지 않게)
DRAW_REACTS = ("가까워요!", "아니에요", "거의 다 왔어요", "반대로 생각해 봐요", "더 넓게 생각해 봐요", "다시 그려 볼게요")
GUESS_REACTS = ("모르겠어요", "조금 더 그려 주세요", "알 것 같아요!", "크게 그려 주세요", "넘겨도 괜찮아요")

register_messages(
    {
        "SKETCH_NOT_DRAWER": "지금은 상대가 그릴 차례예요. 그림을 보고 맞혀 주세요.",
        "SKETCH_BAD_STROKE": "그림 정보가 올바르지 않아요.",
        "SKETCH_STALE": "지난 그림이라 반영하지 않았어요.",
        "SKETCH_RESYNC": "그림 순서가 어긋났어요. 다시 맞춰서 그려 주세요.",
        "SKETCH_FULL": "그림이 너무 복잡해요. 조금 지우고 이어 그려 주세요.",
        "SKETCH_EMPTY": "지울 그림이 없어요.",
        "SKETCH_NO_TRIES": "이 낱말은 답을 낼 기회를 다 썼어요. 그림을 더 보고 기다려 주세요.",
        "SKETCH_CHAT_OFF": "게임 중에는 대화창을 쓸 수 없어요. 반응 버튼으로 알려 주세요.",
    },
    {
        "SKETCH_NOT_DRAWER": 409, "SKETCH_STALE": 409, "SKETCH_RESYNC": 409, "SKETCH_FULL": 409,
        "SKETCH_EMPTY": 409, "SKETCH_NO_TRIES": 409, "SKETCH_CHAT_OFF": 409,
    },
)

# (제시어, 분야, 같은 말로 쳐 주는 답) — 손으로 그릴 수 있는 것만, 글자 · 숫자 없이도 알아볼 수 있는 것만.
# 분야 · 글자 수가 같은 낱말이 늘 3개 이상 있게 맞춘다(분야 · 글자 수만으로 정답이 정해지지 않게). 분야마다 44개.
WORDS = (
    # 사무실 물건
    ("연필", "office", ()),
    ("볼펜", "office", ("펜",)),
    ("가위", "office", ()),
    ("클립", "office", ("종이클립",)),
    ("의자", "office", ("회전의자", "사무실의자")),
    ("책상", "office", ()),
    ("서랍", "office", ("서랍장",)),
    ("화분", "office", ("식물", "화초")),
    ("도장", "office", ()),
    ("압정", "office", ("핀", "푸시핀")),
    ("지우개", "office", ()),
    ("메모지", "office", ("포스트잇", "메모장", "접착메모지")),
    ("테이프", "office", ("스카치테이프", "투명테이프", "셀로판테이프")),
    ("키보드", "office", ("자판",)),
    ("마우스", "office", ()),
    ("모니터", "office", ("화면",)),
    ("노트북", "office", ("랩톱", "노트북컴퓨터")),
    ("프린터", "office", ("프린트", "프린트기", "복합기", "인쇄기")),
    ("전화기", "office", ("전화", "유선전화", "사무실전화")),
    ("머그컵", "office", ("머그", "컵", "머그잔")),
    ("종이컵", "office", ("일회용컵",)),
    ("벽시계", "office", ("시계",)),
    ("사원증", "office", ("출입증", "출입카드", "명찰")),
    ("바인더", "office", ("파일", "파일철")),
    ("휴지통", "office", ("쓰레기통",)),
    ("정수기", "office", ()),
    ("헤드셋", "office", ("헤드폰",)),
    ("멀티탭", "office", ("콘센트",)),
    ("돋보기", "office", ("확대경",)),
    ("책꽂이", "office", ("책장",)),
    ("자판기", "office", ("자동판매기",)),
    ("가습기", "office", ()),
    ("소화기", "office", ()),
    ("서류봉투", "office", ("봉투",)),
    ("커피머신", "office", ("커피메이커", "커피기계")),
    ("택배상자", "office", ("상자", "박스", "택배")),
    ("블라인드", "office", ()),
    ("연필깎이", "office", ("연필깍이",)),
    ("보드마커", "office", ("마커", "매직", "보드펜")),
    ("서류가방", "office", ("브리프케이스",)),
    ("스테이플러", "office", ("호치키스", "찍개", "스태플러", "스테플러")),
    ("화이트보드", "office", ("칠판",)),
    ("빔프로젝터", "office", ("프로젝터", "빔")),
    ("서류파쇄기", "office", ("파쇄기", "문서파쇄기")),
    # 음식
    ("귤", "food", ("감귤", "밀감")),
    ("떡", "food", ()),
    ("밤", "food", ("군밤", "알밤")),
    ("감", "food", ("홍시", "단감")),
    ("김밥", "food", ()),
    ("라면", "food", ()),
    ("피자", "food", ()),
    ("치킨", "food", ("통닭", "닭튀김")),
    ("도넛", "food", ("도너츠", "도너트")),
    ("팝콘", "food", ()),
    ("수박", "food", ()),
    ("사과", "food", ()),
    ("포도", "food", ("청포도",)),
    ("딸기", "food", ()),
    ("당근", "food", ()),
    ("감자", "food", ()),
    ("버섯", "food", ()),
    ("만두", "food", ()),
    ("어묵", "food", ("오뎅", "어묵꼬치")),
    ("초밥", "food", ("스시",)),
    ("식빵", "food", ("빵", "토스트")),
    ("쿠키", "food", ("과자", "비스킷")),
    ("떡볶이", "food", ("떡볶기",)),
    ("짜장면", "food", ("자장면",)),
    ("햄버거", "food", ("버거",)),
    ("핫도그", "food", ()),
    ("케이크", "food", ("케익", "생일케이크")),
    ("붕어빵", "food", ("잉어빵",)),
    ("바나나", "food", ()),
    ("복숭아", "food", ()),
    ("옥수수", "food", ()),
    ("고구마", "food", ()),
    ("주먹밥", "food", ("삼각김밥",)),
    ("솜사탕", "food", ()),
    ("샌드위치", "food", ()),
    ("파인애플", "food", ()),
    ("새우튀김", "food", ()),
    ("크루아상", "food", ("크로와상", "크로아상")),
    ("막대사탕", "food", ("사탕",)),
    ("브로콜리", "food", ()),
    ("아이스크림", "food", ("아이스크림콘", "콘아이스크림")),
    ("계란프라이", "food", ("달걀프라이", "계란후라이", "달걀후라이", "프라이", "후라이")),
    ("오므라이스", "food", ()),
    ("카레라이스", "food", ("카레", "커리", "카레밥")),
    # 동물
    ("뱀", "animal", ()),
    ("닭", "animal", ("수탉", "암탉")),
    ("소", "animal", ("젖소", "얼룩소", "황소")),
    ("곰", "animal", ("곰돌이",)),
    ("말", "animal", ()),
    ("토끼", "animal", ()),
    ("기린", "animal", ()),
    ("사자", "animal", ()),
    ("판다", "animal", ("팬더",)),
    ("펭귄", "animal", ()),
    ("고래", "animal", ()),
    ("문어", "animal", ()),
    ("꽃게", "animal", ("게",)),
    ("나비", "animal", ()),
    ("꿀벌", "animal", ("벌",)),
    ("개미", "animal", ()),
    ("거미", "animal", ()),
    ("악어", "animal", ()),
    ("공룡", "animal", ()),
    ("오리", "animal", ()),
    ("하마", "animal", ()),
    ("돼지", "animal", ()),
    ("강아지", "animal", ("개", "멍멍이")),
    ("고양이", "animal", ("냥이", "야옹이")),
    ("거북이", "animal", ("거북",)),
    ("코끼리", "animal", ()),
    ("호랑이", "animal", ("범",)),
    ("원숭이", "animal", ()),
    ("돌고래", "animal", ()),
    ("오징어", "animal", ()),
    ("달팽이", "animal", ()),
    ("잠자리", "animal", ()),
    ("개구리", "animal", ()),
    ("부엉이", "animal", ("올빼미",)),
    ("병아리", "animal", ()),
    ("앵무새", "animal", ()),
    ("얼룩말", "animal", ()),
    ("캥거루", "animal", ()),
    ("다람쥐", "animal", ()),
    ("금붕어", "animal", ("물고기",)),
    ("무당벌레", "animal", ()),
    ("고슴도치", "animal", ()),
    ("불가사리", "animal", ()),
    ("카멜레온", "animal", ()),
    # 운동·건강
    ("아령", "sport", ("덤벨", "역기", "바벨")),
    ("스키", "sport", ()),
    ("메달", "sport", ("금메달",)),
    ("헬멧", "sport", ()),
    ("다트", "sport", ("다트판",)),
    ("칫솔", "sport", ()),
    ("물병", "sport", ("물통", "텀블러")),
    ("철봉", "sport", ()),
    ("화살", "sport", ("활", "활과화살", "양궁")),
    ("튜브", "sport", ("수영튜브", "구명튜브")),
    ("라켓", "sport", ("테니스라켓", "테니스", "테니스채")),
    ("축구공", "sport", ("축구",)),
    ("농구공", "sport", ("농구",)),
    ("야구공", "sport", ("야구",)),
    ("배구공", "sport", ("배구",)),
    ("방망이", "sport", ("야구방망이", "배트", "야구배트")),
    ("탁구채", "sport", ("탁구", "탁구라켓")),
    ("셔틀콕", "sport", ("배드민턴",)),
    ("볼링핀", "sport", ("볼링", "볼링공")),
    ("골프공", "sport", ("골프",)),
    ("줄넘기", "sport", ()),
    ("자전거", "sport", ()),
    ("수영모", "sport", ("수모", "수영모자")),
    ("물안경", "sport", ("수경",)),
    ("운동화", "sport", ("러닝화", "신발")),
    ("트로피", "sport", ("우승컵",)),
    ("샌드백", "sport", ()),
    ("반창고", "sport", ("밴드", "일회용밴드")),
    ("체온계", "sport", ("온도계",)),
    ("마스크", "sport", ()),
    ("폼롤러", "sport", ()),
    ("낚싯대", "sport", ("낚시", "낚시대")),
    ("킥보드", "sport", ()),
    ("훌라후프", "sport", ()),
    ("스케이트", "sport", ("스케이트화",)),
    ("요가매트", "sport", ("요가", "매트")),
    ("호루라기", "sport", ("휘슬",)),
    ("스톱워치", "sport", ("초시계",)),
    ("권투장갑", "sport", ("권투글러브", "복싱글러브", "글러브")),
    ("구급상자", "sport", ("구급함",)),
    ("안마의자", "sport", ("마사지의자",)),
    ("서핑보드", "sport", ("서핑", "서프보드")),
    ("트램펄린", "sport", ("트램폴린", "방방")),
    ("축구골대", "sport", ("골대",)),
    # 생활
    ("배", "life", ("선박", "보트", "여객선")),
    ("집", "life", ("주택",)),
    ("꽃", "life", ("꽃송이",)),
    ("책", "life", ()),
    ("우산", "life", ()),
    ("버스", "life", ()),
    ("택시", "life", ()),
    ("기차", "life", ("열차",)),
    ("안경", "life", ()),
    ("소파", "life", ("쇼파",)),
    ("침대", "life", ()),
    ("거울", "life", ()),
    ("양말", "life", ()),
    ("모자", "life", ("야구모자",)),
    ("가방", "life", ("백팩", "배낭", "책가방")),
    ("열쇠", "life", ("키",)),
    ("전구", "life", ()),
    ("풍선", "life", ()),
    ("텐트", "life", ()),
    ("등대", "life", ()),
    ("지하철", "life", ("전철",)),
    ("자동차", "life", ("차", "승용차")),
    ("비행기", "life", ()),
    ("신호등", "life", ()),
    ("이어폰", "life", ()),
    ("냉장고", "life", ()),
    ("에어컨", "life", ("에어콘",)),
    ("선풍기", "life", ()),
    ("넥타이", "life", ()),
    ("자물쇠", "life", ()),
    ("눈사람", "life", ()),
    ("카메라", "life", ("사진기",)),
    ("무지개", "life", ()),
    ("선인장", "life", ()),
    ("열기구", "life", ()),
    ("횡단보도", "life", ()),
    ("스마트폰", "life", ("휴대폰", "핸드폰", "휴대전화", "폰")),
    ("텔레비전", "life", ("티비", "tv", "텔레비젼", "티브이")),
    ("미끄럼틀", "life", ()),
    ("해바라기", "life", ()),
    ("헬리콥터", "life", ("헬기", "헬리곱터")),
    ("전자레인지", "life", ("전자렌지", "레인지")),
    ("롤러코스터", "life", ()),
    ("빨래건조대", "life", ("건조대", "빨래대")),
)


class SketchRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "sketch"
    title = "화이트보드 그림 퀴즈"
    label = "협동 게임"
    page = "sketch"
    game = "sketch"
    blurb = "둘이 번갈아 화이트보드에 그림을 그리고 맞히며 3분 동안 점수를 모으는 협동 게임이에요."
    intro = (
        "한 사람이 제시어를 보고 화이트보드에 그림을 그리면, 다른 사람이 그림을 보고 맞혀요. "
        "글자나 숫자를 쓰면 반칙이에요. 한 낱말이 끝나면 그리는 사람이 바뀌어요. 3분 동안 둘이 함께 점수를 최대한 모아 보세요."
    )
    outro = "말 대신 그림으로 주고받은 3분이었어요."  # 잘한 판 · 못 한 판 모두에 어울리게(맞힌 수는 summary 가 말한다)
    # 쪽 이름은 '처음에 맡는 일' — 낱말마다 서로 바뀐다
    sides = {"first": "먼저 그리기", "second": "먼저 맞히기"}
    limit_sec = ROUND_SEC


ROOM = SketchRoom()
START_TEXT = f"시작! {ROUND_SEC // 60}분 동안 번갈아 그리고 맞혀 보세요. 글자를 쓰면 반칙이에요."

_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"


# ── 작은 도구 ─────────────────────────────────────────────────

def _norm(text: str) -> str:
    """띄어쓰기 · 문장부호 · 대소문자를 빼고 비교한다."""
    return re.sub(r"[\s\W_]+", "", (text or "").lower())


def _chosung(word: str) -> str:
    return "".join(_CHO[(ord(ch) - 0xAC00) // 588] if "가" <= ch <= "힣" else ch for ch in word)


def _jamo(text: str) -> str:
    """한글 음절을 초성 · 중성 · 종성으로 푼다 — '떡볶기'와 '떡볶이'처럼 자모 하나 차이를 재려고."""
    out = []
    for ch in text:
        if "가" <= ch <= "힣":
            c = ord(ch) - 0xAC00
            out.append(chr(0x1100 + c // 588) + chr(0x1161 + c % 588 // 28) + (chr(0x11A7 + c % 28) if c % 28 else ""))
        else:
            out.append(ch)
    return "".join(out)


def _edit(a: str, b: str, limit: int) -> int:
    """편집 거리 — limit 를 넘으면 limit + 1 로 일찍 끝낸다(짧은 글자만 비교한다)."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _bonus(streak: int) -> int:
    """이어 맞히기 덤 — 두 번째부터 +1점, 네 번째부터 +2점."""
    return 0 if streak <= 1 else 1 if streak <= 3 else 2


# 모든 제시어 · 별칭(정리한 글자) → 낱말 번호. 다른 제시어와 똑같은 답은 near 로 치지 않는 데 쓴다.
_ANSWERS = {_norm(t): i for i, (w, _, alias) in enumerate(WORDS) for t in (w, *alias)}


def _near(g: str, targets: set, word_idx: int) -> bool:
    """오타 · 조각 답이면 True — 정답을 품은 긴 답(후보 이어 붙이기)이나 다른 제시어는 아니다."""
    if len(g) < 2 or _ANSWERS.get(g, word_idx) != word_idx:
        return False
    for t in targets:
        if g in t:  # 정답의 일부(두 글자 이상)
            return True
        if len(t) < 2:
            continue
        if t in g and len(g) <= len(t) + 1:  # 정답에 한 글자쯤 덧붙임 — '고양이야'
            return True
        limit = 1 if len(t) <= 3 else 2  # 자모 차이 — 짧은 낱말은 하나, 네 글자부터 둘('떡볶기', '스테플러')
        if _edit(_jamo(g), _jamo(t), limit) <= limit:
            return True
    return False


def clean_options(opts: dict) -> dict:
    """대기실 설정 — 분야(category)만. 키(office) · 이름(사무실 물건) 둘 다 받고, 모르는 값은 '전체'."""
    cat = opts.get("category") if isinstance(opts, dict) else None
    if isinstance(cat, str):
        cat = cat.strip()
        if cat not in CATEGORIES:
            cat = next((k for k, v in CATEGORIES.items() if v == cat), None)
    else:
        cat = None
    return {"category": cat or "all"}


@lru_cache(maxsize=128)
def _order(seed: int, cat: str) -> tuple:
    """판마다 섞은 낱말 순서 — 상태에는 seed 만 두고 그때그때 다시 만든다."""
    idx = [i for i, w in enumerate(WORDS) if cat == "all" or w[1] == cat] or list(range(len(WORDS)))
    random.Random(seed).shuffle(idx)
    return tuple(idx)


def _word_idx(k: dict) -> int:
    order = _order(k["seed"], k["cat"])
    return order[min(k["n"], len(order) - 1)]  # 한 바퀴를 다 쓰면 판이 끝나므로 n 은 넘치지 않는다


def _word(k: dict) -> tuple:
    return WORDS[_word_idx(k)]


def _used_up(k: dict) -> bool:
    """고른 분야의 낱말을 한 바퀴 다 썼다."""
    return k["n"] >= len(_order(k["seed"], k["cat"]))


def _pass_at(k: dict) -> float:
    """이 낱말을 넘길 수 있는 시각 — 연달아 넘길수록 늦어진다(맞히면 처음으로)."""
    return k["wordAt"] + PASS_MIN + PASS_STEP * min(k.get("passRun", 0), PASS_STEP_MAX)


def _drawer(k: dict) -> str:
    return "first" if k["n"] % 2 == 0 else "second"


def _rate(gap: dict, key: str, wait: float, now: float) -> None:
    if now - gap.get(key, 0) < wait:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[key] = now


def _bucket(gap: dict, key: str, rate: float, burst: float, now: float) -> None:
    """짧게 몰려 올 수 있는 일(그림 조각 · 답)은 통(token bucket)으로 센다 — 한꺼번에 burst 개, 그 뒤로는 초당 rate 개."""
    tokens, t = gap.get(key) or (burst, now)
    tokens = min(burst, tokens + max(0.0, now - t) * rate)
    if tokens < 1:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    gap[key] = [round(tokens - 1, 3), now]


def _thumb(strokes: list) -> list:
    """끝 화면 그림첩 한 장 — 점을 ART_POINTS 개쯤으로 줄이고 좌표를 ART_SCALE 로 나눈다. [[색, 굵기, [x, y, …]], …]"""
    strokes = strokes[:ART_STROKES]
    total = sum(len(s["p"]) // 2 for s in strokes)
    # 획마다 첫 점 · 끝 점은 꼭 남기므로 그 몫(획 수 × 2)을 빼고 간격을 정한다 → 모두 ART_POINTS 개 안
    step = max(1, -(-total // max(1, ART_POINTS - 2 * len(strokes))))
    out = []
    for s in strokes:
        p, m = s["p"], len(s["p"]) // 2
        if not m:
            continue
        keep = list(range(0, m, step))
        if keep[-1] != m - 1:
            keep.append(m - 1)
        out.append([s["c"], s["w"], [p[j * 2 + a] // ART_SCALE for j in keep for a in (0, 1)]])
    return out


def _next(k: dict, ok: bool, now: float) -> None:
    """한 낱말 끝 — 점수 · 기록을 남기고 역할을 바꿔 다음 낱말로. 보드는 비운다. 낱말을 다 썼으면 판 끝."""
    word = _word(k)[0]
    gain = 0
    if ok:
        k["streak"] += 1
        gain = RIGHT_PTS + _bonus(k["streak"])
        k["score"] += gain
        k["right"] += 1
        k["best"] = max(k["best"], k["streak"])
        k["passRun"] = 0
    else:
        k["streak"] = 0
        k["passed"] += 1
        k["passRun"] = k.get("passRun", 0) + 1
    k["done"] = [*k["done"], {"word": word, "ok": ok, "by": _drawer(k), "pts": gain, "sec": round(now - k["wordAt"], 1)}][-DONE_KEEP:]
    if k["strokes"]:
        k["art"] = [*k["art"], {"word": word, "ok": ok, "by": _drawer(k), "s": _thumb(k["strokes"])}][-ART_KEEP:]
    k["n"] += 1
    k.update(wordAt=now, hint=False, miss=0, strokes=[], pts=0, guesses=[], react=None)
    k["ink"] += 1
    if _used_up(k):
        k["over"], k["reason"] = True, "words"


# ── 흐름 ──────────────────────────────────────────────────────

def start(st: dict, now: float) -> None:
    cat = clean_options(st.get("opts") or {})["category"]
    st["k"] = {
        "start": now, "end": now + ROUND_SEC, "seed": random.randrange(1 << 30), "cat": cat, "n": 0, "wordAt": now,
        "score": 0, "right": 0, "passed": 0, "passRun": 0, "streak": 0, "best": 0, "hint": False, "miss": 0,
        "strokes": [], "lastId": 0, "pts": 0, "ink": 0, "guesses": [], "react": None,
        "done": [], "art": [], "over": False, "reason": None, "gap": {},
    }


def advance(st: dict, now: float) -> bool:
    """시간 끝 · 초성 힌트 — 바뀐 게 있으면 True."""
    k = st["k"]
    if k["over"]:
        return False
    if now >= k["end"]:
        k["over"], k["reason"] = True, "time"
        return True
    if not k["hint"] and now >= k["wordAt"] + HINT_SEC:
        k["hint"], k["miss"] = True, 0  # 초성이 열리면 답 기회도 다시 MISS_MAX 번
        return True
    return False


def next_event(st: dict) -> Optional[float]:
    k = st["k"]
    if k["over"]:
        return None
    return k["end"] if k["hint"] else min(k["end"], k["wordAt"] + HINT_SEC)


# ── 동작 ──────────────────────────────────────────────────────

def _points(raw) -> list:
    """[[x, y], …] — 1~CHUNK_MAX 개, 숫자만. 0~1000 으로 반올림 · 자른다."""
    if not isinstance(raw, list) or not 1 <= len(raw) <= CHUNK_MAX:
        raise_app_error("SKETCH_BAD_STROKE")
    out = []
    for p in raw:
        if not isinstance(p, (list, tuple)) or len(p) != 2:
            raise_app_error("SKETCH_BAD_STROKE")
        xy = []
        for v in p:
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise_app_error("SKETCH_BAD_STROKE")
            if isinstance(v, float) and not math.isfinite(v):
                raise_app_error("SKETCH_BAD_STROKE")
            xy.append(0 if v <= 0 else 1000 if v >= 1000 else int(round(v)))
        out.append(xy)
    return out


def _stroke(k: dict, arg) -> None:
    if not isinstance(arg, dict):
        raise_app_error("SKETCH_BAD_STROKE")
    n, sid, seq = arg.get("n"), arg.get("id"), arg.get("seq")  # 셋 다 꼭 있어야 한다
    if not _is_int(n) or not _is_int(sid) or not 1 <= sid <= ID_MAX or not _is_int(seq) or not 0 <= seq <= ID_MAX:
        raise_app_error("SKETCH_BAD_STROKE")
    if n != k["n"]:
        raise_app_error("SKETCH_STALE")  # 지난 낱말의 늦게 온 조각
    pts = _points(arg.get("pts"))
    strokes = k["strokes"]
    last = strokes[-1] if strokes else None
    if last is not None and last["i"] == sid:
        if seq <= last["q"]:
            raise_app_error("SKETCH_STALE")  # 같은 조각을 다시 보냈다
        s = last
    elif sid > k["lastId"]:
        if sid > k["lastId"] + ID_JUMP:
            raise_app_error("SKETCH_BAD_STROKE")  # 번호를 한꺼번에 너무 많이 건너뜀
        c, w = arg.get("c", 0), arg.get("w", 1)
        if not _is_int(c) or not 0 <= c < len(PALETTE) or not _is_int(w) or not 0 <= w < len(WIDTHS):
            raise_app_error("SKETCH_BAD_STROKE")
        if len(strokes) >= STROKES_MAX:
            raise_app_error("SKETCH_FULL")
        s = {"i": sid, "c": c, "w": w, "q": seq, "p": []}
    elif seq == 0:
        raise_app_error("SKETCH_RESYNC")  # 새 획인데 지난 번호 — 화면이 lastId 로 번호를 다시 맞춘다
    else:
        raise_app_error("SKETCH_STALE")  # 되돌린 획 · 지난 획의 늦게 온 조각
    room = POINTS_MAX - k["pts"]
    if room <= 0:
        raise_app_error("SKETCH_FULL")
    if s is not last:
        k["strokes"] = [*strokes, s]
        k["lastId"] = sid
    p = s["p"]
    lx, ly = (p[-2], p[-1]) if p else (None, None)
    added = 0
    for x, y in pts:
        if added >= room:
            break
        if lx is not None and (x - lx) ** 2 + (y - ly) ** 2 < MIN_STEP ** 2:
            continue
        p += (x, y)
        lx, ly = x, y
        added += 1
    s["q"] = seq
    if added:
        k["pts"] += added
        k["ink"] += 1


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    k = st["k"]
    if k["over"] or now >= k["end"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    if side not in ROOM.sides:
        raise_app_error("KITCHEN_BAD_ACTION")
    drawing = side == _drawer(k)
    gap = k.setdefault("gap", {})

    # 지난 낱말의 늦게 온 그림 조각 — 정답으로 역할이 막 바뀐 뒤에 닿아도 그리는 사람 검사보다 먼저 STALE(화면은 조용히 버린다)
    if action == "stroke" and isinstance(arg, dict) and _is_int(arg.get("n")) and arg["n"] != k["n"]:
        raise_app_error("SKETCH_STALE")
    if action in ("stroke", "undo", "clear", "pass") and not drawing:
        raise_app_error("SKETCH_NOT_DRAWER")
    if action == "stroke":
        _bucket(gap, f"{member_id}:ink", INK_RATE, INK_BURST, now)
        _stroke(k, arg)
        return
    if action == "undo":
        if not k["strokes"]:
            raise_app_error("SKETCH_EMPTY")
        _rate(gap, f"{member_id}:undo", UNDO_GAP, now)
        gone = k["strokes"][-1]
        k["strokes"] = k["strokes"][:-1]
        k["pts"] -= len(gone["p"]) // 2
        k["ink"] += 1
        return
    if action == "clear":
        if not k["strokes"]:
            raise_app_error("SKETCH_EMPTY")
        _rate(gap, f"{member_id}:clear", CLEAR_GAP, now)
        k["strokes"], k["pts"] = [], 0
        k["ink"] += 1
        return
    if action == "pass":
        if now < _pass_at(k):
            raise_app_error("ESCAPE_TOO_FAST", 429)
        _next(k, False, now)
        return
    if action == "guess":
        if drawing:
            raise_app_error("WORDS_NOT_YOUR_TURN")
        if not isinstance(arg, str) and not (_is_int(arg) and abs(arg) < 10**12):
            raise_app_error("KITCHEN_BAD_ACTION")
        text = re.sub(r"\s+", " ", str(arg)[:200]).strip()[:GUESS_MAX]
        g = _norm(text)
        if not g:
            raise_app_error("ESCAPE_CHAT_EMPTY")
        if k.get("miss", 0) >= MISS_MAX:
            raise_app_error("SKETCH_NO_TRIES")
        _rate(gap, f"{member_id}:guess", GUESS_GAP, now)
        _bucket(gap, f"{member_id}:guesses", GUESS_RATE, GUESS_BURST, now)
        idx = _word_idx(k)
        word, _, alias = WORDS[idx]
        targets = {_norm(w) for w in (word, *alias)} - {""}
        ok = g in targets
        near = not ok and _near(g, targets, idx)
        k["guesses"] = [*k["guesses"], {"t": round(now, 2), "text": text, "ok": ok, "near": near}][-GUESS_KEEP:]
        if ok:
            _next(k, True, now)
        else:
            k["miss"] = k.get("miss", 0) + 1
        return
    if action == "react":
        lst = DRAW_REACTS if drawing else GUESS_REACTS
        if not _is_int(arg) or not 0 <= arg < len(lst):
            raise_app_error("KITCHEN_BAD_ACTION")
        _rate(gap, f"{member_id}:react", REACT_GAP, now)
        k["react"] = {"by": side, "d": drawing, "i": arg, "t": round(now, 2)}
        return
    raise_app_error("KITCHEN_BAD_ACTION")


# ── 결과 · 화면 ───────────────────────────────────────────────

def score(st: dict) -> int:
    return st["k"]["score"]


def end_code(st: dict) -> str:
    return "WORDS" if st["k"]["reason"] == "words" else "TIME"


def summary(st: dict) -> str:
    k = st["k"]
    head = "낱말을 모두 썼어요!" if k["reason"] == "words" else "시간 끝!"
    if not k["right"]:
        return f"{head} 아쉽게 하나도 못 맞혔어요."
    return f"{head} {k['right']}개를 맞혀 {k['score']}점을 모았어요."


def view(st: dict, side: Optional[str], now: float) -> dict:
    """side 쪽에만 보내는 화면 — 제시어는 그리는 사람(과 끝난 뒤)에게만, 초성은 힌트 시간이 지난 뒤에만."""
    k = st["k"]
    # 판이 끝났다 — 시간 · 낱말 끝(over) 또는 포기(방 쪽이 st["end"] 를 남긴다). 끝나면 그림첩 · 지난 낱말을 모두 보여 준다
    ended = k["over"] or bool(st.get("end"))
    drawing = side is not None and side == _drawer(k)
    open_word = not _used_up(k)  # 낱말을 다 써서 끝났으면 지금 낱말이 없다
    word, cat, _ = _word(k)
    show = open_word and (drawing or ended)
    r = k.get("react")
    react = None
    if r:
        react = {"mine": r["by"] == side, "text": (DRAW_REACTS if r["d"] else GUESS_REACTS)[r["i"]], "t": r["t"]}
    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st), "over": k["over"],
        "reason": k["reason"],
        "me": side, "role": "draw" if drawing else "guess", "n": k["n"],
        "word": word if show else None,
        "cat": CATEGORIES.get(cat, "") if open_word else "", "pick": k["cat"], "pickName": CATEGORIES.get(k["cat"], "전체"),
        "letters": len(word) if open_word else 0,  # 맞히는 사람에게는 글자 수만
        "hint": _chosung(word) if open_word and (k["hint"] or ended) else None,
        "wordAt": k["wordAt"], "hintAt": k["wordAt"] + HINT_SEC, "passAt": _pass_at(k),
        "strokes": [{"i": s["i"], "c": s["c"], "w": s["w"], "p": s["p"]} for s in k["strokes"]],
        "ink": k["ink"], "lastId": k["lastId"], "idJump": ID_JUMP, "pts": k["pts"],
        "ptsMax": POINTS_MAX, "strokesMax": STROKES_MAX, "chunkMax": CHUNK_MAX,
        "guesses": k["guesses"], "triesLeft": max(0, MISS_MAX - k.get("miss", 0)), "triesMax": MISS_MAX,
        "react": react, "reacts": list(DRAW_REACTS if drawing else GUESS_REACTS),
        "score": k["score"], "right": k["right"], "passed": k["passed"], "streak": k["streak"], "best": k["best"],
        "nextPts": RIGHT_PTS + _bonus(k["streak"] + 1),
        "done": k["done"] if ended else k["done"][-12:],
        "art": k["art"] if ended else None, "artScale": ART_SCALE,
        "pal": list(PALETTE), "palNames": list(PALETTE_NAMES), "widths": list(WIDTHS), "guessMax": GUESS_MAX,
    }
