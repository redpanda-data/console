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

import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import {
  getShadowLinkStateLabel,
  mapConsoleStateToUnified,
  UnifiedShadowLinkState,
  UnifiedShadowLinkStateLabel,
} from './model';
import { describe, expect, test } from 'bun:test';

describe('a link that failed over', () => {
  test.each([
    [ShadowLinkState.FAILING_OVER, 'Failing over'],
    [ShadowLinkState.FAILED_OVER, 'Failed over'],
  ])('is labelled, not Unknown, in the links list (state %s)', (state, label) => {
    expect(getShadowLinkStateLabel(state)).toBe(label);
  });

  test.each([
    [3, UnifiedShadowLinkState.FAILING_OVER, 'Failing over'],
    [4, UnifiedShadowLinkState.FAILED_OVER, 'Failed over'],
  ] as const)('keeps its state on the details page (core state %s)', (core, unified, label) => {
    expect(mapConsoleStateToUnified(core)).toBe(unified);
    expect(UnifiedShadowLinkStateLabel[unified]).toBe(label);
  });
});
