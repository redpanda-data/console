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

import { FEATURE_FLAGS } from './components/constants';
import { themeScript } from './components/redpanda-ui/components/theme-provider';
import { STANDALONE_THEME_INIT } from './theme-init';
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const indexHtml = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');

/** Runs the boot script against a dark OS and `stored`, and returns the theme it stamps. */
const bootTheme = (stored: Record<string, string>) => {
  const root = { dataset: {} as Record<string, string>, classList: { toggle: () => undefined }, style: {} };
  runInNewContext(themeScript(STANDALONE_THEME_INIT), {
    localStorage: { getItem: (key: string) => stored[key] ?? null },
    matchMedia: () => ({ matches: true }),
    document: { documentElement: root },
  });
  return root.dataset.theme;
};

describe('index.html boot theme', () => {
  it('inlines the registry theme script for STANDALONE_THEME_INIT, so the first paint resolves the theme the app will', () => {
    expect(indexHtml).toContain(`<script>${themeScript(STANDALONE_THEME_INIT)}</script>`);
  });

  it('keeps a stored choice from switching the page unless enableDarkMode is on', () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a rollout flips the static flag; this holds both ways
    const expected = FEATURE_FLAGS.enableDarkMode ? 'dark' : 'light';

    expect(bootTheme({ 'redpanda-ui-theme': 'dark' })).toBe(expected);
    expect(bootTheme({ 'redpanda-ui-theme': 'system' })).toBe(expected);
  });
});
