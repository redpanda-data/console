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
import { STANDALONE_THEME_INIT } from './theme-init';
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const indexHtml = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');

describe('index.html boot theme', () => {
  it('inlines the registry theme script for STANDALONE_THEME_INIT, so the first paint resolves the theme the app will', () => {
    expect(indexHtml).toContain(`<script>${themeScript(STANDALONE_THEME_INIT)}</script>`);
  });
});
