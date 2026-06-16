import React from "react";

/**
 * Switch — labelled on/off toggle.
 */
export function Switch({ label, checked, defaultChecked, onChange, disabled, className = "", ...rest }) {
  return (
    <label className={["hk-switch", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="hk-switch__track" aria-hidden="true">
        <span className="hk-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
