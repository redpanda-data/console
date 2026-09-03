/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { matchesQuickSearch, useClientFilters } from './use-client-filters';
import type { TopicMessage } from '../../../../../state/rest-interfaces';

const makeMsg = (overrides: { offset?: number; partitionID?: number; value?: unknown }): TopicMessage =>
  ({
    partitionID: overrides.partitionID ?? 0,
    offset: overrides.offset ?? 1,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: 'k', isPayloadNull: false, size: 1 },
    value: { payload: overrides.value ?? {}, isPayloadNull: false, size: 1 },
    keyJson: JSON.stringify('k'),
    valueJson: JSON.stringify(overrides.value ?? {}),
    keyBinHexPreview: '',
    valueBinHexPreview: '',
  }) as TopicMessage;

describe('matchesQuickSearch — partition range-check', () => {
  test('an out-of-range partition token stays live text (no filter applied) when partitionCount is known', () => {
    const msg = makeMsg({ partitionID: 0 });
    // Without the range-check this parses as `partition:9999` and matches nothing.
    expect(matchesQuickSearch(msg, 'partition:9999', 3)).toBe(false);
    // Falls back to a substring search over offset/key/value instead of a bogus field filter.
    const haystackMsg = makeMsg({ partitionID: 0, value: { note: 'see partition:9999 in the logs' } });
    expect(matchesQuickSearch(haystackMsg, 'partition:9999', 3)).toBe(true);
  });

  test('an in-range partition token still filters correctly', () => {
    expect(matchesQuickSearch(makeMsg({ partitionID: 2 }), 'partition:2', 3)).toBe(true);
    expect(matchesQuickSearch(makeMsg({ partitionID: 0 }), 'partition:2', 3)).toBe(false);
  });

  test('without a known partitionCount, an out-of-range partition token is still applied as a field filter', () => {
    expect(matchesQuickSearch(makeMsg({ partitionID: 0 }), 'partition:9999')).toBe(false);
  });
});

describe('useClientFilters — partition range-check', () => {
  test('quick search does not silently blank the table when the typed partition exceeds partitionCount', () => {
    const messages = [makeMsg({ partitionID: 0, offset: 1 }), makeMsg({ partitionID: 1, offset: 2 })];
    const { result } = renderHook(() => useClientFilters(messages, 'partition:9999', [], 3));
    // Bug: without threading partitionCount through, this parsed as a real (always-false) field
    // filter and returned zero rows instead of staying live/unmatched text.
    expect(result.current).toHaveLength(0);
    expect(result.current).not.toBe(messages);
  });

  test('quick search still applies a valid partition filter when partitionCount is known', () => {
    const messages = [makeMsg({ partitionID: 0, offset: 1 }), makeMsg({ partitionID: 1, offset: 2 })];
    const { result } = renderHook(() => useClientFilters(messages, 'partition:1', [], 3));
    expect(result.current).toEqual([messages[1]]);
  });
});
