/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ThemeInit } from 'components/redpanda-ui/components/theme-provider';

/**
 * Whether standalone Console's `enableDarkMode` was on when the previous page load recorded it. The theme
 * is resolved before the first paint, ahead of the bundle and its flags, so each load runs on what the
 * previous one recorded (`installDarkModeAvailabilitySync`). A flag change lands on the next load, and a
 * page never flips theme under the user. Cloud UI's theme gate uses the same key.
 */
export const DARK_MODE_AVAILABLE_KEY = 'redpanda-ui-dark-mode';

/** Dark mode available: the stored choice, else the OS preference. */
export const AVAILABLE_THEME_INIT = {
  defaultTheme: 'system',
  storageKey: 'redpanda-ui-theme',
} as const satisfies ThemeInit;

/**
 * Dark mode unavailable: light. A key nothing writes, so neither a stored `dark` nor the OS can switch the
 * page, and the user's choice is still in `AVAILABLE_THEME_INIT`'s key when the flag comes back on.
 */
export const UNAVAILABLE_THEME_INIT = {
  defaultTheme: 'light',
  storageKey: 'redpanda-ui-theme-unavailable',
} as const satisfies ThemeInit;

/** Safari in private mode throws on `localStorage`; without storage, dark mode stays unavailable. */
const readDarkModeAvailable = (): boolean => {
  try {
    return localStorage.getItem(DARK_MODE_AVAILABLE_KEY) === 'true';
  } catch {
    return false;
  }
};

let availableThisLoad: boolean | undefined;

/**
 * Read once per page load, so index.html's inline script, the pre-paint `initTheme` in bootstrap.tsx,
 * app.tsx's ThemeProvider and the header's switch agree until the next load.
 */
export const isDarkModeAvailable = (): boolean => {
  availableThisLoad ??= readDarkModeAvailable();
  return availableThisLoad;
};

export const themeInitFor = (available: boolean): ThemeInit =>
  available ? AVAILABLE_THEME_INIT : UNAVAILABLE_THEME_INIT;

/**
 * Records `isAvailable()` for the next load: now, and again when the page is left, so a flag toggled in
 * the debug dialog lands on the reload.
 */
export const installDarkModeAvailabilitySync = (isAvailable: () => boolean): (() => void) => {
  const sync = () => {
    try {
      if (isAvailable()) {
        localStorage.setItem(DARK_MODE_AVAILABLE_KEY, 'true');
      } else {
        localStorage.removeItem(DARK_MODE_AVAILABLE_KEY);
      }
    } catch {
      // Without storage the next load stays light, which is the safe answer.
    }
  };

  sync();
  window.addEventListener('pagehide', sync);
  return () => window.removeEventListener('pagehide', sync);
};
