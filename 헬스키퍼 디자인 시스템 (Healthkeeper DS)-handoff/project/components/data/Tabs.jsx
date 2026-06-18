import React from "react";

/**
 * Tabs — underline tab bar. Controlled via `value` / `onChange`.
 * `items` is [{ value, label }].
 */
export function Tabs({ items = [], value, onChange, className = "" }) {
  return (
    <div className={["hk-tabs", className].filter(Boolean).join(" ")} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={["hk-tab", value === it.value ? "hk-tab--active" : ""].filter(Boolean).join(" ")}
          onClick={() => onChange && onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
