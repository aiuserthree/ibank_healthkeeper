"""2인 협동 「통하는 사이」 — 같은 질문에 둘이 몰래 답하고, 서로의 답을 예상한다. 5분 동안 10문제.

문제마다 각자 (1) 내 답 (2) 동료가 고를 것 같은 답을 함께 낸다. 둘 다 내면 한꺼번에 공개.
예상이 맞으면 1점씩(둘 다 맞히면 2점), 둘의 답이 같으면 「통함」 1점을 더 받는다 — 한 문제 최대 3점.
공개 뒤 둘 다 「다음」을 누르거나 잠깐(REVEAL_SEC) 지나면 다음 문제. 시간이 다 되면 못 푼 문제는 0점.
상대가 낸 답은 둘 다 낼 때까지 보이지 않는다(화면에는 「냈어요」만). 두 쪽이 하는 일은 똑같다.
보기 순서는 사람마다 따로 섞는다 — 「다 1번 고르자」 같은 번호 약속으로 점수를 채우지 못하게.
(「가나다순 첫 보기」처럼 글자로 정한 약속까지는 엔진이 가려낼 수 없다 — 순위 · 도장 기준은 방 공용 코드 몫.)
저장은 원래 보기 번호로, 화면에 오가는 번호는 그 사람 화면 순서로 바꿔 쓴다.
"""

from __future__ import annotations

import random
from typing import Optional

from app.core.errors import raise_app_error, register_messages

ROUND_SEC = 300
QUESTIONS = 10
REVEAL_SEC = 7  # 공개 화면을 보여 주는 시간 — 둘 다 「다음」을 누르면 바로 넘어간다
NEXT_AFTER = 0.8  # 공개되자마자 「다음」 연타로 넘어가지 않게
PICK_GAP = 0.4
NEXT_GAP = 0.3
REACT_GAP = 1.2
MAX_POINTS = 3  # 한 문제 최대 — 예상 2 + 통함 1
SIDES = ("a", "b")

register_messages(
    {
        "SYNC_BAD_PICK": "내 답과 동료 예상을 하나씩 골라 주세요.",
        "SYNC_NOT_PICKING": "지금은 고를 수 없어요. 결과를 확인해 주세요.",
        "SYNC_NOT_REVEAL": "아직 둘 다 고르지 않았어요.",
        "SYNC_STALE": "문제가 바뀌었어요. 새 문제를 확인해 주세요.",
        # 협동 방 공용 코드(say)가 진행 중 대화를 막을 때 쓰라고 — 답을 미리 말하면 예상하는 재미가 없다
        "SYNC_CHAT_OFF": "게임 중에는 대화창이 닫혀요. 결과가 나오면 반응 버튼을 눌러 보세요.",
    },
    {"SYNC_NOT_PICKING": 409, "SYNC_NOT_REVEAL": 409, "SYNC_STALE": 409},
)

THEMES = {"mix": "섞어서", "work": "회사 생활", "food": "음식", "leisure": "여가"}

# 문제 은행 — (바뀌지 않는 번호, 주제, 그림, 질문, 보기 2~4개). 정답 없는 가벼운 취향 질문.
# 판과 지난 기록은 이 번호(id)로 문제를 가리키고, 답은 보기 번호로 남는다. 그래서 고칠 때는
#   - id 는 바꾸지도, 다시 쓰지도 않는다(지운 문제의 id 는 비워 둔다). 새 문제는 새 id 로 붙인다.
#   - 질문 · 보기 문구는 다듬어도 되지만 뜻 · 보기 수 · 보기 순서는 그대로 둔다.
BANK = (
    # ── 회사 생활 ──
    ("w01", "work", "💺", "회의실에 들어가면 어디에 앉아요?", ("문 가까이", "창가", "화면 바로 앞", "맨 구석")),
    ("w02", "work", "⏰", "아침 알람은 몇 개 맞춰 둬요?", ("한 개", "두세 개", "다섯 개 이상")),
    ("w03", "work", "🖥️", "모니터는 몇 개가 좋아요?", ("노트북 하나", "두 개", "세 개 이상")),
    ("w04", "work", "🔔", "메신저 알림은 어떻게 해 둬요?", ("소리까지 켜 두기", "숫자만 보이게", "다 꺼 두기")),
    ("w05", "work", "🗂️", "내 컴퓨터 바탕화면은?", ("텅 빈 화면", "폴더로 깔끔하게", "아이콘 가득")),
    ("w06", "work", "📝", "할 일은 어디에 적어요?", ("종이 수첩", "포스트잇", "메모 앱", "머릿속")),
    ("w07", "work", "📞", "급한 일, 어떻게 연락해요?", ("메신저", "전화", "자리로 찾아가기")),
    ("w08", "work", "🛗", "두 층만 올라가면 돼요. 뭘 타요?", ("엘리베이터", "계단")),
    ("w09", "work", "🎧", "집중할 때 귀는?", ("이어폰으로 음악", "백색 소음", "조용한 게 최고")),
    ("w10", "work", "🔊", "이어폰 음악 볼륨은?", ("겨우 들리게", "적당히", "빵빵하게")),
    ("w11", "work", "🌅", "일이 제일 잘되는 시간은?", ("아침", "점심 먹고", "오후 늦게", "밤")),
    ("w12", "work", "📧", "안 읽은 메일은 보통 몇 개?", ("늘 0개", "몇 개쯤", "세지 않아요")),
    ("w13", "work", "🖊️", "손이 가장 자주 가는 필기구는?", ("볼펜", "샤프", "형광펜", "거의 안 써요")),
    ("w14", "work", "🗓️", "회의 시간, 언제가 좋아요?", ("오전 일찍", "점심 직후", "오후 늦게")),
    ("w15", "work", "💬", "회의에서 나는 어떤 편?", ("먼저 말하는 편", "듣다가 정리", "질문 담당")),
    ("w16", "work", "🧹", "내 책상 위는?", ("깔끔 그 자체", "적당히", "나만 아는 질서")),
    ("w17", "work", "🪴", "책상에 하나 둔다면?", ("작은 화분", "귀여운 인형", "탁상 달력", "아무것도")),
    ("w18", "work", "🔋", "노트북 충전은 언제 해요?", ("반쯤 남았을 때", "20% 알림 뜰 때", "꺼지기 직전")),
    ("w19", "work", "🌡️", "사무실 온도는?", ("살짝 시원하게", "살짝 따뜻하게", "아무래도 좋아요")),
    ("w20", "work", "🏢", "일하고 싶은 층은?", ("낮은 층", "중간 층", "꼭대기 층")),
    ("w21", "work", "📂", "파일 이름은 어떻게 지어요?", ("날짜_제목", "최종_진짜최종", "그때그때")),
    ("w22", "work", "⌨️", "좋아하는 키보드 소리는?", ("조용한 키보드", "딸깍딸깍 기계식")),
    ("w23", "work", "🖱️", "노트북 쓸 때 나는?", ("마우스 꼭 연결", "터치패드로 충분")),
    ("w24", "work", "🕒", "오후 3시, 제일 필요한 건?", ("커피 한 잔", "달달한 간식", "잠깐 바깥 공기", "스트레칭")),
    ("w25", "work", "📅", "금요일 오후에는 주로?", ("다음 주 계획", "밀린 정리", "평소처럼 일")),
    ("w26", "work", "📍", "사무실에서 좋아하는 자리는?", ("창가", "벽 쪽", "한가운데")),
    ("w27", "work", "🚶", "출근길은 어떻게 와요?", ("걸어서", "버스·지하철", "자전거", "자동차")),
    ("w28", "work", "🎒", "출근 가방은?", ("백팩", "어깨에 메는 가방", "에코백", "빈손")),
    ("w29", "work", "🎤", "발표 준비는 어떻게?", ("대본 꼼꼼히", "키워드만", "즉흥으로")),
    ("w30", "work", "📊", "보고서에서 제일 좋은 건?", ("깔끔한 표", "한눈에 그래프", "잘 쓴 글")),
    ("w31", "work", "⏳", "마감이 다가오면 나는?", ("미리 끝내 두기", "전날 몰아서", "마감 직전 초집중")),
    ("w32", "work", "🍽️", "점심 메뉴 정할 때 나는?", ("내가 정하기", "따라가기", "사다리 타기")),
    ("w33", "work", "📌", "포스트잇 색을 고른다면?", ("노랑", "분홍", "하늘", "연두")),
    ("w34", "work", "💡", "아이디어가 잘 떠오르는 곳은?", ("책상 앞", "샤워할 때", "걸을 때", "자기 직전")),
    ("w35", "work", "☕", "쉬는 시간에 나는?", ("자리에서 휴대폰", "탕비실 수다", "바깥 바람")),
    ("w36", "work", "🖨️", "프린터가 멈추면?", ("직접 고쳐 보기", "다른 층 프린터로", "담당자에게 연락")),
    ("w37", "work", "🌓", "컴퓨터 화면은 어떤 모드로?", ("밝은 화면", "어두운 화면", "시간 따라 자동")),
    ("w38", "work", "😊", "업무 메신저에서 이모티콘은?", ("자주 써요", "가끔 써요", "거의 안 써요")),
    ("w39", "work", "🙋", "모르는 게 생기면?", ("바로 물어보기", "모아서 한 번에", "일단 검색")),
    ("w40", "work", "📚", "새 프로그램을 배울 때는?", ("설명서부터", "일단 눌러 보기", "영상 보며 배우기")),
    ("w41", "work", "🥤", "책상 위 음료는 주로?", ("물", "커피", "차", "탄산음료")),
    ("w42", "work", "🪟", "자리 옆 블라인드는?", ("활짝 올려 두기", "반쯤만", "내려 두기")),
    ("w43", "work", "🗃️", "서랍 속 필수품은?", ("핸드크림", "물티슈", "간식", "충전기")),
    ("w44", "work", "🎉", "사내 행사에서 나는?", ("앞에 나서기", "박수 담당", "사진 담당")),
    ("w45", "work", "🏃", "워크숍에서 하고 싶은 건?", ("보물찾기", "팀 대항 게임", "조용한 강연")),
    ("w46", "work", "🌿", "점심 먹고 남은 시간에는?", ("바로 자리로", "짧은 산책", "카페 들르기", "눈 감고 쉬기")),
    ("w47", "work", "⌚", "딱 좋은 회의 길이는?", ("15분", "30분", "1시간")),
    ("w48", "work", "🧭", "외근 갈 때 길 찾기는?", ("지도 앱", "물어물어", "감으로")),
    ("w49", "work", "📸", "회의 화이트보드 내용은?", ("사진으로 찍기", "받아 적기", "머리로 기억")),
    ("w50", "work", "🔁", "반복되는 일이 생기면?", ("자동으로 돌리기", "손에 익히기")),
    ("w51", "work", "🛎️", "월요일 아침 첫 일은?", ("메일 확인", "할 일 정리", "커피부터")),
    ("w52", "work", "📲", "편한 연락 방법은?", ("전화", "문자·메신저")),
    ("w53", "work", "🧩", "일하는 방식은?", ("하나씩 끝내기", "여러 개 동시에")),
    ("w54", "work", "🏖️", "연차를 쓴다면 언제?", ("금요일에 붙여서", "월요일에 붙여서", "주 중간")),
    ("w55", "work", "🍴", "점심 먹을 때 나는?", ("이야기 담당", "듣기 담당", "먹기에 집중")),
    ("w56", "work", "👋", "퇴근할 때 인사는?", ("수고하셨습니다", "내일 봬요", "먼저 들어가 볼게요")),
    # ── 음식 ──
    ("f01", "food", "🍜", "점심 메뉴가 고민될 때 끌리는 건?", ("국물", "밥", "면", "빵")),
    ("f02", "food", "🌶️", "떡볶이 맵기는?", ("순한 맛", "보통", "매운맛", "아주 매운맛")),
    ("f03", "food", "🍗", "치킨을 시킨다면?", ("후라이드", "양념", "간장", "반반")),
    ("f04", "food", "🥟", "만두는 어떻게?", ("찐만두", "군만두", "물만두")),
    ("f05", "food", "🍕", "피자 테두리는?", ("다 먹기", "남기기", "소스 찍어 먹기")),
    ("f06", "food", "🍳", "라면에 계란은?", ("풀어서", "그대로 익혀서", "안 넣어요")),
    ("f07", "food", "🍲", "라면 면발은?", ("꼬들꼬들", "푹 익혀서", "봉지에 적힌 대로")),
    ("f08", "food", "🍢", "떡볶이 떡은?", ("밀떡", "쌀떡", "상관없어요")),
    ("f09", "food", "🐟", "붕어빵은 어디부터?", ("머리부터", "꼬리부터", "반 갈라서")),
    ("f10", "food", "🍦", "아이스크림은?", ("콘", "컵", "막대", "빙수")),
    ("f11", "food", "🍫", "민트 초코는?", ("좋아요", "싫어요", "가끔은 괜찮아요")),
    ("f12", "food", "🍍", "파인애플 올린 피자는?", ("좋아요", "싫어요")),
    ("f13", "food", "🥢", "탕수육 소스는?", ("부어 먹기", "찍어 먹기", "아무렇게나")),
    ("f14", "food", "🥚", "계란 요리 하나만 고르면?", ("반숙", "완숙", "스크램블", "계란말이")),
    ("f15", "food", "🍞", "아침은 주로?", ("밥", "빵", "과일", "커피 한 잔")),
    ("f16", "food", "☕", "카페에서 고르는 건?", ("아메리카노", "라테", "달달한 음료", "차")),
    ("f17", "food", "🧊", "음료 온도는?", ("한겨울에도 차갑게", "늘 따뜻하게", "계절 따라")),
    ("f18", "food", "🍉", "여름 과일 하나만?", ("수박", "복숭아", "참외", "포도")),
    ("f19", "food", "🍊", "겨울 간식 하나만?", ("귤", "군고구마", "호떡", "붕어빵")),
    ("f20", "food", "🍙", "편의점 삼각김밥은?", ("참치마요", "비빔밥", "불고기", "명란")),
    ("f21", "food", "🥪", "소풍 도시락은?", ("샌드위치", "김밥", "유부초밥")),
    ("f22", "food", "🍝", "파스타 소스는?", ("토마토", "크림", "오일", "로제")),
    ("f23", "food", "🍔", "햄버거랑 마실 건?", ("콜라", "사이다", "커피", "물")),
    ("f24", "food", "🍟", "감자튀김은?", ("케첩 찍어서", "그냥", "소스 여러 개")),
    ("f25", "food", "🥗", "반찬 하나만 남긴다면?", ("김치", "계란말이", "멸치볶음", "김")),
    ("f26", "food", "🥡", "중국집에서는?", ("짜장면", "짬뽕", "볶음밥")),
    ("f27", "food", "🥩", "고기 구울 때 나는?", ("집게 담당", "먹는 담당", "번갈아")),
    ("f28", "food", "🥘", "찌개 하나만?", ("김치찌개", "된장찌개", "순두부찌개", "부대찌개")),
    ("f29", "food", "🍱", "도시락 반찬 칸에 꼭?", ("고기", "나물", "계란", "소시지")),
    ("f30", "food", "🍰", "디저트 하나만?", ("케이크", "쿠키", "마카롱", "떡")),
    ("f31", "food", "🍵", "따뜻한 차를 고른다면?", ("녹차", "보리차", "유자차", "허브차")),
    ("f32", "food", "🥛", "우유를 고른다면?", ("흰 우유", "바나나 우유", "초코 우유", "딸기 우유")),
    ("f33", "food", "🍪", "과자 한 봉지를 뜯으면?", ("한 번에 다", "조금씩 나눠서", "옆 사람과 나눠 먹기")),
    ("f34", "food", "🥨", "출출할 때 당기는 건?", ("단 거", "짠 거", "단짠 번갈아")),
    ("f35", "food", "🍓", "딸기는 어떻게?", ("그냥", "생크림이랑", "연유 찍어서")),
    ("f36", "food", "🍣", "초밥집에서 처음 고르는 건?", ("연어", "새우", "계란", "유부")),
    ("f37", "food", "🏪", "분식집 세트를 고른다면?", ("떡볶이+튀김", "라면+김밥", "쫄면+만두")),
    ("f38", "food", "🍢", "어묵은?", ("꼬치가 최고", "국물이 최고", "둘 다")),
    ("f39", "food", "🍠", "고구마는?", ("군고구마", "찐고구마", "고구마 맛탕")),
    ("f40", "food", "🌽", "옥수수는?", ("찰옥수수", "달콤한 옥수수", "팝콘")),
    ("f41", "food", "🍜", "면 요리 하나만?", ("냉면", "칼국수", "우동", "쌀국수")),
    ("f42", "food", "🌮", "처음 보는 메뉴가 있으면?", ("일단 도전", "늘 먹던 걸로")),
    ("f43", "food", "⏱️", "맛집 줄이 길면?", ("30분도 기다리기", "10분까지만", "바로 옆 가게로")),
    ("f44", "food", "🧂", "음식 간은?", ("싱겁게", "딱 맞게", "짭짤하게")),
    ("f45", "food", "🧀", "라면에 하나 더 넣는다면?", ("파", "치즈", "떡", "아무것도")),
    ("f46", "food", "🥤", "탄산음료는?", ("콜라", "사이다", "탄산수", "안 마셔요")),
    ("f47", "food", "🥐", "빵집에서 꼭 집는 건?", ("소금빵", "크루아상", "단팥빵", "식빵")),
    ("f48", "food", "🍲", "국물 요리 마지막엔?", ("밥 말기", "면 추가", "국물만 쭉", "여기까지")),
    ("f49", "food", "🥚", "삶은 계란은?", ("소금 찍어", "그냥", "사이다랑")),
    ("f50", "food", "🍙", "김밥 꼬다리는?", ("제일 좋아요", "그냥 그래요", "양보할게요")),
    ("f51", "food", "🍕", "오늘 저녁 배달이라면?", ("피자", "치킨", "족발", "짜장면")),
    ("f52", "food", "🏬", "편의점 점심은?", ("도시락", "컵라면+김밥", "샐러드", "샌드위치")),
    ("f53", "food", "🍮", "푸딩은?", ("좋아요", "식감이 별로예요")),
    ("f54", "food", "⏲️", "컵라면 물 붓고 언제 먹어요?", ("2분이면 충분", "딱 3분", "4분 넉넉히")),
    ("f55", "food", "🍡", "떡 하나만?", ("꿀떡", "인절미", "백설기", "송편")),
    ("f56", "food", "🍫", "초콜릿은?", ("밀크", "다크", "화이트", "견과류 박힌 것")),
    ("f57", "food", "🍬", "탕비실 간식 하나만?", ("과자", "초콜릿", "견과류", "젤리")),
    ("f58", "food", "🍎", "사과는?", ("껍질째", "깎아서", "주스로")),
    # ── 여가 ──
    ("l01", "leisure", "🏖️", "휴가는 어디로?", ("바다", "산", "도시", "집이 최고")),
    ("l02", "leisure", "🧳", "여행 계획은?", ("시간 단위로 꼼꼼히", "큰 틀만", "그날그날 즉흥")),
    ("l03", "leisure", "🌸", "좋아하는 계절은?", ("봄", "여름", "가을", "겨울")),
    ("l04", "leisure", "🌧️", "비 오는 휴일에는?", ("집에서 영화", "카페 가기", "빗소리 들으며 낮잠", "그래도 나가기")),
    ("l05", "leisure", "🎬", "영화 장르 하나만?", ("코미디", "액션", "애니메이션", "다큐멘터리")),
    ("l06", "leisure", "🍿", "영화관 자리는?", ("맨 뒤", "한가운데", "통로 쪽", "앞쪽")),
    ("l07", "leisure", "📺", "드라마는 어떻게 봐요?", ("한 회씩 아껴서", "주말에 몰아서", "결말부터 확인")),
    ("l08", "leisure", "🎮", "게임은 어떻게 즐겨요?", ("혼자 하기", "같이 하기", "구경하기")),
    ("l09", "leisure", "🎤", "노래방에서 나는?", ("마이크 담당", "탬버린 담당", "노래 고르기 담당")),
    ("l10", "leisure", "🐶", "집에서 하나 키운다면?", ("강아지", "고양이", "물고기", "화분")),
    ("l11", "leisure", "📚", "책은 어떻게 읽어요?", ("종이책", "전자책", "듣는 책")),
    ("l12", "leisure", "🛌", "주말 아침에는?", ("일찍 일어나 움직이기", "실컷 늦잠", "느긋한 브런치")),
    ("l13", "leisure", "🚲", "휴일에 몸을 움직인다면?", ("자전거", "등산", "수영", "산책")),
    ("l14", "leisure", "🎵", "쉬는 날 듣는 음악은?", ("신나는 곡", "잔잔한 곡", "라디오", "안 들어요")),
    ("l15", "leisure", "🏕️", "캠핑을 간다면?", ("텐트 치고", "차에서", "다 갖춰진 곳", "영상으로 구경")),
    ("l16", "leisure", "🌄", "더 보고 싶은 하늘 풍경은?", ("해 뜨는 모습", "해 지는 모습")),
    ("l17", "leisure", "🗺️", "처음 가 보는 동네에서는?", ("지도 보며 걷기", "발길 닿는 대로")),
    ("l18", "leisure", "🧩", "퍼즐 하나만?", ("조각 맞추기", "숫자 퍼즐", "낱말 퍼즐", "방 탈출")),
    ("l19", "leisure", "🎨", "새로 배워 보고 싶은 건?", ("그림", "악기", "요리", "뜨개질")),
    ("l20", "leisure", "📷", "여행 사진은 주로?", ("풍경", "같이 간 사람", "음식", "거의 안 찍어요")),
    ("l21", "leisure", "⏰", "휴일에 일어나는 시간은?", ("7시", "9시", "11시", "오후")),
    ("l22", "leisure", "🎢", "놀이공원에서 제일 먼저?", ("롤러코스터", "회전목마", "퍼레이드", "간식부터")),
    ("l23", "leisure", "⛰️", "산과 바다 중에?", ("산", "바다")),
    ("l24", "leisure", "✈️", "비행기 자리는?", ("창가", "통로")),
    ("l25", "leisure", "🚗", "긴 차 여행에서 나는?", ("운전 담당", "음악 담당", "간식 담당", "잠 담당")),
    ("l26", "leisure", "🎧", "좋아하는 이어폰은?", ("무선", "줄 있는 것", "큰 헤드폰")),
    ("l27", "leisure", "🕹️", "오락실에 가면?", ("인형 뽑기", "농구", "리듬 게임", "레이싱")),
    ("l28", "leisure", "☃️", "눈 오는 날에는?", ("눈사람 만들기", "눈싸움", "창밖 구경")),
    ("l29", "leisure", "🌙", "잠들기 전에는?", ("휴대폰 보기", "책 읽기", "음악 듣기", "바로 잠")),
    ("l30", "leisure", "🎂", "생일 케이크는?", ("생크림", "초코", "치즈", "아이스크림")),
    ("l31", "leisure", "🎁", "선물을 고를 때는?", ("미리미리 준비", "당일에 고르기", "갖고 싶은 걸 물어보기")),
    ("l32", "leisure", "🧺", "소풍을 간다면?", ("공원", "강가", "바닷가", "옥상")),
    ("l33", "leisure", "📮", "여행 기념품은?", ("냉장고 자석", "엽서", "그 동네 간식", "안 사요")),
    ("l34", "leisure", "🌃", "야경은 어디서?", ("높은 전망대", "강가 산책길", "우리 집 창문")),
    ("l35", "leisure", "🖼️", "전시회에서 나는?", ("설명 하나하나 읽기", "빠르게 훑어보기", "기념품 가게부터")),
    ("l36", "leisure", "🎲", "좋아하는 보드게임은?", ("머리 쓰는 전략", "손이 빠른 순발력", "함께하는 협동", "말로 하는 게임")),
    ("l37", "leisure", "🧘", "나만의 쉬는 법은?", ("혼자 조용히", "사람들과 수다", "몸 움직이기")),
    ("l38", "leisure", "🗓️", "주말 계획은 언제 세워요?", ("주중에 미리", "금요일 밤", "계획 없이")),
    ("l39", "leisure", "🛋️", "집에서 제일 좋아하는 곳은?", ("침대", "소파", "책상", "부엌")),
    ("l40", "leisure", "☁️", "하늘을 보면?", ("구름 모양 찾기", "사진 찍기", "그냥 멍하니")),
    ("l41", "leisure", "🌊", "물놀이를 간다면?", ("수영장", "바다", "계곡", "구경만")),
    ("l42", "leisure", "🧁", "직접 만들어 보고 싶은 간식은?", ("쿠키", "케이크", "빵", "사 먹는 게 최고")),
    ("l43", "leisure", "🐧", "동물원에서 먼저 볼 동물은?", ("판다", "기린", "펭귄", "사자")),
    ("l44", "leisure", "🍭", "놀이공원 간식 하나만?", ("츄러스", "솜사탕", "핫도그")),
    ("l45", "leisure", "🛡️", "게임 속 내 역할은?", ("앞에서 막기", "뒤에서 돕기", "빠르게 공격", "몰래 숨어 다니기")),
    ("l46", "leisure", "🧳", "여행 짐은 언제 싸요?", ("일주일 전", "전날 밤", "출발 직전")),
    ("l47", "leisure", "🛒", "장은 어디서 봐요?", ("큰 마트", "온라인 주문", "동네 시장")),
    ("l48", "leisure", "🌼", "꽃 하나만?", ("벚꽃", "해바라기", "튤립", "코스모스")),
    ("l49", "leisure", "⭐", "밤하늘 별 구경은?", ("일부러 보러 가기", "보이면 보기")),
    ("l50", "leisure", "🎪", "축제에 가면?", ("공연 앞자리", "먹거리 골목", "체험 부스")),
    ("l51", "leisure", "🛁", "피곤한 날에는?", ("따뜻한 샤워", "일찍 자기", "맛있는 저녁", "가벼운 산책")),
    ("l52", "leisure", "📖", "책 하나만?", ("만화책", "소설", "에세이", "여행 책")),
    ("l53", "leisure", "🎹", "악기를 배운다면?", ("피아노", "기타", "드럼", "우쿨렐레")),
    ("l54", "leisure", "🔥", "캠핑의 밤에는?", ("별 보기", "모닥불 멍", "이야기꽃", "일찍 자기")),
    ("l55", "leisure", "🎳", "가볍게 즐기기 좋은 건?", ("볼링", "탁구", "배드민턴", "다트")),
    ("l56", "leisure", "🌈", "무지개 색 하나만?", ("빨강", "노랑", "초록", "파랑")),
    ("l57", "leisure", "👾", "아케이드에서 나는?", ("혼자 기록 깨기", "둘이 협동", "1:1 대결")),
    ("l58", "leisure", "🚉", "기차 여행이라면?", ("창밖 구경", "도시락 먹기", "음악 듣기", "잠")),
)
BY_ID = {q[0]: q for q in BANK}
# 보기에 순서가 있는 문제(시간 · 개수 · 정도) — 사람마다 섞지 않고 방향(정순 · 역순)만 바꾼다
ORDERED = frozenset({
    "w02", "w03", "w04", "w05", "w10", "w11", "w12", "w14", "w16", "w18", "w20", "w31", "w38", "w42", "w47",
    "f02", "f43", "f44", "f54",
    "l02", "l21", "l38", "l46",
})
MISSING = ("", "", "❔", "지난 문제", ())  # 은행에서 빠진 문제 — 지난 기록이 깨지지 않게 자리만 채운다

# 공개 화면 한마디 — 결과 갈래마다(둘 다 같은 줄을 본다)
LINES = {
    "perfect": (
        "찌찌뽕! 완전히 통했어요",
        "말 안 해도 다 아는 사이네요",
        "텔레파시라도 쓰는 거예요?",
        "서로의 마음 번역기 같아요",
    ),
    "sameOne": (  # 같은 답 + 한 사람만 맞힘(2점)
        "같은 답! 한 사람은 미리 알고 있었어요",
        "취향도 같고, 한 사람은 눈치챘어요",
        "같은 걸 골랐고, 한 사람은 그걸 맞혔어요",
    ),
    "same": (  # 같은 답 + 둘 다 못 맞힘(1점)
        "고른 건 같은데, 서로 몰랐네요",
        "취향은 통했는데 예상은 빗나갔어요",
        "알고 보니 같은 편이었어요",
    ),
    "both": (
        "취향은 달라도 서로를 잘 알아요",
        "다르다는 걸 정확히 알고 있었어요",
        "눈치가 백 단이에요",
    ),
    "one": (
        "반쯤 통했어요",
        "한 사람은 꿰뚫어 봤어요",
        "조금만 더 알아 가면 돼요",
    ),
    "none": (
        "이번엔 엇갈렸어요",
        "새로운 모습을 알게 됐어요",
        "다음 문제에서 만회해요",
    ),
}

# 공개 화면에서 누르는 반응 — 정해 둔 말만(진행 중 대화창 대신)
REACTIONS = ("😆 ㅋㅋㅋ", "👍 역시!", "😮 헉!", "🙌 찌찌뽕", "😅 아깝다", "🤔 의외예요")

# 끝 화면 이름표 — 통함 지수(%) 이상이면
GRADES = ((90, "텔레파시 동기"), (70, "척하면 척"), (50, "꽤 통하는 사이"), (30, "알아 가는 중"), (0, "이제 시작하는 사이"))


class SyncRoom:
    """방 정보 — 협동 방 공용 코드가 그대로 쓰는 값."""

    key = "sync"
    title = "통하는 사이"
    label = "협동 게임"
    page = "sync"
    game = "sync"
    blurb = "같은 질문에 둘이 몰래 답하고 서로의 답을 예상해 보는 협동 게임이에요."
    intro = (
        "문제마다 내 답을 고르고, 동료가 뭘 골랐을지도 예상해요. 둘 다 고르면 한꺼번에 공개! "
        "예상이 맞으면 1점, 둘이 같은 답을 고르면 「통함」 1점을 더 받아요. 보기 순서는 사람마다 달라요. "
        "5분 동안 10문제, 얼마나 통하는 사이인지 알아봐요."
    )
    outro = "오늘 서로를 조금 더 알게 됐어요!"
    # 두 쪽이 하는 일은 같다 — 자리 이름만 다르다
    sides = {"a": "창가 자리", "b": "복도 자리"}
    limit_sec = ROUND_SEC
    themes = THEMES  # 대기실에서 고르는 주제(화면은 같은 목록을 쓴다)


ROOM = SyncRoom()
START_TEXT = f"시작! {ROUND_SEC // 60}분 동안 {QUESTIONS}문제, 서로의 마음을 맞혀 봐요."


# ── 설정 · 시작 ────────────────────────────────────────────────

def clean_options(opts: dict) -> dict:
    """대기실 설정 — 주제(theme)만. 모르는 값은 버리고 기본값(섞어서)을 채운다. 한글 이름으로 와도 받아 준다."""
    theme = opts.get("theme") if isinstance(opts, dict) else None
    if isinstance(theme, str):
        theme = theme.strip()
        theme = next((key for key, name in THEMES.items() if theme in (key, name)), None)
    else:
        theme = None
    return {"theme": theme or "mix"}


def _pick_questions(theme: str, rnd: random.Random) -> list:
    """문제 id 10개 — 섞어서는 세 주제에서 고르게 뽑는다."""
    if theme != "mix":
        pool = [q[0] for q in BANK if q[1] == theme]
        return rnd.sample(pool, min(QUESTIONS, len(pool)))
    groups = []
    for key in THEMES:
        if key == "mix":
            continue
        g = [q[0] for q in BANK if q[1] == key]
        rnd.shuffle(g)
        groups.append(g)
    rnd.shuffle(groups)
    out = []
    while len(out) < QUESTIONS and any(groups):
        for g in groups:
            if g and len(out) < QUESTIONS:
                out.append(g.pop())
    rnd.shuffle(out)
    return out


def start(st: dict, now: float) -> None:
    opts = clean_options(st.get("opts") or {})
    rnd = random.Random()
    qs = _pick_questions(opts["theme"], rnd)
    st["k"] = {
        # seed — 사람마다 보기 순서를 정하는 값(화면에는 보내지 않는다)
        # qAt — 지금 문제가 나온 시각. 지금은 기록만 한다(문제마다 최소 시간을 두기로 하면 pick 에서 쓴다)
        "start": now, "end": now + ROUND_SEC, "theme": opts["theme"], "qs": qs, "total": len(qs), "seed": rnd.randrange(1 << 30),
        "i": 0, "phase": "pick", "sub": {"a": None, "b": None}, "qAt": now,
        "revealAt": None, "revealEnd": None, "nextBy": [],
        "hist": [], "points": 0, "re": {}, "over": False, "reason": None, "gap": {},
    }


# ── 흐름 ──────────────────────────────────────────────────────

def _entry(qid) -> tuple:
    return BY_ID.get(qid, MISSING)


def _order(k: dict, side: str, qid, n: int) -> list:
    """이 사람 화면의 보기 순서 — 원래 보기 번호의 목록. 판의 seed · 자리 · 문제로 정해져 다시 불러도 같다.

    두 사람 순서가 서로 따로라 「다 1번」 같은 번호 약속은 아무렇게나 고른 것과 다를 게 없다.
    시간 · 개수처럼 순서가 있는 보기는 뒤섞으면 읽기 어려워서 방향만 바꾼다.
    """
    rnd = random.Random(f"{k.get('seed', 0)}:{side}:{qid}")
    order = list(range(n))
    if qid in ORDERED:
        if rnd.random() < 0.5:
            order.reverse()
    else:
        rnd.shuffle(order)
    return order


def _shown(order: list, o) -> Optional[int]:
    """원래 보기 번호 → 이 사람 화면의 번호. 없으면 None(은행이 바뀌어 보기가 줄었을 때)."""
    return order.index(o) if isinstance(o, int) and o in order else None


def _other(side: str) -> str:
    return "b" if side == "a" else "a"


def _judge(a: list, b: list) -> dict:
    """한 문제 채점 — a·b 는 [내 답, 상대 예상]."""
    hit_a = a[1] == b[0]  # a 가 b 의 답을 맞혔나
    hit_b = b[1] == a[0]
    same = a[0] == b[0]
    pts = int(hit_a) + int(hit_b) + int(same)
    if pts == MAX_POINTS:
        kind = "perfect"
    elif same:
        kind = "sameOne" if hit_a or hit_b else "same"
    elif hit_a and hit_b:
        kind = "both"
    elif hit_a or hit_b:
        kind = "one"
    else:
        kind = "none"
    return {"hitA": hit_a, "hitB": hit_b, "same": same, "pts": pts, "kind": kind}


def _reveal(k: dict, now: float) -> None:
    a, b = k["sub"]["a"], k["sub"]["b"]
    j = _judge(a, b)
    k["hist"] = [*k["hist"], {"q": k["qs"][k["i"]], "a": list(a), "b": list(b), "p": j["pts"], "ln": random.randrange(len(LINES[j["kind"]]))}][-QUESTIONS:]
    k["points"] += j["pts"]
    k["phase"] = "reveal"
    k["revealAt"], k["revealEnd"] = now, now + REVEAL_SEC
    k["nextBy"] = []


def _finish(k: dict, reason: str) -> None:
    k["over"], k["reason"], k["phase"] = True, reason, "done"
    k["nextBy"] = []


def _next_q(k: dict, now: float) -> None:
    k["i"] += 1
    k["sub"] = {"a": None, "b": None}
    k["nextBy"] = []
    k["revealAt"] = k["revealEnd"] = None
    if k["i"] >= k["total"]:
        _finish(k, "done")
        return
    k["phase"] = "pick"
    k["qAt"] = now


def advance(st: dict, now: float) -> bool:
    """공개 시간이 끝나면 다음 문제로, 게임 시간이 끝나면 끝. 바뀐 게 있으면 True."""
    k = st["k"]
    if k["over"]:
        return False
    changed = False
    if k["phase"] == "reveal" and k["revealEnd"] <= min(now, k["end"]):
        _next_q(k, k["revealEnd"])
        changed = True
        if k["over"]:
            return True
    if now >= k["end"]:
        _finish(k, "done" if len(k["hist"]) >= k["total"] else "time")
        return True
    return changed


def next_event(st: dict) -> Optional[float]:
    """다음에 저절로 바뀌는 시각 — 공개 끝(다음 문제) 또는 게임 끝."""
    k = st["k"]
    if k["over"]:
        return None
    if k["phase"] == "reveal" and k["revealEnd"]:
        return min(k["revealEnd"], k["end"])
    return k["end"]


# ── 할 일 ─────────────────────────────────────────────────────

def _int(v) -> Optional[int]:
    """보기 번호 · 문제 번호 — 정수(또는 0~9 숫자 글자)만. 아니면 None.

    isdigit() 는 「①」 「²」 같은 글자도 숫자로 봐서 int() 가 터지므로, ASCII 숫자만 받는다.
    """
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        s = v.strip()
        if 0 < len(s) <= 3 and s.isascii() and s.isdecimal():
            return int(s)
    return None


def _pick_arg(arg) -> tuple:
    """{"mine": 0, "guess": 2, "no": 3} 또는 [0, 2] → (내 답, 예상, 문제 번호|None)."""
    if isinstance(arg, dict):
        mine, guess, no = arg.get("mine"), arg.get("guess"), arg.get("no")
    elif isinstance(arg, (list, tuple)) and len(arg) == 2:
        (mine, guess), no = arg, None
    else:
        raise_app_error("SYNC_BAD_PICK")
    m, g = _int(mine), _int(guess)
    if m is None or g is None:
        raise_app_error("SYNC_BAD_PICK")
    n = None
    if no is not None:
        n = _int(no)
        if n is None:
            raise_app_error("SYNC_BAD_PICK")
    return m, g, n


def _no_arg(arg) -> Optional[int]:
    """「다음」의 문제 번호 — 3 또는 {"no": 3}. 없거나 모르면 None."""
    if isinstance(arg, dict):
        arg = arg.get("no")
    return _int(arg) if arg is not None else None


def _gap(k: dict, member_id: int, action: str, now: float, sec: float) -> None:
    gap = k.setdefault("gap", {})
    if now - gap.get(f"{member_id}:{action}", 0) < sec:
        raise_app_error("ESCAPE_TOO_FAST", 429)


def act(st: dict, side: str, member_id: int, action: str, arg, now: float) -> None:
    """한 사람의 동작 하나 — pick(내 답 · 예상 내기) · next(다음 문제) · react(공개 화면 반응)."""
    k = st["k"]
    advance(st, now)  # 협동 방 공용 코드가 먼저 맞춰 두지만, 혼자 불려도 시간 순서가 어긋나지 않게
    if k["over"]:
        raise_app_error("ESCAPE_NOT_PLAYING")
    if side not in SIDES:
        raise_app_error("KITCHEN_BAD_ACTION")
    no = k["i"] + 1
    gap = k.setdefault("gap", {})

    if action == "pick":
        if k["phase"] != "pick":
            raise_app_error("SYNC_NOT_PICKING")
        _gap(k, member_id, action, now, PICK_GAP)
        mine, guess, at = _pick_arg(arg)
        if at is not None and at != no:
            raise_app_error("SYNC_STALE")
        qid = k["qs"][k["i"]]
        n = len(_entry(qid)[4])
        if not (0 <= mine < n and 0 <= guess < n):
            raise_app_error("SYNC_BAD_PICK")
        gap[f"{member_id}:{action}"] = now
        # 화면 번호 → 원래 보기 번호로 저장(채점 · 기록은 원래 번호로)
        order = _order(k, side, qid, n)
        # 상대가 아직 안 냈으면 다시 내서 바꿀 수 있다 — 둘 다 내는 순간 공개
        k["sub"] = {**k["sub"], side: [order[mine], order[guess]]}
        if all(k["sub"][s] is not None for s in SIDES):
            _reveal(k, now)
        return

    if action == "next":
        at = _no_arg(arg)
        if k["phase"] != "reveal":
            if at is not None and at < no:
                return  # 이미 넘어간 문제의 「다음」 — 저절로 넘어간 뒤 늦게 온 것
            raise_app_error("SYNC_NOT_REVEAL")
        if at is not None and at != no:
            return
        if now - (k["revealAt"] or 0) < NEXT_AFTER:
            raise_app_error("ESCAPE_TOO_FAST", 429)
        _gap(k, member_id, action, now, NEXT_GAP)
        gap[f"{member_id}:{action}"] = now
        if side not in k["nextBy"]:
            k["nextBy"] = [*k["nextBy"], side]
        if all(s in k["nextBy"] for s in SIDES):
            _next_q(k, now)
        return

    if action == "react":
        if k["phase"] != "reveal":
            raise_app_error("SYNC_NOT_REVEAL")
        i = _int(arg.get("i") if isinstance(arg, dict) else arg)
        if i is None or not 0 <= i < len(REACTIONS):
            raise_app_error("KITCHEN_BAD_ACTION")
        _gap(k, member_id, action, now, REACT_GAP)
        gap[f"{member_id}:{action}"] = now
        k["re"] = {**k.get("re", {}), side: [i, now, no]}
        return

    raise_app_error("KITCHEN_BAD_ACTION")


# ── 결과 ──────────────────────────────────────────────────────

def _pct(k: dict) -> int:
    """통함 지수 — 얻은 점수 ÷ 만점(10문제 × 3점). 못 푼 문제는 0점."""
    full = MAX_POINTS * (k.get("total") or QUESTIONS)
    return round(100 * k["points"] / full) if full else 0


def _grade(pct: int) -> str:
    return next(name for low, name in GRADES if pct >= low)


def tier(st: dict) -> str:
    """끝 이야기 갈래 제안 — 화면 storyTier 가 view 의 tier 를 그대로 쓴다.

    아무렇게나 고르면 평균 31% 쯤이라, ok 는 그보다 조금 위(40%)부터.
    """
    pct = _pct(st["k"])
    return "great" if pct >= 70 else "ok" if pct >= 40 else "fail"


def score(st: dict) -> int:
    return st["k"]["points"]


def end_code(st: dict) -> str:
    return "DONE" if st["k"]["reason"] == "done" else "TIME"


def summary(st: dict) -> str:
    k = st["k"]
    pct = _pct(k)
    if k["reason"] == "done":
        return f"{k['total']}문제 끝! {k['points']}점 · 통함 지수 {pct}% 「{_grade(pct)}」"
    return f"시간 끝! {len(k['hist'])}문제에서 {k['points']}점 · 통함 지수 {pct}%"


# ── 화면 ──────────────────────────────────────────────────────

def _qview(k: dict, qid, no: int, side: str) -> tuple:
    """문제 하나를 이 사람 화면 순서로 — (화면 값, 보기 순서)."""
    _, theme, icon, text, options = _entry(qid)
    order = _order(k, side, qid, len(options))
    out = {"no": no, "icon": icon, "text": text, "options": [options[i] for i in order],
           "theme": theme, "themeName": THEMES.get(theme, "")}
    return out, order


def _hview(k: dict, h: dict, no: int, me: str) -> dict:
    """공개된 한 문제 — 보는 사람 쪽에서(mine 내 것 · theirs 동료 것). 보기 번호는 보는 사람 화면 순서."""
    other = _other(me)
    mine, theirs = h[me], h[other]
    j = _judge(h["a"], h["b"])
    lines = LINES[j["kind"]]
    q, order = _qview(k, h["q"], no, me)
    return {
        **q,
        "mine": {"own": _shown(order, mine[0]), "guess": _shown(order, mine[1])},
        "theirs": {"own": _shown(order, theirs[0]), "guess": _shown(order, theirs[1])},
        "myHit": mine[1] == theirs[0], "theirHit": theirs[1] == mine[0], "same": j["same"],
        "pts": j["pts"], "kind": j["kind"], "line": lines[h.get("ln", 0) % len(lines)],
    }


def view(st: dict, side: Optional[str], now: float) -> dict:
    k = st["k"]
    me = side if side in SIDES else None
    look = me or "a"  # 방 사람이 아니면(없어야 하지만) 공개된 것만 a 쪽에서 보여 준다
    other = _other(look)
    over = k["over"]
    total = k["total"]
    hist = [_hview(k, h, n + 1, look) for n, h in enumerate(k["hist"])]
    picking = not over and k["phase"] == "pick"
    revealing = not over and k["phase"] == "reveal"
    q, order = (None, []) if over else _qview(k, k["qs"][k["i"]], k["i"] + 1, look)
    mine = k["sub"].get(me) if (picking and me) else None
    pct = _pct(k)

    def react(s: str):
        r = k.get("re", {}).get(s)
        if not r or r[2] != k["i"] + 1 or not revealing:
            return None
        return {"i": r[0], "text": REACTIONS[r[0] % len(REACTIONS)], "t": r[1]}

    return {
        "now": now, "start": k["start"], "end": k["end"], "nextAt": next_event(st),
        "over": over, "reason": k["reason"],
        "theme": k["theme"], "themeName": THEMES.get(k["theme"], ""),
        "total": total, "no": min(k["i"] + 1, total), "phase": "done" if over else k["phase"],
        "q": q,
        # 고르는 중 — 내 것만(내 화면 번호로). 동료는 냈는지만
        "mine": {"own": _shown(order, mine[0]), "guess": _shown(order, mine[1])} if mine else None,
        "partnerDone": bool(picking and k["sub"].get(other) is not None),
        # 공개 중 — 이번 문제 결과 · 누가 「다음」을 눌렀나. until 은 게임 끝을 넘지 않게(화면 고리가 7초를 보여 주지 않게)
        "reveal": {**hist[-1], "until": min(k["revealEnd"], k["end"]), "nextMe": look in k["nextBy"],
                   "nextPartner": other in k["nextBy"]}
        if revealing and hist else None,
        "reacts": {"me": react(look), "partner": react(other)},
        "reactions": list(REACTIONS),
        "points": k["points"], "maxPoints": MAX_POINTS * total, "syncPct": pct,
        "answered": len(hist), "matches": sum(1 for h in hist if h["same"]),
        "perfect": sum(1 for h in hist if h["kind"] == "perfect"),
        "hits": {"me": sum(1 for h in hist if h["myHit"]), "partner": sum(1 for h in hist if h["theirHit"])},
        "history": hist,
        "grade": _grade(pct) if over else None,
        "tier": tier(st) if over else None,
        "revealSec": REVEAL_SEC, "nextAfter": NEXT_AFTER,
    }
