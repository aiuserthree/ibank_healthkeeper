import React from "react";

/**
 * EmptyState — centered icon + message for empty lists / blocked states.
 */
export function EmptyState({ icon, title, description, action, className = "" }) {
  return (
    <div
      className={className}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", padding: "48px 24px", gap: "8px",
      }}
    >
      {icon && (
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "var(--color-fog)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--color-slate-blue)", marginBottom: 6,
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-midnight-navy)" }}>{title}</div>
      {description && <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 320, lineHeight: 1.6 }}>{description}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
