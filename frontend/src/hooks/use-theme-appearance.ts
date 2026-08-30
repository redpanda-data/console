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
/** Keep in step with `isDarkGround` in redpanda-ui/lib/editor-theme, or Monaco disagrees with the shell. */
const DARK_BELOW = 0.4;

/** Painting resolves the token whatever it is — a hex, a `var()` chain, a wash. */
const paintGround = (): string => {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = `var(${GROUND_TOKEN})`;
  // `body` is missing only if this runs before mount; the root carries the same palette.
  (document.body ?? document.documentElement).append(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  return painted;
};

/**
 * Canvas rather than a regex: a computed colour can come back as `rgb()`, `color(srgb …)` from a
 * `color-mix()`, or `oklch()` verbatim, and reading the first three numbers out of the last two
 * misreads them badly — `color(srgb 0.9 0.9 0.9)` is near-white, not near-black. Rasterising hands
 * back sRGB bytes for every format. Null when there is no canvas, as in jsdom.
 */
const toSrgb = (painted: string): Srgb | null => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!(context && painted)) {
    return null;
  }
  // An unparseable colour leaves the previous fill, so seed the safe answer rather than black.
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
export const classifyGround = (ground: Srgb | null): ThemeAppearance => {
  if (!ground) {
    return 'light';
  }
  const [r, g, b] = ground;
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance < DARK_BELOW ? 'dark' : 'light';
};

/** Shared: the appearance belongs to the document, not to any one subscriber. */
let cached: ThemeAppearance | null = null;

// A palette swap always lands on the root — that is how theme.css itself is keyed.
const THEME_ATTRIBUTES = ['class', 'data-theme', 'data-theme-palette', 'style'];

function subscribe(onStoreChange: () => void): () => void {
  // Nothing was watching until now, so any cached answer may predate a theme change.
  cached = null;
  const observer = new MutationObserver(() => {
    cached = null;
    onStoreChange();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
  return () => observer.disconnect();
}

// Cached so this stays cheap across renders; the observer clears it.
const getSnapshot = (): ThemeAppearance => {
  cached ??= classifyGround(toSrgb(paintGround()));
  return cached;
};

export function useThemeAppearance(): ThemeAppearance {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light');
}
