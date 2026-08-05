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

// Takes the filtered count, not the page count: a stale page index leaves the page empty while
// matches exist, which must not read as 'empty'. Rows + isLoading is a background refetch, so it
// returns 'data' and stale rows stay visible instead of a spinner.
export const deriveDisplayState = (filteredRowCount: number, isLoading: boolean): DisplayState => {
  if (isLoading && filteredRowCount === 0) {
    return 'loading';
  }
  if (filteredRowCount === 0) {
    return 'empty';
  }
  return 'data';
};

// The filtered count can be non-zero while the page slice is empty. Mid-clamp that page index is
// about to change, so 'empty' would claim "no results" about a set with matches — hold 'loading'.
export const resolvePageDisplayState = (
  displayState: DisplayState,
  pageRowCount: number,
  clampPending: boolean
): DisplayState => {
  if (displayState !== 'data' || pageRowCount > 0) {
    return displayState;
  }
  return clampPending ? 'loading' : 'empty';
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

// Containment drops portaled content (menus, popovers) and targets already unmounted; the
// interactive check drops clicks a control in the row has already handled.
export const isRowActivationClick = (target: EventTarget | null, row: Element): boolean =>
  target instanceof Element && row.contains(target) && !isInteractiveTarget(target, row);
