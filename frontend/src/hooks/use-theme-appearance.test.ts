// Copyright 2026 Redpanda Data, Inc.

import { classifyGround } from './use-theme-appearance';
import { describe, expect, it } from 'bun:test';

/**
 * Keeps theming name-agnostic: a theme called `midnight` has to come out dark with nothing matching
 * on the string `dark`. The threshold also has to agree with `isDarkGround` in
 * redpanda-ui/lib/editor-theme, or Monaco and the shell disagree on one page.
 */
describe('classifyGround', () => {
  it('classifies the shipped grounds', () => {
    expect(classifyGround([22, 22, 22])).toBe('dark');
    expect(classifyGround([6, 6, 6])).toBe('dark');
    expect(classifyGround([255, 255, 255])).toBe('light');
  });

  it('goes by the ground, not by any name', () => {
    expect(classifyGround([11, 16, 32])).toBe('dark');
    expect(classifyGround([251, 247, 236])).toBe('light');
  });

  it('counts a near-white ground as light', () => {
    // What `color-mix(in srgb, #fff 90%, #000)` rasterises to. Read as raw `color(srgb 0.9 …)`
    expect(classifyGround([230, 230, 230])).toBe('light');
  });

  it('treats an unreadable ground as light', () => {
    expect(classifyGround(null)).toBe('light');
  });

  it('weights green over blue, per WCAG relative luminance', () => {
    expect(classifyGround([0, 210, 0])).toBe('light');
    expect(classifyGround([0, 0, 210])).toBe('dark');
  });

  it('pins the threshold either side of grey 170', () => {
    expect(classifyGround([175, 175, 175])).toBe('light');
    expect(classifyGround([165, 165, 165])).toBe('dark');
  });
});
