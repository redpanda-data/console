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

const compareBySorting = (a: TopicMessage, b: TopicMessage, sorting: SortingState): number => {
  for (const sort of sorting) {
    const direction = sort.desc ? -1 : 1;
    const left = sort.id === 'timestamp' ? a.timestamp : a.offset;
    const right = sort.id === 'timestamp' ? b.timestamp : b.offset;
    if (left !== right) {
      return left < right ? -direction : direction;
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
  const sorted = sortingDisabled ? [...messages] : [...messages].sort((a, b) => compareBySorting(a, b, sorting));
  const start = pageIndex * pageSize;
  return sorted.slice(start, start + pageSize).map(messageKey);
}
