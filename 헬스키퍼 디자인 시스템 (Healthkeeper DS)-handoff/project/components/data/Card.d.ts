import * as React from "react";

/** Elevated white surface container with blue-tinted shadow and 8px radius. */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Apply 24px padding. @default true */
  padded?: boolean;
  /** Lift on hover. */
  hover?: boolean;
  /** Remove the shadow (border only). */
  flat?: boolean;
  /** Render as a different element. @default "div" */
  as?: keyof JSX.IntrinsicElements;
}

export function Card(props: CardProps): JSX.Element;
