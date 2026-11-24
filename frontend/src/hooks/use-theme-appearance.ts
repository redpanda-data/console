import { useSyncExternalStore } from 'react';

/**
 * Which appearance the active theme paints. Themes are named, and a name says nothing about its
 * ground — there can be several dark ones — so this reads the ground the theme actually painted.
 * For surfaces that can't read a CSS variable and need the binary answer: react-flow's `colorMode`,
 * Sonner's `theme`, CodeMirror's `dark` flag.
 */
export type ThemeAppearance = 'light' | 'dark';

type Srgb = [r: number, g: number, b: number];

const GROUND_TOKEN = '--color-background';
// WARNING: Keep the cutoff aligned with the registry editor's isDarkGround so Monaco and Console agree on the same theme.
const DARK_BELOW = 0.4;

const paintGround = () => {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = `var(${GROUND_TOKEN})`;
  (document.body ?? document.documentElement).append(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  return painted;
};

const createPixelCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
};

const toSrgb: (painted: string) => Srgb | null = (painted) => {
  const canvas = createPixelCanvas();
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!(context && painted)) {
    return null;
  }
  context.fillStyle = '#ffffff';
  context.fillStyle = painted;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
};

const toLinear = (value: number) => {
  const scaled = value / 255;
  return scaled <= 0.040_45 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

/**
 * Exported for tests — the DOM and canvas halves can't run in jsdom. An unreadable ground counts as
 * light: a light surface in a dark shell is untidy, the reverse can be unreadable.
 */
export const classifyGround: (ground: Srgb | null) => ThemeAppearance = (ground) => {
  if (!ground) {
    return 'light';
  }
  const [r, g, b] = ground;
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance < DARK_BELOW ? 'dark' : 'light';
};

let cached: ThemeAppearance | null = null;

const THEME_ATTRIBUTES = ['class', 'data-theme', 'data-theme-palette', 'style'];

function subscribe(onStoreChange: () => void) {
  cached = null;
  const observer = new MutationObserver(() => {
    cached = null;
    onStoreChange();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
  return () => observer.disconnect();
}

const getSnapshot = () => {
  cached ??= classifyGround(toSrgb(paintGround()));
  return cached;
};

/**
 * Derives appearance from the painted background, not a theme name or assumed CSS color syntax. Canvas normalizes variable-backed and wide-gamut colors to sRGB before classification. The snapshot is document-wide.
 */
export function useThemeAppearance(): ThemeAppearance {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light');
}
