import React from "react";

/**
 * Input — labelled text field with optional hint and error.
 */
export function Input({
  label,
  hint,
  error,
  required = false,
  id,
  className = "",
  ...rest
}) {
  const autoId = id || (label ? `f-${String(label).replace(/\s+/g, "-")}` : undefined);
  return (
    <div className={["hk-field", error ? "hk-field--invalid" : "", className].filter(Boolean).join(" ")}>
      {label && (
        <label className="hk-field__label" htmlFor={autoId}>
          {label}{required && <span className="hk-field__req">*</span>}
        </label>
      )}
      <input id={autoId} className="hk-input" aria-invalid={!!error} {...rest} />
      {error ? (
        <span className="hk-field__error">{error}</span>
      ) : hint ? (
        <span className="hk-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
