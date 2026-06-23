import type { OnChangeFn, PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useEffect } from 'react';

import { useQueryStateWithCallback } from './use-query-state-with-callback';

/**
 * Shape of the per-list ui settings slice this hook reads defaults from and
 * writes back to (e.g. `uiSettings.topicPartitionsList`).
 */
type TableSettings = {
  pageSize: number;
  sortId: string;
  sortDesc: boolean;
};

type UseUrlTableStateParams = {
  /** Prefix for the URL query params (e.g. `consumer` -> `consumerPage`, `consumerPageSize`, ...). */
  keyPrefix: string;
  /** ui settings slice used for default page size / sorting and synced on change. */
  settings: TableSettings;
  /** Total number of rows; used to clamp a stale `pageIndex` back into range. */
  rowCount: number;
  /**
   * Whether clamping is active. Pass `false` while data is still loading so a
   * transient `rowCount` of 0 does not reset the page index. Defaults to `true`.
   */
  enabled?: boolean;
};

type UseUrlTableStateResult = {
  sorting: SortingState;
  pagination: PaginationState;
  onSortingChange: OnChangeFn<SortingState>;
  onPaginationChange: OnChangeFn<PaginationState>;
};

/**
 * URL-backed sorting + pagination state for TanStack Table tables.
 *
 * Keeps page index, page size and sorting in the URL search query (prefixed by
 * `keyPrefix`) so the view is shareable and survives reloads, while syncing page
 * size and sorting back to the provided ui settings slice.
 *
 * Because tables are configured with `autoResetPageIndex: false`, a stale
 * `?{prefix}Page=` from a shared link can point past the last page and render an
 * empty table even when rows exist. This hook clamps the effective page index
 * into range and repairs the URL once data is available (`enabled`).
 */
export function useUrlTableState({
  keyPrefix,
  settings,
  rowCount,
  enabled = true,
}: UseUrlTableStateParams): UseUrlTableStateResult {
  const [pageIndex, setPageIndex] = useQueryState(`${keyPrefix}Page`, parseAsInteger.withDefault(0));

  const [pageSize, setPageSize] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        settings.pageSize = val;
      },
      getDefaultValue: () => settings.pageSize,
    },
    `${keyPrefix}PageSize`,
    parseAsInteger.withDefault(settings.pageSize || DEFAULT_TABLE_PAGE_SIZE)
  );

  const [sortId, setSortId] = useQueryStateWithCallback<string>(
    {
      onUpdate: (val) => {
        settings.sortId = val;
      },
      getDefaultValue: () => settings.sortId,
    },
    `${keyPrefix}SortId`,
    parseAsString.withDefault(settings.sortId ?? '')
  );

  const [sortDesc, setSortDesc] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        settings.sortDesc = val;
      },
      getDefaultValue: () => settings.sortDesc,
    },
    `${keyPrefix}SortDesc`,
    parseAsBoolean.withDefault(settings.sortDesc ?? false)
  );

  // Clamp a stale/out-of-range page index into a valid range. Effective value is
  // used for rendering immediately; the effect below repairs the URL.
  const lastPageIndex = enabled && rowCount > 0 ? Math.ceil(rowCount / pageSize) - 1 : 0;
  const clampedPageIndex = enabled ? Math.max(0, Math.min(pageIndex, lastPageIndex)) : pageIndex;

  useEffect(() => {
    if (enabled && clampedPageIndex !== pageIndex) {
      setPageIndex(clampedPageIndex);
    }
  }, [enabled, clampedPageIndex, pageIndex, setPageIndex]);

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc }] : [];

  const onSortingChange: OnChangeFn<SortingState> = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (next.length > 0) {
      setSortId(next[0].id);
      setSortDesc(next[0].desc);
    } else {
      setSortId('');
      setSortDesc(false);
    }
    setPageIndex(0);
  };

  const pagination: PaginationState = { pageIndex: clampedPageIndex, pageSize };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPageIndex(next.pageIndex);
    setPageSize(next.pageSize);
  };

  return { sorting, pagination, onSortingChange, onPaginationChange };
}
