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

import type { Monaco } from '@monaco-editor/react';
import { editorTheme } from 'components/redpanda-ui/lib/editor-theme';
import { useCallback, useEffect, useRef } from 'react';

import { useThemeAppearance } from './use-theme-appearance';

export const MONACO_THEME_NAME = 'redpanda-editor';

const applyTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(MONACO_THEME_NAME, editorTheme());
  monaco.editor.setTheme(MONACO_THEME_NAME);
};

/**
 * The token-built Monaco theme for an editor: pass `theme` to it and call `beforeMount` with the
 * instance. `defineTheme` is a snapshot and global, so a theme flip re-resolves it for every mounted
 * editor.
 */
export function useMonacoTheme() {
  const appearance = useThemeAppearance();
  const monacoRef = useRef<Monaco | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `appearance` only triggers the re-resolve
  useEffect(() => {
    if (monacoRef.current) {
      applyTheme(monacoRef.current);
    }
  }, [appearance]);

  const beforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    applyTheme(monaco);
  }, []);

  return { theme: MONACO_THEME_NAME, beforeMount };
}
