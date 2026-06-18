import React from "react";

const ICONS = {
  info: <path d="M12 16v-4M12 8h.01" />,
  success: <path d="M20 6 9 17l-5-5" />,
  warning: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
  danger: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
};

/**
 * Alert — inline message banner with icon, optional title.
 */
export function Alert({ variant = "info", title, className = "", children, ...rest }) {
  return (
    <div className={["hk-alert", `hk-alert--${variant}`, className].filter(Boolean).join(" ")} role="status" {...rest}>
      <span className="hk-alert__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {variant === "info" ? <><circle cx="12" cy="12" r="10" />{ICONS.info}</> : ICONS[variant]}
        </svg>
      </span>
      <div>
        {title && <div className="hk-alert__title">{title}</div>}
        <div className="hk-alert__body">{children}</div>
      </div>
    </div>
  );
}
