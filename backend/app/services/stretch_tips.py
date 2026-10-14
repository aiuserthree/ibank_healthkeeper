"""오늘의 1분 스트레칭 — 예약하기 화면(web/_shared/fun-stats.js)과 같은 목록·같은 순서."""
from __future__ import annotations

from datetime import date

STRETCH_TIPS: tuple[tuple[str, str], ...] = (
    ("목 옆 늘리기", "오른손으로 머리 왼쪽을 감싸 오른쪽으로 천천히 당겨 15초. 반대쪽도 똑같이."),
    ("어깨 으쓱 털기", "숨을 들이쉬며 어깨를 귀까지 올리고, 내쉬며 툭 떨어뜨리기를 5번."),
    ("가슴 열기", "양손을 등 뒤로 깍지 끼고 가슴을 앞으로 내밀며 10초 유지."),
    ("손목 풀기", "팔을 앞으로 뻗어 손등을 반대 손으로 몸 쪽으로 당겨 10초씩."),
    ("등 고양이 자세", "의자에 앉아 등을 둥글게 말았다가 펴기를 천천히 5번."),
    ("눈 쉬어주기", "20분마다 6m 이상 먼 곳을 20초 바라보는 20-20-20 규칙."),
    ("허리 비틀기", "의자에 앉아 상체를 좌우로 천천히 비틀어 각 10초씩."),
    ("턱 당기기", "턱을 뒤로 당겨 이중턱을 만들듯 5초 유지, 거북목 예방에 좋아요."),
    ("종아리 펌프", "앉은 채로 발뒤꿈치 들었다 내리기 20번, 다리 붓기를 줄여요."),
    ("깊은 호흡", "4초 들이쉬고 4초 멈추고 6초 내쉬기를 3번. 긴장이 스르르."),
    ("어깨 돌리기", "어깨로 큰 원을 그리듯 앞으로 5번, 뒤로 5번 천천히 돌려요."),
    ("옆구리 늘리기", "한 팔을 머리 위로 뻗어 반대쪽으로 천천히 기울이고 10초씩."),
    ("손가락 쥐었다 펴기", "주먹을 꽉 쥐었다가 손가락을 활짝 펴기를 10번, 손 저림에 좋아요."),
    ("발목 돌리기", "앉은 채 한 발을 살짝 들어 발목을 안쪽·바깥쪽으로 5번씩 돌려요."),
    ("팔 앞으로 뻗기", "깍지 낀 팔을 앞으로 쭉 뻗고 등을 둥글게 말아 10초 유지."),
    ("무릎 당기기", "의자에 앉아 한쪽 무릎을 두 팔로 가슴 쪽으로 당겨 10초씩."),
    ("기지개 켜기", "깍지 낀 손바닥을 하늘로 향하게 쭉 뻗어 온몸을 늘리고 10초."),
    ("고개 끄덕이기", "천천히 천장을 봤다가 바닥을 보기를 5번, 반동 없이 부드럽게."),
    ("다리 뒤 늘리기", "앉아서 한쪽 다리를 앞으로 펴고 발끝을 몸 쪽으로 당겨 10초씩."),
    ("날개뼈 모으기", "양 팔꿈치를 뒤로 당겨 날개뼈를 모으고 5초 유지, 5번 반복."),
)


def stretch_tip_index(day: date) -> int:
    """화면과 같은 날 같은 스트레칭이 나오도록 연중 일수로 고른다."""
    return day.timetuple().tm_yday % len(STRETCH_TIPS)


def stretch_tip_for(day: date) -> tuple[str, str]:
    """해당 날짜의 (제목, 설명)."""
    return STRETCH_TIPS[stretch_tip_index(day)]


# 예약하기 화면에서 롤링되는 개수 (web/_shared/fun-stats.js STRETCH_ROLL_COUNT)
STRETCH_ROLL_COUNT = 3


def stretch_roll_indexes(day: date, count: int = STRETCH_ROLL_COUNT) -> list[int]:
    """화면 롤링과 같은 순서 — 오늘의 스트레칭부터 count개."""
    start = stretch_tip_index(day)
    return [(start + i) % len(STRETCH_TIPS) for i in range(count)]


def stretch_image_name(index: int) -> str:
    """메일용 PNG(web/assets/email/stretch-NN.png) — 화면 SVG를 그대로 렌더한 것."""
    return f"stretch-{index + 1:02d}.png"
