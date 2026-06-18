import * as React from "react";

/** Labelled checkbox with the brand check glyph; fills signal-blue when checked. */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text label rendered after the box. */
  label?: React.ReactNode;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
