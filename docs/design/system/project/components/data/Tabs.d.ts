import * as React from "react";

export interface TabItem {
  value: string;
  label: React.ReactNode;
}

/** Underline tab bar. Controlled — own the active `value` in the parent. */
export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Tabs(props: TabsProps): JSX.Element;
