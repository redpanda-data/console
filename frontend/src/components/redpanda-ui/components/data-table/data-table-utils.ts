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

// Feed this the FILTERED row count, not the page row count: a stale page index can leave the
// current page empty while matches exist, and that transient state must not read as 'empty'.
// When isLoading but rows already exist (background refetch), returns 'data' so stale rows show instead of a spinner.
export const deriveDisplayState = (filteredRowCount: number, isLoading: boolean): DisplayState => {
  if (isLoading && filteredRowCount === 0) {
    return 'loading';
  }
  if (filteredRowCount === 0) {
    return 'empty';
  }
  return 'data';
};

const INTERACTIVE_TARGET_SELECTOR =
  'a,button,input,select,textarea,label,[role="button"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="combobox"]';

// `boundary` scopes the check so interactive ancestors outside the row never match.
export const isInteractiveTarget = (target: EventTarget | null, boundary?: Element | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  const interactive = target.closest(INTERACTIVE_TARGET_SELECTOR);
  return interactive !== null && (boundary ? boundary.contains(interactive) : true);
};
