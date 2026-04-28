import React from 'react';

const FormDepthContext = React.createContext(0);

export function useFormDepth(): number {
  return React.useContext(FormDepthContext);
}

export function FormDepthProvider({ depth, children }: { depth: number; children: React.ReactNode }) {
  return <FormDepthContext.Provider value={depth}>{children}</FormDepthContext.Provider>;
}

/**
 * Map a nesting depth (0 = root section, 1 = first-nested, ...) to an
 * HTML heading level. Root sections render as h2 because h1 is reserved
 * for the page heading. The clamp at 5 matches the `Heading` component's
 * styled variants (h1..h5). Depth is always ≥ 0 because the context
 * initialises at 0 and is only incremented, so no lower-bound guard is
 * needed.
 */
export function headingLevelForDepth(depth: number): 2 | 3 | 4 | 5 {
  const level = 2 + depth;
  if (level > 5) {
    return 5;
  }
  return level as 2 | 3 | 4 | 5;
}
