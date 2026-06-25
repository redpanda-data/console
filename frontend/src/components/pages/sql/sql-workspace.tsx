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
import { Button } from 'components/redpanda-ui/components/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { cn } from 'components/redpanda-ui/lib/utils';
import { isEmbedded } from 'config';
import { Database, Maximize2, Minimize2 } from 'lucide-react';
import {
  CatalogType,
  ExecuteQueryRequestSchema,
  type Column as SqlColumn,
  type Row as SqlRow,
  type Value as SqlValue,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// Studio layout mode. 'boxed' caps the studio to the standard page width like
// every other page; 'full' is edge-to-edge. Persisted per browser.
type StudioMode = 'boxed' | 'full';

const STUDIO_MODE_KEY = 'rp-sql-studio-mode';
// Generic cloud-ui shell contract: any embedded page that sets this <html>
// attribute makes the layout wrapper (and the breadcrumb header inside it)
// animate to full width via CSS — see cloud-ui layout.tsx `expandableWidth`.
// Presence = expanded. Set synchronously with the studio's own geometry change
// so the wrapper and the studio animate in lockstep.
const PAGE_EXPANDED_ATTR = 'data-page-expanded';
const STUDIO_MAX_WIDTH = 1500; // boxed mode caps to the standard page column
const STUDIO_SIDE_GAP = 40; // boxed inset from the centered max-width column
const STUDIO_TOP_GAP = 16; // boxed gap between the breadcrumb header and the studio header; full mode has none
const STUDIO_BOTTOM_GAP = 32;
const STUDIO_EASE = '0.3s cubic-bezier(0.4, 0, 0.2, 1)';
const SCROLLABLE_OVERFLOW_RE = /(auto|scroll)/;
// Root animates geometry only; the body card animates its own border/radius/shadow
// via Tailwind (same easing/duration) so the studio header stays outside the box.
const STUDIO_TRANSITION = `top ${STUDIO_EASE}, left ${STUDIO_EASE}, right ${STUDIO_EASE}, bottom ${STUDIO_EASE}`;

const readStudioMode = (): StudioMode =>
  (typeof localStorage !== 'undefined' ? localStorage.getItem(STUDIO_MODE_KEY) : null) === 'full' ? 'full' : 'boxed';

const setPageExpanded = (expanded: boolean) => {
  const root = document.documentElement;
  if (expanded) {
    root.setAttribute(PAGE_EXPANDED_ATTR, '');
  } else {
    root.removeAttribute(PAGE_EXPANDED_ATTR);
  }
};

// Standalone console renders its own breadcrumb/title header for the SQL route;
// populate it the way other pages do (no-op visually when embedded, where the
// host supplies the header).
const setStudioPageHeader = () => {
  uiState.pageTitle = 'SQL';
  uiState.pageBreadcrumbs = [{ title: 'SQL', linkTo: '/sql', heading: 'SQL' }];
};

// Renders the workspace as a fixed overlay filling the area right of the
// cluster sidebar, below the page header. This gives a true full-width,
// full-height editor WITHOUT mutating any shared cloud-ui layout nodes — so it
// never leaves residue on other pages (e.g. Overview) when you navigate away.
// Works in both standalone console and embedded cloud-ui. `getMode` is read on
// every layout pass so a mode toggle re-runs geometry; returns teardown +
// relayout (the latter called by the component when the mode changes).
function setupOverlayLayout(
  el: HTMLDivElement,
  getMode: () => StudioMode
): { relayout: () => void; teardown: () => void } {
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
    const regionLeft = findRegionLeft();
    el.style.position = 'fixed';
    el.style.height = 'auto';
    if (getMode() === 'full') {
      // Edge-to-edge: fill the region right of the sidebar, flush under the header.
      el.style.top = `${naturalTop}px`;
      el.style.left = `${regionLeft}px`;
      el.style.right = '0px';
      el.style.bottom = '0px';
      return;
    }
    // Boxed: centre a max-width column in the region, inset by the side gap, with a
    // bottom gap. Standalone adds a top gap below the thin breadcrumb; embedded
    // skips it because the cloud-ui shell's own header spacing already supplies the
    // gap. The card border/radius/shadow live on the body element, so the studio
    // header sits outside the box.
    const regionWidth = window.innerWidth - regionLeft;
    const capped = Math.min(STUDIO_MAX_WIDTH, regionWidth);
    const centeredLeft = regionLeft + (regionWidth - capped) / 2;
    el.style.top = `${naturalTop + (isEmbedded() ? 0 : STUDIO_TOP_GAP)}px`;
    el.style.left = `${centeredLeft + STUDIO_SIDE_GAP}px`;
    el.style.right = `${window.innerWidth - (centeredLeft + capped) + STUDIO_SIDE_GAP}px`;
    el.style.bottom = `${STUDIO_BOTTOM_GAP}px`;
  };

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
  const lockAll = () => {
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.body) {
      const c = getComputedStyle(node);
      const scrollable = SCROLLABLE_OVERFLOW_RE.test(c.overflowY + c.overflowX);
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
  };
  const unlockAll = () => {
    for (const { node, overflow } of locked) {
      node.style.overflow = overflow;
    }
    locked.length = 0;
  };

  // When embedded, the host keeps Console MOUNTED but display:none while on
  // its own routes (e.g. /overview) — unmount cleanup never runs there, which
  // would strand the scroll locks on a page that needs to scroll. Hold the
  // locks only while actually on screen: display:none collapses the overlay
  // to 0x0, which fires the ResizeObserver, and we release until shown again.
  const isVisible = () => el.getClientRects().length > 0;
  let active = false;
  const sync = () => {
    if (isVisible() && !active) {
      layout();
      lockAll();
      // Re-assert the host expand attr on show — embedded cloud-ui keeps Console
      // mounted+hidden, so this is the lifecycle that owns the attribute.
      setPageExpanded(getMode() === 'full');
      active = true;
    } else if (!isVisible() && active) {
      unlockAll();
      // Clear it on hide so other cloud-ui pages don't render stuck full-width.
      setPageExpanded(false);
      active = false;
    }
  };
  sync();
  const visibilityObserver = new ResizeObserver(sync);
  visibilityObserver.observe(el);

  // Enable transitions one frame after first geometry so the initial mount
  // snaps into place instead of animating from the unstyled position.
  let transitionsReady = false;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.transition = STUDIO_TRANSITION;
      transitionsReady = true;
    })
  );

  const onWindowResize = () => {
    if (!active) {
      return;
    }
    // Reposition instantly during resize — animating every resize tick trails.
    if (transitionsReady) {
      el.style.transition = 'none';
    }
    layout();
    if (transitionsReady) {
      requestAnimationFrame(() => {
        el.style.transition = STUDIO_TRANSITION;
      });
    }
  };
  window.addEventListener('resize', onWindowResize);

  return {
    relayout: () => {
      if (active) {
        layout();
      }
    },
    teardown: () => {
      visibilityObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
      if (active) {
        unlockAll();
      }
    },
  };
}

export type SqlWorkspaceProps = {
  /**
   * Effective role of the caller. When omitted it's derived from the
   * SQLService GetSqlIdentity endpoint (admin when the caller is a superuser);
   * pass it explicitly to override the lookup in tests/storybook.
   */
  sqlRole?: SqlRole;
};

// Studio layout mode + the callback ref that wires it to the imperative overlay.
// The ref mirrors the mode so the overlay (set up once) reads the latest value
// during async relayouts; toggleMode drives the geometry change directly — react
// state only mirrors it so the toggle button's icon re-renders.
function useStudioMode(): {
  attachOverlay: (el: HTMLDivElement | null) => void;
  mode: StudioMode;
  toggleMode: () => void;
} {
  const [mode, setMode] = useState<StudioMode>(readStudioMode);
  const modeRef = useRef(mode);
  const overlayCleanup = useRef<(() => void) | null>(null);
  const overlayRelayout = useRef<(() => void) | null>(null);

  // Callback ref (no effect): React calls it with the node on mount and null
  // on unmount, which maps 1:1 onto the overlay's setup/teardown. Must be
  // identity-stable, or React would detach/reattach the overlay every render.
  const attachOverlay = useCallback((el: HTMLDivElement | null) => {
    overlayCleanup.current?.();
    if (el) {
      // Reflect the mode for the cloud-ui shell while the studio is mounted, and
      // clear it on unmount so it leaves no residue on other pages.
      setPageExpanded(modeRef.current === 'full');
      setStudioPageHeader();
      const handle = setupOverlayLayout(el, () => modeRef.current);
      overlayCleanup.current = handle.teardown;
      overlayRelayout.current = handle.relayout;
    } else {
      setPageExpanded(false);
      overlayCleanup.current = null;
      overlayRelayout.current = null;
    }
  }, []);

  const toggleMode = useCallback(() => {
    const next: StudioMode = modeRef.current === 'boxed' ? 'full' : 'boxed';
    modeRef.current = next;
    try {
      localStorage.setItem(STUDIO_MODE_KEY, next);
    } catch {
      // ignore storage failures (private mode / quota)
    }
    // Update the <html> attr and the studio geometry in the same synchronous
    // tick: the cloud-ui shell's wrapper transitions off the attr via CSS while
    // the overlay transitions its inline geometry, so both animate together.
    setPageExpanded(next === 'full');
    overlayRelayout.current?.();
    setMode(next);
  }, []);

  return { attachOverlay, mode, toggleMode };
}

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
  const { mode, toggleMode, attachOverlay } = useStudioMode();

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
      ref={attachOverlay}
    >
      <div className={cn('flex h-[52px] shrink-0 items-center gap-3 px-1', mode === 'full' ? 'px-4' : 'mt-3')}>
        <div className="flex items-center gap-2 font-semibold text-lg text-strong tracking-heading [&_svg]:text-action-primary">
          <Database size={20} /> Redpanda SQL <span className="font-medium text-muted-foreground">· Studio</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge size="sm" variant="simple">
            {sqlRole === 'admin' ? 'Admin' : 'Viewer · read-only'}
          </Badge>
          <Button
            aria-label={mode === 'boxed' ? 'Enter fullscreen' : 'Exit fullscreen'}
            onClick={toggleMode}
            size="icon-sm"
            title={mode === 'boxed' ? 'Fullscreen' : 'Exit fullscreen'}
            variant="secondary-ghost"
          >
            {mode === 'boxed' ? <Maximize2 /> : <Minimize2 />}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden bg-background transition-[margin,border-radius,border-color,box-shadow] duration-300 ease-in-out',
          // The box lives here (not on the root) so the studio header stays above it.
          // Boxed: rounded, bordered, shadowed card with a gap below the header.
          // Full: flush, top divider only (sides/bottom border kept transparent so
          // the radius/border transition has something to animate).
          mode === 'boxed'
            ? 'mt-3 rounded-xl border pt-3 shadow-sm'
            : 'rounded-none border border-x-transparent border-b-transparent shadow-none'
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
                defaultSize={42}
                minSize={15}
              >
                <SqlEditor catalogs={completionCatalogs} initialQuery={INITIAL_QUERY} onRun={doRun} ref={editorRef} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel className="flex min-h-0 bg-background [&>*]:min-w-0 [&>*]:flex-1" minSize={20}>
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
