import * as React from "react";

/** Centered empty/blocked-state message with optional icon and action. */
export interface EmptyStateProps {
  /** Icon element (Lucide) shown in a fog circle. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action element (usually a Button). */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
