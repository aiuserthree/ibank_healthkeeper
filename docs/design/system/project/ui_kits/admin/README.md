# 관리자 콘솔 (Admin console)

Operator-facing surface of 헬스키퍼. Left-sidebar admin layout with the priority-confirmation workflow at its center.

**Open `index.html`.**

## Screens (in `app.jsx`)
- **Dashboard** — weekly stat cards (신청 / 확정 / 대기 / 탈락) + 확정 대기 슬롯 list.
- **예약 관리** — date selector → per-slot applicant tables. Applicants are **sorted by priority** (이력 없음 first, then oldest 마지막 이용일). Confirming one applicant (`Dialog`) marks the rest of that slot 탈락 and fires a completion `Toast`.
- **휴가 관리** — week grid; toggle 운영/휴가 per day with `Switch` (allowed only before reservations open).
- **운영 설정** — operating hours, open/close times, auto-mail toggles.

## Built from primitives
`Button`, `IconButton`, `Card`, `Avatar`, `Badge`, `StatusBadge`, `Alert`, `Dialog`, `Toast`, `Switch`, `Input`, `EmptyState` — all from `window.HealthkeeperDS_31e44b`. Icons via Lucide CDN.

> The priority sort + single-confirm-per-slot mechanic mirrors §3.4 / §4.5 of the 설계서 draft.
