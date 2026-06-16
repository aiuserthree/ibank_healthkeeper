import * as React from "react";

/** Inline message banner with icon and optional bold title. */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "info" */
  variant?: "info" | "success" | "warning" | "danger";
  /** Optional bold heading line. */
  title?: React.ReactNode;
}

export function Alert(props: AlertProps): JSX.Element;
