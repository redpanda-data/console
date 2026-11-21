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

describe('a link that failed over, or whose failover stopped', () => {
  test.each([
    [ShadowLinkState.FAILING_OVER, 'Failing over'],
    [ShadowLinkState.FAILED_OVER, 'Failed over'],
    [ShadowLinkState.FAILOVER_FAULTED, 'Failover stopped'],
  ])('is labelled, not Unknown, in the links list (state %s)', (state, label) => {
    expect(getShadowLinkStateLabel(state)).toBe(label);
  });

  test.each([
    [ShadowLinkState.FAILING_OVER, UnifiedShadowLinkState.FAILING_OVER, 'Failing over'],
    [ShadowLinkState.FAILED_OVER, UnifiedShadowLinkState.FAILED_OVER, 'Failed over'],
    [ShadowLinkState.FAILOVER_FAULTED, UnifiedShadowLinkState.FAILOVER_FAULTED, 'Failover stopped'],
  ] as const)('keeps its state on the details page (core state %s)', (core, unified, label) => {
    expect(mapConsoleStateToUnified(core)).toBe(unified);
    expect(UnifiedShadowLinkStateLabel[unified]).toBe(label);
  });
});
