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

import { describe, expect, it } from 'vitest';

import { DIFF_COLORS } from './changes-diff-theme';

/**
 * Asserts the shape of the palette copy, not its values — pinning those would break the suite on every
 * registry palette change. What is guarded is the reading order the design needs, which is what
 * Monaco's own defaults get wrong.
 */

const alphaOf = (color: string) => Number.parseInt(color.slice(7), 16);
const hueOf = (color: string) => color.slice(0, 7);

const SIDES = [
  ['removed', DIFF_COLORS.removed],
  ['inserted', DIFF_COLORS.inserted],
] as const;

describe('DIFF_COLORS', () => {
  // Monaco's colour registry requires it: an opaque fill hides the syntax highlighting.
  it('never paints an opaque fill over the code', () => {
    const all = [...Object.values(DIFF_COLORS.removed), ...Object.values(DIFF_COLORS.inserted), DIFF_COLORS.neutral];
    for (const color of all) {
      expect(color, `${color} must be #rrggbbaa`).toMatch(/^#[0-9a-f]{8}$/);
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
    expect(alphaOf(DIFF_COLORS.removed.line)).toBe(alphaOf(DIFF_COLORS.inserted.line));
    expect(alphaOf(DIFF_COLORS.removed.gutter)).toBe(alphaOf(DIFF_COLORS.inserted.gutter));
    expect(alphaOf(DIFF_COLORS.removed.text)).toBe(alphaOf(DIFF_COLORS.inserted.text));
  });

  it('tells removals and additions apart', () => {
    expect(hueOf(DIFF_COLORS.removed.line)).not.toBe(hueOf(DIFF_COLORS.inserted.line));
  });
});
