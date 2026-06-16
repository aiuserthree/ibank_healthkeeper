import * as React from "react";

/** Compact transient notification on a navy surface. */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "default" */
  variant?: "default" | "success" | "danger";
}

export function Toast(props: ToastProps): JSX.Element;
