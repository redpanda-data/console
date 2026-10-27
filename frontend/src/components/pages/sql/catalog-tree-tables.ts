import type { Namespace, TableRef } from './sql-types';

// Promote search past this many tables in a namespace.
export const CAT_LIMIT = 20;

// Merge tables seeded on the namespace with tables fetched from ListTables for
// the catalog. Fetched tables win; seeded names fill in before the fetch lands.
export function tablesForNamespace(namespace: Namespace, fetched: TableRef[]): TableRef[] {
  const byId = new Map<string, TableRef>();
  for (const t of namespace.tables) {
    byId.set(t.id, t);
  }
  for (const t of fetched) {
    if (t.namespaceName === namespace.name) {
      byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

export type NamespaceTables = {
  /** Every table in the namespace, before the search filter. */
  all: TableRef[];
  /** Tables whose name matches the search (all of them when not searching). */
  matched: TableRef[];
  /** The rows to render: `matched`, cut to the pagination window when paginating. */
  visible: TableRef[];
  /** True when the namespace is long enough to page (never while searching). */
  paginate: boolean;
  /** Matched tables past the pagination window. */
  remaining: number;
  /** True while a search query is active. */
  searching: boolean;
  /** True when a search misses both the namespace name and all its tables. */
  hidden: boolean;
};

// Search and pagination for one namespace's table list.
export function namespaceTables(
  namespace: Namespace,
  fetched: TableRef[],
  query: string,
  shownCount: number
): NamespaceTables {
  const all = tablesForNamespace(namespace, fetched);
  const q = query.trim().toLowerCase();
  const matched = q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all;
  const paginate = !q && matched.length > CAT_LIMIT;
  const visible = paginate ? matched.slice(0, shownCount) : matched;
  return {
    all,
    matched,
    visible,
    paginate,
    remaining: paginate ? Math.max(0, matched.length - visible.length) : 0,
    searching: q.length > 0,
    hidden: q.length > 0 && matched.length === 0 && !namespace.name.toLowerCase().includes(q),
  };
}
