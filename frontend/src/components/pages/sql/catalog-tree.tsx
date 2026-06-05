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
import { useDescribeTableQuery, useListTablesQuery, useTopicIcebergQuery } from 'react-query/api/sql';
import { useState } from 'react';

import './catalog-tree.css';
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

function engineMark(engine: CatalogEngine) {
  if (engine === 'redpanda') {
    return (
      <span className="cat-engine cat-engine-rp">
        <Layers size={13} />
      </span>
    );
  }
  return (
    <span className="cat-engine cat-engine-ice">
      <Box size={13} />
    </span>
  );
}

function Spinner() {
  return <span className="cat-spinner" aria-hidden="true" />;
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
      <div className="cat-cols">
        <div className="cat-loading">
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
      <div className="cat-cols">
        <div className="cat-ns-empty">No columns</div>
      </div>
    );
  }

  return (
    <div className="cat-cols">
      {columns.map((col) => {
        const KindIcon = COL_KIND_ICON[col.kind];
        return (
          <div className="cat-col" key={col.name}>
            <KindIcon className="cat-col-ico" size={11} />
            <span className="cat-col-name">{col.name}</span>
            <span className="cat-col-type">{col.short}</span>
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

  return (
    <div className="cat-table-wrap">
      <div
        className="cat-row cat-row-table"
        data-active={isActive || undefined}
        data-locked={!allowed || undefined}
        data-tiered={tiered || undefined}
      >
        <button
          className="cat-table-main"
          disabled={!allowed}
          onClick={() => allowed && onToggle()}
          type="button"
        >
          <Chevron className="cat-chev" size={13} />
          <TableIcon className={`cat-table-ico${isIceberg ? ' cat-table-ico-ice' : ''}`} size={13} />
          <span className="cat-label">{table.name}</span>
          {isIceberg && (
            <span className="cat-ice">
              <Box size={9} />
              Iceberg
            </span>
          )}
          {tiered && (
            <span className="cat-bridge" title="Iceberg-tiered · bridge queried">
              <GitMerge size={9} />
              Iceberg
            </span>
          )}
          {!allowed && <Lock className="cat-lock" size={12} />}
        </button>
        {allowed && (
          <button
            className="cat-table-run"
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

  const countLabel = q && matched.length !== allTables.length ? `${matched.length}/${allTables.length}` : allTables.length;
  const NsChevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="cat-ns">
      <button className="cat-row cat-row-ns" onClick={onToggleNamespace} type="button">
        <NsChevron className="cat-chev" size={14} />
        <GitBranch className="cat-ns-ico" size={13} />
        <span className="cat-label">{namespace.name}</span>
        <span className="cat-count">{countLabel}</span>
      </button>
      {isOpen && (
        <div className="cat-tables">
          {isLoading && allTables.length === 0 && (
            <div className="cat-loading">
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
          {!isLoading && matched.length === 0 && <div className="cat-ns-empty">No tables</div>}
          {paginate && remaining > 0 && (
            <button className="cat-more" onClick={onLoadMore} title="Load more tables" type="button">
              <ChevronDown className="cat-more-ico" size={12} />
              <span>Load more · {remaining} remaining</span>
            </button>
          )}
          {showAddTopic && (
            <button
              className="cat-row cat-add-row"
              onClick={onAddTable}
              title="Create a SQL table from a Redpanda topic"
              type="button"
            >
              <Plus className="cat-add-row-ico" size={13} />
              <span className="cat-label">Add a topic</span>
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
    <div className="cat-catalog">
      <div className="cat-row cat-row-catalog">
        <button className="cat-cat-main" onClick={() => onToggle(catalog.name)} type="button">
          <CatChevron className="cat-chev" size={14} />
          {engineMark(catalog.engine)}
          <span className="cat-label">{catalog.displayLabel || catalog.name}</span>
        </button>
        {showAdd && (
          <button className="cat-cat-add" onClick={onAddTable} title="Add a topic to this catalog" type="button">
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

export function CatalogTree({
  catalogs,
  role,
  isLoading,
  activeTableId,
  onQueryTable,
  onAddTable,
}: CatalogTreeProps) {
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
    <div className="cat">
      <div className="cat-head">
        <span className="cat-head-title">Catalogs</span>
        {role === 'admin' && <span className="cat-head-hint">Redpanda only</span>}
      </div>
      <div className="cat-search">
        <div className="rp-input-group" style={{ display: 'flex', alignItems: 'center' }}>
          <Search size={15} style={{ color: 'var(--color-muted-foreground)', marginRight: 6, flexShrink: 0 }} />
          <input
            className="rp-input-group-input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables"
            style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 13 }}
            value={query}
          />
        </div>
      </div>

      <div className="cat-tree">
        {isLoading && catalogs.length === 0 && (
          <div className="cat-loading">
            <Spinner />
            <span>Loading catalogs…</span>
          </div>
        )}
        {!isLoading && catalogs.length === 0 && <div className="cat-ns-empty">No catalogs</div>}
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
