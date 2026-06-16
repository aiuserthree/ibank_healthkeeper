import * as React from "react";

/** Small pill label for tags, counts and categories. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color treatment. @default "neutral" */
  variant?: "neutral" | "info" | "soft" | "success" | "warning" | "danger";
  /** Show a leading status dot. */
  dot?: boolean;
}

export function Badge(props: BadgeProps): JSX.Element;
