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

/**
 * Light-theme values of the semantic tokens, since Monaco can only take literal hex. A copy, so re-check
 * it against `theme.css` when the registry palette moves — nothing fails automatically. Not the
 * `--color-*-alpha-*` ramps: they are being retired, and are not built on these hues.
 */
const DIFF_BASE = {
  /** `--color-destructive` → `--color-red-600`. */
  removed: '#cd372c',
  /** `--color-success` → `--color-green-600`. */
  inserted: '#25855a',
  /** `--color-border` → `--color-grey-200`. The hatching is a divider, not a state. */
  neutral: '#c3c4c6',
} as const;

/** Monaco requires non-opaque fills, so emphasis is alpha over the semantic hue. */
const DIFF_ALPHA = {
  line: 0.08,
  gutter: 0.12,
  /** Composites over `line`, so it lands near a third. */
  text: 0.24,
  /** The hatching is already a light grey, so less sheer. */
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

/**
 * Three tiers — line, gutter, changed words — rather than one flat wash, and the chrome cleared so the
 * panel's surface shows through (as `kowl-transparent` does for the YAML lanes).
 *
 * Monaco's defaults are why an unthemed diff shouts: removals are pure `rgb(255, 0, 0)` doubled up on
 * the changed words, additions a muted olive, so deletions read as an error and additions as an
 * afterthought.
 */
export const defineDiffTheme = (monaco: Monaco) =>
  monaco.editor.defineTheme(DIFF_THEME, {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': DIFF_COLORS.transparent,
      'editorGutter.background': DIFF_COLORS.transparent,
      // The collapsed-region strip, otherwise a filled grey band across our surface.
      'diffEditor.unchangedRegionBackground': DIFF_COLORS.transparent,

      'diffEditor.removedLineBackground': DIFF_COLORS.removed.line,
      'diffEditor.removedTextBackground': DIFF_COLORS.removed.text,
      'diffEditorGutter.removedLineBackground': DIFF_COLORS.removed.gutter,

      'diffEditor.insertedLineBackground': DIFF_COLORS.inserted.line,
      'diffEditor.insertedTextBackground': DIFF_COLORS.inserted.text,
      'diffEditorGutter.insertedLineBackground': DIFF_COLORS.inserted.gutter,

      // An absence rather than a change, so neutral.
      'diffEditor.diagonalFill': DIFF_COLORS.neutral,
    },
    rules: [],
  });
