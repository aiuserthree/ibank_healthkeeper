import * as React from "react";

/** Centered confirmation modal with overlay blur and an action row. */
export interface DialogProps {
  /** Controls visibility. @default true */
  open?: boolean;
  title?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Variant for the confirm button. @default "primary" */
  confirmVariant?: "primary" | "danger";
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Hide the cancel button (single-action dialogs). */
  hideCancel?: boolean;
}

export function Dialog(props: DialogProps): JSX.Element | null;
