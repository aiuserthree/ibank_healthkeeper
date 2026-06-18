The booking time-slot button — 4 per day. Drives the reservation calendar.

```jsx
<SlotButton time="13:30" meta="휴가" state="disabled" />
<SlotButton time="14:30" meta="예약 가능" state="selected" onClick={pick} />
<SlotButton time="15:30" meta="예약 가능" onClick={pick} />
<SlotButton time="16:30" meta="예약 완료" state="confirmed" />
```

States: `available` (default), `selected` (blue fill), `confirmed` (green, locked), `disabled` (휴가/마감, locked). Lay out 4 across with a grid + `gap`.
