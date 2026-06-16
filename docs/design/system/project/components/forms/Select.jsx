import React from "react";

/**
 * Select — labelled native dropdown with brand chevron.
 * Pass options as [{value, label}] or render <option> children.
 */
export function Select({ label, hint, error, required = false, options, id, className = "", children, ...rest }) {
  const autoId = id || (label ? `s-${String(label).replace(/\s+/g, "-")}` : undefined);
  return (
    <div className={["hk-field", error ? "hk-field--invalid" : "", className].filter(Boolean).join(" ")}>
      {label && (
        <label className="hk-field__label" htmlFor={autoId}>
          {label}{required && <span className="hk-field__req">*</span>}
        </label>
      )}
      <select id={autoId} className="hk-select" aria-invalid={!!error} {...rest}>
        {options
          ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
          : children}
      </select>
      {error ? <span className="hk-field__error">{error}</span> : hint ? <span className="hk-field__hint">{hint}</span> : null}
    </div>
  );
}
