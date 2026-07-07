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

import { Button } from 'components/redpanda-ui/components/button';
import {
  CardTitle,
  Card as RegistryCard,
  CardAction as RegistryCardAction,
  CardHeader as RegistryCardHeader,
} from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Heading, InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Database,
  FileText,
  GitMerge,
  type LucideIcon,
  Play,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
  Terminal,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { prettyMilliseconds } from 'utils/utils';

import { previewSql } from './sql';
import { loadHistory } from './sql-history';
import type { Catalog, SqlRole, TableRef } from './sql-types';

// The SQL section landing page — the default view for the /sql route. It renders
// a hero, a derived-metrics strip, the catalogs/tables overview, suggested
// queries, recent history and docs.
//
// CAPABILITY GATING. The source design also shows observability-backed metric
// tiles (queries · 24h, p50 latency, bytes scanned, max bridge lag) and a
// connection-details card (host/port/JDBC/psql). Neither has a backend today:
// - The metric tiles need named ObservabilityService queries that don't exist
//   yet (only the per-topic `iceberg_topic_*_lag` instant queries do). When
//   those land, add the tiles behind a capability gate (e.g. embedded cloud
//   where the Prometheus-backed ObservabilityService is reachable).
// - The connection card needs the SQL Postgres-wire endpoint surfaced to the UI
//   (host/port/catalog), which Console doesn't expose. When a connection-info
//   source exists, gate the card on it (likely embedded-only).
// Everything rendered here is real data, so standalone deployments degrade
// gracefully to the honest subset rather than showing placeholder numbers.

const DOC_LINKS: Array<{ label: string; sub: string; icon: LucideIcon; href: string }> = [
  {
    label: 'Query topics with SQL',
    sub: 'Syntax, supported statements, limits',
    icon: Database,
    href: 'https://docs.redpanda.com',
  },
  {
    label: 'Connect external tools',
    sub: 'DBeaver, psql, Tableau, Metabase',
    icon: Plug,
    href: 'https://docs.redpanda.com',
  },
  {
    label: 'Bridge queries & freshness',
    sub: 'How the live tail meshes with Iceberg',
    icon: GitMerge,
    href: 'https://docs.redpanda.com',
  },
  {
    label: 'Manage SQL access',
    sub: 'Grant SELECT on catalogs and tables',
    icon: ShieldCheck,
    href: 'https://docs.redpanda.com',
  },
];

const ONBOARDING_STEPS: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  {
    icon: Plus,
    title: 'Add a topic as a table',
    desc: 'Pick a Redpanda topic and expose it in the catalog. Schema is inferred automatically.',
  },
  {
    icon: GitMerge,
    title: 'Query it instantly',
    desc: 'Reads mesh the live tail with Iceberg-tiered history — fresh and complete, no ETL.',
  },
  {
    icon: Terminal,
    title: 'Connect anything',
    desc: 'Query in Console, or point any PostgreSQL-compatible client at the SQL endpoint.',
  },
];

const MAX_RECENT = 6;
const MAX_SUGGESTED = 4;

function flattenTables(catalog: Catalog): TableRef[] {
  return catalog.namespaces.flatMap((ns) => ns.tables);
}

// ---- card shell -------------------------------------------------------------
// Thin flush-list adapters over the registry card: no outer padding, dividers
// between rows, and a compact single-row header.

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <RegistryCard className={cn('gap-0 overflow-hidden p-0 shadow-sm', className)} size="full" variant="standard">
      {children}
    </RegistryCard>
  );
}

function CardHead({
  icon: Icon,
  title,
  badge,
  action,
}: {
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <RegistryCardHeader className="items-center px-4 py-3">
      <CardTitle>
        <span className="flex items-center gap-2.5">
          <Icon className="shrink-0 text-action-primary" size={16} />
          <span className="whitespace-nowrap font-semibold text-sm text-strong tracking-tight">{title}</span>
          {badge}
        </span>
      </CardTitle>
      {action ? <RegistryCardAction className="flex items-center gap-4">{action}</RegistryCardAction> : null}
    </RegistryCardHeader>
  );
}

// Divider under the card header; rows inside separate themselves with border-t.
function CardRows({ children }: { children: ReactNode }) {
  return <div className="border-border-subtle border-t">{children}</div>;
}

function CardActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button className="h-auto p-0 font-medium text-xs" onClick={onClick} size="sm" variant="link">
      {children}
    </Button>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.75 px-4 py-4">
      <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
      <Text as="span" className="text-muted-foreground" variant="bodySmall">
        {label}
      </Text>
    </div>
  );
}

// ---- metrics ----------------------------------------------------------------

function MetricStrip({ tableCount, catalogCount, role }: { tableCount: number; catalogCount: number; role: SqlRole }) {
  const tiles = [
    {
      icon: TableIcon,
      label: 'Queryable tables',
      value: String(tableCount),
      sub: `${catalogCount} ${catalogCount === 1 ? 'catalog' : 'catalogs'} connected`,
    },
    {
      icon: Database,
      label: 'Catalogs',
      value: String(catalogCount),
      sub: 'Available to query',
    },
    {
      icon: ShieldCheck,
      label: 'Your access',
      value: role === 'admin' ? 'Admin' : 'Read-only',
      sub: role === 'admin' ? 'Can add topics as tables' : 'SELECT on granted tables',
    },
  ];
  return (
    <Card className="mt-7 flex-row">
      {tiles.map((tile) => (
        <div className="flex-1 border-border-subtle border-l px-4 py-4 first:border-l-0" key={tile.label}>
          <div className="mb-2 flex items-center gap-1.5">
            <tile.icon className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate font-medium text-muted-foreground text-xs">{tile.label}</span>
          </div>
          <div className="font-semibold text-2xl text-strong tabular-nums leading-none tracking-tight">
            {tile.value}
          </div>
          <div className="mt-1.5 truncate text-muted-foreground text-xs">{tile.sub}</div>
        </div>
      ))}
    </Card>
  );
}

// ---- tables overview --------------------------------------------------------

function TablesOverview({
  catalogs,
  onRunQuery,
  onOpenStudio,
}: {
  catalogs: Catalog[];
  onRunQuery: (sql: string) => void;
  onOpenStudio: () => void;
}) {
  return (
    <Card>
      <CardHead
        action={
          <CardActionButton onClick={onOpenStudio}>
            Browse in studio <ArrowRight size={13} />
          </CardActionButton>
        }
        icon={TableIcon}
        title="Catalogs & tables"
      />
      <CardRows>
        {catalogs.map((catalog) => {
          const tables = flattenTables(catalog);
          return (
            <div className="border-border border-b last:border-b-0" key={catalog.name}>
              <div className="flex items-center gap-2 bg-muted px-4 py-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-action-primary/10 text-action-primary">
                  <Database size={12} />
                </span>
                <span className="font-semibold text-sm">{catalog.displayLabel}</span>
                <span className="ml-auto text-muted-foreground text-xs">
                  {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                </span>
              </div>
              {tables.length === 0 ? (
                <div className="px-4 py-3 text-muted-foreground text-xs">No tables in this catalog yet.</div>
              ) : (
                tables.map((table) => {
                  const sql = previewSql(table.catalogName, table.name);
                  return (
                    <button
                      className="flex w-full cursor-pointer items-center gap-3 border-border-subtle border-t px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-muted/50 dark:hover:bg-surface-default-hover"
                      key={table.id}
                      onClick={() => onRunQuery(sql)}
                      type="button"
                    >
                      <TableIcon className="shrink-0 text-action-primary" size={15} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium font-mono text-sm text-strong">{table.name}</div>
                        {table.topicName ? (
                          <div className="truncate text-muted-foreground text-xs">topic · {table.topicName}</div>
                        ) : null}
                      </div>
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-md border bg-background text-action-primary transition-colors hover:bg-action-primary/10"
                        title="Query table"
                      >
                        <Play size={13} />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </CardRows>
    </Card>
  );
}

// ---- suggested queries (derived from real tables) ---------------------------

function SuggestedQueries({ catalogs, onRunQuery }: { catalogs: Catalog[]; onRunQuery: (sql: string) => void }) {
  const suggestions = useMemo(() => {
    const tables = catalogs.flatMap((catalog) => flattenTables(catalog));
    return tables.slice(0, MAX_SUGGESTED).map((table) => ({
      // Table ids are fully qualified (catalog.namespace.table), so two
      // same-named tables in different namespaces don't collide as keys.
      id: table.id,
      label: `Preview ${table.name}`,
      sub: table.topicName ? `Latest 100 rows from topic ${table.topicName}` : 'Latest 100 rows',
      sql: previewSql(table.catalogName, table.name),
    }));
  }, [catalogs]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHead icon={Sparkles} title="Suggested queries" />
      <CardRows>
        {suggestions.map((suggestion) => (
          <button
            className="group flex w-full cursor-pointer items-center gap-3 border-border-subtle border-t px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-muted/50 dark:hover:bg-surface-default-hover"
            key={suggestion.id}
            onClick={() => onRunQuery(suggestion.sql)}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-sm text-strong">{suggestion.label}</div>
              <div className="truncate text-muted-foreground text-xs">{suggestion.sub}</div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-action-primary text-xs opacity-0 transition-opacity group-hover:opacity-100">
              <Play size={13} /> Run
            </span>
          </button>
        ))}
      </CardRows>
    </Card>
  );
}

// ---- recent queries (localStorage) ------------------------------------------

function RecentQueries({ onRunQuery }: { onRunQuery: (sql: string) => void }) {
  const recent = useMemo(() => loadHistory().slice(0, MAX_RECENT), []);
  if (recent.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHead icon={FileText} title="Recent queries" />
      <CardRows>
        {recent.map((entry) => (
          <button
            className="flex w-full cursor-pointer items-center gap-2.5 border-border-subtle border-t px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-muted/50 dark:hover:bg-surface-default-hover"
            key={`${entry.at}-${entry.sql}`}
            onClick={() => onRunQuery(entry.sql)}
            type="button"
          >
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
            <span className="min-w-0 flex-1 truncate font-mono text-foreground text-xs">{entry.sql}</span>
            <span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
              {`${prettyMilliseconds(Date.now() - entry.at, { compact: true })} ago`}
            </span>
          </button>
        ))}
      </CardRows>
    </Card>
  );
}

// ---- docs -------------------------------------------------------------------

function DocsCard() {
  return (
    <Card>
      <CardHead icon={FileText} title="Learn more" />
      <CardRows>
        {DOC_LINKS.map((doc) => (
          <a
            className="group flex items-center gap-3 border-border-subtle border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-muted/50 dark:hover:bg-surface-default-hover"
            href={doc.href}
            key={doc.label}
            rel="noreferrer"
            target="_blank"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-action-primary/10 text-action-primary">
              <doc.icon size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold text-sm text-strong group-hover:text-action-primary">{doc.label}</span>
              <span className="text-muted-foreground text-xs">{doc.sub}</span>
            </span>
            <ArrowUpRight className="shrink-0 text-muted-foreground/70" size={13} />
          </a>
        ))}
      </CardRows>
    </Card>
  );
}

// ---- onboarding (empty catalog) ---------------------------------------------

function OnboardingSteps() {
  return (
    <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
      {ONBOARDING_STEPS.map((step, index) => (
        <RegistryCard className="relative gap-0 p-5 shadow-sm" key={step.title} size="full" variant="standard">
          <span className="absolute top-4 right-4 font-bold text-3xl text-border leading-none">{index + 1}</span>
          <div className="mb-3.5 grid size-10 place-items-center rounded-md bg-action-primary/10 text-action-primary">
            <step.icon size={18} />
          </div>
          <div className="mb-1.5 font-semibold text-sm text-strong">{step.title}</div>
          <div className="text-muted-foreground text-xs leading-relaxed">{step.desc}</div>
        </RegistryCard>
      ))}
    </div>
  );
}

// ---- load/error states ------------------------------------------------------

function LoadingSection() {
  return (
    <Card className="mt-7">
      <LoadingRow label="Loading catalogs…" />
    </Card>
  );
}

function ErrorSection({ onRetry }: { onRetry: () => void }) {
  return (
    <RegistryCard className="mt-7 gap-0 p-6 shadow-sm" size="full" variant="standard">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={18} />
        <div className="min-w-0 flex-1">
          <Text className="mb-1 font-semibold text-sm text-strong">Couldn't load the SQL catalog</Text>
          <Text className="text-muted-foreground text-sm leading-relaxed">
            The catalog or table listing failed. The SQL endpoint may be unreachable, or your session may have expired.
          </Text>
        </div>
        <Button onClick={onRetry} size="sm" variant="secondary">
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    </RegistryCard>
  );
}

// -----------------------------------------------------------------------------

export type SqlLandingProps = {
  catalogs: Catalog[];
  sqlRole: SqlRole;
  isLoading: boolean;
  /** Catalog/table listing failed — render the error state, not the empty state. */
  isError: boolean;
  hasTables: boolean;
  onOpenStudio: () => void;
  /** Switch to the studio and run the given SQL. */
  onRunQuery: (sql: string) => void;
  /** Open the add-topic wizard (admin only). */
  onAddTopic: () => void;
  /** Re-run the failed catalog/table requests. */
  onRetry: () => void;
};

export function SqlLanding({
  catalogs,
  sqlRole,
  isLoading,
  isError,
  hasTables,
  onOpenStudio,
  onRunQuery,
  onAddTopic,
  onRetry,
}: SqlLandingProps) {
  const isAdmin = sqlRole === 'admin';
  // Only assert "empty" once the catalog and table listings have actually
  // settled successfully — a load in flight or a failed request is not an
  // empty catalog.
  const isEmpty = !(isLoading || isError || hasTables);
  const showOnboarding = isEmpty;
  const tableCount = useMemo(
    () => catalogs.reduce((sum, catalog) => sum + flattenTables(catalog).length, 0),
    [catalogs]
  );

  const openStudioButton = (
    <Button onClick={onOpenStudio} size="md" variant={showOnboarding ? 'secondary' : 'primary'}>
      <Terminal size={15} /> Open studio
    </Button>
  );
  const addTopicButton = isAdmin ? (
    <Button onClick={onAddTopic} size="md" variant={showOnboarding ? 'primary' : 'secondary'}>
      <Plus size={15} /> Add a topic
    </Button>
  ) : null;

  let body: ReactNode;
  if (isLoading) {
    body = <LoadingSection />;
  } else if (isError) {
    body = <ErrorSection onRetry={onRetry} />;
  } else if (showOnboarding) {
    body = (
      <>
        <OnboardingSteps />
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_364px]">
          <div className="min-w-0">
            <RegistryCard
              className="gap-0 p-6 text-muted-foreground text-sm leading-relaxed shadow-sm"
              size="full"
              variant="standard"
            >
              <Text className="mb-2 font-semibold text-strong">No tables yet</Text>
              <Text className="text-muted-foreground text-sm leading-relaxed">
                {isAdmin ? (
                  <>
                    Add a Redpanda topic to create your first table — schema is inferred, and reads mesh the live tail
                    with Iceberg history. Use <InlineCode>Add a topic</InlineCode> above to get started.
                  </>
                ) : (
                  'Ask an admin to add a Redpanda topic as a table before you can query it with SQL.'
                )}
              </Text>
            </RegistryCard>
          </div>
          <div className="min-w-0">
            <DocsCard />
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <MetricStrip catalogCount={catalogs.length} role={sqlRole} tableCount={tableCount} />
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_364px]">
          <div className="flex min-w-0 flex-col gap-5">
            <TablesOverview catalogs={catalogs} onOpenStudio={onOpenStudio} onRunQuery={onRunQuery} />
            <DocsCard />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <SuggestedQueries catalogs={catalogs} onRunQuery={onRunQuery} />
            <RecentQueries onRunQuery={onRunQuery} />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      {/* hero */}
      <div className="border-border border-b bg-card">
        <div className="mx-auto w-full max-w-[1500px] px-12 pt-10 pb-9">
          <div className="max-w-[720px]">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-action-primary/10 px-2.5 py-1 font-semibold text-action-primary text-xs uppercase tracking-wider">
              <Database size={13} /> SQL
            </div>
            <Heading className="mb-3 font-semibold text-3xl text-strong leading-tight tracking-heading" level={1}>
              {showOnboarding ? 'Run SQL on your Redpanda topics' : 'Query your streaming data with SQL'}
            </Heading>
            {/* Text (renders a div), not <p>: an unlayered global reset zeroes margins
                on paragraph elements and beats Tailwind's layered mb-* utilities. */}
            <Text className="mb-6 text-base text-muted-foreground leading-relaxed">
              {showOnboarding
                ? 'Expose a topic as a table and query it instantly — Redpanda meshes the live tail with Iceberg history, so every read is fresh and complete. No pipeline to build.'
                : 'Read live topics and Iceberg tables together through one PostgreSQL-compatible endpoint. Bridge queries mesh the live tail with tiered history at query time.'}
            </Text>
            <div className="flex flex-wrap items-center gap-2.5">
              {showOnboarding ? (
                <>
                  {addTopicButton}
                  {openStudioButton}
                </>
              ) : (
                <>
                  {openStudioButton}
                  {addTopicButton}
                </>
              )}
            </div>
            {/* Only claim a live connection once the catalog listing has actually succeeded. */}
            {isLoading || isError ? null : (
              <div className="mt-5 flex items-center gap-2 text-muted-foreground text-sm">
                <span className="size-2 shrink-0 rounded-full bg-success" />
                Connected{' · '}PostgreSQL wire
              </div>
            )}
          </div>
        </div>
      </div>

      {/* body */}
      <div className="mx-auto w-full max-w-[1500px] px-12 pb-14">{body}</div>
    </div>
  );
}
