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
import { useNavigate } from '@tanstack/react-router';
import { Badge } from 'components/redpanda-ui/components/badge';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ExpandedPageToggle } from 'components/ui/expanded-page-toggle';
import { useExpandedPageMode } from 'hooks/use-expanded-page-mode';
import { Database } from 'lucide-react';
import {
  CatalogType,
  ExecuteQueryRequestSchema,
  type Column as SqlColumn,
  type Row as SqlRow,
  type Value as SqlValue,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useExecuteInstantQuery } from 'react-query/api/observability';
import {
  useExecuteQueryMutation,
  useGetSqlIdentityQuery,
  useInvalidateSqlCatalog,
  useListCatalogsQuery,
  useListTablesQuery,
  useTopicIcebergQuery,
} from 'react-query/api/sql';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { toast } from 'sonner';
import { Feature, isSupported, useSupportedFeaturesStore } from 'state/supported-features';
import { uiState } from 'state/ui-state';

import { CatalogTree } from './catalog-tree';
import { bridgeTopicForQuery, firstKeyword, isWriteKeyword } from './sql';
import { SqlEditor, type SqlEditorHandle } from './sql-editor';
import { SqlResults } from './sql-results';
import {
  type BridgeInfo,
  type Catalog,
  type CellValue,
  type ColumnDef,
  columnKindForPgType,
  hintFromError,
  isArrayPgType,
  type QueryRun,
  type ResultRow,
  type SqlRole,
  type TableRef,
} from './sql-types';
import { createTableSql, SqlWizard, type WizardTopic } from './sql-wizard';

// Start with a blank editor — the results pane prompts the caller to run a
// query (or create a table from a topic when the catalog is empty) instead of
// pre-running a system query.
const INITIAL_QUERY = '';

function columnDefFromProto(column: SqlColumn): ColumnDef {
  return {
    name: column.name,
    type: column.type,
    kind: columnKindForPgType(column.type),
    short: column.type.toLowerCase(),
    isArray: isArrayPgType(column.type),
  };
}

function cellValueForColumn(value: SqlValue, column: ColumnDef): CellValue {
  let cell: CellValue = value.nullValue ? null : (value.value ?? null);
  // Arrays keep their raw string form — only scalar bools coerce. Case-insensitive
  // so 'TRUE'/'T'/'True' don't slip through as a falsey render.
  if (cell !== null && column.kind === 'bool' && !column.isArray) {
    const v = cell.toLowerCase();
    cell = v === 'true' || v === 't';
  }
  return cell;
}

function resultRowFromProto(row: SqlRow, columns: ColumnDef[]): ResultRow {
  const result: ResultRow = {};
  row.values.forEach((value, index) => {
    const column = columns[index];
    if (!column) {
      return;
    }
    result[column.name] = cellValueForColumn(value, column);
  });
  return result;
}

const STUDIO_MODE_KEY = 'rp-sql-studio-mode';

// Standalone renders its own breadcrumb header; the embedded host supplies its own.
const setStudioPageHeader = () => {
  uiState.pageTitle = 'SQL';
  uiState.pageBreadcrumbs = [{ title: 'SQL', linkTo: '/sql', heading: 'SQL' }];
};

export type SqlWorkspaceProps = {
  /**
   * Effective role of the caller. When omitted it's derived from the
   * SQLService GetSqlIdentity endpoint (admin when the caller is a superuser);
   * pass it explicitly to override the lookup in tests/storybook.
   */
  sqlRole?: SqlRole;
};

export function SqlWorkspace({ sqlRole: sqlRoleProp }: SqlWorkspaceProps) {
  const navigate = useNavigate();
  // The route guard skips the redirect while endpoint compatibility is still
  // loading; once it resolves, bounce clusters that genuinely lack SQLService.
  const endpointsLoaded = useSupportedFeaturesStore((s) => s.endpointCompatibility !== null);
  useEffect(() => {
    if (endpointsLoaded && !isSupported(Feature.SQLService)) {
      navigate({ to: '/', replace: true });
    }
  }, [endpointsLoaded, navigate]);

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
  // Per-instance monotonic run token: drops out-of-order responses without
  // sharing state across concurrently-mounted SqlWorkspace instances.
  const latestRunToken = useRef(0);
  const { expanded, toggleExpanded, ref: expandedModeRef } = useExpandedPageMode({ storageKey: STUDIO_MODE_KEY });

  // Pre-paint so the previous route's title doesn't flash in the app header.
  useLayoutEffect(() => {
    setStudioPageHeader();
  }, []);

  const { data: catalogsData, isLoading } = useListCatalogsQuery();
  const executeQuery = useExecuteQueryMutation();

  // Caller's effective role: an explicit prop wins (tests/storybook), otherwise
  // derive it from the SQL identity — admin unlocks write/DDL affordances like
  // the "Add a topic" button. Falls back to viewer until the lookup resolves.
  const { data: identity } = useGetSqlIdentityQuery();
  const sqlRole: SqlRole = sqlRoleProp ?? (identity?.isAdmin ? 'admin' : 'viewer');

  // Map proto catalogs to the tree view model. Tables/columns are filled in by
  // the catalog-tree agent via ListTables/DescribeTable.
  const catalogs = useMemo<Catalog[]>(() => {
    // MVP surfaces only the Redpanda catalog; Iceberg catalog support lands later.
    const list = (catalogsData?.catalogs ?? []).filter((c) => c.type === CatalogType.REDPANDA);
    return list.map((c) => ({
      name: c.name,
      displayLabel: c.type === CatalogType.REDPANDA ? 'Redpanda Catalog' : c.name,
      engine: c.type === CatalogType.REDPANDA ? 'redpanda' : 'iceberg',
      namespaces: c.namespace ? [{ id: `${c.name}.${c.namespace}`, name: c.namespace, tables: [] }] : [],
    }));
  }, [catalogsData]);

  // Whether the queried topic is Iceberg-tiered — the authoritative bridge-query
  // signal (`redpanda.iceberg.mode`), independent of any lag metric. A topic that
  // is tiered but hasn't started translating yet emits no lag series, so the badge
  // must key off the config, not metric presence (else a not-yet-synced bridge
  // query — every row served from the topic — would look like a plain query).
  const { isIceberg: bridgeTopicTiered } = useTopicIcebergQuery(bridgeTopic ?? '', {
    enabled: Boolean(bridgeTopic),
  });
  // Bridge-query lag for the queried topic, read from the ObservabilityService
  // (per-topic named queries) — decoupled from ExecuteQuery. Drives only the lag
  // timeline; the badge itself comes from `bridgeTopicTiered` above.
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
    // Bridge-ness is the topic being Iceberg-tiered — not whether lag has shown up.
    // Lag defaults to 0 when its series is absent (e.g. translation hasn't started),
    // which the timeline reads as "fully caught up" and hides; the badge still shows.
    if (!(bridgeTopic && bridgeTopicTiered)) {
      return;
    }
    const tx = bridgeTxLag.data?.results?.[0]?.value?.value;
    const commit = bridgeCommitLag.data?.results?.[0]?.value?.value;
    const translationLag = tx ?? 0;
    const commitLag = commit ?? 0;
    return { topic: bridgeTopic, translationLag, commitLag, totalLag: translationLag + commitLag };
  }, [bridgeTopic, bridgeTopicTiered, bridgeTxLag.data, bridgeCommitLag.data]);

  // Redpanda-catalog tables, fetched up front so both the add-topic wizard and
  // editor autocomplete (and the bridge indicator below) can resolve table refs.
  const redpandaCatalogName = useMemo(() => catalogs.find((c) => c.engine === 'redpanda')?.name ?? '', [catalogs]);
  const { data: redpandaTablesData } = useListTablesQuery({ catalog: redpandaCatalogName });
  const hasTables = (redpandaTablesData?.tables?.length ?? 0) > 0;

  // Catalogs enriched with the fetched Redpanda-catalog tables, so editor
  // autocomplete can resolve table references — the bare catalog list seeds
  // namespaces with empty `tables`.
  const completionCatalogs = useMemo<Catalog[]>(
    () =>
      catalogs.map((catalog) => {
        if (catalog.name !== redpandaCatalogName) {
          return catalog;
        }
        const tablesByNamespace = new Map<string, TableRef[]>();
        for (const t of redpandaTablesData?.tables ?? []) {
          const list = tablesByNamespace.get(t.catalogNamespace) ?? [];
          list.push({
            id: `${catalog.name}.${t.catalogNamespace}.${t.name}`,
            name: t.name,
            namespaceName: t.catalogNamespace,
            catalogName: catalog.name,
            topicName: t.topic,
          });
          tablesByNamespace.set(t.catalogNamespace, list);
        }
        const namespaces = catalog.namespaces.map((ns) => ({
          ...ns,
          tables: tablesByNamespace.get(ns.name) ?? ns.tables,
        }));
        for (const [name, tables] of tablesByNamespace) {
          if (!namespaces.some((ns) => ns.name === name)) {
            namespaces.push({ id: `${catalog.name}.${name}`, name, tables });
          }
        }
        return { ...catalog, namespaces };
      }),
    [catalogs, redpandaCatalogName, redpandaTablesData]
  );

  const doRun = useCallback(
    (sql: string) => {
      const token = (latestRunToken.current += 1);
      const kw = firstKeyword(sql);
      // Block writes/DDL/DCL on the first keyword; read-shaped statements
      // (SELECT/WITH/EXPLAIN/SHOW/…) pass and the server rejects what it can't run.
      const blocked = !kw || isWriteKeyword(sql);
      // Drive the bridge indicator off the executed query (single tiered topic),
      // not the catalog click — so it only shows for the topic actually queried.
      const nextBridgeTopic = blocked ? null : bridgeTopicForQuery(sql, completionCatalogs);
      setBridgeTopic(nextBridgeTopic);
      setBridgeRunAt(nextBridgeTopic ? Date.now() : null);

      if (blocked) {
        let title = 'Statement not allowed';
        let message = `Only read queries are supported in this release. Found "${kw || 'empty statement'}".`;
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
          if (latestRunToken.current !== token) {
            return;
          }
          const columns = res.columns.map(columnDefFromProto);
          const rows = res.rows.map((row) => resultRowFromProto(row, columns));
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
          if (latestRunToken.current !== token) {
            return;
          }
          setRun({ state: 'error', token, title: 'Query failed', message: error.message, hint: hintFromError(error) });
        },
      });
    },
    [completionCatalogs, executeQuery]
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
  const takenTopics = useMemo(() => {
    const taken = new Set<string>();
    for (const t of redpandaTablesData?.tables ?? []) {
      if (t.topic) {
        taken.add(t.topic);
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
      // Shares one builder with the wizard's "this will run" preview so the two
      // can't drift.
      const statement = createTableSql(tableName, topic);
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
      // In-flow page (footer below); 7rem = app header + pt-8, matching the RPCN
      // editor. Dark mode re-points the border tokens — the registry's near-black
      // theme renders borders effectively invisible.
      className="flex h-[calc(100dvh-7rem)] min-h-[500px] flex-col bg-background text-strong dark:[--color-border-strong:var(--color-grey-800)] dark:[--color-border-subtle:var(--color-grey-600)] dark:[--color-border:var(--color-grey-700)]"
      ref={expandedModeRef}
    >
      <div className={cn('flex h-[52px] shrink-0 items-center gap-3 px-1', expanded ? 'px-4' : 'mt-3')}>
        <div className="flex items-center gap-2 font-semibold text-lg text-strong tracking-heading [&_svg]:text-action-primary">
          <Database size={20} /> Redpanda SQL <span className="font-medium text-muted-foreground">· Studio</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge size="sm" variant="simple">
            {sqlRole === 'admin' ? 'Admin' : 'Viewer · read-only'}
          </Badge>
          <ExpandedPageToggle expanded={expanded} onToggle={toggleExpanded} />
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden bg-background transition-[margin,border-radius,border-color,box-shadow] duration-300 ease-in-out',
          // Boxed: rounded card below the studio header. Full: flush sides; top/bottom
          // borders stay so clipped scrollable content keeps a visible edge.
          expanded ? 'rounded-none border border-x-transparent shadow-none' : 'mt-3 rounded-xl border pt-3 shadow-sm'
        )}
      >
        <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r bg-background">
          <CatalogTree
            catalogs={catalogs}
            isLoading={isLoading}
            onAddTable={openWizard}
            onQueryTable={onQueryTable}
            sqlRole={sqlRole}
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
            <ResizablePanelGroup className="min-w-0 flex-1" orientation="vertical">
              <ResizablePanel
                className="flex min-h-0 bg-background [&>*]:min-w-0 [&>*]:flex-1"
                defaultSize="42%"
                minSize="15%"
              >
                <SqlEditor catalogs={completionCatalogs} initialQuery={INITIAL_QUERY} onRun={doRun} ref={editorRef} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel className="flex min-h-0 bg-background [&>*]:min-w-0 [&>*]:flex-1" minSize="20%">
                <SqlResults
                  hasTables={hasTables}
                  onAddTable={openWizard}
                  run={run.state === 'success' ? { ...run, bridge } : run}
                  sqlRole={sqlRole}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    </div>
  );
}
