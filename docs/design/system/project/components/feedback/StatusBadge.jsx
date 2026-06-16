import React from "react";
import { Badge } from "./Badge.jsx";

/**
 * StatusBadge — maps a 헬스키퍼 reservation status to the correct
 * color + dot. Accepts the Korean status string directly.
 */
const MAP = {
  "신청":   { variant: "warning", label: "신청" },
  "대기":   { variant: "warning", label: "확정 대기" },
  "확정":   { variant: "success", label: "확정" },
  "완료":   { variant: "success", label: "완료" },
  "탈락":   { variant: "danger",  label: "탈락" },
  "취소":   { variant: "danger",  label: "취소" },
  "재신청": { variant: "info",    label: "재신청" },
};

export function StatusBadge({ status, className = "", ...rest }) {
  const cfg = MAP[status] || { variant: "neutral", label: status };
  return (
    <Badge variant={cfg.variant} dot className={className} {...rest}>
      {cfg.label}
    </Badge>
  );
}
