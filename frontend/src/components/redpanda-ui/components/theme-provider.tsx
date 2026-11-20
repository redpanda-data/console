'use client';

// Copyright 2026 Redpanda Data, Inc.

import React, { useContext, useEffect, useState } from 'react';
import { omitUndefined } from '../lib/utils/omit-undefined';
import {
  applyTheme,
  DARK_QUERY,
  DEFAULT_STORAGE_KEY,
  isTheme,
  type ResolvedTheme,
  readStored,
  readSystemTheme,
  type Theme,
  type ThemeInit,
  themeScript,
} from './theme-provider/theme-script';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme | undefined;
  /**
   * `localStorage` key the theme persists under. `null` keeps it in memory: nothing is read, written,
   * or picked up from another tab, for a provider that follows a theme something else owns.
   */
  storageKey?: string | null | undefined;
}

interface ThemeProviderState {
  /** The theme the page is in. Equal to `theme`, unless that is `system`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

function ThemeProvider({ children, defaultTheme = 'system', storageKey = DEFAULT_STORAGE_KEY }: ThemeProviderProps) {
  const [themePreference, setThemePreference] = useState<Theme>(() =>
    typeof window === 'undefined' || storageKey === null ? defaultTheme : (readStored(storageKey) ?? defaultTheme)
  );
  // In state, not read during render: a bare `matchMedia` read cannot re-render on an OS flip.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'light' : readSystemTheme()
  );

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const sync = () => {
      setSystemTheme(media.matches ? 'dark' : 'light');
    };
    // Once on mount too: the query can have moved since the initial state.
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);

  // Another tab is the same app with the same stored preference.
  useEffect(() => {
    if (storageKey === null) {
      return;
    }
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemePreference(isTheme(event.newValue) ? event.newValue : defaultTheme);
      }
    };
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('storage', sync);
    };
  }, [storageKey, defaultTheme]);

  const resolvedTheme: ResolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = (next: Theme) => {
    if (storageKey !== null) {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Persisting is an optimisation; the theme still applies for this session.
      }
    }
    setThemePreference(next);
  };

  const value: ThemeProviderState = { theme: themePreference, resolvedTheme, setTheme };

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
 * `themeScript` as an element. It has to run before anything themed paints, which means `<head>` or the
 * first child of `<body>` — the latter in a Next App Router layout, which owns `<head>` itself. Put
 * `suppressHydrationWarning` on `<html>`: mutating what the server rendered is the whole job.
 */
function ThemeScript({ storageKey, defaultTheme }: ThemeInit = {}) {
  return <script suppressHydrationWarning>{themeScript(omitUndefined({ defaultTheme, storageKey }))}</script>;
}

export type { ResolvedTheme, Theme, ThemeInit } from './theme-provider/theme-script';
export type { ThemeProviderProps, ThemeProviderState };
export { ThemeProvider, ThemeScript, useTheme };
