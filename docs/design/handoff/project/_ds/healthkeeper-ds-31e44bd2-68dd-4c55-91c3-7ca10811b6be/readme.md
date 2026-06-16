# 헬스키퍼 디자인 시스템 (iBank Healthkeeper Design System)

A design system for **아이뱅크 안마서비스 (헬스키퍼) 예약 시스템** — iBank's in-house massage (Health Keeper) reservation service. It dresses a focused weekly-booking product in a quiet, professional, Calendly-inspired visual language, adapted for a Korean-language audience.

> **One file to link:** `styles.css` (root). It `@import`s every token + font + component-class file. Components are read from `window.HealthkeeperDS_31e44b` after loading the compiled `_ds_bundle.js`.

---

## Product context

A single masseur, a fixed weekly cadence, and a fairness-based allocation rule. The system has **two product surfaces**:

1. **회원 예약 앱** (member booking app) — service intro, signup + email verification, the weekly reservation calendar, and my-page. → `ui_kits/member/`
2. **관리자 콘솔** (admin console) — dashboard, reservation management with priority confirmation, vacation management, operation settings. → `ui_kits/admin/`

**Core rules** driving the UI (from the 설계서 draft):
- Masseur 1명 · daily **13:30–17:00** · 4 slots/day (30분 + 휴식 30분): `13:30 / 14:30 / 15:30 / 16:30`. Week = 월–금 → **20 slots**.
- Reservations open **every Wednesday 09:00**, close the same day **17:00** (accept until 16:59). Target = next week (차주) 월–금.
- General applications are **신청(요청)** → require **admin 확정**. Duplicate applicants for one slot are ranked by **priority**: oldest 마지막 이용일 wins (never-used = top); tie → earliest 신청 시각.
- Rejected (탈락) applicants may **재신청** first-come-first-served for empty slots until next day (목) 17:00 — **instantly confirmed, non-cancelable**.
- Masseur **휴가** is registered before open; those days are un-bookable.
- Statuses: **신청 · 확정 · 탈락 · 취소**. Emails: 인증 / 예약 완료(일반·재신청) / 탈락·재신청 안내.

### Sources provided
- `uploads/설계서 초안.md` — the business-logic design draft (Korean). Source of truth for flows, screens, IA, and rules.
- `uploads/DESIGN.md`, `tokens.json`, `theme.css`, `variables.css` — the **Calendly.com style reference** extraction (colors, type, spacing, shadows). Used as the visual language only; this is **not** a Calendly clone.

---

## CONTENT FUNDAMENTALS — voice & copy

The product talks to employees booking a workplace perk. Copy is **Korean, polite-but-warm (해요체)**, concise, and reassuring.

- **Tone:** calm, considerate, fair. The system manages scarcity, so copy reduces anxiety ("오래 기다린 분께 우선권을 드립니다", "마감 전까지 취소할 수 있어요").
- **Politeness:** 해요체 for users (`신청하세요`, `확인해 주세요`), with `~님` for names (`김민수님`). Admin-facing copy is a touch more declarative (`확정하세요`, `우선권을 확인하고 확정하세요`).
- **Person:** address the user implicitly ("예약하기", "내 예약 신청 내역"); avoid 당신/귀하.
- **Numbers & time** are first-class and exact: `13:30 – 14:00`, `16:59까지`, `17:00 정각 마감`. Use tabular numerals. Times use the 24-hour clock.
- **Status words are fixed vocabulary** — always 신청 / 확정 / 탈락 / 취소 / 재신청 (never synonyms). Map them via `StatusBadge`.
- **Critical constraints are bolded inline**, not buried: **관리자 확정**, **선착순·즉시 확정·취소 불가**.
- **Headlines** can be a little aspirational ("마음까지 풀리는 헬스키퍼 예약"); body copy stays factual.
- **English** appears only as the secondary wordmark line (IBANK HEALTHKEEPER) and labels like ADMIN. **No emoji.** No exclamation-heavy marketing speak.

Example microcopy:
- 접수: "예약 신청이 접수되었습니다 · 마이페이지에서 확인하세요"
- 안내: "신청은 접수 후 관리자 확정으로 완료됩니다."
- 거절: "이미 예약이 완료된 날짜 및 시간대입니다."

---

## VISUAL FOUNDATIONS

**Vibe:** quiet professional calendar on frosted paper. White surfaces, near-black text, a signature **navy** voice, and a single functional **blue** accent. Restrained, geometric, editorial.

- **Color.** Headlines use **Midnight Navy `#0b3558`** — never pure black. The lone functional accent is **Signal Blue `#006bff`** (CTAs, active states, focus). Secondary text is **Slate Blue `#476788`**; body is **Carbon `#0a0a0a`**. Canvas is **Mist `#f8f9fb`**, cards **Paper `#ffffff`**, soft fills **Fog `#e7edf6`**. Status semantics (added for this product, desaturated to sit beside the blue): success green `#1f8a5b`, warning amber `#c2780c`, danger red `#d23f3f`, each with a soft tint.
- **Decorative gradients.** Magenta/violet/amber/cyan blobs (`--blob-*`) are **atmosphere only** — soft-edged, heavily blurred, low opacity, **behind product cards**. Never on text, buttons, or UI chrome.
- **Type.** Single family. **Pretendard** (Korean + Latin, geometric, warm) is the primary; **Manrope** an optional Latin display companion. Weights 600–700 for headings (geometric authority), 400–500 for body. Display sizes carry slight negative tracking; Korean body reads at 16–18px with 1.6 leading.
- **Spacing.** 8px base, comfortable density. Sections breathe (80px gaps in marketing contexts); cards pad 24px; element gap 16px. Max content width ~1200px.
- **Radius.** Geometric, not pillowy: **4px** buttons/inputs, **8px** cards, **16px** product mockups, **999px** badges/avatars/switches.
- **Shadows.** Always **blue-tinted** `rgba(71,103,136,…)`, soft and multi-layered — never neutral gray. Four steps (`--shadow-xs/sm/md/lg`).
- **Borders.** Hairlines in `#d4e0ed` (Mist Border) for dividers, card edges, inputs. Dashed hairlines mark unavailable/휴가 slots.
- **Cards.** White, 8px radius, hairline border + soft blue-tinted `--shadow-sm`; optional `hover` lift (translateY −2px, deeper shadow).
- **Backgrounds.** Flat Mist canvas. **No photography, no lifestyle imagery, no 3D.** The product UI itself is the hero; gradient blobs supply warmth.
- **Buttons.** Primary = solid Signal Blue + white, blue-tinted shadow. Secondary = white + hairline border. Ghost = transparent, fog hover. Danger = solid red. Hover darkens; active nudges +0.5px; focus shows a 3px blue ring.
- **Press / hover states.** Hover = darker fill (primary) or fog wash (ghost/secondary); inputs gain a steel-blue border then a blue ring + glow on focus. No bounce. Transitions are short (120–200ms) on `cubic-bezier(0.4,0,0.2,1)`; entrances use a soft `ease-out` (dialogs fade + pop).
- **Transparency / blur.** Used sparingly: dialog overlay is `rgba(11,53,88,0.32)` + 2px backdrop blur; gradient blobs are blurred. Otherwise surfaces are opaque.
- **Layout rules.** Member app: sticky 72px top nav, centered 1200px container, 2-column hero. Admin: fixed 240px left sidebar + scrolling content. Booking slots always lay out 4-up via grid + gap.
- **Imagery color vibe.** Cool, bright, airy — blues and whites; the only saturated color is the blob gradients (warm magenta/amber against cool cyan/violet).

---

## ICONOGRAPHY

Flat, single-color **line icons** at ~1.75px stroke, 18–24px, drawn in navy (`#0b3558`) or, for emphasis, signal blue (`#006bff`). No filled/duotone icons, **no emoji**, no unicode-glyph icons.

- **Set:** [**Lucide**](https://lucide.dev) — loaded from CDN (`unpkg.com/lucide@0.460.0`). *Substitution note:* the Calendly reference ships no icon assets and no codebase was provided, so Lucide is used as the closest match to the described flat 24px navy/blue line icons. **If iBank has an in-house icon set, drop it into `assets/` and swap.**
- **Usage:** `<i data-lucide="calendar-days"></i>` then `lucide.createIcons()`. In React, re-run `createIcons()` in an effect after render. Common icons in use: `calendar-days`, `clock`, `circle-check-big`, `user-round`, `bell`, `mail`, `hourglass`, `ban`, `palmtree`, `layout-dashboard`, `calendar-check`, `settings`, `arrow-right`, `log-out`.
- **Brand mark:** original geometric logo (clock ring + confirm check + blue dot) — `assets/logo-mark.svg`, `assets/logo-lockup.svg`. *No Calendly or third-party logo is used or reproduced.*

---

## Index / manifest

**Root**
- `styles.css` — global entry (@import list only).
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skill manifest for download/Claude Code use.

**Tokens** (`tokens/`, all reached from `styles.css`)
- `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `effects.css` · `components.css` (the `.hk-*` class layer) · `base.css`

**Assets** (`assets/`)
- `logo-mark.svg` · `logo-lockup.svg`

**Components** (`window.HealthkeeperDS_31e44b`)
- `components/forms/` — `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`
- `components/feedback/` — `Badge`, `StatusBadge`, `Alert`, `Dialog`, `Toast`
- `components/data/` — `Card`, `Avatar`, `SlotButton`, `Tabs`, `EmptyState`

**UI kits**
- `ui_kits/member/` — 회원 예약 앱 (landing · auth · reserve · my-page)
- `ui_kits/admin/` — 관리자 콘솔 (dashboard · reservation mgmt · vacation · settings)

**Templates** (consuming-project starting points)
- `templates/booking-page/` — 회원 예약 페이지 scaffold
- `templates/admin-console/` — 관리자 콘솔 scaffold

**Foundation cards** (Design System tab) — `guidelines/cards/*.html` (Colors, Type, Spacing, Brand, Components groups).

---

## Caveats / substitutions
- **Fonts:** Gilroy (the reference family) is commercial and not bundled. **Pretendard** (primary, Korean + Latin) + **Manrope** (Latin display) substitute it, loaded from CDN. Provide licensed Gilroy/brand webfont files to swap.
- **Icons:** Lucide via CDN substitutes for an unspecified icon set.
- **Logo:** original mark created here (none was provided). Replace with the official iBank Healthkeeper logo when available.
- UI kits mock interactions (no backend); they are visual + flow recreations of the 설계서 draft, not production code.
