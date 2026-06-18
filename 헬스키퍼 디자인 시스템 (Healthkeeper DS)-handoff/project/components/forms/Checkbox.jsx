import React from "react";

/**
 * Checkbox — labelled box with brand check glyph.
 */
export function Checkbox({ label, checked, defaultChecked, onChange, disabled, className = "", ...rest }) {
  return (
    <label className={["hk-check", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="hk-check__box" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
