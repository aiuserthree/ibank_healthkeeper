// 2인 협동 시리즈 「오늘도 둘이서」 — 이야기 · 그림 · 컷신 (협동 방 공용 coop.js 와 함께하기 페이지 /together 가 쓴다)
//
// 입사 동기 둘(실제로 같이 하는 두 사람 — 초대한 사람 {a}, 초대받은 사람 {b})이 하루를 같이 보내는 이야기.
//   1화 lunch    12:00 회사 앞 오복분식   「점심 분식집」    /games/kitchen
//   2화 words    15:00 본관 대회의실      「말해 봐 맞혀 봐」 /games/words
//   3화 overtime 22:00 7층 사무실         「야근 사무실 탈출」 /games/escape
//   4화 parking  23:30 지하주차장         「깜깜한 주차장」   /games/maze
// 이어지는 이야기 — 1화 사장님의 김밥 두 줄(3화·4화에서 먹는다), 1화 문 반장님의 「오늘 밤 보안 시험」(3화 잠김),
//                  2화 참가상 야광 손전등 키링(4화 정전), 2화 마 팀장님의 보고서 부탁(3화 야근), 4화 끝 「내일 점심은 오복분식」.
//
// 번외편 — 본편 사이사이(2화와 3화 사이) 같은 하루의 짧은 이야기. 본편 order 밖이라 본편 4화의 prev · next 는 그대로다.
//   번외 1화 sync     16:40 7층 탕비실     「통하는 사이」         /games/sync
//   번외 2화 sketch   17:40 본관 소회의실  「화이트보드 그림 퀴즈」 /games/sketch
//   번외 3화 spotdiff 21:30 7층 사무실     「틀린 그림 찾기」       /games/spotdiff
// 이어지는 이야기 — 2화 마 팀장님의 보고서(번외 셋 다 「오늘까지」), 1화 복순 사장님(번외 1 점심 고맙다고 떡꼬치 배달),
//                  1화 문 반장님의 「오늘 밤 보안 시험」(번외 2 회의실 6시 잠금 · 번외 3 「10시에 시스템을 켜요」 → 3화 22:00 잠김),
//                  번외 2 마 팀장님의 감자 같은 고양이 그림, 번외 3 범인은 마 팀장님의 머그컵.
//
// window.HKCoopStory = {
//   series: { title, tagline, logline, npcs: [{ name, role, about, color, face }] },
//   order: ["lunch", "words", "overtime", "parking"],
//   extras: ["sync", "sketch", "spotdiff"]   번외편 — 시각 순서(번외 1 · 2 · 3화). 본편 order 에는 넣지 않는다
//   extrasInfo: { title: "번외편", tagline }  번외편 묶음 이름 · 한 줄 소개(함께하기 페이지 칸 제목 등)
//   extraChapters: { [방 key]: 번외 화 정보 } — chapters 와 같은 모양에 셋을 더한다:
//     no = 글자 「번외 1」(협동 방 coop.js 처럼 `${no}화` 로 쓰면 「번외 1화」 — 숫자로 빼거나 정렬하지 말고 order · extras 순서를 쓴다),
//     extra = 번외 순번(1 · 2 · 3), back = 끝나고 이어지는 본편 화 key(셋 다 "overtime" — 끝 화면 「다음 화」가 3화로 간다)
//   ※ chapters 에는 본편 4화만 있다(함께하기 /together 의 하루 줄 · 아케이드 입구 그림은 본편만 쓴다). 번외편까지 찾을 때는 chapter(key)
//   chapters: { [방 key]: { key, no, time, place, title, page, logline, facts, palette, bestLabel, best(n), goal, tier(room),
//                           prologue: [줄], epilogue: { great: [줄], ok: [줄], fail: [줄] }, next } },
//     줄 = { who: "narr" | "a" | "b" | "npc", npc?: "복순 사장님", text: "… {a} … {b} …" }
//     palette = { accent, glow, strong, soft, deep, ink, sky: [위, 아래] } — strong 은 흰 글씨를 얹을 수 있는 진한 색,
//               glow 는 어두운 바탕 위 글씨 색, soft 는 옅은 바탕, deep 은 어두운 바탕
//     goal = 성공 조건 한 줄(함께하기 페이지) · tier(room) → "great" | "ok" | "fail" (room = 협동 방 정보: status · end · score · recordSec)
//   chapter(key) → 화 정보 — 본편 · 번외편 모두 (없으면 null) · prev(key) · next(key) → 앞 · 뒤 화 (없으면 null)
//     번외편: prev → null(앞 화 끝 이야기가 번외편으로 이어지지 않으므로) · next → 본편 chapters[back](3화 「야근 사무실 탈출」)
//   isExtra(key) → 번외편인지 · label(key) → 「1화」 · 「번외 1화」 (없으면 "")
//   cleared(room) → 성공한 판인지(서버 series() 의 cleared 와 같은 규칙) · tier(key, room) → 끝 이야기 갈래(화 기준, 없으면 성공 ok · 그 밖 fail)
//   vars(key) → "--ch-accent:…;…" 화 색을 CSS 변수로 (style 속성에 넣는다)
//   scene(key, { label }) → 화 그림(인라인 SVG 문자열, 가로세로 비율을 지키며 칸을 꽉 채운다)
//   npcFace(name) → 등장인물 얼굴 SVG
//   cutscene(key, kind, ctx) → 컷신 HTML. kind: "prologue" | "great" | "ok" | "fail"
//     ctx = { a: 초대한 사람 이름, b: 초대받은 사람 이름, me: "a" | "b", id?: 방 번호(같은 방에서 진행을 이어 가는 열쇠),
//             static?: true(목록 미리 보기 — 한꺼번에 다 보이고 본 것으로 치지 않는다) }
//     한 줄씩 나온다(「다음」을 누르거나, 화면에 보일 때 1.4초쯤마다 저절로). 「건너뛰기」는 모두 보인다. 끝까지 본 컷신은 기억해 두었다가
//     다음에는 접힌 채(「이야기 다시 보기」)로 나온다. 화면을 통째로 다시 그려도 진행은 이어진다(진행 상태는 화면 밖에 둔다).
//     움직임 줄이기(prefers-reduced-motion)를 켠 사람에게는 처음부터 모두 보여 준다.
// }
window.HKCoopStory = (function () {
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
  const nf = (n) => Number(n || 0).toLocaleString("ko-KR"); // 보여 주는 수 — 1,234
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  // ── 시리즈 · 등장인물 ──────────────────────────────────────
  const series = {
    title: "오늘도 둘이서",
    tagline: "입사 동기 둘의 아주 긴 하루",
    logline: "점심 분식집 대타부터 한밤 지하주차장 정전까지. 입사 동기 둘이 꼬이고 꼬인 하루를 같이 버텨요.",
    npcs: [
      { name: "복순 사장님", role: "회사 앞 오복분식 사장님", about: "허리가 아파도 손님 김밥은 꼭 챙겨요. 오늘 점심, 가게를 둘에게 맡겨요.", color: "#f97316", face: "scarf" },
      { name: "마 팀장님", role: "워크숍 진행을 맡은 옆 팀 팀장님", about: "마이크만 잡으면 목소리가 두 배. 상품 고르는 눈은… 조금 특이해요.", color: "#8b5cf6", face: "mic" },
      { name: "문 반장님", role: "건물 관리실 반장님", about: "새 보안 시스템을 시험하는 날이라 밤늦게까지 관리실을 지켜요.", color: "#0ea5e9", face: "cap" },
    ],
  };
  const N = (npc, text) => ({ who: "npc", npc, text });
  const R = (text) => ({ who: "narr", text });
  const A = (text) => ({ who: "a", text });
  const B = (text) => ({ who: "b", text });
  const BOK = "복순 사장님", MA = "마 팀장님", MUN = "문 반장님";

  // 성공한 판인지 — 서버 escape.series() 의 cleared 와 같은 규칙.
  // 포기 · 시간 초과(FAILED)는 실패. 시간제 게임(분식집 · 낱말 · 주차장 …)은 끝나면 늘 CLEAR 라서
  // 일찍 끝난 판(분식집 HEARTS — 손님을 너무 놓쳐 문을 닫음)과 점수 0 인 판도 실패로 본다. 방탈출(game "escape")은 CLEAR 면 성공
  const FAIL_ENDS = ["HEARTS", "GIVEUP", "TIMEOUT", "LEFT"];
  function cleared(r) {
    if (!r || r.status !== "CLEAR" || FAIL_ENDS.includes(r.end)) return false;
    return r.game === "escape" || Number(r.score) > 0;
  }

  const chapters = {
    lunch: {
      key: "lunch", no: 1, time: "12:00", place: "회사 앞 오복분식", title: "점심 분식집", page: "kitchen",
      logline: "사장님이 허리를 삐끗했어요. 점심 손님은 몰려오는데, 가게를 볼 사람은 우리 둘뿐!",
      facts: ["3분", "홀 · 주방"],
      palette: { accent: "#f97316", glow: "#fdba74", strong: "#c2410c", soft: "#fff7ed", deep: "#431407", ink: "#7c2d12", sky: ["#fff4dc", "#ffd2a1"] },
      bestLabel: "최고 매출", best: (n) => won(n),
      goal: "가게 문을 닫지 않고 3분 영업 끝내기",
      // 손님을 너무 놓쳐 일찍 닫았거나(HEARTS) 매출이 없으면 fail · 15만 원 넘게 팔면 great(kitchen.html GREAT 와 같게)
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 150000 ? "great" : "ok"),
      prologue: [
        R("12:00, 회사 앞 오복분식. 입사 동기 {a}님과 {b}님이 점심을 먹으러 왔어요."),
        N(BOK, "아이고 허리야… 마침 잘 왔어요! 나 병원 잠깐 다녀올 동안 가게 좀 봐 줄래요?"),
        A("네? 저희가요? 저 라면밖에 못 끓이는데요…"),
        B("괜찮아요, {a}님. 한 명은 홀, 한 명은 주방! 둘이면 돼요."),
        N(MUN, "여기 떡볶이 하나요! 아, 오늘 밤에 새 보안 시스템 시험하니까 너무 늦게까지 있지 말아요~"),
        R("어느새 손님 줄이 문밖까지 늘어섰어요. 3분 영업 시작!"),
      ],
      epilogue: {
        great: [
          N(BOK, "세상에, 매출이 나보다 많네! 둘이 아예 여기 취직할래요?"),
          A("점심시간이 이렇게 짧은 거였나요…"),
          N(BOK, "고마워서 김밥 두 줄 싸 줄게요. 오늘 야근하면 꼭 먹어요."),
          B("야근은 안 할 건데요… 아마도요."),
        ],
        ok: [
          N(BOK, "어머, 둘이 손발이 척척이네! 손님들이 맛있게 먹고 갔어요."),
          B("주문 전달이 이렇게 바쁜 일이었다니."),
          N(BOK, "고마워요. 김밥 두 줄 싸 줄 테니까 출출할 때 먹어요."),
          R("김밥 두 줄을 챙겨 회사로 돌아가는 길, 오후 일정이 기다려요."),
        ],
        fail: [
          N(BOK, "괜찮아요, 괜찮아! 나도 첫날엔 떡볶이를 다 태웠어요."),
          A("죄송해요… 다음엔 진짜 잘할 수 있어요."),
          N(BOK, "급할 때 도와줘서 고마워요. 김밥 두 줄 가져가요."),
          R("김밥 두 줄을 챙겨 회사로. 하루는 아직 길어요."),
        ],
      },
      next: "15:00, 대회의실에서 팀 워크숍 낱말 대회가 열려요. 마이크를 잡은 마 팀장님이 둘을 부르는데…",
    },
    words: {
      key: "words", no: 2, time: "15:00", place: "본관 대회의실", title: "말해 봐 맞혀 봐", page: "words",
      logline: "오후 팀 워크숍 낱말 대회! 금지어를 피해 설명하고, 동기의 설명으로 정답을 맞혀요.",
      facts: ["3분", "번갈아 설명 · 맞히기"],
      palette: { accent: "#8b5cf6", glow: "#c4b5fd", strong: "#6d28d9", soft: "#f5f3ff", deep: "#2e1065", ink: "#4c1d95", sky: ["#f1ebff", "#d8cbff"] },
      bestLabel: "최고 점수", best: (n) => `${nf(n)}점`,
      goal: "3분 동안 하나라도 맞히기",
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 16 ? "great" : "ok"),
      prologue: [
        R("15:00, 대회의실. 점심을 먹고 나니 졸음이 몰려오는 시간이에요."),
        N(MA, "자, 졸지 말고! 팀 워크숍 낱말 대회 시작할게요. 다음 팀, {a}님 {b}님 나와요~"),
        B("점심에 분식집 일까지 하고 왔는데 또 대회예요?"),
        N(MA, "설명할 때 금지어를 쓰면 안 돼요. 1등 팀에게는 아주 쓸모 있는 상품을 드려요!"),
        A("상품이 뭔데요?"),
        N(MA, "그건 끝나고 공개! 3분 드릴게요. 시작!"),
      ],
      epilogue: {
        great: [
          N(MA, "와, 눈빛만 봐도 통하네! 오늘의 1등 팀이에요!"),
          N(MA, "상품은… 짜잔, 야광 손전등 키링 두 개!"),
          A("이걸… 어디에 쓰죠?"),
          B("일단 가방에 달아 둘게요. 혹시 모르니까요."),
          N(MA, "아 참, 둘이 손발이 잘 맞으니까 오늘 보고서도 같이 부탁해요~"),
        ],
        ok: [
          N(MA, "좋아요, 좋아! 둘이 꽤 잘 통하는데요?"),
          N(MA, "참가상으로 야광 손전등 키링 드려요. 어두우면 반짝반짝!"),
          B("회사에서 손전등 쓸 일이 있을까요?"),
          N(MA, "그리고 오늘까지 내야 하는 보고서, 둘이 같이 마무리해 줘요~"),
        ],
        fail: [
          N(MA, "아쉽다! 그래도 나와 줘서 고마워요. 다 같이 박수!"),
          A("금지어가 자꾸 입에서 먼저 나와요…"),
          N(MA, "참가상 야광 손전등 키링! 그리고 보고서는 오늘까지예요~"),
          B("상품보다 숙제가 더 크네요."),
        ],
      },
      next: "22:00, 보고서를 다 끝낸 순간 사무실 문이 철컥 잠겨요. 새 보안 시스템이 말썽이에요.",
    },
    overtime: {
      key: "overtime", no: 3, time: "22:00", place: "7층 사무실", title: "야근 사무실 탈출", page: "escape",
      logline: "보고서를 끝내자 새 보안 시스템이 문을 잠갔어요. 유리 벽 너머 동기와 단서를 맞춰 20분 안에 탈출!",
      facts: ["20분", "단서 나누기"],
      palette: { accent: "#38bdf8", glow: "#7dd3fc", strong: "#1d4ed8", soft: "#eff6ff", deep: "#0b1220", ink: "#1e3a8a", sky: ["#16233d", "#0b1220"] },
      bestLabel: "가장 빠른 탈출", best: (n) => mmss(n),
      goal: "20분 안에 둘이 같이 나가기",
      tier: (r) => (!cleared(r) ? "fail" : r.recordSec != null && Number(r.recordSec) <= 600 ? "great" : "ok"),
      prologue: [
        R("22:00, 7층 사무실. 마 팀장님이 부탁한 보고서를 드디어 다 끝냈어요."),
        B("저장 완료! {a}님, 이제 퇴근해요!"),
        R("삐빅— 「보안 시험 중」 소리와 함께 문이 모두 잠겼어요. 둘 사이엔 유리 벽까지 내려왔어요."),
        A("{b}님, 들려요? 이쪽 문도 안 열려요!"),
        N(MUN, "(인터폰) 아이고, 새 시스템이 아직 말을 안 들어요. 자물쇠마다 단서가 있으니 서로 알려 주면서 풀어 봐요!"),
        N(MUN, "마지막 출입문은 사원증 두 장을 같이 대야 열려요."),
        B("점심에 받은 김밥이 있어서 다행이에요. 힘내서 나가요!"),
      ],
      epilogue: {
        great: [
          R("출입문이 스르륵 열렸어요. 엄청 빠른 기록이에요!"),
          N(MUN, "벌써요? 새 시스템보다 둘이 더 똑똑하네요!"),
          A("김밥 먹을 시간까지 남았어요."),
          B("주차장 가면서 먹어요. 이제 진짜 퇴근!"),
        ],
        ok: [
          R("삐빅— 드디어 출입문이 열렸어요!"),
          N(MUN, "고생했어요! 시스템은 내일 다시 손볼게요."),
          B("김밥 한 줄씩 들고 퇴근해요."),
          R("둘은 엘리베이터를 타고 지하주차장으로 내려갔어요."),
        ],
        fail: [
          R("결국 문 반장님이 비상 열쇠를 들고 올라와 문을 열어 줬어요."),
          N(MUN, "미안해요, 내 시스템 탓이에요. 둘 다 정말 잘했어요!"),
          A("다음엔 꼭 우리 힘으로 열어요."),
          B("좋아요. 일단은… 퇴근!"),
        ],
      },
      next: "23:30, 지하주차장에 내려서자마자 불이 탁 꺼져요. 정전이에요!",
    },
    parking: {
      key: "parking", no: 4, time: "23:30", place: "지하주차장", title: "깜깜한 주차장", page: "maze",
      logline: "퇴근길 지하주차장이 정전됐어요. 한 명은 관리실 CCTV로, 한 명은 손전등 키링을 들고 차를 찾아요.",
      facts: ["3분", "CCTV · 손전등"],
      palette: { accent: "#facc15", glow: "#fde047", strong: "#a16207", soft: "#fefce8", deep: "#020617", ink: "#713f12", sky: ["#0d1426", "#020617"] },
      bestLabel: "최고 기록", best: (n) => `${nf(n)}층`,
      goal: "3분 동안 한 층이라도 빠져나가기",
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 3 ? "great" : "ok"),
      prologue: [
        R("23:30, 지하주차장. 엘리베이터 문이 열리자마자 불이 탁 꺼졌어요."),
        A("정전이에요? 아무것도 안 보여요!"),
        B("잠깐만요… 낮에 받은 야광 손전등 키링!"),
        N(MUN, "관리실 CCTV는 비상 전원으로 켜져 있어요. 한 명은 여기 와서 길을 봐 줘요!"),
        A("그럼 한 명은 CCTV, 한 명은 손전등. 층마다 바꿔 가요."),
        R("떨어뜨린 차 키를 줍고 차까지! 3분 안에 몇 층이나 빠져나갈까요?"),
      ],
      epilogue: {
        great: [
          R("마지막 층을 빠져나오자 불이 환하게 다시 들어왔어요."),
          N(MUN, "둘이 진짜 한 팀이네! 오늘 하루 고생 많았어요."),
          B("점심엔 분식집, 오후엔 대회, 밤엔 탈출… 무슨 하루가 이래요?"),
          A("그래도 둘이라 재밌었어요. 내일 점심은 오복분식 어때요?"),
          R("출구 앞, 불 켜진 오복분식에서 복순 사장님이 손을 흔들었어요. 「내일은 손님으로 와요!」"),
        ],
        ok: [
          R("출구 표시등이 보이고, 비상등이 하나둘 켜졌어요."),
          N(MUN, "무사히 나왔네요! 손전등 키링이 큰일 했어요."),
          A("마 팀장님께 고맙다고 해야겠어요."),
          B("내일 점심은 오복분식 어때요? 이번엔 손님으로요."),
        ],
        fail: [
          R("잠시 뒤 비상 전원이 들어와 주차장이 환해졌어요."),
          N(MUN, "괜찮아요. 둘 다 무사하면 됐어요."),
          B("차는 못 찾았지만… 김밥은 아직 남았어요."),
          A("주차장에서 먹는 김밥, 의외로 맛있네요. 내일 점심도 같이 먹어요."),
        ],
      },
      next: "긴 하루 끝! 다른 동료와 처음부터 다시 하거나, 대전으로 한 판 겨뤄 봐요.",
    },
  };
  const order = ["lunch", "words", "overtime", "parking"];

  // ── 번외편 — 본편 2화(15:00)와 3화(22:00) 사이, 같은 하루의 짧은 이야기. 본편 order 밖 ─────────────
  //    tier 기준은 엔진 점수에 맞춘다 — 통하는 사이: 30점 만점 통함 지수 ·
  //    그림 퀴즈: 정답 2점 + 이어 맞히기 덤 · 틀린 그림: 찾은 곳 1점 + 사진 한 장 다 찾으면 3점.
  //    성공한 판(cleared — 점수 > 0, 시리즈 「성공」에 세는 판)은 fail 로 두지 않는다 — 점수가 낮아도 ok, 높으면 great
  const extraChapters = {
    sync: {
      key: "sync", no: "번외 1", extra: 1, back: "overtime", time: "16:40", place: "7층 탕비실", title: "통하는 사이", page: "sync",
      logline: "워크숍 뒤 커피 한 잔. 사내 소식지 새 코너에 불려 나간 둘, 같은 질문에 몰래 답하고 서로의 답을 맞혀요.",
      facts: ["5분 · 10문제", "몰래 고르고 함께 공개"],
      palette: { accent: "#65a30d", glow: "#bef264", strong: "#4d7c0f", soft: "#f7fee7", deep: "#1a2e05", ink: "#365314", sky: ["#f7fee7", "#d9f99d"] },
      bestLabel: "최고 통함", best: (n) => `${nf(n)}점 · ${Math.round((Number(n || 0) * 100) / 30)}%`,
      goal: "5분 동안 한 번이라도 통하기",
      // 통함 지수(점수 ÷ 30) 70% 이상(21점) great · 한 번이라도 통했으면(점수 > 0 — 시리즈 「성공」) ok · 0점이면 fail
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 21 ? "great" : "ok"),
      prologue: [
        R("16:40, 7층 탕비실. 워크숍을 마치고 커피를 내리는데 마 팀장님이 따라 들어왔어요."),
        N(MA, "마침 잘 만났다! 사내 소식지 새 코너 「우리 동기, 얼마나 통하나」 첫 손님이 돼 줘요."),
        A("저희 입사 동기긴 한데… 서로 커피 취향도 잘 몰라요."),
        N(MA, "그러니까 재밌죠! 같은 질문에 몰래 답하고, 동기가 뭘 골랐을지도 맞혀 봐요."),
        N(BOK, "(배달 가방을 들고) 점심 고마워서 떡꼬치 가져왔어요! 허리는 파스 붙이고 멀쩡해요~"),
        B("떡꼬치 먹으면서 하면 답이 더 잘 보일 것 같아요."),
        R("서류철로 칸막이를 세우고 마주 앉았어요. 5분 동안 10문제, 시작!"),
      ],
      epilogue: {
        great: [
          N(MA, "통함 지수 좀 봐요! 이번 호 표지는 두 분이에요."),
          A("표지요? 그럼 사진은 잘 나와야 하는데…"),
          N(BOK, "점심때 손발 맞는 거 보고 알아봤지! 떡꼬치 하나씩 더 먹어요."),
          B("{a}님, 우리 고르는 게 은근히 비슷하네요."),
          N(MA, "그 호흡이면 보고서도 금방이겠네요. 오늘까지인 거 알죠?~"),
        ],
        ok: [
          N(MA, "꽤 통하는데요? 다음 호에 작게 실을게요. 사진은 잘 나왔어요!"),
          B("{a}님 답, 반은 맞히고 반은 놀랐어요."),
          A("저도요. 그래도 오늘 {b}님을 꽤 알게 됐어요."),
          N(MA, "자, 커피 다 마셨으면 보고서! 오늘까지예요~"),
        ],
        fail: [
          N(MA, "아직 서로 알아 갈 게 많네요. 다음 달에 다시 도전!"),
          A("{b}님, 아까 그거 진짜 그렇게 골랐어요?"),
          B("저도 {a}님 답 보고 깜짝 놀랐어요."),
          N(BOK, "괜찮아요. 우리 가게 단골들도 떡볶이 맵기는 다 달라요!"),
          R("둘은 남은 떡꼬치를 하나씩 들고 자리로 돌아갔어요. 보고서가 기다려요."),
        ],
      },
      next: "커피 힘으로 보고서를 붙잡은 지 몇 시간째, 22:00. 저장을 누르자마자 사무실 문이 철컥 잠겨요.",
    },
    sketch: {
      key: "sketch", no: "번외 2", extra: 2, back: "overtime", time: "17:40", place: "본관 소회의실", title: "화이트보드 그림 퀴즈", page: "sketch",
      logline: "보고서 회의를 하러 간 소회의실. 마 팀장님이 신입 교육에 쓸 그림 퀴즈를 먼저 풀어 달래요. 글자는 쓰면 반칙!",
      facts: ["3분", "번갈아 그리기 · 맞히기"],
      palette: { accent: "#0d9488", glow: "#5eead4", strong: "#0f766e", soft: "#f0fdfa", deep: "#042f2e", ink: "#134e4a", sky: ["#ecfeff", "#ccfbf1"] },
      bestLabel: "최고 점수", best: (n) => `${nf(n)}점`,
      goal: "3분 동안 하나라도 맞히기",
      // 하나라도 맞히면 ok · 20점(이어 맞히기로 6~7개쯤) 넘게 모으면 great
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 20 ? "great" : "ok"),
      prologue: [
        R("17:40, 본관 소회의실. 보고서 순서를 정하려고 화이트보드 앞에 섰어요."),
        N(MA, "아, 여기 있었네! 이 그림 뭐로 보여요? 내일 신입 교육 퀴즈에 넣을 거예요."),
        A("음… 감자요?"),
        N(MA, "고양이예요! …그러니까 둘이 좀 그려 줘요. 한 명이 그리고 한 명이 맞히기. 글자는 쓰면 반칙!"),
        N(MUN, "(문틈으로) 6시엔 보안 시험 준비로 회의실을 먼저 잠가요. 그 전에 끝내 줘요~"),
        B("보고서 회의는요…?"),
        R("보고서는 잠깐 미뤄 두고 보드마커 뚜껑을 열었어요. 3분 시작!"),
      ],
      epilogue: {
        great: [
          N(MA, "와, 하나도 안 헷갈려요! 이 그림 그대로 신입 교육에 쓸게요."),
          A("글자 없이도 이렇게 통하네요."),
          N(MA, "내 고양이는… 빼는 게 낫겠죠?"),
          B("감자 칸에 넣으면 딱이에요."),
          N(MUN, "6시예요~ 불 끕니다! 둘 다 고생했어요."),
        ],
        ok: [
          N(MA, "이건… 고양이죠?"),
          A("의자예요."),
          N(MA, "좋아요, 그래도 내 고양이보다는 잘 보여요. 통과!"),
          N(MUN, "6시예요~ 불 끕니다!"),
        ],
        fail: [
          R("보드에 남은 건 알 수 없는 동그라미들뿐이에요."),
          A("이건… 우리 둘만 본 걸로 해요."),
          B("지우개로 쓱! 아무도 못 봤어요."),
          N(MA, "괜찮아요, 내 고양이보다는 훨씬 나았어요!"),
          N(MUN, "6시예요~ 불 끕니다!"),
        ],
      },
      next: "회의실 불이 꺼지고 보고서는 7층 자리에서 마저. 그리고 22:00, 저장을 누르자마자 문이 철컥 잠겨요.",
    },
    spotdiff: {
      key: "spotdiff", no: "번외 3", extra: 3, back: "overtime", time: "21:30", place: "7층 사무실", title: "틀린 그림 찾기", page: "spotdiff",
      logline: "보고서 마지막 장만 남은 밤. 보안 시스템이 아침에 찍은 사진과 지금이 달라요. 한 장씩 나눠 보고 바뀐 곳을 찾아요.",
      facts: ["3분", "서로 다른 사진"],
      palette: { accent: "#e11d48", glow: "#fda4af", strong: "#be123c", soft: "#fff1f2", deep: "#4c0519", ink: "#881337", sky: ["#fff1f2", "#fecdd3"] },
      bestLabel: "최고 점수", best: (n) => `${nf(n)}점`,
      goal: "3분 동안 다른 곳 하나라도 찾기",
      // 세 장(24점)을 다 찾으면 great · 한 곳이라도 찾았으면(점수 > 0 — 시리즈 「성공」) ok · 하나도 못 찾으면 fail
      tier: (r) => (!cleared(r) ? "fail" : Number(r.score) >= 24 ? "great" : "ok"),
      prologue: [
        R("21:30, 7층 사무실. 보고서는 마지막 장만 남았어요."),
        N(MUN, "아직 있었네요? 10시에 새 보안 시스템을 켜는데, 아침에 찍은 사진이랑 지금이 다르면 경보가 울린대요."),
        A("그럼 바뀐 곳을 찾아서 아침처럼 돌려놓으면 되겠네요."),
        N(MUN, "내 눈엔 다 똑같아 보여요… 둘이 사진을 한 장씩 보고 말로 맞춰 봐 줄래요?"),
        B("{a}님, 시계부터 봐요. 몇 시예요?"),
        R("아무 데나 누르면 시간이 줄어요. 3분 시작!"),
      ],
      epilogue: {
        great: [
          N(MUN, "벌써 다 찾았어요? 둘 눈썰미면 보안 시스템이 필요 없겠어요!"),
          A("그럼 오늘 밤 시험은 안 해도 되죠?"),
          N(MUN, "그건… 해야죠. 10시 전에는 꼭 나가요!"),
          N(MA, "(메신저) 아, 그 머그컵 내가 옮긴 거예요~ 보고서는 잘 돼 가요?"),
          B("범인은 팀장님이었어요…"),
        ],
        ok: [
          N(MUN, "덕분에 바뀐 데를 알았어요. 나머지는 내가 돌려놓을게요."),
          B("머그컵이 왜 탕비실에서 회의실까지 갔을까요?"),
          N(MA, "(메신저) 그거 나예요~"),
          A("일단 보고서부터 끝내요. 10시 전에!"),
        ],
        fail: [
          N(MUN, "괜찮아요, 나는 한 곳도 못 찾았는걸요."),
          A("사진이 한 장씩이라 더 헷갈렸어요."),
          N(MUN, "경보는 내가 잘 달래 볼게요. 10시 전에는 꼭 나가요!"),
          B("네! 보고서 마지막 장만 쓰고요."),
        ],
      },
      next: "「마지막 장만」은 30분이 걸렸어요. 22:00, 저장을 누른 순간 삐빅— 문이 모두 잠겨요.",
    },
  };
  const extras = ["sync", "sketch", "spotdiff"];
  const extrasInfo = { title: "번외편", tagline: "본편 사이사이, 같은 하루에 있었던 짧은 이야기" };
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null);

  // 본편 · 번외편 모두에서 찾는다
  const chapter = (key) => own(chapters, key) || own(extraChapters, key);
  const isExtra = (key) => !!own(extraChapters, key);
  const label = (key) => { const c = chapter(key); return c ? `${c.no}화` : ""; };
  // 끝 이야기 갈래 — 화마다 정한 기준(chapter(key).tier), 없으면 성공 → ok · 그 밖 → fail
  function tier(key, room) {
    const c = chapter(key);
    let t = null;
    try { t = c && c.tier ? c.tier(room || {}) : null; } catch (_) { t = null; }
    return KIND[t] && t !== "prologue" ? t : cleared(room) ? "ok" : "fail";
  }
  // 본편은 order 순서대로. 번외편은 앞 화 없음(null) · 뒤 화는 이어지는 본편 화(back)
  const prev = (key) => { const i = order.indexOf(key); return i > 0 ? chapters[order[i - 1]] : null; };
  const next = (key) => {
    const x = own(extraChapters, key);
    if (x) return own(chapters, x.back);
    const i = order.indexOf(key); return i >= 0 && i < order.length - 1 ? chapters[order[i + 1]] : null;
  };
  function vars(key) {
    const c = chapter(key);
    if (!c) return "";
    const p = c.palette;
    return `--ch-accent:${p.accent};--ch-glow:${p.glow};--ch-strong:${p.strong};--ch-soft:${p.soft};--ch-deep:${p.deep};--ch-ink:${p.ink};--ch-sky1:${p.sky[0]};--ch-sky2:${p.sky[1]}`;
  }

  // ── 그림 — 납작한 그림(SVG). 640×320 판에 그리고, 칸에 맞춰 가운데를 꽉 채운다 ─────────────
  //    넓은 칸(16:6 쯤)에서는 위아래가 50쯤씩 잘리므로 글자 · 중요한 것은 y 50~270 안에 둔다
  let uid = 0;
  const r1 = (n) => Math.round(n * 10) / 10;
  // 사람 실루엣 — x 가운데, base 바닥, s 크기
  function person(x, base, c, s = 1, extra = "") {
    const w = 34 * s, sh = base - 60 * s;
    return `<g fill="${c}"><circle cx="${r1(x)}" cy="${r1(base - 81 * s)}" r="${r1(17 * s)}"/><path d="M${r1(x - w)} ${base}V${r1(base - 36 * s)}Q${r1(x - w)} ${r1(sh)} ${r1(x)} ${r1(sh)}Q${r1(x + w)} ${r1(sh)} ${r1(x + w)} ${r1(base - 36 * s)}V${base}Z"/>${extra}</g>`;
  }
  const SCENES = {
    lunch(u) {
      const scallop = `M166 130${"a19.75 19.75 0 0 0 39.5 0".repeat(8)}V128H166Z`;
      const roll = (x) => `<circle cx="${x}" cy="203" r="9" fill="#1f2937"/><circle cx="${x}" cy="203" r="6" fill="#fef9c3"/><circle cx="${x - 2}" cy="202" r="1.8" fill="#ef4444"/><circle cx="${x + 2}" cy="205" r="1.8" fill="#16a34a"/>`;
      const apron = (x) => `<path d="M${x - 13} 276h26v44h-26z" fill="#fff7ed" opacity=".9"/>`;
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4dc"/><stop offset="1" stop-color="#ffd2a1"/></linearGradient>
          <pattern id="${u}w" width="26" height="30" patternUnits="userSpaceOnUse"><rect x="7" y="8" width="12" height="14" rx="2" fill="#fff6e8"/></pattern>
          <pattern id="${u}a" width="40" height="40" patternUnits="userSpaceOnUse" x="166"><rect width="20" height="40" fill="#f97316"/><rect x="20" width="20" height="40" fill="#fff7ed"/></pattern></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <circle cx="566" cy="66" r="46" fill="#fde68a" opacity=".5"/><circle cx="566" cy="66" r="27" fill="#fcd34d"/>
        <rect x="22" y="28" width="134" height="252" fill="#f4c495"/><rect x="22" y="28" width="134" height="252" fill="url(#${u}w)"/>
        <rect x="498" y="124" width="124" height="156" fill="#f0b985"/><rect x="498" y="124" width="124" height="156" fill="url(#${u}w)"/>
        <rect x="176" y="120" width="296" height="160" fill="#fff7ed"/>
        <rect x="166" y="96" width="316" height="34" fill="url(#${u}a)"/><path d="${scallop}" fill="url(#${u}a)"/>
        <rect x="248" y="54" width="152" height="36" rx="10" fill="#7c2d12"/><text x="324" y="79" text-anchor="middle" font-size="19" font-weight="800" fill="#fde68a">오복분식</text>
        <rect x="198" y="160" width="252" height="62" rx="8" fill="#fed7aa"/>
        <path d="M252 178c-6-8 6-12 0-20M266 176c-6-8 6-12 0-20M280 178c-6-8 6-12 0-20" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".95"/>
        <path d="M236 190h56v20a8 8 0 0 1-8 8h-40a8 8 0 0 1-8-8z" fill="#dc2626"/><rect x="232" y="185" width="64" height="8" rx="4" fill="#b91c1c"/>
        <ellipse cx="384" cy="211" rx="48" ry="8" fill="#fff"/>${roll(356)}${roll(375)}${roll(394)}${roll(413)}
        <rect y="276" width="640" height="44" fill="#e7ad79"/><rect y="276" width="640" height="5" fill="#d4945c"/>
        ${person(540, 320, "#c2410c", 0.78, "")}${person(582, 320, "#c2410c", 0.74, "")}${person(622, 320, "#c2410c", 0.7, "")}
        ${person(262, 320, "#7c2d12", 1, apron(262))}${person(380, 320, "#7c2d12", 1, apron(380))}
        <rect x="244" y="226" width="36" height="7" rx="3.5" fill="#fff7ed"/>`;
    },
    words(u) {
      const confetti = [[96, 70, "#f472b6", 20], [140, 120, "#facc15", -25], [470, 90, "#34d399", 35], [520, 60, "#60a5fa", -15], [440, 160, "#f472b6", 10], [200, 92, "#60a5fa", 40], [586, 200, "#facc15", -30], [60, 170, "#34d399", 15]]
        .map(([x, y, c, a]) => `<rect x="${x}" y="${y}" width="9" height="5" rx="1.5" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join("");
      const heads = Array.from({ length: 12 }, (_, i) => `<circle cx="${18 + i * 55}" cy="316" r="24"/>`).join("");
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1ebff"/><stop offset="1" stop-color="#d8cbff"/></linearGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect x="514" y="34" width="104" height="150" rx="4" fill="#fffbeb"/><path d="M566 34v150M514 109h104" stroke="#e9d5ff" stroke-width="5"/>
        <polygon points="514,60 618,60 470,320 300,320" fill="#fff8d6" opacity=".35"/>
        <polygon points="140,0 186,0 292,236 112,236" fill="#fff7c2" opacity=".32"/><polygon points="454,0 500,0 528,236 352,236" fill="#fff7c2" opacity=".26"/>
        <rect x="170" y="50" width="300" height="36" rx="18" fill="#4c1d95"/><text x="320" y="74" text-anchor="middle" font-size="17" font-weight="800" fill="#f5f3ff">팀 워크숍 낱말 대회</text>
        <rect x="226" y="96" width="188" height="96" rx="12" fill="#1e1b4b"/><text x="320" y="152" text-anchor="middle" font-size="44" font-weight="900" fill="#c4b5fd">?</text>
        <g fill="#fecaca"><rect x="252" y="164" width="36" height="14" rx="7"/><rect x="302" y="164" width="36" height="14" rx="7"/><rect x="352" y="164" width="36" height="14" rx="7"/></g>
        <path d="M262 171h16M312 171h16M362 171h16" stroke="#b91c1c" stroke-width="2.5" stroke-linecap="round"/>
        ${confetti}
        <rect y="232" width="640" height="16" fill="#7c3aed"/><rect y="248" width="640" height="72" fill="#5b21b6"/>
        ${person(146, 248, "#3b0764", 0.92, `<rect x="168" y="190" width="6" height="22" rx="3"/><circle cx="171" cy="186" r="7" fill="#a78bfa"/>`)}
        ${person(446, 248, "#312e81", 0.9)}${person(512, 248, "#312e81", 0.9)}
        <rect x="408" y="198" width="144" height="38" rx="6" fill="#4c1d95"/><rect x="408" y="198" width="144" height="7" rx="3.5" fill="#6d28d9"/>
        <circle cx="446" cy="196" r="7" fill="#ef4444"/><circle cx="512" cy="196" r="7" fill="#22c55e"/>
        <g fill="#2e1065" opacity=".92">${heads}</g>`;
    },
    overtime(u) {
      const lit = [[52, 150], [66, 150], [100, 120], [114, 134], [170, 160], [184, 146], [232, 132], [246, 160], [290, 150], [128, 170]]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="7" height="8" fill="#fde68a" opacity=".85"/>`).join("");
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16233d"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
          <radialGradient id="${u}g"><stop offset="0" stop-color="#60a5fa" stop-opacity=".55"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></radialGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect x="26" y="34" width="300" height="176" rx="4" fill="#0f2346"/>
        <circle cx="284" cy="72" r="17" fill="#e2e8f0"/><circle cx="292" cy="66" r="15" fill="#0f2346"/>
        <path d="M26 210V150h30v-24h34v40h26v-60h44v74h30v-34h40v-20h38v44h30v-26h28v66z" fill="#0a1730"/>${lit}
        <rect x="26" y="34" width="300" height="176" rx="4" fill="none" stroke="#334155" stroke-width="6"/><path d="M176 34v176" stroke="#334155" stroke-width="5"/>
        <circle cx="370" cy="64" r="22" fill="#e2e8f0"/><path d="M370 64V48M370 64l-12-7" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="176" cy="196" rx="96" ry="54" fill="url(#${u}g)"/>
        <rect x="128" y="166" width="96" height="58" rx="6" fill="#1e3a8a"/><rect x="134" y="172" width="84" height="46" rx="3" fill="#60a5fa" opacity=".55"/><rect x="170" y="224" width="12" height="8" fill="#334155"/>
        <rect x="40" y="230" width="272" height="10" rx="3" fill="#334155"/><rect x="56" y="240" width="8" height="40" fill="#1e293b"/><rect x="288" y="240" width="8" height="40" fill="#1e293b"/>
        <rect x="470" y="80" width="118" height="200" rx="4" fill="#1e293b" stroke="#334155" stroke-width="4"/><rect x="574" y="176" width="6" height="22" rx="3" fill="#475569"/>
        <rect x="498" y="58" width="62" height="10" rx="5" fill="#ef4444"/><rect x="490" y="54" width="78" height="18" rx="9" fill="#ef4444" opacity=".25"/>
        <circle cx="529" cy="150" r="17" fill="#ef4444"/><circle cx="529" cy="146" r="4.5" fill="#fff"/><rect x="527" y="148" width="4" height="10" rx="1.5" fill="#fff"/>
        <rect y="280" width="640" height="40" fill="#0a0f1c"/>
        <rect x="404" y="0" width="12" height="320" fill="#93c5fd" opacity=".2"/><path d="M410 0v320" stroke="#bfdbfe" stroke-width="1.5" opacity=".45"/>
        ${person(346, 320, "#475569", 1, `<rect x="338" y="282" width="16" height="11" rx="2" fill="#38bdf8"/><path d="M341 262l5 20l5-20" stroke="#38bdf8" stroke-width="2" fill="none"/>`)}
        ${person(476, 320, "#475569", 1, `<rect x="468" y="282" width="16" height="11" rx="2" fill="#38bdf8"/><path d="M471 262l5 20l5-20" stroke="#38bdf8" stroke-width="2" fill="none"/>`)}`;
    },
    parking(u) {
      const car = (x, y, c) => `<g fill="${c}"><rect x="${x + 28}" y="${y - 26}" width="92" height="36" rx="14"/><rect x="${x}" y="${y}" width="150" height="44" rx="14"/></g><g fill="#020617"><circle cx="${x + 34}" cy="${y + 44}" r="13"/><circle cx="${x + 116}" cy="${y + 44}" r="13"/></g>`;
      const lines = [40, 160, 470, 590].map((x) => `<rect x="${x}" y="272" width="4" height="40" fill="#ca8a04" opacity=".45"/>`).join("");
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1426"/><stop offset="1" stop-color="#020617"/></linearGradient>
          <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde047" stop-opacity=".8"/><stop offset="1" stop-color="#fde047" stop-opacity="0"/></linearGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect width="640" height="26" fill="#0b1224"/><g fill="#1e293b"><rect x="70" y="10" width="60" height="6" rx="3"/><rect x="330" y="10" width="60" height="6" rx="3"/></g>
        <rect x="110" y="44" width="134" height="98" rx="8" fill="#052e2b" stroke="#134e4a" stroke-width="3"/>
        <g fill="#10b981" opacity=".6"><rect x="120" y="56" width="38" height="26" rx="3"/><rect x="163" y="56" width="38" height="26" rx="3"/><rect x="120" y="88" width="38" height="26" rx="3"/><rect x="163" y="88" width="38" height="26" rx="3"/></g>
        ${person(224, 142, "#022c22", 0.55)}
        <text x="177" y="164" text-anchor="middle" font-size="13" font-weight="800" fill="#6ee7b7">관리실</text>
        <rect x="492" y="30" width="36" height="15" rx="4" fill="#334155"/><path d="M518 26v6" stroke="#334155" stroke-width="4"/><circle cx="498" cy="37.5" r="3.2" fill="#ef4444"/>
        <rect x="330" y="50" width="80" height="26" rx="4" fill="#15803d"/><text x="370" y="68" text-anchor="middle" font-size="14" font-weight="800" fill="#dcfce7">출구 ›</text>
        <rect x="250" y="26" width="36" height="246" fill="#111a2e"/><rect x="250" y="112" width="36" height="22" fill="#ca8a04"/><text x="268" y="128" text-anchor="middle" font-size="12" font-weight="900" fill="#111827">B2</text>
        <rect x="560" y="26" width="34" height="246" fill="#111a2e"/><rect x="560" y="112" width="34" height="22" fill="#ca8a04"/><text x="577" y="128" text-anchor="middle" font-size="12" font-weight="900" fill="#111827">B2</text>
        <rect y="266" width="640" height="54" fill="#0b1120"/>${lines}
        ${car(300, 218, "#162036")}${car(470, 218, "#0f172a")}
        <polygon points="214,238 480,168 480,312" fill="url(#${u}b)"/>
        <g stroke="#fde047" stroke-width="3" fill="none"><circle cx="372" cy="262" r="6"/><path d="M378 262h14M386 262v6M391 262v5"/></g>
        ${person(190, 320, "#1e293b", 1)}
        <rect x="204" y="232" width="15" height="9" rx="2" fill="#fde047"/><circle cx="216" cy="236" r="9" fill="#fde047" opacity=".35"/>`;
    },

    // ── 번외편 그림 ──
    // 번외 1 — 16:40 탕비실. 서류철 칸막이 너머로 둘이 같은 답(커피잔) 카드를 번쩍
    sync(u) {
      const skewer = (x, y, a) => `<g transform="rotate(${a} ${x} ${y})"><path d="M${x} ${y}h46" stroke="#a16207" stroke-width="2.5" stroke-linecap="round"/>${[9, 20, 31].map((d) => `<rect x="${x + d}" y="${y - 4.5}" width="10" height="9" rx="4" fill="#dc2626"/>`).join("")}</g>`;
      const cup = (x, y) => `<path d="M${x - 12} ${y - 6}h20v11a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7z" fill="#4d7c0f"/><path d="M${x + 8} ${y - 3}a5 5 0 0 1 0 10" stroke="#4d7c0f" stroke-width="3" fill="none"/>
          <path d="M${x - 6} ${y - 11}q-3-4 0-8M${x + 1} ${y - 11}q-3-4 0-8" stroke="#84cc16" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
      // 두 손으로 들어 올린 답 카드 — 팔은 사람 색
      const card = (x, c) => `<path d="M${x - 30} 262L${x - 24} 174M${x + 30} 262L${x + 24} 174" stroke="${c}" stroke-width="10" stroke-linecap="round"/>
          <rect x="${x - 34}" y="122" width="68" height="54" rx="8" fill="#fff" stroke="#bef264" stroke-width="3"/>${cup(x, 152)}`;
      const mug = (x) => `<rect x="${x}" y="244" width="19" height="18" rx="4" fill="#fff"/><path d="M${x + 19} 248a5 5 0 0 1 0 9" stroke="#fff" stroke-width="3" fill="none"/>
          <path d="M${x + 6} 238q-4-5 0-10M${x + 13} 238q-4-5 0-10" stroke="#65a30d" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7fee7"/><stop offset="1" stop-color="#d9f99d"/></linearGradient>
          <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#fff7d6"/></linearGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect x="24" y="36" width="122" height="176" rx="4" fill="url(#${u}w)"/><circle cx="64" cy="168" r="30" fill="#fbbf24" opacity=".35"/><circle cx="64" cy="168" r="18" fill="#fbbf24" opacity=".85"/>
        <path d="M24 212v-30h20v-18h24v26h18v-40h26v30h16v-12h18v44z" fill="#65a30d" opacity=".35"/>
        <rect x="24" y="36" width="122" height="176" rx="4" fill="none" stroke="#bef264" stroke-width="6"/><path d="M85 36v176M24 122h122" stroke="#bef264" stroke-width="4"/>
        <polygon points="146,72 146,212 330,262 236,262" fill="#fef9c3" opacity=".45"/>
        <rect x="182" y="58" width="276" height="34" rx="17" fill="#365314"/><text x="320" y="81" text-anchor="middle" font-size="16" font-weight="800" fill="#ecfccb">우리 동기, 얼마나 통하나?</text>
        <rect x="484" y="38" width="138" height="52" rx="4" fill="#ecfccb" stroke="#bef264" stroke-width="2"/><path d="M553 38v52" stroke="#bef264" stroke-width="2"/><g fill="#65a30d"><rect x="540" y="58" width="4" height="14" rx="2"/><rect x="562" y="58" width="4" height="14" rx="2"/></g>
        <rect x="496" y="114" width="54" height="68" rx="7" fill="#1a2e05"/><rect x="504" y="122" width="38" height="13" rx="3" fill="#84cc16"/><rect x="517" y="142" width="12" height="8" rx="2" fill="#365314"/>
        <rect x="514" y="164" width="18" height="16" rx="3" fill="#fff"/><path d="M523 151v9" stroke="#a16207" stroke-width="2" stroke-dasharray="3 3"/>
        <g fill="#4d7c0f"><ellipse cx="588" cy="148" rx="7" ry="15" transform="rotate(-24 588 148)"/><ellipse cx="604" cy="144" rx="7" ry="16" transform="rotate(18 604 144)"/><ellipse cx="596" cy="140" rx="6" ry="17"/></g>
        <path d="M584 160h24l-3 22h-18z" fill="#ea580c"/>
        <rect x="470" y="182" width="170" height="10" rx="3" fill="#4d7c0f"/><rect x="476" y="192" width="164" height="90" fill="#a3e635" opacity=".45"/><path d="M558 196v86" stroke="#d9f99d" stroke-width="3"/>
        <g fill="#facc15"><path d="M320 116l5.5 15.5 15.5 5.5-15.5 5.5-5.5 15.5-5.5-15.5-15.5-5.5 15.5-5.5z"/><circle cx="294" cy="120" r="3.5"/><circle cx="348" cy="156" r="3"/></g>
        <path d="M342 114l6-6M298 114l-6-6" stroke="#facc15" stroke-width="3" stroke-linecap="round"/>
        ${person(228, 300, "#365314", 1.1, card(228, "#365314"))}${person(412, 300, "#3f6212", 1.1, card(412, "#3f6212"))}
        <rect x="301" y="198" width="18" height="66" rx="2" fill="#facc15"/><rect x="304" y="212" width="12" height="16" rx="1.5" fill="#fff" opacity=".85"/>
        <rect x="321" y="206" width="18" height="58" rx="2" fill="#a3e635"/><rect x="324" y="218" width="12" height="16" rx="1.5" fill="#fff" opacity=".85"/>
        <rect x="128" y="262" width="384" height="12" rx="5" fill="#4d7c0f"/><rect x="140" y="274" width="360" height="46" fill="#365314"/>
        <ellipse cx="170" cy="262" rx="32" ry="6" fill="#fff"/>${skewer(146, 255, -5)}${skewer(152, 260, 4)}
        ${mug(450)}${mug(478)}`;
    },
    // 번외 2 — 17:40 소회의실. 해 질 녘 창, 화이트보드엔 감자 같은 고양이 · 별 · 우산, 문 위엔 「6시 잠금」 빨간 등
    sketch(u) {
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecfeff"/><stop offset="1" stop-color="#ccfbf1"/></linearGradient>
          <linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset=".55" stop-color="#f9a8d4"/><stop offset="1" stop-color="#fdba74"/></linearGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect x="22" y="38" width="122" height="180" rx="4" fill="url(#${u}d)"/>
        <path d="M22 218v-34h18v-22h22v30h16v-46h26v38h18v-16h22v50z" fill="#1e293b" opacity=".5"/>
        <g fill="#fde68a" opacity=".8"><rect x="88" y="182" width="4" height="5"/><rect x="96" y="192" width="4" height="5"/><rect x="48" y="196" width="4" height="5"/></g>
        <rect x="22" y="38" width="122" height="180" rx="4" fill="none" stroke="#99f6e4" stroke-width="6"/><path d="M83 38v180" stroke="#99f6e4" stroke-width="4"/>
        <rect x="164" y="40" width="312" height="192" rx="6" fill="#94a3b8"/><rect x="172" y="48" width="296" height="176" rx="3" fill="#fff"/>
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M212 156q-12-22 2-40q10-13 28-11q13-8 28 0q24 6 27 30q6 24-11 38q-15 12-38 8q-27 0-36-25z" stroke="#2563eb" stroke-width="4"/>
          <path d="M226 115l4-22 16 15M270 108l14-18 4 24" stroke="#2563eb" stroke-width="4"/>
          <path d="M252 152q4 5 8 0M228 150h-20M228 158l-18 6M282 148h20M282 156l18 6" stroke="#2563eb" stroke-width="2.5"/>
          <path d="M392 66l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z" stroke="#dc2626" stroke-width="4"/>
          <path d="M360 184a34 30 0 0 1 68 0q-8-7-17 0q-9-7-17 0q-9-7-17 0q-9-7-17 0" stroke="#16a34a" stroke-width="4"/><path d="M394 184v20q0 8 8 8" stroke="#16a34a" stroke-width="4"/>
        </g>
        <circle cx="242" cy="138" r="3.5" fill="#2563eb"/><circle cx="270" cy="136" r="3.5" fill="#2563eb"/>
        <rect x="186" y="232" width="268" height="9" rx="3" fill="#64748b"/>
        <rect x="292" y="225" width="28" height="7" rx="3" fill="#2563eb"/><rect x="326" y="225" width="28" height="7" rx="3" fill="#dc2626"/><rect x="360" y="225" width="28" height="7" rx="3" fill="#1f2937"/><rect x="404" y="222" width="30" height="10" rx="2" fill="#334155"/>
        <circle cx="514" cy="88" r="20" fill="#fff" stroke="#134e4a" stroke-width="3"/><path d="M514 88l1.7 9.8M514 88l-13.9 8" stroke="#134e4a" stroke-width="3" stroke-linecap="round"/>
        <rect x="560" y="104" width="72" height="168" rx="3" fill="#115e59"/><rect x="568" y="112" width="56" height="62" rx="2" fill="#5eead4" opacity=".35"/><circle cx="574" cy="194" r="4" fill="#ccfbf1"/>
        <rect x="570" y="84" width="52" height="15" rx="7.5" fill="#ef4444" opacity=".22"/><rect x="576" y="87" width="40" height="9" rx="4.5" fill="#ef4444"/>
        ${person(206, 300, "#042f2e", 1.3, `<path d="M236 240L262 178" stroke="#042f2e" stroke-width="12" stroke-linecap="round"/><rect x="258" y="164" width="9" height="20" rx="3" fill="#2563eb" transform="rotate(24 262 174)"/>`)}
        ${person(456, 300, "#134e4a", 1.1, `<path d="M486 254L500 196" stroke="#134e4a" stroke-width="11" stroke-linecap="round"/><circle cx="501" cy="190" r="8"/>`)}
        <rect x="500" y="140" width="58" height="30" rx="15" fill="#fff"/><path d="M510 166l-4 14 14-10z" fill="#fff"/><text x="529" y="160.5" text-anchor="middle" font-size="15" font-weight="800" fill="#134e4a">감자?</text>
        <rect y="262" width="640" height="10" fill="#0f766e"/><rect y="272" width="640" height="48" fill="#134e4a"/>
        <rect x="70" y="250" width="46" height="12" rx="2" fill="#fff"/><rect x="76" y="245" width="46" height="12" rx="2" fill="#f0fdfa" stroke="#99f6e4"/>`;
    },
    // 번외 3 — 21:30 밤 사무실. 「아침」 · 「지금」 사진 두 장(머그컵 색에 빨간 동그라미), 돋보기, 보안 카메라
    spotdiff(u) {
      // 즉석 사진 한 장 — 가운데 (x, y), 왼쪽 위에 「아침」 · 「지금」 꼬리표(아래 글자는 컷신 제목과 겹쳐서). now 면 지금 사진(머그컵 파랑 · 화분 없음 · 시계 9:30)
      const photo = (x, y, rot, now) => `<g transform="translate(${x} ${y}) rotate(${rot})">
          <rect x="-80" y="-86" width="160" height="172" rx="5" fill="#fff"/><rect x="-72" y="-78" width="144" height="120" fill="#fef3c7"/>
          <rect x="-72" y="12" width="144" height="30" fill="#d6a77a"/><rect x="-72" y="12" width="144" height="4" fill="#b45309" opacity=".35"/>
          <rect x="-32" y="-38" width="56" height="38" rx="3" fill="#334155"/><rect x="-28" y="-34" width="48" height="29" rx="2" fill="#93c5fd"/><rect x="-7" y="0" width="6" height="12" fill="#334155"/>
          <path d="M-22 -26h22M-22 -19h30M-22 -12h16" stroke="#fff" stroke-width="2.5" opacity=".8"/>
          <rect x="36" y="-4" width="17" height="16" rx="3" fill="${now ? "#2563eb" : "#dc2626"}"/><path d="M53 -1a4.5 4.5 0 0 1 0 9" stroke="${now ? "#2563eb" : "#dc2626"}" stroke-width="2.5" fill="none"/>
          ${now ? "" : `<rect x="-64" y="-4" width="18" height="16" rx="2" fill="#c2410c"/><g fill="#16a34a"><ellipse cx="-60" cy="-12" rx="5" ry="10" transform="rotate(-20 -60 -12)"/><ellipse cx="-50" cy="-13" rx="5" ry="11" transform="rotate(18 -50 -13)"/></g>`}
          <circle cx="46" cy="-56" r="11" fill="#fff" stroke="#334155" stroke-width="2"/><path d="M46 -56${now ? "l-6 2M46 -56v9" : "h-7M46 -56v-9"}" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
          <ellipse cx="46" cy="4" rx="18" ry="16" fill="none" stroke="#e11d48" stroke-width="3.5"/>
          <rect x="-68" y="-74" width="44" height="21" rx="10.5" fill="${now ? "#be123c" : "#881337"}"/><text x="-46" y="-59" text-anchor="middle" font-size="12.5" font-weight="800" fill="#fff">${now ? "지금" : "아침"}</text>
        </g>`;
      const lit = [[34, 120], [48, 132], [74, 110], [100, 128], [114, 104], [528, 114], [546, 128], [574, 108], [598, 122]]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="7" fill="#fde68a" opacity=".85"/>`).join("");
      return `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1f2"/><stop offset="1" stop-color="#fecdd3"/></linearGradient>
          <linearGradient id="${u}n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#4c0519"/></linearGradient></defs>
        <rect width="640" height="320" fill="url(#${u}s)"/>
        <rect x="20" y="30" width="600" height="128" rx="4" fill="url(#${u}n)"/>
        <circle cx="586" cy="60" r="13" fill="#fde68a"/><circle cx="592" cy="55" r="11" fill="#2a1446"/>
        <path d="M20 158v-46h26v-20h30v34h22v-42h30v74zM510 158v-50h28v24h24v-36h30v20h28v42z" fill="#2e1065" opacity=".85"/>${lit}
        <rect x="20" y="30" width="600" height="128" rx="4" fill="none" stroke="#fecdd3" stroke-width="6"/><path d="M170 30v128M470 30v128" stroke="#fecdd3" stroke-width="4"/>
        <rect x="576" y="174" width="34" height="15" rx="4" fill="#4c0519"/><path d="M604 166v9" stroke="#4c0519" stroke-width="4"/><circle cx="582" cy="181.5" r="3.2" fill="#ef4444"/>
        ${photo(232, 136, -4, false)}${photo(412, 138, 3, true)}
        <circle cx="484" cy="210" r="22" fill="#fff" fill-opacity=".35" stroke="#4c0519" stroke-width="7"/><path d="M500 226l22 22" stroke="#4c0519" stroke-width="11" stroke-linecap="round"/>
        <rect x="18" y="236" width="128" height="9" rx="3" fill="#881337"/><path d="M30 245v40M134 245v40" stroke="#881337" stroke-width="6"/>
        <polygon points="80,198 118,198 142,236 56,236" fill="#fde68a" opacity=".6"/>
        <rect x="34" y="229" width="34" height="7" rx="3.5" fill="#4c0519"/><path d="M51 229L64 192L98 182" stroke="#4c0519" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M88 180h22l10 19h-42z" fill="#4c0519"/>
        <rect y="280" width="640" height="40" fill="#fb7185" opacity=".45"/>
        ${person(250, 320, "#4c0519", 1)}${person(394, 320, "#881337", 1)}`;
    },
  };
  function scene(key, opts = {}) {
    const c = chapter(key);
    const draw = SCENES[key];
    if (!c || !draw) return "";
    const u = `hkcs${++uid}`;
    const label = opts.label || `${c.no}화 ${c.time} ${c.place}`;
    return `<svg class="cs-art" viewBox="0 0 640 320" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${draw(u)}</svg>`;
  }

  // 등장인물 얼굴 — 동그란 판에 머리와 소품 하나
  function npcFace(name) {
    const n = series.npcs.find((x) => x.name === name);
    if (!n) return "";
    const prop = {
      scarf: `<path d="M16 28q16-22 32 0q-4-5-16-5t-16 5z" fill="#f97316"/><circle cx="47" cy="27" r="3.5" fill="#f97316"/>`,
      mic: `<g fill="none" stroke="#1f2937" stroke-width="1.8"><circle cx="26.5" cy="30" r="4.6"/><circle cx="37.5" cy="30" r="4.6"/><path d="M31 30h2"/></g><rect x="45" y="38" width="4.5" height="14" rx="2" fill="#1f2937"/><circle cx="47.3" cy="36" r="4.2" fill="#a78bfa"/>`,
      cap: `<path d="M17 27q15-16 30 0z" fill="#0369a1"/><rect x="31" y="24" width="21" height="4.5" rx="2.2" fill="#075985"/><rect x="38" y="52" width="7" height="5" rx="1" fill="#facc15"/>`,
    }[n.face] || "";
    return `<svg class="cs-face" viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="32" fill="${n.color}" opacity=".18"/><path d="M10 64c0-13 10-19 22-19s22 6 22 19z" fill="${n.color}"/><circle cx="32" cy="31" r="15" fill="#fcd9b6"/><circle cx="26.5" cy="30.5" r="1.9" fill="#1f2937"/><circle cx="37.5" cy="30.5" r="1.9" fill="#1f2937"/><path d="M27.5 36.5q4.5 3.6 9 0" stroke="#1f2937" stroke-width="1.8" fill="none" stroke-linecap="round"/>${prop}</svg>`;
  }

  // ── 컷신 ────────────────────────────────────────────────────
  const KIND = { prologue: "이야기 시작", great: "이야기 끝 · 최고예요", ok: "이야기 끝", fail: "이야기 끝 · 다음엔 꼭" };
  const SEEN_KEY = "hk-coop-story-seen";
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  function seenAll() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch (_) { return {}; } }
  function markSeen(k) { try { const s = seenAll(); if (!s[k]) { s[k] = 1; localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } } catch (_) { /* 기억 못 해도 그만 */ } }
  const linesOf = (key, kind) => { const c = chapter(key); if (!c) return []; return kind === "prologue" ? c.prologue : (c.epilogue[kind] || c.epilogue.ok); };
  const fill = (text, ctx) => esc(text).replace(/\{a\}/g, esc(ctx.a || "동기")).replace(/\{b\}/g, esc(ctx.b || "동기"));
  const pace = (line) => Math.min(2000, 1050 + String(line.text).length * 10); // 한 줄 1.4초쯤 — 긴 줄은 조금 더

  // 진행 상태는 화면 밖(이 Map)에 둔다 — 협동 방 화면은 실시간 소식마다 통째로 다시 그려지므로
  const prog = new Map(); // 열쇠 → { key, kind, ctx, shown, total, state: "play" | "done" | "fold" }
  let timer = 0;

  function lineHtml(l, i, p, isNew) {
    const ctx = p.ctx;
    const text = fill(l.text, ctx);
    const cls = isNew ? " is-new" : "";
    if (l.who === "narr") return `<div class="cs__line is-narr${cls}">${text}</div>`;
    if (l.who === "npc") {
      return `<div class="cs__line is-npc${cls}"><span class="cs__face">${npcFace(l.npc)}</span><div class="cs__bub"><span class="cs__name">${esc(l.npc || "")}</span>${text}</div></div>`;
    }
    const mine = l.who === ctx.me;
    const name = l.who === "a" ? ctx.a : ctx.b;
    return `<div class="cs__line ${mine ? "is-me" : "is-mate"}${cls}"><div class="cs__bub"><span class="cs__name">${mine ? "나" : esc(name || "동기")}</span>${text}</div></div>`;
  }
  // animate — 방금 한 줄 넘겼을 때만(advance) 마지막 줄을 살짝 띄운다. 실시간 소식으로 화면을 통째로 다시 그릴 때는 그대로 둔다
  function render(id, animate = false) {
    const p = prog.get(id);
    const c = chapter(p.key);
    const lines = linesOf(p.key, p.kind);
    const shown = p.state === "play" ? p.shown : lines.length;
    const nextLine = lines[shown];
    const typing = p.state === "play" && nextLine
      ? `<div class="cs__more ${nextLine.who === "narr" ? "is-narr" : nextLine.who === p.ctx.me ? "is-me" : ""}" aria-hidden="true"><i></i><i></i><i></i></div>` : "";
    const body = p.state === "fold" ? "" : `<div class="cs__body" ${p.state === "play" ? `data-cs-tap="${esc(id)}" aria-live="polite"` : ""}>
        ${lines.slice(0, shown).map((l, i) => lineHtml(l, i, p, animate && i === shown - 1 && i > 0)).join("")}${typing}</div>`;
    const bar = p.state === "play"
      ? `<button type="button" class="cs__btn is-main" data-cs-next="${esc(id)}">다음 <span aria-hidden="true">›</span></button><button type="button" class="cs__btn" data-cs-skip="${esc(id)}">건너뛰기</button><span class="cs__count">${shown} / ${lines.length}</span>`
      : p.ctx.static ? "" : `<button type="button" class="cs__btn" data-cs-replay="${esc(id)}">${p.state === "fold" ? "이야기 다시 보기" : "처음부터 다시 보기"}</button>`;
    return `<div class="cs is-${p.state} is-${p.kind === "prologue" ? "pro" : "epi"}" data-cs="${esc(id)}" style="${vars(p.key)}">
        <div class="cs__head"><div class="cs__art">${scene(p.key)}</div>
          <div class="cs__cap"><small>${esc(series.title)} · ${c.no}화 · ${esc(c.time)}</small><b>${esc(KIND[p.kind] || KIND.ok)}</b><span>${esc(c.place)}</span></div></div>
        ${body}${bar ? `<div class="cs__bar">${bar}</div>` : ""}
      </div>`;
  }
  function cutscene(key, kind, ctx = {}) {
    const c = chapter(key);
    if (!c) return "";
    kind = KIND[kind] ? kind : "ok";
    const id = `${ctx.static ? "s" : ""}${ctx.id ?? ""}:${key}:${kind}`;
    let p = prog.get(id);
    if (!p) {
      const total = linesOf(key, kind).length;
      const seen = !ctx.static && seenAll()[`${key}:${kind}`];
      const state = ctx.static ? "done" : seen ? "fold" : reduce() ? "done" : "play";
      p = { key, kind, ctx: { ...ctx }, shown: 1, state, total };
      prog.set(id, p);
      if (state === "done" && !ctx.static) markSeen(`${key}:${kind}`);
    } else {
      p.ctx = { ...p.ctx, ...ctx }; // 이름이 늦게 들어와도 맞춘다
    }
    if (p.state === "play") setTimeout(wake, 0);
    return render(id);
  }

  // 화면에 있는 컷신을 다시 그린다(같은 열쇠의 상자를 찾아서)
  function repaint(id, animate = false) {
    const el = [...document.querySelectorAll(".cs[data-cs]")].find((x) => x.dataset.cs === id);
    if (el) el.outerHTML = render(id, animate);
  }
  function advance(id) {
    const p = prog.get(id);
    if (!p || p.state !== "play") return;
    p.shown += 1;
    if (p.shown >= p.total) { p.state = "done"; markSeen(`${p.key}:${p.kind}`); }
    repaint(id, true);
  }
  // 컷신 말풍선 칸이 화면(뷰포트)에 보이는지 — 아래로 밀려 안 보이면 저절로 넘기지 않는다(안 본 이야기를 「본 것」으로 치지 않게)
  function inView(el) {
    const box = el.querySelector(".cs__body") || el;
    const r = box.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    return r.height > 0 && r.top < h - 40 && r.bottom > 40;
  }
  // 저절로 넘기기 — 타이머는 하나만. 화면에서 아직 재생 중인 첫 컷신을, 보일 때만 한 줄씩 넘긴다
  function wake() {
    if (timer || document.hidden) return;
    const el = document.querySelector(".cs.is-play[data-cs]");
    if (!el) return;
    const p = prog.get(el.dataset.cs);
    if (!p) return;
    const line = linesOf(p.key, p.kind)[Math.max(0, p.shown - 1)] || { text: "" };
    timer = setTimeout(() => {
      timer = 0;
      if (document.hidden) return;
      const cur = document.querySelector(".cs.is-play[data-cs]");
      if (cur && inView(cur)) advance(cur.dataset.cs);
      wake();
    }, pace(line));
  }
  function restartTimer() { clearTimeout(timer); timer = 0; wake(); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-cs-next], [data-cs-skip], [data-cs-replay], [data-cs-tap]");
    if (!t) return;
    const d = t.dataset;
    if (d.csNext || d.csTap) { advance(d.csNext || d.csTap); restartTimer(); return; }
    if (d.csSkip) {
      const p = prog.get(d.csSkip);
      if (p) { p.state = "done"; p.shown = p.total; markSeen(`${p.key}:${p.kind}`); repaint(d.csSkip); }
      return;
    }
    if (d.csReplay) {
      const p = prog.get(d.csReplay);
      if (p) { p.state = reduce() ? "done" : "play"; p.shown = 1; repaint(d.csReplay); restartTimer(); }
    }
  });

  return { series, order, chapters, extras, extrasInfo, extraChapters, chapter, isExtra, label, prev, next, vars, scene, npcFace, cutscene, tier, cleared, KIND };
})();
