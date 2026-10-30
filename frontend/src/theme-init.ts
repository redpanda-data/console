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

import { FEATURE_FLAGS } from 'components/constants';
import type { ThemeInit } from 'components/redpanda-ui/components/theme-provider';

/**
 * Standalone Console's theme resolve, shared by index.html's inline script, the pre-paint `initTheme` in
 * bootstrap.tsx and app.tsx's ThemeProvider, so the three cannot disagree for a paint. With
 * `enableDarkMode` the default is the OS preference until the user picks one in the header's switcher;
 * without it, light, read from a key only the dev switcher writes, so a stored choice cannot switch the
 * page and is still there when the flag comes back on. Read from the static default rather than
 * `isFeatureFlagEnabled`, because the inline script is built from it: flipping the flag fails
 * theme-init.test.ts until index.html is regenerated.
 */
export const STANDALONE_THEME_INIT = (
  FEATURE_FLAGS.enableDarkMode
    ? { defaultTheme: 'system' }
    : { defaultTheme: 'light', storageKey: 'redpanda-ui-theme-unavailable' }
) satisfies ThemeInit;
