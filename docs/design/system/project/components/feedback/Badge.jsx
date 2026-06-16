import React from "react";

/**
 * Badge — small pill label.
 */
export function Badge({ variant = "neutral", dot = false, className = "", children, ...rest }) {
  return (
    <span className={["hk-badge", `hk-badge--${variant}`, className].filter(Boolean).join(" ")} {...rest}>
      {dot && <span className="hk-badge__dot" />}
      {children}
    </span>
  );
}
