Centered modal for confirmations. Overlay click = cancel.

```jsx
<Dialog
  open={open}
  title="예약을 신청할까요?"
  confirmLabel="신청하기"
  onConfirm={submit}
  onCancel={() => setOpen(false)}
>
  6월 17일(화) 14:30 타임으로 신청합니다. 확정은 관리자 처리 후 완료됩니다.
</Dialog>

<Dialog title="예약 취소" confirmLabel="취소하기" confirmVariant="danger" … />
```

Composes `Button`. For destructive actions set `confirmVariant="danger"`.
