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

import type { EditorTheme } from 'components/redpanda-ui/lib/editor-theme';
import { describe, expect, it } from 'vitest';

import { type DiffBase, diffColors, diffTheme } from './changes-diff-theme';

/**
 * Asserts the shape of the palette, not its values — pinning those would break the suite on every
 * registry palette change. What is guarded is the reading order the design needs, which is what
 * Monaco's own defaults get wrong.
 */

const RGBA_HEX = /^#[0-9a-f]{8}$/;
const alphaOf = (color: string) => Number.parseInt(color.slice(7), 16);
const hueOf = (color: string) => color.slice(0, 7);

// Any three distinct hues stand in for the resolved tokens.
const BASE: DiffBase = { removed: '#cd372c', inserted: '#25855a', neutral: '#c3c4c6' };
const COLORS = diffColors(BASE);

const SIDES = [
  ['removed', COLORS.removed],
  ['inserted', COLORS.inserted],
] as const;

describe('diffColors', () => {
  // Monaco's colour registry requires it: an opaque fill hides the syntax highlighting.
  it('never paints an opaque fill over the code', () => {
    const all = [...Object.values(COLORS.removed), ...Object.values(COLORS.inserted), COLORS.neutral];
    for (const color of all) {
      expect(color, `${color} must be #rrggbbaa`).toMatch(RGBA_HEX);
      expect(alphaOf(color)).toBeLessThan(255);
      expect(alphaOf(color)).toBeGreaterThan(0);
    }
  });

  it.each(SIDES)('weights %s words above its gutter above its line', (_name, side) => {
    expect(alphaOf(side.text)).toBeGreaterThan(alphaOf(side.gutter));
    expect(alphaOf(side.gutter)).toBeGreaterThan(alphaOf(side.line));
  });

  it.each(SIDES)('keeps %s to a single hue across its tiers', (_name, side) => {
    expect(new Set([hueOf(side.line), hueOf(side.gutter), hueOf(side.text)]).size).toBe(1);
  });

  it('gives removals and additions the same weight', () => {
    expect(alphaOf(COLORS.removed.line)).toBe(alphaOf(COLORS.inserted.line));
    expect(alphaOf(COLORS.removed.gutter)).toBe(alphaOf(COLORS.inserted.gutter));
    expect(alphaOf(COLORS.removed.text)).toBe(alphaOf(COLORS.inserted.text));
  });

  it('paints with the hues it was handed, so a dark palette reaches the diff', () => {
    expect(hueOf(COLORS.removed.line)).toBe(BASE.removed);
    expect(hueOf(COLORS.inserted.line)).toBe(BASE.inserted);
    expect(hueOf(COLORS.neutral)).toBe(BASE.neutral);
  });
});

describe('diffTheme', () => {
  const editor: EditorTheme = {
    base: 'vs-dark',
    inherit: false,
    colors: { 'editor.background': '#00000000', 'editorLineNumber.foreground': '#9c9c9c' },
    rules: [{ token: 'string', foreground: '2fe572' }],
  };
  const theme = diffTheme(editor, BASE);

  // The ground decides light/dark, so the diff must not pin a base of its own.
  it('keeps the editor theme base, syntax rules, and chrome', () => {
    expect(theme.base).toBe(editor.base);
    expect(theme.inherit).toBe(editor.inherit);
    expect(theme.rules).toEqual(editor.rules);
    expect(theme.colors).toMatchObject(editor.colors);
  });

  it('lets the panel surface show through the unchanged regions', () => {
    expect(theme.colors['diffEditor.unchangedRegionBackground']).toBe('#00000000');
  });

  it('layers every diff tier on the editor theme', () => {
    expect(theme.colors['diffEditor.removedLineBackground']).toBe(COLORS.removed.line);
    expect(theme.colors['diffEditorGutter.removedLineBackground']).toBe(COLORS.removed.gutter);
    expect(theme.colors['diffEditor.removedTextBackground']).toBe(COLORS.removed.text);
    expect(theme.colors['diffEditor.insertedLineBackground']).toBe(COLORS.inserted.line);
    expect(theme.colors['diffEditorGutter.insertedLineBackground']).toBe(COLORS.inserted.gutter);
    expect(theme.colors['diffEditor.insertedTextBackground']).toBe(COLORS.inserted.text);
    expect(theme.colors['diffEditor.diagonalFill']).toBe(COLORS.neutral);
  });
});
