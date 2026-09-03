// Copyright 2026 Redpanda Data, Inc.

import { describe, expect, it } from '@rstest/core';

import { classifyGround } from './use-theme-appearance';

/**
 * Keeps theming name-agnostic: a theme called `midnight` has to come out dark with nothing matching
 * on the string `dark`. The threshold also has to agree with `isDarkGround` in
 * redpanda-ui/lib/editor-theme, or Monaco and the shell disagree on one page.
 */
describe('classifyGround', () => {
  it('classifies the shipped grounds', () => {
    expect(classifyGround([22, 22, 22])).toBe('dark'); // dark  --color-background
    expect(classifyGround([6, 6, 6])).toBe('dark'); // dark  --color-page
    expect(classifyGround([255, 255, 255])).toBe('light'); // light --color-background
  });

  it('goes by the ground, not by any name', () => {
    // A navy `midnight` and a cream `parchment` — neither name says which it is.
    expect(classifyGround([11, 16, 32])).toBe('dark');
    expect(classifyGround([251, 247, 236])).toBe('light');
  });

  it('counts a near-white ground as light', () => {
    // What `color-mix(in srgb, #fff 90%, #000)` rasterises to. Read as raw `color(srgb 0.9 …)`
    // numbers instead, this would have come out dark.
    expect(classifyGround([230, 230, 230])).toBe('light');
  });

  it('treats an unreadable ground as light', () => {
    expect(classifyGround(null)).toBe('light');
  });

  it('weights green over blue, per WCAG relative luminance', () => {
    // Identical channel value, opposite verdicts: green carries 0.7152 of the luminance, blue 0.0722.
    expect(classifyGround([0, 210, 0])).toBe('light');
    expect(classifyGround([0, 0, 210])).toBe('dark');
  });

  it('pins the threshold either side of grey 170', () => {
    // Where luminance 0.4 falls. Moving it means re-checking editor-theme's copy.
    expect(classifyGround([175, 175, 175])).toBe('light');
    expect(classifyGround([165, 165, 165])).toBe('dark');
  });
});
