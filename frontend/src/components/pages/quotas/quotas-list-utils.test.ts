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

import type { SortingState } from '@tanstack/react-table';
import { Quota_EntityType, type Quota_Value, Quota_ValueType } from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { describe, expect, test } from 'vitest';

import {
  clampPageIndex,
  getRate,
  isQuotaConfigured,
  mapEntityTypeToDisplay,
  searchToSorting,
  sortingToSearch,
} from './quotas-list-utils';

const value = (valueType: Quota_ValueType, v: number): Quota_Value => ({ valueType, value: v }) as Quota_Value;

describe('quotas-list-utils', () => {
  describe('mapEntityTypeToDisplay', () => {
    test.each([
      { entityType: Quota_EntityType.CLIENT_ID, expected: 'client-id' },
      { entityType: Quota_EntityType.CLIENT_ID_PREFIX, expected: 'client-id' },
      { entityType: Quota_EntityType.USER, expected: 'user' },
      { entityType: Quota_EntityType.IP, expected: 'ip' },
      { entityType: Quota_EntityType.UNSPECIFIED, expected: 'unknown' },
    ])('maps $entityType to $expected', ({ entityType, expected }) => {
      expect(mapEntityTypeToDisplay(entityType)).toBe(expected);
    });
  });

  describe('getRate', () => {
    const values = [value(Quota_ValueType.PRODUCER_BYTE_RATE, 1000), value(Quota_ValueType.CONSUMER_BYTE_RATE, 0)];

    test('returns the value for a present type', () => {
      expect(getRate(values, Quota_ValueType.PRODUCER_BYTE_RATE)).toBe(1000);
    });

    test('preserves an explicit 0 (not treated as absent)', () => {
      expect(getRate(values, Quota_ValueType.CONSUMER_BYTE_RATE)).toBe(0);
    });

    test('returns undefined for an absent type', () => {
      expect(getRate(values, Quota_ValueType.CONTROLLER_MUTATION_RATE)).toBeUndefined();
    });

    test('returns undefined for an empty list', () => {
      expect(getRate([], Quota_ValueType.PRODUCER_BYTE_RATE)).toBeUndefined();
    });
  });

  describe('isQuotaConfigured', () => {
    test('treats 0 as a configured (maximally-restrictive) limit', () => {
      expect(isQuotaConfigured(0)).toBe(true);
    });

    test('treats a positive value as configured', () => {
      expect(isQuotaConfigured(1000)).toBe(true);
    });

    test('treats undefined as not configured', () => {
      expect(isQuotaConfigured(undefined)).toBe(false);
    });
  });

  describe('clampPageIndex', () => {
    test('keeps an in-range page', () => {
      // 25 rows / 10 per page => 3 pages (indexes 0..2)
      expect(clampPageIndex(1, 25, 10)).toBe(1);
    });

    test('clamps an out-of-range page to the last page', () => {
      expect(clampPageIndex(9, 25, 10)).toBe(2);
    });

    test('clamps a negative page to 0', () => {
      expect(clampPageIndex(-5, 25, 10)).toBe(0);
    });

    test('returns 0 for an empty list so the genuine empty state shows', () => {
      expect(clampPageIndex(9, 0, 10)).toBe(0);
    });

    test('returns 0 when pageSize is 0', () => {
      expect(clampPageIndex(3, 25, 0)).toBe(0);
    });

    test('keeps the last full page exactly at its boundary', () => {
      // 20 rows / 10 per page => 2 pages (indexes 0..1)
      expect(clampPageIndex(1, 20, 10)).toBe(1);
      expect(clampPageIndex(2, 20, 10)).toBe(1);
    });
  });

  describe('searchToSorting', () => {
    test('returns empty sorting when no field is set', () => {
      expect(searchToSorting(undefined, undefined)).toEqual([]);
    });

    test('maps an ascending field', () => {
      expect(searchToSorting('entityName', 'asc')).toEqual([{ id: 'entityName', desc: false }]);
    });

    test('maps a descending field', () => {
      expect(searchToSorting('producerRate', 'desc')).toEqual([{ id: 'producerRate', desc: true }]);
    });

    test('defaults to ascending when direction is omitted', () => {
      expect(searchToSorting('entityType', undefined)).toEqual([{ id: 'entityType', desc: false }]);
    });
  });

  describe('sortingToSearch', () => {
    test('returns undefined fields for empty sorting', () => {
      expect(sortingToSearch([])).toEqual({ sortField: undefined, sortDirection: undefined });
    });

    test('maps a descending sort', () => {
      const sorting: SortingState = [{ id: 'consumerRate', desc: true }];
      expect(sortingToSearch(sorting)).toEqual({ sortField: 'consumerRate', sortDirection: 'desc' });
    });

    test('maps an ascending sort', () => {
      const sorting: SortingState = [{ id: 'entityName', desc: false }];
      expect(sortingToSearch(sorting)).toEqual({ sortField: 'entityName', sortDirection: 'asc' });
    });

    test('round-trips with searchToSorting', () => {
      expect(sortingToSearch(searchToSorting('producerRate', 'desc'))).toEqual({
        sortField: 'producerRate',
        sortDirection: 'desc',
      });
    });
  });
});
