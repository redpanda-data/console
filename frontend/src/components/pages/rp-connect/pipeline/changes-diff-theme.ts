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
import { type EditorTheme, editorTheme } from 'components/redpanda-ui/lib/editor-theme';

/** The tokens the diff paints on top of the editor theme, and which theme token each reads. */
const DIFF_TOKENS = {
  removed: '--color-surface-destructive',
  inserted: '--color-surface-success',
  neutral: '--color-border',
} as const;

export type DiffBase = Record<keyof typeof DIFF_TOKENS, string>;

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

export const diffColors = (base: DiffBase) => ({
  removed: {
    line: withAlpha(base.removed, DIFF_ALPHA.line),
    gutter: withAlpha(base.removed, DIFF_ALPHA.gutter),
    text: withAlpha(base.removed, DIFF_ALPHA.text),
  },
  inserted: {
    line: withAlpha(base.inserted, DIFF_ALPHA.line),
    gutter: withAlpha(base.inserted, DIFF_ALPHA.gutter),
    text: withAlpha(base.inserted, DIFF_ALPHA.text),
  },
  neutral: withAlpha(base.neutral, DIFF_ALPHA.fill),
  transparent: '#00000000',
});

const HEX_CHANNEL = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
const RGB_PARTS = /-?[\d.]+/g;

/** `rgb(24, 24, 24)` → `#181818`; alpha is dropped since the tiers above supply their own. */
const toHex = (painted: string): string => {
  const parts = (painted.match(RGB_PARTS) ?? []).map(Number);
  if (parts.length < 3) {
    return '#000000';
  }
  return `#${HEX_CHANNEL(parts[0])}${HEX_CHANNEL(parts[1])}${HEX_CHANNEL(parts[2])}`;
};

// Monaco can't read CSS vars: paint each token on a probe and read the rgb() back, as redpanda-ui/lib/editor-theme does.
const resolveDiffBase = (): DiffBase => {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);

  const resolved = {} as DiffBase;
  for (const [name, token] of Object.entries(DIFF_TOKENS) as [keyof DiffBase, string][]) {
    probe.style.color = `var(${token})`;
    resolved[name] = toHex(getComputedStyle(probe).color);
  }

  probe.remove();
  return resolved;
};

export const DIFF_THEME = 'rpcn-changes-diff';

// Transparent chrome so the panel surface shows through, as the YAML lanes' `redpanda-yaml` theme does.
export const diffTheme = (editor: EditorTheme, base: DiffBase): EditorTheme => {
  const colors = diffColors(base);
  return {
    ...editor,
    colors: {
      ...editor.colors,
      'diffEditor.unchangedRegionBackground': colors.transparent,

      'diffEditor.removedLineBackground': colors.removed.line,
      'diffEditor.removedTextBackground': colors.removed.text,
      'diffEditorGutter.removedLineBackground': colors.removed.gutter,

      'diffEditor.insertedLineBackground': colors.inserted.line,
      'diffEditor.insertedTextBackground': colors.inserted.text,
      'diffEditorGutter.insertedLineBackground': colors.inserted.gutter,

      'diffEditor.diagonalFill': colors.neutral,
    },
  };
};

// A snapshot, not a binding — run again on every theme flip.
export const applyDiffTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(DIFF_THEME, diffTheme(editorTheme({ transparentBackground: true }), resolveDiffBase()));
  monaco.editor.setTheme(DIFF_THEME);
};
