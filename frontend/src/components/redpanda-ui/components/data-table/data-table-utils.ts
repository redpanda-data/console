import type { PaginationState, SortingState } from '@tanstack/react-table';

// ── Pagination mode resolution ────────────────────────────────────────
export type PaginationMode = {
  enabled: boolean;
  controlledState: PaginationState | undefined;
  defaultPageSize: number;
};

export const resolvePaginationMode = (
  pagination: false | true | PaginationState | undefined,
  defaultPageSize = 10
): PaginationMode => {
  if (pagination === false) {
    return { enabled: false, controlledState: undefined, defaultPageSize };
  }
  if (pagination === true || pagination === undefined) {
    return { enabled: true, controlledState: undefined, defaultPageSize };
  }
  return { enabled: true, controlledState: pagination, defaultPageSize: pagination.pageSize };
};

// ── Sorting mode resolution ───────────────────────────────────────────
export type SortingMode = {
  enabled: boolean;
  controlledState: SortingState | undefined;
};

export const resolveSortingMode = (sorting: false | true | SortingState | undefined): SortingMode => {
  if (sorting === false) {
    return { enabled: false, controlledState: undefined };
  }
  if (sorting === true || sorting === undefined) {
    return { enabled: true, controlledState: undefined };
  }
  return { enabled: true, controlledState: sorting };
};

// ── Empty state derivation ────────────────────────────────────────────
export type DisplayState = 'loading' | 'empty' | 'data';

/**
 * Determines which UI state the DataTable body should display.
 *
 * When `isLoading` is true but rows already exist (e.g., background refetch
 * with stale data), returns `'data'` — the table shows existing rows rather
 * than replacing them with a spinner. Consumers needing a loading overlay
 * on top of stale data should check `isLoading` separately.
 */
export const deriveDisplayState = (rowCount: number, isLoading: boolean): DisplayState => {
  if (isLoading && rowCount === 0) {
    return 'loading';
  }
  if (rowCount === 0) {
    return 'empty';
  }
  return 'data';
};

// ── Boolean helpers for pagination ────────────────────────────────────
export const isPaginationState = (
  pagination: false | true | PaginationState | undefined
): pagination is PaginationState => typeof pagination === 'object' && pagination !== null && 'pageIndex' in pagination;
