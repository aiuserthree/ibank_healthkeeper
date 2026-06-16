import React from "react";

/**
 * IconButton — square, borderless control for a single icon action.
 */
export function IconButton({ label, children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={["hk-iconbtn", className].filter(Boolean).join(" ")}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  );
}
