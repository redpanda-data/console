'use client';

// Copyright 2026 Redpanda Data, Inc.

import { createColorScheme, createLocalStorage } from '@ui-sdk/core';
import { usePreference } from '@ui-sdk/react/preferences';
import React, { useCallback, useContext, useEffect, useMemo } from 'react';

type Theme = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

const DEFAULT_STORAGE_KEY = 'redpanda-ui-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  /**
   * `localStorage` key the theme persists under. `null` keeps it in memory: nothing is read, written,
   * or picked up from another tab, for a provider that follows a theme something else owns.
   */
  storageKey?: string | null;
}

interface ThemeProviderState {
  /** The theme the page is in. Equal to `theme`, unless that is `system`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

/** Shared by the pre-paint entry points, so they cannot resolve differently from the provider. */
interface ThemeInit {
  defaultTheme?: Theme;
  storageKey?: string;
}

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
  const preference = useMemo(
    () => createColorScheme({
      defaultValue: defaultTheme,
      initial: typeof window === 'undefined' ? 'unknown' : readSystemTheme(),
      storage: storageKey === null ? undefined : createLocalStorage(storageKey),
    }),
    [defaultTheme, storageKey]
  );
  const { value: theme, resolved } = usePreference(preference);
  const resolvedTheme: ResolvedTheme = resolved === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    preference.set(next);
  }, [preference]);

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

/** JSON for an inline script, with HTML and JavaScript line separators escaped. */
const inlineScriptString = (value: string): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

/**
 * `initTheme`'s resolve as inline source. Blocking, because `async`, `defer` and an external file all run
 * after the paint this exists to beat; hand-minified, being a string no bundler sees. Pass the provider's
 * own arguments, or the two disagree for one paint.
 */
const themeScript = ({ storageKey = DEFAULT_STORAGE_KEY, defaultTheme = 'system' }: ThemeInit = {}): string =>
  '(function(){try{' +
  // `s` then `t`, not `getItem() || default`: a corrupt value has to fall back as the provider does.
  `var s=localStorage.getItem(${inlineScriptString(storageKey)}),` +
  `t=s==="dark"||s==="light"||s==="system"?s:${inlineScriptString(defaultTheme)},` +
  `r=t==="system"?(matchMedia(${inlineScriptString(DARK_QUERY)}).matches?"dark":"light"):t,` +
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
    <script dangerouslySetInnerHTML={{ __html: themeScript({ defaultTheme, storageKey }) }} suppressHydrationWarning />
  );
}

export type { ResolvedTheme, Theme, ThemeInit, ThemeProviderProps, ThemeProviderState };
export { initTheme, ThemeProvider, ThemeScript, themeScript, useTheme };
