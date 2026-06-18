import React from "react";

/**
 * Toast — compact transient notification (navy surface).
 */
export function Toast({ variant = "default", className = "", children, ...rest }) {
  const icon =
    variant === "success" ? <path d="M20 6 9 17l-5-5" /> :
    variant === "danger"  ? <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></> :
    <path d="M12 16v-4M12 8h.01" />;
  return (
    <div className={["hk-toast", `hk-toast--${variant}`, className].filter(Boolean).join(" ")} role="status" {...rest}>
      <span className="hk-toast__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {variant === "default" ? <><circle cx="12" cy="12" r="10" />{icon}</> : icon}
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}
