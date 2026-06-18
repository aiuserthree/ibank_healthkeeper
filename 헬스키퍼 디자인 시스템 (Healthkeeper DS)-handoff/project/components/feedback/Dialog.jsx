import React from "react";
import { Button } from "../forms/Button.jsx";

/**
 * Dialog — centered modal with overlay, title, body, action row.
 * Controlled via `open`; render-nothing when closed.
 */
export function Dialog({
  open = true,
  title,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  hideCancel = false,
}) {
  if (!open) return null;
  return (
    <div className="hk-dialog__overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="hk-dialog" onClick={(e) => e.stopPropagation()}>
        {title && <div className="hk-dialog__title">{title}</div>}
        <div className="hk-dialog__body">{children}</div>
        <div className="hk-dialog__actions">
          {!hideCancel && <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>}
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
