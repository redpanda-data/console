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

import { describe, expect, test } from '@rstest/core';

import { isModifiedClick } from './mouse-events';

const click = (overrides: Partial<Parameters<typeof isModifiedClick>[0]> = {}) => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  button: 0,
  ...overrides,
});

describe('isModifiedClick', () => {
  test('plain left click is unmodified', () => {
    expect(isModifiedClick(click())).toBe(false);
  });

  test.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
  ])('%s marks the click as modified', (_name, overrides) => {
    expect(isModifiedClick(click(overrides))).toBe(true);
  });

  test.each([
    ['middle', 1],
    ['right', 2],
  ])('%s button is not a primary click', (_name, button) => {
    expect(isModifiedClick(click({ button }))).toBe(true);
  });
});
