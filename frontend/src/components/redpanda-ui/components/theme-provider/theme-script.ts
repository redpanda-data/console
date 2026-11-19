'use client';

export type Theme = 'dark' | 'light' | 'system';

export type ResolvedTheme = 'dark' | 'light';

export const DEFAULT_STORAGE_KEY = 'redpanda-ui-theme';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Shared by the pre-paint entry points, so they cannot resolve differently from the provider. */
export interface ThemeInit {
  defaultTheme?: Theme;
  storageKey?: string;
}

export const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light' || value === 'system';

/** Safari in private mode throws on `localStorage`, and a theme is not worth an exception. */
export const readStored = (storageKey: string): Theme | null => {
  try {
    const stored = localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const readSystemTheme = (): ResolvedTheme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/**
 * The three things "being in a theme" means, in one place:
 *
 *  - `data-theme` — what theme.css keys on.
 *  - `.dark` — CSS this theme does not own: a vendored stylesheet, Fumadocs' shell, Tailwind's own
 *    class-based `dark:`. It goes when theme.css's `.dark` selector does, not before.
 *  - `color-scheme` — what the *browser* keys on: scrollbars, native controls, the overscroll canvas.
 */
export const applyTheme = (resolved: ResolvedTheme): void => {
  const root = document.documentElement;
  root.dataset['theme'] = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
};

/**
 * Apply the stored theme synchronously from a client entry point, above `createRoot`. The provider can
 * only apply in its mount effect, a paint too late: the page shows the light ground and then flips.
 * Server-rendered apps have no such entry point — use `<ThemeScript />`.
 */
export const initTheme = ({
  storageKey = DEFAULT_STORAGE_KEY,
  defaultTheme = 'system',
}: ThemeInit = {}): ResolvedTheme => {
  const stored = readStored(storageKey) ?? defaultTheme;
  const resolved = stored === 'system' ? readSystemTheme() : stored;
  applyTheme(resolved);
  return resolved;
};

/** JSON for an inline script, with HTML and JavaScript line separators escaped. */
export const inlineScriptString = (value: string): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

/**
 * `initTheme`'s resolve as inline source. Blocking, because `async`, `defer` and an external file all run
 * after the paint this exists to beat; hand-minified, being a string no bundler sees. Pass the provider's
 * own arguments, or the two disagree for one paint.
 */
export const themeScript = ({ storageKey = DEFAULT_STORAGE_KEY, defaultTheme = 'system' }: ThemeInit = {}): string =>
  '(function(){try{' +
  // `s` then `t`, not `getItem() || default`: a corrupt value has to fall back as the provider does.
  `var s=localStorage.getItem(${inlineScriptString(storageKey)}),` +
  `t=s==="dark"||s==="light"||s==="system"?s:${inlineScriptString(defaultTheme)},` +
  `r=t==="system"?(matchMedia(${inlineScriptString(DARK_QUERY)}).matches?"dark":"light"):t,` +
  'e=document.documentElement;' +
  'e.dataset.theme=r;e.classList.toggle("dark",r==="dark");e.style.colorScheme=r' +
  '}catch{}})()';
