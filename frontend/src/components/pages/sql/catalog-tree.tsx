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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Box,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Lock,
  Table as LucideTable,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import type { Column } from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import {
  createContext,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useState,
} from 'react';
import { useDescribeTableQuery, useListTablesQuery, useTopicIcebergQuery } from 'react-query/api/sql';

import type { Catalog, CatalogEngine, Namespace, SqlRole, TableRef } from './sql-types';

export type CatalogTreeProps = {
  /** Catalogs to render. Empty array while loading. */
  catalogs: Catalog[];
  /** Effective role of the caller. Drives admin-only affordances (Add a topic). */
  sqlRole: SqlRole;
  /** True while the initial ListCatalogs fetch is in flight. */
  isLoading?: boolean;
  /** id of the table whose query tab is currently active, if any. */
  activeTableId?: string | null;
  /** Open `SELECT * FROM <catalog>.<table> LIMIT 100;` in a new editor tab. */
  onQueryTable: (catalog: Catalog, table: TableRef) => void;
  /** Admin entry point for the add-topic wizard (scoped to the Redpanda catalog). */
  onAddTable?: () => void;
};

// Promote search past this many tables in a namespace.
const CAT_LIMIT = 20;

// Shared row layout: flex, gap, full-width, left-aligned, padded, rounded, with a
// subtle hover background. Used by namespace rows and the "Add a topic" row.
const ROW_BASE =
  'flex w-full cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-2 py-1.5 text-left text-sm text-strong hover:bg-accent-subtle';

// Truncating label that fills the remaining row width.
const LABEL = 'flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap';

// Tree-wide state and callbacks, provided once by CatalogTree so the node
// components stay lean instead of threading a dozen props per level.
type CatalogTreeContextValue = {
  role: SqlRole;
  query: string;
  activeTableId?: string | null;
  /** Expand state per node id. Undefined => default open (`!== false`). */
  open: Record<string, boolean>;
  /** Expand state per table id. Undefined => closed. */
  openTables: Record<string, boolean>;
  /** Pagination window per namespace id. */
  shown: Record<string, number>;
  toggle: (id: string) => void;
  toggleTable: (id: string) => void;
  loadMore: (namespaceId: string) => void;
  onQueryTable: (catalog: Catalog, table: TableRef) => void;
  onAddTable?: () => void;
  /** tabIndex for a treeitem so the tree is a single tab stop (roving). */
  rowTabIndex: (id: string) => 0 | -1;
};

const CatalogTreeContext = createContext<CatalogTreeContextValue | null>(null);

function useCatalogTree(): CatalogTreeContextValue {
  const ctx = useContext(CatalogTreeContext);
  if (!ctx) {
    throw new Error('useCatalogTree must be used within CatalogTree');
  }
  return ctx;
}

function engineMark(engine: CatalogEngine) {
  if (engine === 'redpanda') {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-primary-subtle text-primary">
        <Layers size={13} />
      </span>
    );
  }
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-info-subtle text-info">
      <Box size={13} />
    </span>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.75 px-4 py-1.5">
      <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
      <Text as="span" className="text-muted-foreground" variant="bodySmall">
        {label}
      </Text>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Text className="px-4 py-1.5 text-disabled" variant="bodySmall">
      {children}
    </Text>
  );
}

// Merge tables seeded on the namespace with tables fetched from ListTables for
// the catalog. Fetched tables win; seeded names fill in before the fetch lands.
function tablesForNamespace(namespace: Namespace, fetched: TableRef[]): TableRef[] {
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

// Roving keyboard navigation for the tree, per the WAI-ARIA tree pattern:
// Up/Down move between visible rows, Home/End jump, Right expands (or moves
// into) a node, Left collapses. Operates on the rendered treeitem buttons so
// it always matches what's visible.
function handleTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const handled = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!handled.includes(e.key)) {
    return;
  }
  const current = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="treeitem"]');
  if (!current) {
    return;
  }
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]:not(:disabled)'));
  const idx = rows.indexOf(current);
  if (idx === -1) {
    return;
  }
  e.preventDefault();

  const focusRow = (i: number) => rows[i]?.focus();
  const expanded = current.getAttribute('aria-expanded');

  switch (e.key) {
    case 'ArrowDown':
      focusRow(idx + 1);
      break;
    case 'ArrowUp':
      focusRow(idx - 1);
      break;
    case 'Home':
      focusRow(0);
      break;
    case 'End':
      focusRow(rows.length - 1);
      break;
    case 'ArrowRight':
      if (expanded === 'false') {
        current.click();
      } else {
        focusRow(idx + 1);
      }
      break;
    case 'ArrowLeft':
      if (expanded === 'true') {
        current.click();
      }
      break;
    default:
      break;
  }
}

type ColumnListProps = {
  catalogName: string;
  tableName: string;
};

// Recursively renders column fields. Struct (json) fields get an expand chevron
// that reveals their nested fields, indented one level per depth.
function FieldRows({
  fields,
  depth,
  pathPrefix,
  open,
  toggle,
}: {
  fields: Column[];
  depth: number;
  pathPrefix: string;
  open: Record<string, boolean>;
  toggle: (path: string) => void;
}) {
  return (
    <>
      {fields.map((field) => {
        const path = `${pathPrefix}/${field.name}`;
        const nested = field.fields ?? [];
        const hasNested = nested.length > 0;
        const isOpen = Boolean(open[path]);
        const FieldChevron = isOpen ? ChevronDown : ChevronRight;
        const rowClass = 'flex w-full items-center gap-1.5 px-2 py-0.75 text-foreground text-xs';
        const indent = { paddingLeft: `${depth * 12}px` };
        const body = (
          <>
            {hasNested ? (
              <FieldChevron className="shrink-0 text-disabled" size={11} />
            ) : (
              <span aria-hidden="true" className="shrink-0" style={{ width: '11px' }} />
            )}
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-mono">
              {field.name}
            </span>
            <span className="shrink-0 whitespace-nowrap font-mono text-caption-sm text-muted-foreground tracking-wide">
              {field.type}
            </span>
          </>
        );
        return (
          <Fragment key={path}>
            {hasNested ? (
              <button
                aria-expanded={isOpen}
                className={cn(rowClass, 'cursor-pointer border-0 bg-transparent')}
                onClick={() => toggle(path)}
                style={indent}
                type="button"
              >
                {body}
              </button>
            ) : (
              <div className={rowClass} style={indent}>
                {body}
              </div>
            )}
            {hasNested && isOpen ? (
              <FieldRows depth={depth + 1} fields={nested} open={open} pathPrefix={path} toggle={toggle} />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

// Fetches columns for a single expanded table via DescribeTable.
function ColumnList({ catalogName, tableName }: ColumnListProps) {
  const { data, isLoading } = useDescribeTableQuery({ catalog: catalogName, name: tableName });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (path: string) => setOpen((s) => ({ ...s, [path]: !s[path] }));

  let content: ReactNode;
  if (isLoading) {
    content = <LoadingRow label="Loading columns…" />;
  } else if (data?.columns?.length) {
    content = <FieldRows depth={0} fields={data.columns} open={open} pathPrefix="" toggle={toggle} />;
  } else {
    content = <EmptyNote>No columns</EmptyNote>;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use role="group" for nested tree item containers.
    <div className="mb-0.5 ml-6.5 border-border-subtle border-l pl-2" role="group">
      {content}
    </div>
  );
}

type TableRowProps = {
  catalog: Catalog;
  table: TableRef;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Leaf row combines grant, selection, tiering and query affordance state.
function TableRow({ catalog, table }: TableRowProps) {
  const { activeTableId, openTables, toggleTable, onQueryTable, rowTabIndex } = useCatalogTree();
  const allowed = table.allowed !== false;
  const isOpen = Boolean(openTables[table.id]);
  const isActive = activeTableId === table.id;
  const isIceberg = catalog.engine === 'iceberg' || table.iceberg === true;
  // A Redpanda-catalog table is Iceberg-tiered when its backing topic has
  // `redpanda.iceberg.mode` enabled (read from the Kafka topic config). Fetch
  // only once the row is expanded — otherwise every visible table fires its own
  // GetTopicConfigurations request (N+1) just to decide whether to show a badge.
  const { isIceberg: topicTiered } = useTopicIcebergQuery(table.topicName ?? '', {
    enabled: catalog.engine === 'redpanda' && Boolean(table.topicName) && isOpen,
  });
  const tiered = catalog.engine === 'redpanda' && topicTiered;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  // The table icon picks up the Iceberg blue when the table is Iceberg-backed or
  // tiered, the disabled grey when locked, else the action-primary accent.
  const tableIcoClass = cn('shrink-0 text-action-primary', {
    'text-info': (isIceberg || tiered) && allowed,
    'text-disabled': !allowed,
  });

  return (
    <div>
      <div
        className={cn('group flex w-full items-center rounded pr-1', isActive && 'bg-selected')}
        data-active={isActive || undefined}
        data-locked={!allowed || undefined}
        data-tiered={tiered || undefined}
      >
        <button
          aria-expanded={allowed ? isOpen : undefined}
          aria-level={3}
          aria-selected={isActive}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 py-1.5 font-sans text-sm text-strong disabled:cursor-default disabled:text-disabled"
          data-tree-id={table.id}
          disabled={!allowed}
          onClick={() => toggleTable(table.id)}
          role="treeitem"
          tabIndex={rowTabIndex(table.id)}
          type="button"
        >
          <Chevron className="shrink-0 text-disabled" size={13} />
          <LucideTable className={tableIcoClass} size={13} />
          <span className={LABEL}>{table.name}</span>
          {isIceberg || tiered ? (
            <Badge size="sm" title={tiered ? 'Iceberg-tiered · bridge queried' : undefined} variant="info-inverted">
              Iceberg
            </Badge>
          ) : null}
          {allowed ? null : <Lock className="ml-0.5 text-disabled" size={12} />}
        </button>
        {allowed ? (
          <Button
            className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => onQueryTable(catalog, table)}
            size="icon-xs"
            title="Query this table"
            type="button"
            variant="ghost"
          >
            <Play />
          </Button>
        ) : null}
      </div>
      {isOpen && allowed ? <ColumnList catalogName={catalog.name} tableName={table.name} /> : null}
    </div>
  );
}

type NamespaceNodeProps = {
  catalog: Catalog;
  namespace: Namespace;
  fetchedTables: TableRef[];
  isLoading: boolean;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Namespace rendering coordinates search, pagination, loading and admin actions.
function NamespaceNode({ catalog, namespace, fetchedTables, isLoading }: NamespaceNodeProps) {
  const { role, query, open, shown, toggle, loadMore, onAddTable, rowTabIndex } = useCatalogTree();
  const isOpen = open[namespace.id] !== false;
  const shownCount = shown[namespace.id] ?? CAT_LIMIT;

  const allTables = tablesForNamespace(namespace, fetchedTables);
  const q = query.trim().toLowerCase();
  const matched = q ? allTables.filter((t) => t.name.toLowerCase().includes(q)) : allTables;

  // When searching, hide namespaces whose name and tables both miss.
  if (q && matched.length === 0 && !namespace.name.toLowerCase().includes(q)) {
    return null;
  }

  const paginate = !q && matched.length > CAT_LIMIT;
  const visible = paginate ? matched.slice(0, shownCount) : matched;
  const remaining = paginate ? Math.max(0, matched.length - visible.length) : 0;

  const showAddTopic = role === 'admin' && catalog.engine === 'redpanda' && !q && Boolean(onAddTable);

  const NsChevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="ml-2.5">
      <button
        aria-expanded={isOpen}
        aria-level={2}
        className={cn(ROW_BASE, 'font-medium text-foreground')}
        data-tree-id={namespace.id}
        onClick={() => toggle(namespace.id)}
        role="treeitem"
        tabIndex={rowTabIndex(namespace.id)}
        type="button"
      >
        <NsChevron className="shrink-0 text-disabled" size={14} />
        <GitBranch className="text-muted-foreground" size={13} />
        <span className={LABEL}>{namespace.name}</span>
      </button>
      {isOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use role="group" for nested tree item containers.
        <div className="ml-2.5" role="group">
          {isLoading && allTables.length === 0 ? <LoadingRow label="Loading tables…" /> : null}
          {visible.map((t) => (
            <TableRow catalog={catalog} key={t.id} table={t} />
          ))}
          {!isLoading && matched.length === 0 && !showAddTopic ? <EmptyNote>No tables</EmptyNote> : null}
          {paginate && remaining > 0 ? (
            <Button
              className="w-full justify-start px-2"
              onClick={() => loadMore(namespace.id)}
              size="sm"
              title="Load more tables"
              type="button"
              variant="ghost"
            >
              <ChevronDown />
              <span>Load more · {remaining} remaining</span>
            </Button>
          ) : null}
          {showAddTopic ? (
            <Button
              className="w-full justify-start px-2"
              onClick={onAddTable}
              size="sm"
              title="Create a SQL table from a Redpanda topic"
              type="button"
              variant="ghost"
            >
              <Plus className="ml-4.75" />
              <span className={LABEL}>Add a topic</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// One catalog subtree. Owns the per-catalog ListTables fetch, gated on the
// catalog (or an active search) being expanded.
function CatalogNode({ catalog }: { catalog: Catalog }) {
  const { role, query, open, toggle, onAddTable, rowTabIndex } = useCatalogTree();
  const isCatalogOpen = open[catalog.name] !== false;
  const enabled = isCatalogOpen || query.trim().length > 0;
  const { data, isLoading } = useListTablesQuery({ catalog: catalog.name }, { enabled });

  const fetchedTables: TableRef[] = (data?.tables ?? []).map((t) => ({
    id: `${catalog.name}.${t.catalogNamespace}.${t.name}`,
    name: t.name,
    namespaceName: t.catalogNamespace,
    catalogName: catalog.name,
    topicName: t.topic,
  }));

  const CatChevron = isCatalogOpen ? ChevronDown : ChevronRight;
  const showAdd = role === 'admin' && catalog.engine === 'redpanda' && Boolean(onAddTable);

  return (
    <div>
      <div className="group flex w-full items-center rounded pr-1">
        <button
          aria-expanded={isCatalogOpen}
          aria-level={1}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 py-1.5 font-sans font-semibold text-sm text-strong"
          data-tree-id={catalog.name}
          onClick={() => toggle(catalog.name)}
          role="treeitem"
          tabIndex={rowTabIndex(catalog.name)}
          type="button"
        >
          <CatChevron className="shrink-0 text-disabled" size={14} />
          {engineMark(catalog.engine)}
          <span className={LABEL}>{catalog.displayLabel || catalog.name}</span>
        </button>
        {showAdd ? (
          <Button
            className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            onClick={onAddTable}
            size="icon-xs"
            title="Add a topic to this catalog"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        ) : null}
      </div>
      {isCatalogOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use role="group" for nested tree item containers.
        <div role="group">
          {catalog.namespaces.map((ns) => (
            <NamespaceNode
              catalog={catalog}
              fetchedTables={fetchedTables}
              isLoading={isLoading}
              key={ns.id}
              namespace={ns}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CatalogTree({
  catalogs,
  sqlRole,
  isLoading,
  activeTableId,
  onQueryTable,
  onAddTable,
}: CatalogTreeProps) {
  // Expand/collapse state per node id. Undefined => default open for catalogs
  // and namespaces (see `!== false` checks in the nodes).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  // The single tabbable treeitem (WAI-ARIA roving tabIndex). Until the user
  // focuses a row, the first catalog is the entry point.
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const rovingId = activeRowId ?? catalogs[0]?.name ?? null;

  const context: CatalogTreeContextValue = {
    role: sqlRole,
    query,
    activeTableId,
    open,
    openTables,
    shown,
    toggle: (id) => setOpen((s) => ({ ...s, [id]: !(s[id] ?? true) })),
    toggleTable: (id) => setOpenTables((s) => ({ ...s, [id]: !s[id] })),
    loadMore: (namespaceId) => setShown((s) => ({ ...s, [namespaceId]: (s[namespaceId] ?? CAT_LIMIT) + CAT_LIMIT })),
    onQueryTable,
    onAddTable,
    rowTabIndex: (id) => (id === rovingId ? 0 : -1),
  };

  // Keep the roving tabIndex on whichever row the user last focused, so Shift+Tab
  // and re-entry return to that row rather than the first one.
  const handleTreeFocus = (e: FocusEvent<HTMLDivElement>) => {
    const id = e.target.closest<HTMLElement>('[role="treeitem"]')?.getAttribute('data-tree-id');
    if (id && id !== activeRowId) {
      setActiveRowId(id);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center px-3.5 pt-3.5 pb-2">
        <Text as="span" className="text-muted-foreground uppercase tracking-wider" variant="labelStrongXSmall">
          Catalogs
        </Text>
      </div>
      <div className="px-3 pb-2.5">
        <Input onChange={(e) => setQuery(e.target.value)} placeholder="Search tables" size="sm" value={query}>
          <InputStart>
            <Search className="text-muted-foreground" size={15} />
          </InputStart>
        </Input>
      </div>

      <CatalogTreeContext.Provider value={context}>
        <div
          aria-label="Catalogs"
          className="flex-1 overflow-y-auto px-2 pb-2"
          onFocus={handleTreeFocus}
          onKeyDown={handleTreeKeyDown}
          role="tree"
        >
          {isLoading && catalogs.length === 0 ? <LoadingRow label="Loading catalogs…" /> : null}
          {!isLoading && catalogs.length === 0 ? <EmptyNote>No catalogs</EmptyNote> : null}
          {catalogs.map((catalog) => (
            <CatalogNode catalog={catalog} key={catalog.name} />
          ))}
        </div>
      </CatalogTreeContext.Provider>
    </div>
  );
}
