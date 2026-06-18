Primary action button — signal-blue fill reserved for the main conversion action; secondary/ghost/danger for everything else.

```jsx
<Button variant="primary" onClick={apply}>예약 신청</Button>
<Button variant="secondary">취소</Button>
<Button variant="ghost" size="sm">로그인</Button>
<Button variant="danger" iconLeft={<i data-lucide="x" />}>예약 취소</Button>
<Button variant="primary" block size="lg">신청 완료</Button>
```

Variants: `primary` (default), `secondary`, `ghost`, `danger`. Sizes: `sm` (36px), `md` (44px), `lg` (52px). Props: `block`, `disabled`, `iconLeft`, `iconRight`. 4px radius, blue-tinted shadow on primary.
