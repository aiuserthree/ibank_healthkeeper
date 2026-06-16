# 회원 예약 앱 (Member booking app)

Calendly-styled, member-facing surface of 헬스키퍼. A single-page click-through that demonstrates the full member journey.

**Open `index.html`.**

## Screens (in `app.jsx`)
- **Landing** — service intro hero (gradient blob + product mini-calendar), stat strip, 3 feature blocks.
- **Auth** — login / signup toggle; signup gates the CTA behind the consent checkbox and explains email verification.
- **Reserve** — weekly calendar (월~금 × 4 타임). Pick a slot → summary card → confirm `Dialog` → success `Toast`. Vacation days render as 휴가; already-booked slots show as `confirmed`.
- **MyPage** — priority summary (마지막 이용일 · 우선권) + reservation cards with `StatusBadge` and 마감 전 취소.

## Built from primitives
`Button`, `Card`, `Input`, `Checkbox`, `Avatar`, `SlotButton`, `Badge`, `StatusBadge`, `Alert`, `Dialog`, `Toast`, `EmptyState` — all from `window.HealthkeeperDS_31e44b`. Icons via Lucide CDN.

> Recreation/scaffold for prototyping — interactions are mocked (no backend), but visuals and flow follow the 설계서 draft.
