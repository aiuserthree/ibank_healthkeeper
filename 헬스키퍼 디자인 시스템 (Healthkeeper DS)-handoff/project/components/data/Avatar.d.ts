import * as React from "react";

/** Circular avatar showing an image or the first 1–2 characters of `name`. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Used for initials and alt text. */
  name?: string;
  /** Image URL; falls back to initials when absent. */
  src?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}

export function Avatar(props: AvatarProps): JSX.Element;
