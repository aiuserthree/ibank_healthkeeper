import * as React from "react";

/**
 * Primary action button for 헬스키퍼. Signal-blue fill is reserved for
 * the main conversion action; use secondary/ghost for everything else.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Control height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Stretch to fill container width. */
  block?: boolean;
  /** Icon element rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
