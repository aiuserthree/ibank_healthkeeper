import * as React from "react";

/**
 * A selectable 30-minute reservation slot. The core booking control of
 * the 헬스키퍼 calendar — 4 per day (13:30 / 14:30 / 15:30 / 16:30).
 */
export interface SlotButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Slot start time, e.g. "14:30". */
  time: string;
  /** Small caption under the time (e.g. "예약 가능", "휴가"). */
  meta?: string;
  /** Visual + interaction state. @default "available" */
  state?: "available" | "selected" | "confirmed" | "disabled";
  onClick?: () => void;
}

export function SlotButton(props: SlotButtonProps): JSX.Element;
