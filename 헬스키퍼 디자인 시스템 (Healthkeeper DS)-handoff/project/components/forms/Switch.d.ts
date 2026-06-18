import * as React from "react";

/** Labelled on/off toggle; signal-blue track when on. */
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

export function Switch(props: SwitchProps): JSX.Element;
