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

import { themeScript } from './components/redpanda-ui/components/theme-provider';
import {
  AVAILABLE_THEME_INIT,
  DARK_MODE_AVAILABLE_KEY,
  installDarkModeAvailabilitySync,
  isDarkModeAvailable,
  UNAVAILABLE_THEME_INIT,
} from './theme-init';
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const indexHtml = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');

const bootThemeScript =
  `(function(){try{if(localStorage.getItem(${JSON.stringify(DARK_MODE_AVAILABLE_KEY)})==="true"){` +
  `${themeScript(AVAILABLE_THEME_INIT)}}else{${themeScript(UNAVAILABLE_THEME_INIT)}}}catch{}})()`;

/** Runs the boot script against a dark OS and `stored`, and returns the theme it stamps. */
const bootTheme = (stored: Record<string, string>) => {
  const root = { dataset: {} as Record<string, string>, classList: { toggle: () => undefined }, style: {} };
  runInNewContext(bootThemeScript, {
    localStorage: { getItem: (key: string) => stored[key] ?? null },
    matchMedia: () => ({ matches: true }),
    document: { documentElement: root },
  });
  return root.dataset.theme;
};

describe('index.html boot theme', () => {
  it('inlines the registry theme script for each availability, so the first paint resolves the theme the app will', () => {
    expect(indexHtml).toContain(`<script>${bootThemeScript}</script>`);
  });

  it('follows the stored choice, else the OS, only while dark mode is available', () => {
    expect(bootTheme({ [DARK_MODE_AVAILABLE_KEY]: 'true', 'redpanda-ui-theme': 'light' })).toBe('light');
    expect(bootTheme({ [DARK_MODE_AVAILABLE_KEY]: 'true' })).toBe('dark');
    expect(bootTheme({ 'redpanda-ui-theme': 'dark' })).toBe('light');
  });
});

describe('dark-mode availability', () => {
  it('records the flag now and again when the page is left, until torn down', () => {
    let enabled = true;
    const teardown = installDarkModeAvailabilitySync(() => enabled);
    expect(localStorage.getItem(DARK_MODE_AVAILABLE_KEY)).toBe('true');

    enabled = false;
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(DARK_MODE_AVAILABLE_KEY)).toBeNull();

    teardown();
    enabled = true;
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(DARK_MODE_AVAILABLE_KEY)).toBeNull();
  });

  it('reads the recorded availability once per page load', () => {
    localStorage.setItem(DARK_MODE_AVAILABLE_KEY, 'true');
    expect(isDarkModeAvailable()).toBe(true);

    localStorage.removeItem(DARK_MODE_AVAILABLE_KEY);
    expect(isDarkModeAvailable()).toBe(true);
  });
});
