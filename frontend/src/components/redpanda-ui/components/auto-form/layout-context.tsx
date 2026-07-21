import React from 'react';

import { cn } from '../../lib/utils';

const FormDepthContext = React.createContext(0);

export function useFormDepth(): number {
  return React.useContext(FormDepthContext);
}

export function FormDepthProvider({ depth, children }: { depth: number; children: React.ReactNode }) {
  return <FormDepthContext.Provider value={depth}>{children}</FormDepthContext.Provider>;
}

/**
 * Map nesting depth to a heading level. Root is h2 (h1 is reserved for the page
 * heading); clamped at 5 to match the Heading component's h1..h5 variants.
 */
export function headingLevelForDepth(depth: number): 2 | 3 | 4 | 5 {
  const level = 2 + depth;
  if (level > 5) {
    return 5;
  }
  return level as 2 | 3 | 4 | 5;
}

// Maps a form-depth level (2–5) to its heading utility class (literals so Tailwind can scan them).
const HEADING_CLASS_BY_LEVEL = {
  2: 'text-heading-lg',
  3: 'text-heading-md',
  4: 'text-heading-sm',
  5: 'text-heading-xs',
} as const;

/** Renders the heading element matching a form-depth level (2–5) with its `text-heading-*` utility. */
export function DepthHeading({
  level,
  children,
  className,
  ...props
}: { level: 2 | 3 | 4 | 5 } & React.HTMLAttributes<HTMLHeadingElement>) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cn(HEADING_CLASS_BY_LEVEL[level], className)} {...props}>
      {children}
    </Tag>
  );
}
