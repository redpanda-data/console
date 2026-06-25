import React from 'react';

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
