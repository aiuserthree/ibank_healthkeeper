import * as React from "react";

/**
 * Square borderless button holding a single icon (close, settings, bell…).
 * Always pass `label` for accessibility.
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label, applied as aria-label. */
  label: string;
  /** The icon element. */
  children: React.ReactNode;
}

export function IconButton(props: IconButtonProps): JSX.Element;
