# 레퍼런스(Sling Raiders) 직접 해 본 기록 — 2026-11-19

틀: 힉스필드 플레이어블 페이지 가운데 iframe(srcdoc 7.1MB · 3D). 기기 틀을 가로 태블릿(576×432)으로 놓고 함.

## 첫 화면
- 제목 · PLAY · 금화 0 · 별 0/30(= 10단계 × 별 3) · LONGHOUSE 단추 · 음악/소리 단추

## 놀이 화면
- 위 왼쪽 멈춤 단추 + LEVEL n 딱지, 위 가운데 「고블린 × N」 남은 수(쓰러뜨리면 -1 이 옆에 뜸, 0 이면 초록 체크), 위 오른쪽 금화
- 아래 왼쪽: 용사 줄(동그란 아이콘, 지금 쏠 용사는 크고 노란 테, 쓴 것은 흐리게, 특수는 SMASH · BOUNCE · BOMB 딱지)
- 단계 시작: 요새를 가까이 비추며 「LEVEL 3 · FROST CELLAR / Ice shatters - the Giant smashes through walls!」 띠 → 카메라가 새총 뒤로 물러남
- 조준: 새총에서 끌어 당김(왼쪽 아래로) → 점선 궤적 → 놓으면 발사. 당긴 길이 = 힘
- 발사 뒤 카메라가 용사를 따라가 요새를 가까이 보여 주고, 멎으면 새총으로 돌아옴
- 특수: 날아가는 중에 화면을 누르면 발동 — BOMB(폭탄을 던져 터짐 · 반경 3.2m), BOUNCE(방패를 들고 튕김 「BOING ×1」 · 3번), SMASH(거인 「TAP to SMASH!」 · 블록 4개 뚫음)
- 연출: 고블린 쓰러지면 금화가 튀고 「+15」, 구조가 무너지면 「CRUMBLE!」, 먼지 · 파편
- 재료: 나무(판자 · 상자 · 말뚝 울타리), 돌(회색 블록), 얼음(3단계부터, 잘 깨짐)

## 결과
- 이김 「FORT RAIDED!」: 별 3칸, Goblins 4/4, Plunder +79, Unused vikings 1 × 100, First raid +70, 단추 MAP · LONGHOUSE · NEXT
  - 2단계: 용사 4(보통 · BOUNCE · BOMB · 보통) 가운데 1명 남기고 깸 → 별 2
- 짐 「THE GOBLINS HOLD!」: 「1 goblin left」, 도움말(War Horn 을 사면 용사 +1), 「Plunder kept +66」(진 판의 금화도 가짐), 단추 MAP · LONGHOUSE · RETRY

## LONGHOUSE(강화 · 금화로)
- Bigger Booms 3칸: 폭발 3.2m → 3.6m …, 값 120 → 320
- Springy Shield 3칸: 3번 → 4번 튕김, 값 120
- Giant's Might 3칸: 블록 4 → 5개 뚫음, 값 150 → 380
- War Horn 2칸: 용사 +1 → +2, 값 300 → 900
- 단추 MAP · CONTINUE

## 단계
- 1: 용사 3?(보통 · BOMB · 보통?) 고블린 2~3 — 처음 배우는 단계
- 2 Stone Steading?: 고블린 4, 용사 4(보통 · BOUNCE · BOMB · 보통), 나무 + 돌
- 3 FROST CELLAR: 고블린 5, 용사 5(보통 · SMASH · BOUNCE · BOMB · 보통), 돌 + 얼음 기둥 + 나무, War Horn 을 사서 +1 된 수일 수 있음
