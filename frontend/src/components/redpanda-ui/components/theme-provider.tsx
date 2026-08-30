'use client';

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

const DEFAULT_STORAGE_KEY = 'redpanda-ui-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  /** The theme the page is in. Equal to `theme`, unless that is `system`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

/** Shared by the pre-paint entry points, so they cannot resolve differently from the provider. */
type ThemeInit = {
  storageKey?: string;
  defaultTheme?: Theme;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState);

const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light' || value === 'system';

/** Safari in private mode throws on `localStorage`, and a theme is not worth an exception. */
const readStored = (storageKey: string): Theme | null => {
  try {
    const stored = localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const readSystemTheme = (): ResolvedTheme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/**
 * The three things "being in a theme" means, in one place:
 *
 *  - `data-theme` — what theme.css keys on.
 *  - `.dark` — CSS this theme does not own: a vendored stylesheet, Fumadocs' shell, Tailwind's own
 *    class-based `dark:`. It goes when theme.css's `.dark` selector does, not before.
 *  - `color-scheme` — what the *browser* keys on: scrollbars, native controls, the overscroll canvas.
 */
const applyTheme = (resolved: ResolvedTheme): void => {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
};

function ThemeProvider({ children, defaultTheme = 'system', storageKey = DEFAULT_STORAGE_KEY }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === 'undefined' ? defaultTheme : (readStored(storageKey) ?? defaultTheme)
  );
  // In state, not read during render: a bare `matchMedia` read cannot re-render on an OS flip.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'light' : readSystemTheme()
  );

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const sync = () => setSystemTheme(media.matches ? 'dark' : 'light');
    // Once on mount too: the query can have moved since the initial state.
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Another tab is the same app with the same stored preference.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey, defaultTheme]);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Persisting is an optimisation; the theme still applies for this session.
      }
      setThemeState(next);
    },
    [storageKey]
  );

  const value = useMemo<ThemeProviderState>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};

/**
 * Apply the stored theme synchronously from a client entry point, above `createRoot`. The provider can
 * only apply in its mount effect, a paint too late: the page shows the light ground and then flips.
 * Server-rendered apps have no such entry point — use `<ThemeScript />`.
 */
const initTheme = ({ storageKey = DEFAULT_STORAGE_KEY, defaultTheme = 'system' }: ThemeInit = {}): ResolvedTheme => {
  const stored = readStored(storageKey) ?? defaultTheme;
  const resolved = stored === 'system' ? readSystemTheme() : stored;
  applyTheme(resolved);
  return resolved;
};

/**
 * `initTheme`'s resolve as inline source. Blocking, because `async`, `defer` and an external file all run
 * after the paint this exists to beat; hand-minified, being a string no bundler sees. Pass the provider's
 * own arguments, or the two disagree for one paint.
 */
const themeScript = ({ storageKey = DEFAULT_STORAGE_KEY, defaultTheme = 'system' }: ThemeInit = {}): string =>
  '(function(){try{' +
  // `s` then `t`, not `getItem() || default`: a corrupt value has to fall back as the provider does.
  `var s=localStorage.getItem(${JSON.stringify(storageKey)}),` +
  `t=s==="dark"||s==="light"||s==="system"?s:${JSON.stringify(defaultTheme)},` +
  `r=t==="system"?(matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light"):t,` +
  'e=document.documentElement;' +
  'e.dataset.theme=r;e.classList.toggle("dark",r==="dark");e.style.colorScheme=r' +
  '}catch{}})()';

/**
 * `themeScript` as an element. It has to run before anything themed paints, which means `<head>` or the
 * first child of `<body>` — the latter in a Next App Router layout, which owns `<head>` itself. Put
 * `suppressHydrationWarning` on `<html>`: mutating what the server rendered is the whole job.
 */
function ThemeScript({ storageKey, defaultTheme }: ThemeInit = {}) {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: this file's own source, and only an inline script beats the first paint
      dangerouslySetInnerHTML={{ __html: themeScript({ defaultTheme, storageKey }) }}
      suppressHydrationWarning
    />
  );
}

export { initTheme, ThemeProvider, ThemeScript, themeScript, useTheme };
export type { ResolvedTheme, Theme, ThemeInit, ThemeProviderProps, ThemeProviderState };
