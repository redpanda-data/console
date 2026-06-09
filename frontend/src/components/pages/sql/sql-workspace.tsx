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

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Badge } from 'components/redpanda-ui/components/badge';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Database } from 'lucide-react';
import { CatalogType, ExecuteQueryRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExecuteInstantQuery } from 'react-query/api/observability';
import {
  useExecuteQueryMutation,
  useInvalidateSqlCatalog,
  useListCatalogsQuery,
  useListTablesQuery,
} from 'react-query/api/sql';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { toast } from 'sonner';

import { CatalogTree } from './catalog-tree';
import { firstKeyword, SQL_KEYWORDS } from './sql';
import { SqlEditor, type SqlEditorHandle } from './sql-editor';
import { SqlResults } from './sql-results';
import {
  type BridgeInfo,
  type Catalog,
  type CellValue,
  type ColumnDef,
  columnKindForPgType,
  type QueryRun,
  type ResultRow,
  type SqlIdentifier,
  type SqlRole,
  shortPgType,
  type TableRef,
} from './sql-types';
import { SqlWizard, type WizardTopic } from './sql-wizard';

const INITIAL_QUERY = 'SELECT name, type\nFROM system.catalogs\nORDER BY name;';

// Build autocomplete identifiers from the loaded catalog set + SQL keywords.
function buildIdentifiers(catalogs: Catalog[]): SqlIdentifier[] {
  const out: SqlIdentifier[] = [];
  const seenCols = new Set<string>();
  for (const c of catalogs) {
    out.push({ label: c.name, kind: 'catalog' });
    for (const ns of c.namespaces) {
      for (const t of ns.tables) {
        out.push({ label: t.name, kind: 'table' });
        for (const col of t.columns ?? []) {
          if (!seenCols.has(col.name)) {
            seenCols.add(col.name);
            out.push({ label: col.name, kind: 'column' });
          }
        }
      }
    }
  }
  for (const k of SQL_KEYWORDS) {
    out.push({ label: k, kind: 'keyword' });
  }
  return out;
}

let RUN_TOKEN = 0;

// Oxla addresses catalog tables as `catalog=>table`. These match the table
// ref(s) in a statement for the bridge-query indicator.
const BRIDGE_REF_RE = /=>\s*"?[a-zA-Z0-9._-]+/g;
const BRIDGE_TABLE_RE = /=>\s*"?([a-zA-Z0-9._-]+)/;

// Best-effort: a single-table SELECT against a Redpanda-catalog topic resolves
// to that topic, used to drive the bridge-query indicator. Returns null for
// joins/multi-table/non-matching shapes; the lag query then self-gates
// (non-Iceberg topics have no pending-lag series).
const queriedBridgeTopic = (sql: string): string | null => {
  const refs = sql.match(BRIDGE_REF_RE);
  if (!refs || refs.length !== 1) {
    return null;
  }
  return sql.match(BRIDGE_TABLE_RE)?.[1] ?? null;
};

export type SqlWorkspaceProps = {
  /** Effective role of the caller. Defaults to viewer. */
  role?: SqlRole;
};

export function SqlWorkspace({ role = 'viewer' }: SqlWorkspaceProps) {
  const [run, setRun] = useState<QueryRun>({ state: 'idle' });
  // Topic whose Iceberg lag drives the bridge-query indicator. Set when a table
  // is queried from the catalog tree; the lag itself comes from the
  // ObservabilityService (below), so ExecuteQuery stays untouched.
  const [bridgeTopic, setBridgeTopic] = useState<string | null>(null);
  // Timestamp of the run that set bridgeTopic — stamped into the lag query so
  // re-running the same query refetches (new key) instead of serving a cached
  // snapshot, and reflects the lag at that query's time.
  const [bridgeRunAt, setBridgeRunAt] = useState<number | null>(null);
  const editorRef = useRef<SqlEditorHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Render the workspace as a fixed overlay filling the area right of the
  // cluster sidebar, below the page header. This gives a true full-width,
  // full-height editor WITHOUT mutating any shared cloud-ui layout nodes —
  // so it never leaves residue on other pages (e.g. Overview) when you
  // navigate away. Works in both standalone console and embedded cloud-ui.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    // Natural (in-flow) top sits just below the page header. Measured once
    // while still in flow; horizontal resizes don't change it.
    const naturalTop = el.getBoundingClientRect().top;

    const findRegionLeft = () => {
      // The content region is the INNERMOST ancestor that spans to the
      // viewport's right edge — i.e. the main column right of the sidebar.
      // (Outer ancestors like the sidebar wrapper also reach the right edge but
      // start at x=0 and would put the editor under the sidebar.)
      let node = el.parentElement;
      while (node && node !== document.body) {
        const r = node.getBoundingClientRect();
        if (Math.abs(r.right - window.innerWidth) <= 2 && r.width > 200) {
          return r.left;
        }
        node = node.parentElement;
      }
      return el.getBoundingClientRect().left;
    };

    const layout = () => {
      const left = findRegionLeft();
      el.style.position = 'fixed';
      el.style.top = `${naturalTop}px`;
      el.style.left = `${left}px`;
      el.style.right = '0px';
      el.style.bottom = '0px';
      el.style.height = 'auto';
      el.style.borderTop = '1px solid var(--color-border)';
    };

    layout();
    window.addEventListener('resize', layout);

    // The overlay is fixed, but the host page (cloud-ui chrome when embedded)
    // still scrolls behind it — dragging the host page header up/down/sideways
    // while the pinned editor stays put. Lock every scrollable ancestor (plus
    // the document scroller) so nothing behind the overlay can scroll, keeping
    // the host header static. No-op in standalone console, where nothing scrolls.
    const locked: Array<{ node: HTMLElement; overflow: string }> = [];
    const lock = (node: HTMLElement) => {
      locked.push({ node, overflow: node.style.overflow });
      node.style.overflow = 'hidden';
    };
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.body) {
      const c = getComputedStyle(node);
      const scrollable = /(auto|scroll)/.test(c.overflowY + c.overflowX);
      if (scrollable && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
        lock(node);
      }
      node = node.parentElement;
    }
    const scroller = (document.scrollingElement ?? document.documentElement) as HTMLElement;
    lock(scroller);
    if (document.body) {
      lock(document.body);
    }

    return () => {
      window.removeEventListener('resize', layout);
      for (const { node: n, overflow } of locked) {
        n.style.overflow = overflow;
      }
    };
  }, []);

  const { data: catalogsData, isLoading } = useListCatalogsQuery();
  const executeQuery = useExecuteQueryMutation();

  // Map proto catalogs to the tree view model. Tables/columns are filled in by
  // the catalog-tree agent via ListTables/DescribeTable.
  const catalogs = useMemo<Catalog[]>(() => {
    // MVP surfaces only the Redpanda catalog; Iceberg catalog support lands later.
    const list = (catalogsData?.catalogs ?? []).filter((c) => c.type === CatalogType.REDPANDA);
    return list.map((c) => ({
      name: c.name,
      displayLabel: c.type === CatalogType.REDPANDA ? 'Redpanda Catalog' : c.name,
      engine: c.type === CatalogType.REDPANDA ? 'redpanda' : 'iceberg',
      namespaces: c.namespaceName ? [{ id: `${c.name}.${c.namespaceName}`, name: c.namespaceName, tables: [] }] : [],
    }));
  }, [catalogsData]);

  const identifiers = useMemo(() => buildIdentifiers(catalogs), [catalogs]);

  // Bridge-query lag for the queried topic, read from the ObservabilityService
  // (per-topic named queries) — decoupled from ExecuteQuery. A non-Iceberg topic
  // has no pending-lag series, so `bridge` resolves to undefined and nothing shows.
  const bridgeTxLag = useExecuteInstantQuery(
    {
      queryName: 'iceberg_topic_translation_lag',
      params: {
        filters: { topic: bridgeTopic ?? '' },
        time: bridgeRunAt ? timestampFromDate(new Date(bridgeRunAt)) : undefined,
      },
    },
    { enabled: Boolean(bridgeTopic) }
  );
  const bridgeCommitLag = useExecuteInstantQuery(
    {
      queryName: 'iceberg_topic_commit_lag',
      params: {
        filters: { topic: bridgeTopic ?? '' },
        time: bridgeRunAt ? timestampFromDate(new Date(bridgeRunAt)) : undefined,
      },
    },
    { enabled: Boolean(bridgeTopic) }
  );
  const bridge = useMemo<BridgeInfo | undefined>(() => {
    if (!bridgeTopic) {
      return;
    }
    const tx = bridgeTxLag.data?.results?.[0]?.value?.value;
    const commit = bridgeCommitLag.data?.results?.[0]?.value?.value;
    if (tx === undefined && commit === undefined) {
      return;
    }
    const translationLag = tx ?? 0;
    const commitLag = commit ?? 0;
    return { topic: bridgeTopic, translationLag, commitLag, totalLag: translationLag + commitLag };
  }, [bridgeTopic, bridgeTxLag.data, bridgeCommitLag.data]);

  const doRun = useCallback(
    (sql: string) => {
      const token = ++RUN_TOKEN;
      const kw = firstKeyword(sql);
      // Drive the bridge indicator off the executed query (single tiered topic),
      // not the catalog click — so it only shows for the topic actually queried.
      const nextBridgeTopic = kw === 'SELECT' ? queriedBridgeTopic(sql) : null;
      setBridgeTopic(nextBridgeTopic);
      setBridgeRunAt(nextBridgeTopic ? Date.now() : null);

      if (kw !== 'SELECT') {
        let title = 'Statement not allowed';
        let message = `Only SELECT statements are supported in this release. Found "${kw || 'empty statement'}".`;
        let hint: string | undefined;
        let hintAction = false;
        if (kw === 'CREATE') {
          title = 'Use the wizard to create tables';
          message = "CREATE TABLE isn't run from the editor in this release.";
          hint = 'Creating a table from a topic?';
          hintAction = true;
        } else if (kw === 'GRANT' || kw === 'REVOKE') {
          title = 'Manage access in Security';
          message = 'Grants are managed in Security in this release.';
        }
        setRun({ state: 'error', token, title, message, hint, hintAction });
        return;
      }

      setRun({ state: 'running', token });
      const start = performance.now();
      executeQuery.mutate(create(ExecuteQueryRequestSchema, { statement: sql }), {
        onSuccess: (res) => {
          if (RUN_TOKEN !== token) {
            return;
          }
          const columns: ColumnDef[] = res.columns.map((c) => ({
            name: c.name,
            type: c.type,
            kind: columnKindForPgType(c.type),
            short: shortPgType(c.type),
          }));
          const rows: ResultRow[] = res.rows.map((r) => {
            const row: ResultRow = {};
            r.values.forEach((v, i) => {
              const col = columns[i];
              if (!col) {
                return;
              }
              let cell: CellValue = v.nullValue ? null : (v.value ?? null);
              if (cell !== null && col.kind === 'bool') {
                cell = cell === 'true' || cell === 't';
              }
              row[col.name] = cell;
            });
            return row;
          });
          setRun({
            state: 'success',
            token,
            columns,
            rows,
            totalRows: rows.length,
            elapsedMs: Math.round(performance.now() - start),
            truncated: res.truncated,
          });
        },
        onError: (error) => {
          if (RUN_TOKEN !== token) {
            return;
          }
          setRun({ state: 'error', token, title: 'Query failed', message: error.message });
        },
      });
    },
    [executeQuery]
  );

  const onQueryTable = useCallback((catalog: Catalog, table: TableRef) => {
    // Redpanda SQL (Oxla) addresses catalog-qualified tables with the `=>`
    // operator, e.g. `default_redpanda_catalog=>cars` — not `catalog.table`.
    const ref = `${catalog.name}=>${table.name}`;
    const sql = `SELECT *\nFROM ${ref}\nLIMIT 100;`;
    editorRef.current?.setQuery(sql, table.name);
  }, []);

  // ---- Add-topic wizard ----
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardError, setWizardError] = useState<string | undefined>(undefined);
  const { data: topicsData } = useLegacyListTopicsQuery(undefined, { hideInternalTopics: true });
  const invalidateSqlCatalog = useInvalidateSqlCatalog();

  // Topics already exposed as tables in the Redpanda catalog — excluded from
  // the wizard's topic picker so you can't create a duplicate.
  const redpandaCatalogName = useMemo(() => catalogs.find((c) => c.engine === 'redpanda')?.name ?? '', [catalogs]);
  const { data: redpandaTablesData } = useListTablesQuery({ catalog: redpandaCatalogName });
  const takenTopics = useMemo(() => {
    const taken = new Set<string>();
    for (const t of redpandaTablesData?.tables ?? []) {
      if (t.topicName) {
        taken.add(t.topicName);
      }
      taken.add(t.name);
    }
    return taken;
  }, [redpandaTablesData]);

  const wizardTopics = useMemo<WizardTopic[]>(
    () =>
      (topicsData?.topics ?? [])
        .filter((t) => !takenTopics.has(t.topicName))
        .map((t) => ({ name: t.topicName, partitions: t.partitionCount })),
    [topicsData, takenTopics]
  );

  const openWizard = useCallback(() => {
    setWizardError(undefined);
    setWizardOpen(true);
  }, []);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardError(undefined);
  }, []);

  const onCreateTable = useCallback(
    ({ topic, tableName }: { topic: string; tableName: string }) => {
      setWizardError(undefined);
      const statement = `CREATE TABLE default_redpanda_catalog=>${tableName}\n  WITH (topic='${topic}');`;
      executeQuery.mutate(create(ExecuteQueryRequestSchema, { statement }), {
        onSuccess: async () => {
          await invalidateSqlCatalog();
          toast.success(`Table ${tableName} created`);
          closeWizard();
        },
        onError: (error) => setWizardError(error.message),
      });
    },
    [executeQuery, invalidateSqlCatalog, closeWizard]
  );

  return (
    <div
      // The registry's near-black dark theme renders borders at rgba(255,255,255,0.04)
      // — effectively invisible. The SQL design uses visible grey dividers
      // (grey-700/600/800), so re-point the border tokens to those registry grey
      // scale values for this surface in dark mode only. Light mode is untouched.
      className="flex h-full flex-col bg-background text-strong dark:[--color-border-strong:var(--color-grey-800)] dark:[--color-border-subtle:var(--color-grey-600)] dark:[--color-border:var(--color-grey-700)]"
      ref={rootRef}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b bg-background px-6">
        <div className="flex items-center gap-2 font-semibold text-sm text-strong tracking-heading [&_svg]:text-action-primary">
          <Database size={16} /> Redpanda SQL <span className="font-medium text-muted-foreground">· Studio</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge size="sm" variant={role === 'admin' ? 'info-inverted' : 'simple'}>
            {role === 'admin' ? 'Admin' : 'Viewer · read-only'}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r bg-background">
          <CatalogTree
            catalogs={catalogs}
            isLoading={isLoading}
            onAddTable={openWizard}
            onQueryTable={onQueryTable}
            role={role}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1">
          {wizardOpen ? (
            <SqlWizard
              error={wizardError}
              isCreating={executeQuery.isPending}
              onClose={closeWizard}
              onCreate={onCreateTable}
              topics={wizardTopics}
            />
          ) : (
            <ResizablePanelGroup className="min-w-0 flex-1" direction="vertical">
              <ResizablePanel
                className="flex min-h-0 bg-background [&>*]:min-w-0 [&>*]:flex-1"
                defaultSize={42}
                minSize={15}
              >
                <SqlEditor
                  identifiers={identifiers}
                  initialQuery={INITIAL_QUERY}
                  onRun={(sql) => doRun(sql)}
                  ref={editorRef}
                  role={role}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel className="flex min-h-0 bg-background [&>*]:min-w-0 [&>*]:flex-1" minSize={20}>
                <SqlResults role={role} run={run.state === 'success' ? { ...run, bridge } : run} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    </div>
  );
}
