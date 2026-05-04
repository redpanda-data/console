import type {
  ColumnFiltersState,
  ExpandedState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

// ── State ─────────────────────────────────────────────────────────────
// Readonly at every level — the reducer MUST return a new object.
export type DataTableState = Readonly<{
  pagination: PaginationState;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  rowSelection: RowSelectionState;
  expanded: ExpandedState;
}>;

// ── Actions (discriminated union) ─────────────────────────────────────
export type DataTableAction =
  | {
      readonly type: 'SET_PAGINATION';
      readonly updater: PaginationState | ((prev: PaginationState) => PaginationState);
    }
  | { readonly type: 'SET_SORTING'; readonly updater: SortingState | ((prev: SortingState) => SortingState) }
  | {
      readonly type: 'SET_COLUMN_FILTERS';
      readonly updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState);
    }
  | {
      readonly type: 'SET_COLUMN_VISIBILITY';
      readonly updater: VisibilityState | ((prev: VisibilityState) => VisibilityState);
    }
  | {
      readonly type: 'SET_ROW_SELECTION';
      readonly updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState);
    }
  | { readonly type: 'SET_EXPANDED'; readonly updater: ExpandedState | ((prev: ExpandedState) => ExpandedState) }
  | { readonly type: 'RESET'; readonly defaults: Partial<DataTableState> };

// ── Exhaustive check helper ───────────────────────────────────────────
const assertNever = (action: never): never => {
  throw new Error(`Unhandled data-table action: ${(action as DataTableAction).type}`);
};

// ── Resolve updater (value or function) ───────────────────────────────
const resolve = <T>(updater: T | ((prev: T) => T), prev: T): T =>
  typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;

// ── Reducer (pure function — no React imports, no side effects) ───────
export const dataTableReducer = (state: DataTableState, action: DataTableAction): DataTableState => {
  switch (action.type) {
    case 'SET_PAGINATION':
      return { ...state, pagination: resolve(action.updater, state.pagination) };
    case 'SET_SORTING':
      return { ...state, sorting: resolve(action.updater, state.sorting) };
    case 'SET_COLUMN_FILTERS':
      return { ...state, columnFilters: resolve(action.updater, state.columnFilters) };
    case 'SET_COLUMN_VISIBILITY':
      return { ...state, columnVisibility: resolve(action.updater, state.columnVisibility) };
    case 'SET_ROW_SELECTION':
      return { ...state, rowSelection: resolve(action.updater, state.rowSelection) };
    case 'SET_EXPANDED':
      return { ...state, expanded: resolve(action.updater, state.expanded) };
    case 'RESET':
      return { ...state, ...action.defaults };
    default:
      return assertNever(action);
  }
};

// ── Initial state factory ─────────────────────────────────────────────
export type DataTableInitialConfig = {
  defaultPageSize?: number;
  defaultSorting?: SortingState;
};

export const createInitialState = (config: DataTableInitialConfig = {}): DataTableState => ({
  pagination: { pageIndex: 0, pageSize: Math.max(1, config.defaultPageSize ?? 10) },
  sorting: config.defaultSorting ?? [],
  columnFilters: [],
  columnVisibility: {},
  rowSelection: {},
  expanded: {},
});
