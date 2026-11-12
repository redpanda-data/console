import type { CSSProperties } from 'react';

/** Dynamic geometry and chart values cross the React/CSS boundary through named custom properties. */
export type ComponentStyleVars = CSSProperties & { [key: `--console-${string}`]: string | number | undefined };
