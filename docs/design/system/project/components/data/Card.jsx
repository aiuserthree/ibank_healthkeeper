import React from "react";

/**
 * Card — elevated surface container.
 */
export function Card({ padded = true, hover = false, flat = false, as = "div", className = "", children, ...rest }) {
  const Tag = as;
  const cls = [
    "hk-card",
    padded ? "hk-card--pad" : "",
    hover ? "hk-card--hover" : "",
    flat ? "hk-card--flat" : "",
    className,
  ].filter(Boolean).join(" ");
  return <Tag className={cls} {...rest}>{children}</Tag>;
}
