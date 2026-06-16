import * as React from "react";

/**
 * Reservation lifecycle badge. Pass the Korean status and it picks the
 * brand color + dot: 신청/대기 → amber, 확정/완료 → green, 탈락/취소 → red,
 * 재신청 → blue.
 */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "신청" | "대기" | "확정" | "완료" | "탈락" | "취소" | "재신청" | string;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element;
