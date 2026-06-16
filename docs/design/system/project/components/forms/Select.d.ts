import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/** Labelled native select with the brand chevron and focus ring. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Convenience option list; alternatively pass <option> children. */
  options?: SelectOption[];
}

export function Select(props: SelectProps): JSX.Element;
