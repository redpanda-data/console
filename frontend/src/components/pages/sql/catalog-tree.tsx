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

import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Box,
  Calendar,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  Hash,
  Layers,
  Lock,
  Play,
  Plus,
  Search,
  Table as TableIcon,
  ToggleLeft,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import { useDescribeTableQuery, useListTablesQuery, useTopicIcebergQuery } from 'react-query/api/sql';

import {
  type Catalog,
  type CatalogEngine,
  type ColumnDef,
  type ColumnKind,
  columnKindForPgType,
  type SqlRole,
  shortPgType,
  type TableRef,
} from './sql-types';

export type CatalogTreeProps = {
  /** Catalogs to render. Empty array while loading. */
  catalogs: Catalog[];
  /** Effective role of the caller. Drives admin-only affordances (Add a topic). */
  role: SqlRole;
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

const COL_KIND_ICON: Record<ColumnKind, typeof Hash> = {
  num: Hash,
  str: Type,
  bool: ToggleLeft,
  time: Calendar,
};

// Shared row layout: flex, gap, full-width, left-aligned, padded, rounded, with a
// subtle hover background. Used by namespace rows and the "Add a topic" row.
const ROW_BASE =
  'flex w-full cursor-pointer items-center gap-[6px] rounded border-0 bg-transparent px-[8px] py-[6px] text-left text-sm text-strong hover:bg-accent-subtle';

// Truncating label that fills the remaining row width.
const LABEL = 'flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap';

function engineMark(engine: CatalogEngine) {
  if (engine === 'redpanda') {
    return (
      <span className="inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded bg-primary-subtle text-primary">
        <Layers size={13} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded bg-info-subtle text-info">
      <Box size={13} />
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[13px] w-[13px] flex-shrink-0 animate-spin rounded-full border-2 border-muted border-t-action-primary"
    />
  );
}

// Merge tables seeded on the namespace with tables fetched from ListTables for
// the catalog. Fetched tables win; seeded names fill in before the fetch lands.
function tablesForNamespace(namespace: { name: string; tables: TableRef[] }, fetched: TableRef[]): TableRef[] {
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

type ColumnListProps = {
  catalogName: string;
  tableName: string;
};

// Fetches columns for a single expanded table via DescribeTable.
function ColumnList({ catalogName, tableName }: ColumnListProps) {
  const { data, isLoading } = useDescribeTableQuery({ catalog: catalogName, name: tableName });

  if (isLoading) {
    return (
      <div className="mb-[2px] ml-[26px] border-border-subtle border-l pl-[8px]">
        <div className="flex items-center gap-[7px] px-[16px] py-[6px] text-xs text-muted-foreground">
          <Spinner />
          <span>Loading columns…</span>
        </div>
      </div>
    );
  }

  const columns: ColumnDef[] = (data?.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type,
    kind: columnKindForPgType(c.type),
    short: shortPgType(c.type),
  }));

  if (columns.length === 0) {
    return (
      <div className="mb-[2px] ml-[26px] border-border-subtle border-l pl-[8px]">
        <div className="px-[16px] py-[6px] text-xs text-disabled">No columns</div>
      </div>
    );
  }

  return (
    <div className="mb-[2px] ml-[26px] border-border-subtle border-l pl-[8px]">
      {columns.map((col) => {
        const KindIcon = COL_KIND_ICON[col.kind];
        return (
          <div className="flex items-center gap-[7px] px-[8px] py-[3px] text-xs text-foreground" key={col.name}>
            <KindIcon className="flex-shrink-0 text-muted-foreground" size={11} />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono">{col.name}</span>
            <span className="font-mono text-caption-sm text-muted-foreground tracking-wide">{col.short}</span>
          </div>
        );
      })}
    </div>
  );
}

type TableRowProps = {
  catalog: Catalog;
  table: TableRef;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onQueryTable: (catalog: Catalog, table: TableRef) => void;
};

function TableRow({ catalog, table, isOpen, isActive, onToggle, onQueryTable }: TableRowProps) {
  const allowed = table.allowed !== false;
  const isIceberg = catalog.engine === 'iceberg' || table.iceberg === true;
  // A Redpanda-catalog table is Iceberg-tiered when its backing topic has
  // `redpanda.iceberg.mode` enabled (read from the Kafka topic config).
  const { isIceberg: topicTiered } = useTopicIcebergQuery(table.topicName ?? '', {
    enabled: catalog.engine === 'redpanda' && Boolean(table.topicName),
  });
  const tiered = catalog.engine === 'redpanda' && topicTiered;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  // The table icon picks up the Iceberg blue when the table is Iceberg-backed or
  // tiered, the disabled grey when locked, else the action-primary accent.
  const tableIcoClass = cn('flex-shrink-0 text-action-primary', {
    'text-info': (isIceberg || tiered) && allowed,
    'text-disabled': !allowed,
  });

  return (
    <div>
      <div
        className={cn('group flex w-full items-center rounded', isActive && 'bg-selected')}
        data-active={isActive || undefined}
        data-locked={!allowed || undefined}
        data-tiered={tiered || undefined}
      >
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[8px] py-[6px] font-sans text-sm text-strong disabled:cursor-default disabled:text-disabled"
          disabled={!allowed}
          onClick={() => allowed && onToggle()}
          type="button"
        >
          <Chevron className="flex-shrink-0 text-disabled" size={13} />
          <TableIcon className={tableIcoClass} size={13} />
          <span className={LABEL}>{table.name}</span>
          {isIceberg && (
            <span className="inline-flex flex-shrink-0 items-center gap-[3px] rounded-sm bg-info-subtle py-[1px] pr-[5px] pl-[4px] font-bold text-caption-sm text-info uppercase tracking-wide">
              <Box size={9} />
              Iceberg
            </span>
          )}
          {tiered && (
            <span
              className="inline-flex flex-shrink-0 items-center gap-[3px] rounded-sm bg-info-subtle py-[1px] pr-[5px] pl-[4px] font-bold text-caption-sm text-info uppercase tracking-wide"
              title="Iceberg-tiered · bridge queried"
            >
              <GitMerge size={9} />
              Iceberg
            </span>
          )}
          {!allowed && <Lock className="ml-[2px] text-disabled" size={12} />}
        </button>
        {allowed && (
          <button
            className="mr-[4px] inline-flex h-[26px] w-[26px] flex-shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-action-primary opacity-0 hover:bg-accent group-hover:opacity-100"
            onClick={() => onQueryTable(catalog, table)}
            title="Query this table"
            type="button"
          >
            <Play size={13} />
          </button>
        )}
      </div>
      {isOpen && allowed && <ColumnList catalogName={catalog.name} tableName={table.name} />}
    </div>
  );
}

type NamespaceNodeProps = {
  catalog: Catalog;
  namespace: Catalog['namespaces'][number];
  fetchedTables: TableRef[];
  isLoading: boolean;
  query: string;
  isOpen: boolean;
  shownCount: number;
  openTables: Record<string, boolean>;
  activeTableId?: string | null;
  onAddTable?: () => void;
  onToggleNamespace: () => void;
  onToggleTable: (id: string) => void;
  onLoadMore: () => void;
  onQueryTable: (catalog: Catalog, table: TableRef) => void;
};

function NamespaceNode({
  catalog,
  namespace,
  fetchedTables,
  isLoading,
  query,
  isOpen,
  shownCount,
  openTables,
  activeTableId,
  onAddTable,
  onToggleNamespace,
  onToggleTable,
  onLoadMore,
  onQueryTable,
}: NamespaceNodeProps) {
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

  // Shown whenever a handler is wired (Redpanda catalog, not searching). Real
  // admin-gating is a follow-up once the session role is plumbed through.
  const showAddTopic = catalog.engine === 'redpanda' && !q && onAddTable;

  const countLabel =
    q && matched.length !== allTables.length ? `${matched.length}/${allTables.length}` : allTables.length;
  const NsChevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="ml-[10px]">
      <button className={cn(ROW_BASE, 'font-medium text-foreground')} onClick={onToggleNamespace} type="button">
        <NsChevron className="flex-shrink-0 text-disabled" size={14} />
        <GitBranch className="text-muted-foreground" size={13} />
        <span className={LABEL}>{namespace.name}</span>
        <span className="rounded-full bg-muted px-[7px] py-[1px] text-xs text-muted-foreground">{countLabel}</span>
      </button>
      {isOpen && (
        <div className="ml-[10px]">
          {isLoading && allTables.length === 0 && (
            <div className="flex items-center gap-[7px] px-[16px] py-[6px] text-xs text-muted-foreground">
              <Spinner />
              <span>Loading tables…</span>
            </div>
          )}
          {visible.map((t) => (
            <TableRow
              catalog={catalog}
              isActive={activeTableId === t.id}
              isOpen={Boolean(openTables[t.id])}
              key={t.id}
              onQueryTable={onQueryTable}
              onToggle={() => onToggleTable(t.id)}
              table={t}
            />
          ))}
          {!isLoading && matched.length === 0 && (
            <div className="px-[16px] py-[6px] text-xs text-disabled">No tables</div>
          )}
          {paginate && remaining > 0 && (
            <button
              className="mt-[2px] flex w-full cursor-pointer items-center gap-[7px] rounded border-0 bg-transparent px-[8px] py-[7px] text-left font-sans font-medium text-xs text-action-primary hover:bg-accent"
              onClick={onLoadMore}
              title="Load more tables"
              type="button"
            >
              <ChevronDown className="flex-shrink-0 text-action-primary" size={12} />
              <span>Load more · {remaining} remaining</span>
            </button>
          )}
          {showAddTopic && (
            <button
              className="flex w-full cursor-pointer items-center gap-[6px] rounded border-0 bg-transparent px-[8px] py-[6px] text-left font-sans font-medium text-sm text-action-primary hover:bg-accent"
              onClick={onAddTable}
              title="Create a SQL table from a Redpanda topic"
              type="button"
            >
              <Plus className="ml-[19px] flex-shrink-0 text-action-primary" size={13} />
              <span className={cn(LABEL, 'text-action-primary')}>Add a topic</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type CatalogNodeProps = {
  catalog: Catalog;
  query: string;
  role: SqlRole;
  activeTableId?: string | null;
  open: Record<string, boolean>;
  shown: Record<string, number>;
  openTables: Record<string, boolean>;
  onToggle: (id: string) => void;
  onToggleTable: (id: string) => void;
  onLoadMore: (namespaceId: string) => void;
  onQueryTable: (catalog: Catalog, table: TableRef) => void;
  onAddTable?: () => void;
};

// One catalog subtree. Owns the per-catalog ListTables fetch, gated on the
// catalog (or an active search) being expanded.
function CatalogNode({
  catalog,
  query,
  role,
  activeTableId,
  open,
  shown,
  openTables,
  onToggle,
  onToggleTable,
  onLoadMore,
  onQueryTable,
  onAddTable,
}: CatalogNodeProps) {
  const isCatalogOpen = open[catalog.name] !== false;
  const enabled = isCatalogOpen || query.trim().length > 0;
  const { data, isLoading } = useListTablesQuery({ catalog: catalog.name }, { enabled });

  const fetchedTables: TableRef[] = (data?.tables ?? []).map((t) => ({
    id: `${catalog.name}.${t.namespaceName}.${t.name}`,
    name: t.name,
    namespaceName: t.namespaceName,
    catalogName: catalog.name,
    topicName: t.topicName,
  }));

  const CatChevron = isCatalogOpen ? ChevronDown : ChevronRight;
  const showAdd = role === 'admin' && catalog.engine === 'redpanda' && onAddTable;

  return (
    <div>
      <div className="group flex w-full items-center rounded">
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[8px] py-[6px] font-sans font-semibold text-sm text-strong"
          onClick={() => onToggle(catalog.name)}
          type="button"
        >
          <CatChevron className="flex-shrink-0 text-disabled" size={14} />
          {engineMark(catalog.engine)}
          <span className={LABEL}>{catalog.displayLabel || catalog.name}</span>
        </button>
        {showAdd && (
          <button
            className="mr-[4px] inline-flex h-[26px] w-[26px] flex-shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-action-primary opacity-0 hover:bg-accent group-hover:opacity-100"
            onClick={onAddTable}
            title="Add a topic to this catalog"
            type="button"
          >
            <Plus size={15} />
          </button>
        )}
      </div>
      {isCatalogOpen &&
        catalog.namespaces.map((ns) => (
          <NamespaceNode
            activeTableId={activeTableId}
            catalog={catalog}
            fetchedTables={fetchedTables}
            isLoading={isLoading}
            isOpen={open[ns.id] !== false}
            key={ns.id}
            namespace={ns}
            onAddTable={onAddTable}
            onLoadMore={() => onLoadMore(ns.id)}
            onQueryTable={onQueryTable}
            onToggleNamespace={() => onToggle(ns.id)}
            onToggleTable={onToggleTable}
            openTables={openTables}
            query={query}
            shownCount={shown[ns.id] ?? CAT_LIMIT}
          />
        ))}
    </div>
  );
}

export function CatalogTree({ catalogs, role, isLoading, activeTableId, onQueryTable, onAddTable }: CatalogTreeProps) {
  // Expand/collapse state per node id. Undefined => default open for catalogs
  // and namespaces (see `!== false` checks below).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !(s[id] ?? true) }));
  const toggleTable = (id: string) => setOpenTables((s) => ({ ...s, [id]: !s[id] }));
  const loadMore = (namespaceId: string) =>
    setShown((s) => ({ ...s, [namespaceId]: (s[namespaceId] ?? CAT_LIMIT) + CAT_LIMIT }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-[14px] pt-[14px] pb-[8px]">
        <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Catalogs</span>
        {role === 'admin' && (
          <span className="text-caption-sm text-disabled uppercase tracking-wider">Redpanda only</span>
        )}
      </div>
      <div className="px-[12px] pb-[10px]">
        <div className="flex items-center">
          <Search className="mr-[6px] flex-shrink-0 text-muted-foreground" size={15} />
          <input
            className="flex-1 border-0 bg-transparent text-sm outline-none"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables"
            value={query}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[8px] pb-[8px]">
        {isLoading && catalogs.length === 0 && (
          <div className="flex items-center gap-[7px] px-[16px] py-[6px] text-xs text-muted-foreground">
            <Spinner />
            <span>Loading catalogs…</span>
          </div>
        )}
        {!isLoading && catalogs.length === 0 && (
          <div className="px-[16px] py-[6px] text-xs text-disabled">No catalogs</div>
        )}
        {catalogs.map((catalog) => (
          <CatalogNode
            activeTableId={activeTableId}
            catalog={catalog}
            key={catalog.name}
            onAddTable={onAddTable}
            onLoadMore={loadMore}
            onQueryTable={onQueryTable}
            onToggle={toggle}
            onToggleTable={toggleTable}
            open={open}
            openTables={openTables}
            query={query}
            role={role}
            shown={shown}
          />
        ))}
      </div>
    </div>
  );
}
