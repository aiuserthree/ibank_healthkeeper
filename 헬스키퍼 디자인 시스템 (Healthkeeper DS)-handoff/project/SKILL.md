---
name: healthkeeper-design
description: Use this skill to generate well-branded interfaces and assets for the iBank 헬스키퍼 (Healthkeeper) massage-reservation product, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping a quiet, Calendly-inspired Korean booking experience.
user-invocable: true
---

Read the `readme.md` file within this skill first — it carries the full design guide: product context, content/voice fundamentals, visual foundations, iconography, and a manifest of every file. Then explore the other available files.

Key locations:
- `styles.css` — link this one file to get all tokens, fonts, and the `.hk-*` component classes.
- `tokens/` — colors, typography, spacing, effects, component classes.
- `assets/` — logo mark + lockup (SVG).
- `components/` — React primitives (`Button`, `Input`, `SlotButton`, `StatusBadge`, `Dialog`, `Card`, …), exposed at `window.HealthkeeperDS_31e44b` after loading `_ds_bundle.js`. Each has a `.d.ts` props contract and a `.prompt.md` usage note.
- `ui_kits/member/` and `ui_kits/admin/` — full click-through screen recreations to copy patterns from.
- `templates/` — ready-to-copy starting scaffolds (booking page, admin console).
- `guidelines/cards/` — foundation specimen cards.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and produce static HTML files for the user to view. If working on production code, copy assets and follow the rules here to become an expert in designing with this brand.

If the user invokes this skill without other guidance, ask what they want to build, ask a few focused questions, and act as an expert designer who outputs HTML artifacts *or* production code as needed.

Non-negotiables: navy `#0b3558` headlines (never pure black); signal blue `#006bff` is the only functional accent (reserve it for CTAs/active/focus); 4px button radius; blue-tinted shadows; gradient blobs are atmosphere-only; fixed status vocabulary (신청 · 확정 · 탈락 · 취소 · 재신청); Korean 해요체 copy; no emoji.
