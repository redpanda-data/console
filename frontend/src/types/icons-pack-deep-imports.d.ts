/**
 * Types for deep per-icon imports from @icons-pack/react-simple-icons. Its exports map is verbatim
 * (`"./icons/*": "./icons/*"`), so imports must name the `.mjs` file, which TypeScript cannot pair
 * with the adjacent `.d.ts` — this ambient wildcard supplies the type instead. Deep imports are
 * deliberate: the barrel re-exports ~3000 icons (59 MB) and crashes browser-mode Vitest.
 */
declare module '@icons-pack/react-simple-icons/icons/*' {
  import type { ComponentType, SVGProps } from 'react';

  const icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; color?: string; title?: string }>;
  export default icon;
}
