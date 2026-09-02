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

// Light-theme hex copies of the semantic tokens (Monaco can't read CSS vars); re-check against theme.css
// when the palette moves. Never the retiring `--color-*-alpha-*` ramps.
const DIFF_BASE = {
  /** `--color-surface-destructive` */
  removed: '#cd372c',
  /** `--color-surface-success` */
  inserted: '#25855a',
  /** `--color-border` */
  neutral: '#c3c4c6',
} as const;

const DIFF_ALPHA = {
  line: 0.08,
  gutter: 0.12,
  text: 0.24,
  fill: 0.6,
} as const;

const withAlpha = (hex: string, alpha: number): string =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;

export const DIFF_COLORS = {
  removed: {
    line: withAlpha(DIFF_BASE.removed, DIFF_ALPHA.line),
    gutter: withAlpha(DIFF_BASE.removed, DIFF_ALPHA.gutter),
    text: withAlpha(DIFF_BASE.removed, DIFF_ALPHA.text),
  },
  inserted: {
    line: withAlpha(DIFF_BASE.inserted, DIFF_ALPHA.line),
    gutter: withAlpha(DIFF_BASE.inserted, DIFF_ALPHA.gutter),
    text: withAlpha(DIFF_BASE.inserted, DIFF_ALPHA.text),
  },
  neutral: withAlpha(DIFF_BASE.neutral, DIFF_ALPHA.fill),
  transparent: '#00000000',
} as const;

export const DIFF_THEME = 'rpcn-changes-diff';

// Transparent chrome so the panel surface shows through, as the YAML lanes' `redpanda-yaml` theme does.
export const defineDiffTheme = (monaco: Monaco) =>
  monaco.editor.defineTheme(DIFF_THEME, {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': DIFF_COLORS.transparent,
      'editorGutter.background': DIFF_COLORS.transparent,
      'diffEditor.unchangedRegionBackground': DIFF_COLORS.transparent,

      'diffEditor.removedLineBackground': DIFF_COLORS.removed.line,
      'diffEditor.removedTextBackground': DIFF_COLORS.removed.text,
      'diffEditorGutter.removedLineBackground': DIFF_COLORS.removed.gutter,

      'diffEditor.insertedLineBackground': DIFF_COLORS.inserted.line,
      'diffEditor.insertedTextBackground': DIFF_COLORS.inserted.text,
      'diffEditorGutter.insertedLineBackground': DIFF_COLORS.inserted.gutter,

      'diffEditor.diagonalFill': DIFF_COLORS.neutral,
    },
    rules: [],
  });
