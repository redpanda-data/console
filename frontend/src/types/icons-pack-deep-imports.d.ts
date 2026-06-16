/**
 * Types for deep per-icon imports from @icons-pack/react-simple-icons.
 *
 * The package's exports map is `"./icons/*": "./icons/*"` (verbatim, no
 * extension rewriting), so runtime imports must reference the `.mjs` file
 * explicitly — which TypeScript cannot pair with the adjacent `.d.ts`. This
 * ambient wildcard supplies the component type instead.
 *
 * Deep imports are deliberate: the package barrel re-exports ~3000 icons
 * (59 MB), which dev-mode bundlers pre-bundle whole and crash browser-mode
 * Vitest; per-icon imports load only what the app uses.
 */
declare module '@icons-pack/react-simple-icons/icons/*' {
  import type { ComponentType, SVGProps } from 'react';

  const icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; color?: string; title?: string }>;
  export default icon;
}
