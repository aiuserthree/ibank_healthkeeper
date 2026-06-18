Reservation-status badge — give it the Korean status, it picks the brand color.

```jsx
<StatusBadge status="신청" />   {/* amber */}
<StatusBadge status="확정" />   {/* green */}
<StatusBadge status="탈락" />   {/* red */}
<StatusBadge status="재신청" /> {/* blue */}
```

Domain-specific; wraps `Badge`. Use it anywhere a 신청/확정/탈락/취소 state is shown (lists, my-page, admin tables).
