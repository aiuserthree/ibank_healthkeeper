import * as React from "react";

/**
 * Labelled text input with optional helper text and error state.
 * Hairline border, 4px radius, blue focus ring.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label shown above the control. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Error message; turns the field red and replaces the hint. */
  error?: string;
  /** Show a required asterisk. */
  required?: boolean;
}

export function Input(props: InputProps): JSX.Element;
