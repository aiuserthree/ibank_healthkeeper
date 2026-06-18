import React from "react";

/**
 * SlotButton — a 30-minute reservation slot in the 헬스키퍼 calendar.
 * States: available · selected · confirmed · disabled (휴가/마감/예약완료).
 */
export function SlotButton({ time, meta, state = "available", onClick, className = "", ...rest }) {
  const disabled = state === "disabled" || state === "confirmed";
  const cls = [
    "hk-slot",
    state === "selected" ? "hk-slot--selected" : "",
    state === "confirmed" ? "hk-slot--confirmed" : "",
    state === "disabled" ? "hk-slot--disabled" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={cls}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={state === "selected"}
      {...rest}
    >
      <span className="hk-slot__time">{time}</span>
      {meta && <span className="hk-slot__meta">{meta}</span>}
    </button>
  );
}
