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

import type { SortingState } from '@tanstack/react-table';

import { messageKey } from './message-key';
import type { TopicMessage } from '../../../../../state/rest-interfaces';

/**
 * True for the only column id the messages table actually sorts on. `messages-table.tsx`'s
 * `buildColumn` derives every column's `enableSorting` from this same predicate, so a persisted
 * sort id the table doesn't honor (`key`/`value` from the legacy page, or `offset`, which is
 * fixed non-sortable) is ignored identically here and there — tanstack's own `getSortedRowModel`
 * filters `state.sorting` by `column.getCanSort()` before applying it, so mirroring anything else
 * (e.g. defaulting an unrecognized id to `offset`) would select rows in an order the table itself
 * never rendered.
 */
export const isSortableColumnId = (id: string, sortingDisabled: boolean): boolean =>
  id === 'timestamp' && !sortingDisabled;

const compareBySorting = (
  a: TopicMessage,
  b: TopicMessage,
  sorting: SortingState,
  sortingDisabled: boolean
): number => {
  for (const sort of sorting) {
    if (!isSortableColumnId(sort.id, sortingDisabled)) {
      continue;
    }
    if (a.timestamp !== b.timestamp) {
      const direction = sort.desc ? -1 : 1;
      return a.timestamp < b.timestamp ? -direction : direction;
    }
  }
  return 0;
};

export type VisiblePageKeysOptions = {
  sorting: SortingState;
  /** Must mirror the table's own `sortingDisabled` — continuous mode preserves server order. */
  sortingDisabled: boolean;
  pageIndex: number;
  pageSize: number;
};

/**
 * The on-screen row order for the current page, as keyboard nav (`j`/arrow keys) should walk it.
 * Continuous mode disables the table's own sorting to preserve server order for paging, so
 * re-applying `sorting` here would select rows in a different order than what's actually
 * displayed.
 */
export function visiblePageKeys(messages: readonly TopicMessage[], options: VisiblePageKeysOptions): string[] {
  const { sorting, sortingDisabled, pageIndex, pageSize } = options;
  const sorted = sortingDisabled
    ? [...messages]
    : [...messages].sort((a, b) => compareBySorting(a, b, sorting, sortingDisabled));
  const start = pageIndex * pageSize;
  return sorted.slice(start, start + pageSize).map(messageKey);
}
