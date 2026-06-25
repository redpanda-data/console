import type { PaginationState, SortingState } from '@tanstack/react-table';

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

export type DisplayState = 'loading' | 'empty' | 'data';

// When isLoading but rows already exist (background refetch), returns 'data' so stale rows show instead of a spinner.
export const deriveDisplayState = (rowCount: number, isLoading: boolean): DisplayState => {
  if (isLoading && rowCount === 0) {
    return 'loading';
  }
  if (rowCount === 0) {
    return 'empty';
  }
  return 'data';
};

export const isPaginationState = (
  pagination: false | true | PaginationState | undefined
): pagination is PaginationState => typeof pagination === 'object' && pagination !== null && 'pageIndex' in pagination;
