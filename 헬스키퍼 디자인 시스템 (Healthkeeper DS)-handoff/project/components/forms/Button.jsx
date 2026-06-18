import React from "react";

/**
 * Button — the primary action primitive.
 * Variants: primary (signal blue), secondary, ghost, danger.
 */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "hk-btn",
    `hk-btn--${variant}`,
    size === "sm" ? "hk-btn--sm" : size === "lg" ? "hk-btn--lg" : "",
    block ? "hk-btn--block" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button type={type} className={cls} disabled={disabled} {...rest}>
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </button>
  );
}
