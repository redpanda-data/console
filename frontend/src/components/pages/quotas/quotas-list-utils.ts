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

import {
  Quota_EntityType,
  type Quota_Value,
  type Quota_ValueType,
} from '../../../protogen/redpanda/api/dataplane/v1/quota_pb';

export type QuotaEntityDisplay = 'client-id' | 'user' | 'ip' | 'unknown';

export type QuotaSortField = 'entityType' | 'entityName' | 'producerRate' | 'consumerRate' | 'controllerMutationRate';

export type QuotaSortDirection = 'asc' | 'desc';

/** Maps protobuf EntityType enum to its display string. */
export const mapEntityTypeToDisplay = (entityType: Quota_EntityType): QuotaEntityDisplay => {
  switch (entityType) {
    case Quota_EntityType.CLIENT_ID:
    case Quota_EntityType.CLIENT_ID_PREFIX:
      return 'client-id';
    case Quota_EntityType.USER:
      return 'user';
    case Quota_EntityType.IP:
      return 'ip';
    default:
      return 'unknown';
  }
};

/** Returns the value for a given quota type, or `undefined` when that type is not present. */
export const getRate = (values: Quota_Value[], valueType: Quota_ValueType): number | undefined =>
  values.find((v) => v.valueType === valueType)?.value;

/**
 * A quota of `0` is a real, maximally-restrictive limit, so only an absent
 * (undefined) value counts as "no limit configured".
 */
export const isQuotaConfigured = (value?: number): value is number => value !== undefined;

/**
 * Clamps a requested page index to the valid range for the current data so a stale or
 * too-large `?page=` can't render a false "No quotas configured" empty state. An empty
 * list has no pages, so it clamps to 0 (the genuine empty state).
 */
export const clampPageIndex = (requestedPage: number, rowCount: number, pageSize: number): number => {
  const pageCount = pageSize > 0 ? Math.ceil(rowCount / pageSize) : 0;
  if (pageCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(requestedPage, 0), pageCount - 1);
};

/** Derives TanStack's SortingState from the URL search params. */
export const searchToSorting = (sortField?: QuotaSortField, sortDirection?: QuotaSortDirection): SortingState =>
  sortField ? [{ id: sortField, desc: sortDirection === 'desc' }] : [];

/** Derives the URL search params from TanStack's SortingState. */
export const sortingToSearch = (
  sorting: SortingState
): { sortField: QuotaSortField | undefined; sortDirection: QuotaSortDirection | undefined } => {
  const first = sorting.at(0);
  if (!first) {
    return { sortField: undefined, sortDirection: undefined };
  }
  return { sortField: first.id as QuotaSortField, sortDirection: first.desc ? 'desc' : 'asc' };
};
