import type { CSSProperties } from 'react';

/** Dynamic geometry and chart values cross the React/CSS boundary through named custom properties. */
export type ComponentStyleVars = CSSProperties & Record<`--console-${string}`, string | number | undefined>;
