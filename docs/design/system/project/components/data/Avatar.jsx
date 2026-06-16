import React from "react";

/**
 * Avatar — circular initials or image.
 */
export function Avatar({ name = "", src, size = "md", className = "", ...rest }) {
  const initials = name.trim().slice(0, 2);
  return (
    <span className={["hk-avatar", `hk-avatar--${size}`, className].filter(Boolean).join(" ")} {...rest}>
      {src ? <img src={src} alt={name} /> : <span>{initials}</span>}
    </span>
  );
}
