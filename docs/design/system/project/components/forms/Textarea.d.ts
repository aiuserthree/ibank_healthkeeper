import * as React from "react";

/** Multi-line labelled text field with hint/error, min-height 110px, vertical resize. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function Textarea(props: TextareaProps): JSX.Element;
