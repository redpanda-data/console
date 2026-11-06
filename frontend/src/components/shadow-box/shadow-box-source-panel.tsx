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

import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button, buttonVariants } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { Table, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import type { ShadowLinkReader } from 'federation/types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type BrokerOwnCopy, describeShadowBoxReadError, useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { BoxClusterDialog } from './box-cluster-dialog';
import {
  BOX_PHASE_LABEL,
  type BoxPhase,
  type BoxSummary,
  type BrokerProgress,
  type ClientEffect,
  canBoxFromPhase,
  describeBoxPhase,
  describeHeldMove,
  formatBoxDuration,
  getClientEffects,
  getReadPolicyWarnings,
  linkCanRead,
  linksThatStopBox,
  SHADOW_CLUSTER_CANT_BOX,
} from './shadow-box-model';
import { ShadowBoxSettingsDialog } from './shadow-box-settings-dialog';
import { WARNING_VARIANT } from './shadow-box-settings-fields';
import { CanReadBadge, ShadowBoxStateBadge, useNow } from './shadow-box-ui';
import { UnboxClusterDialog } from './unbox-cluster-dialog';

const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clockFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Just the time for today, as in "Since 14:02"; the date too for anything older. */
const formatSince = (date: Date, now: number) =>
  new Date(now).toDateString() === date.toDateString() ? clockFormatter.format(date) : timeFormatter.format(date);

const BROKER_STATUS: Record<
  BrokerProgress['status'],
  { label: string; variant: 'success' | 'informative' | 'destructive' }
> = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  behind: { label: 'Behind', variant: 'informative' },
  'not-answering': { label: 'Not answering', variant: 'destructive' },
};

const BrokerCopy = ({ broker }: { broker: BrokerProgress }) => {
  if (!broker.copy) {
    return <span className="font-mono text-body-sm text-muted-foreground">{broker.errorMessage || 'No answer'}</span>;
  }
  const phase = broker.copy.phase ? BOX_PHASE_LABEL[broker.copy.phase] : 'Unknown state';
  return (
    <span className="text-body-sm">
      {phase} <span className="text-muted-foreground">· revision {broker.copy.revision.toString()}</span>
    </span>
  );
};

/** Each broker's own copy, as GetClusterFenceStatus lists it: a move waits until every copy matches. */
const BrokersTable = ({ brokers }: { brokers: BrokerProgress[] }) => (
  <div className="flex flex-col gap-2">
    <h4 className="text-label">Brokers</h4>
    <Table testId="shadow-box-brokers">
      <TableHeader>
        <TableRow>
          <TableHead>Broker</TableHead>
          <TableHead>Its copy</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      {/* Plain rows: nothing here is clickable, so the registry body's hover would mislead. */}
      <tbody className="[&_tr:last-child]:border-0">
        {brokers.map((broker) => {
          const status = BROKER_STATUS[broker.status];
          return (
            <TableRow key={broker.nodeId} testId={`shadow-box-broker-${broker.nodeId}`}>
              <TableCell className="tabular-nums">{broker.nodeId}</TableCell>
              <TableCell>
                <BrokerCopy broker={broker} />
              </TableCell>
              <TableCell>
                <StatusBadge pulsing={broker.status === 'behind'} size="sm" variant={status.variant}>
                  {status.label}
                </StatusBadge>
              </TableCell>
            </TableRow>
          );
        })}
      </tbody>
    </Table>
  </div>
);

const VERDICT_BAR: Record<ClientEffect['verdict'], string> = {
  allowed: 'border-l-success',
  rejected: 'border-l-destructive',
  partly: 'border-l-warning',
  ended: 'border-l-surface-strong',
  open: 'border-l-surface-strong',
  unknown: 'border-l-surface-strong',
};

const ClientEffects = ({ effects }: { effects: ClientEffect[] }) => (
  <ul aria-label="What clients see now" className="flex flex-col gap-2" data-testid="shadow-box-client-effects">
    {effects.map((effect) => (
      <li
        className={cn('border-l-4 py-0.5 pl-3', VERDICT_BAR[effect.verdict])}
        data-testid={`shadow-box-effect-${effect.id}`}
        data-verdict={effect.verdict}
        key={effect.id}
      >
        <div className="text-body-sm font-medium">{effect.label}</div>
        <div className="text-body-sm text-muted-foreground">{effect.detail}</div>
      </li>
    ))}
  </ul>
);

const ExemptValue = ({ summary }: { summary: BoxSummary }) => {
  if (summary.allowAllReads) {
    return 'Not needed: Allow all reads is on';
  }
  if (summary.exemptPrincipals.length === 0) {
    return <span className="text-destructive">No one</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {summary.exemptPrincipals.map((principal) => (
        <Badge key={principal} tone="default" variant="outline">
          <span className="font-mono">{principal || '(no SASL or mTLS)'}</span>
        </Badge>
      ))}
    </span>
  );
};

const SettingsCard = ({ summary, onEdit }: { summary: BoxSummary; onEdit: () => void }) => {
  const warnings = getReadPolicyWarnings(summary.exemptPrincipals, summary.allowAllReads);
  return (
    <Card size="full" testId="shadow-box-settings-card" variant="standard">
      <CardContent>
        <div className="flex flex-col gap-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-heading-xs">Settings</h3>
            <Button onClick={onEdit} size="sm" testId="edit-shadow-box-settings" variant="outline">
              Edit settings
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body-sm">
              <dt className="tracking-tight text-muted-foreground">Exempt users</dt>
              <dd data-testid="shadow-box-read-policy">
                <ExemptValue summary={summary} />
              </dd>
            </dl>
            <div className="flex flex-col gap-7">
              {warnings.map((warning) => (
                <Alert
                  key={warning.id}
                  testId={`shadow-box-policy-${warning.id}`}
                  variant={WARNING_VARIANT[warning.severity]}
                >
                  <AlertDescription>
                    <p>{warning.message}</p>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const readerUser = (reader: ShadowLinkReader) => {
  if (reader.authentication === 'mtls') {
    return <span className="text-muted-foreground">mTLS certificate</span>;
  }
  if (reader.authentication === 'none') {
    return <span className="text-muted-foreground">No SASL or mTLS</span>;
  }
  return reader.principal ? <span className="font-mono">{reader.principal}</span> : '–';
};

const ReadersCard = ({
  readers,
  resolving,
  incomplete,
  summary,
}: {
  readers: ShadowLinkReader[] | undefined;
  /** The host is still finding links, so an empty list doesn't mean none read from this cluster yet. */
  resolving: boolean;
  /** The host couldn't check every link, so the list may be missing some. */
  incomplete: boolean;
  summary: BoxSummary;
}) => {
  const openCluster = useShadowBoxStore((state) => state.openCluster);
  const settledEmpty = readers?.length === 0 && !resolving && !incomplete;

  return (
    <Card size="full" testId="shadow-box-readers" variant="standard">
      <CardContent>
        <div className="flex flex-col gap-7">
          <h3 className="text-heading-xs">Links reading from this cluster</h3>
          {readers === undefined ? (
            <p className="text-body-sm text-muted-foreground">
              Redpanda doesn’t record which shadow links read from a cluster, so Console can’t list them. Check the
              Shadow Links page on each shadow cluster, and make sure each link’s user is exempt before you fence.
            </p>
          ) : null}
          {readers?.length === 0 && resolving ? (
            <p
              className="flex items-center gap-2 text-body-sm text-muted-foreground"
              data-testid="shadow-box-readers-loading"
            >
              <Spinner className="size-4" />
              Finding the shadow links that read from this cluster…
            </p>
          ) : null}
          {readers && incomplete ? (
            <Alert testId="shadow-box-readers-incomplete" variant="warning">
              <AlertDescription>
                <p>
                  Redpanda Cloud couldn’t check every shadow link, so this list may be missing some. Make sure each
                  link’s user is exempt before you fence.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          {settledEmpty ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No links read from this cluster</EmptyTitle>
                <EmptyDescription>
                  No shadow link in Redpanda Cloud uses this cluster as its source. Links to it from outside Cloud don’t
                  appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {readers && readers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Link</TableHead>
                  <TableHead>Shadow cluster</TableHead>
                  <TableHead>Reads as</TableHead>
                  <TableHead>Under these settings</TableHead>
                </TableRow>
              </TableHeader>
              <tbody className="[&_tr:last-child]:border-0">
                {readers.map((reader) => (
                  <TableRow
                    key={`${reader.shadowClusterId}-${reader.linkName}`}
                    testId={`shadow-box-reader-${reader.linkName}`}
                  >
                    <TableCell weight="medium">
                      {openCluster ? (
                        <button
                          className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0')}
                          onClick={() =>
                            openCluster(
                              reader.shadowClusterId,
                              `/shadowlinks/${encodeURIComponent(reader.linkName)}?tab=failover`
                            )
                          }
                          type="button"
                        >
                          {reader.linkName}
                        </button>
                      ) : (
                        reader.linkName
                      )}
                    </TableCell>
                    <TableCell>{reader.shadowClusterName}</TableCell>
                    <TableCell>{readerUser(reader)}</TableCell>
                    <TableCell>
                      <CanReadBadge canRead={linkCanRead(summary, reader)} no="Blocked" yes="Can read" />
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

const BoxActions = ({
  phase,
  stopsBox,
  onBox,
  onUnbox,
}: {
  phase: BoxPhase;
  /** Names of this cluster's own shadow links that haven't failed over: while any remain, it's a shadow and Box fails. */
  stopsBox: string[];
  onBox: () => void;
  onUnbox: () => void;
}) =>
  canBoxFromPhase(phase) ? (
    <DisabledReasonTooltip
      reason={stopsBox.length > 0 ? `${SHADOW_CLUSTER_CANT_BOX} Its links: ${stopsBox.join(', ')}.` : undefined}
    >
      <Button disabled={stopsBox.length > 0} onClick={onBox} size="sm" testId="open-box-cluster" variant="destructive">
        Fence cluster
      </Button>
    </DisabledReasonTooltip>
  ) : (
    <Button onClick={onUnbox} size="sm" testId="open-unbox-cluster">
      Unfence cluster
    </Button>
  );

/** Each broker's own copy, read one by one while there's no controller leader to give the whole status. */
const OwnCopies = ({ copies }: { copies: BrokerOwnCopy[] }) =>
  copies.length > 0 ? (
    <div className="text-body-sm">
      Each broker’s own copy, read from that broker:
      <ul className="mt-1 flex flex-col gap-0.5" data-testid="shadow-box-own-copies">
        {copies.map((copy, index) => (
          <li key={copy.nodeId ?? `self-${index}`}>
            {copy.nodeId === undefined ? 'The broker that answered' : `Broker ${copy.nodeId}`}:{' '}
            {copy.phase
              ? `${BOX_PHASE_LABEL[copy.phase]}, revision ${copy.revision?.toString()}`
              : copy.errorMessage || 'no answer'}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

const ReadProblem = ({
  error,
  ownCopies,
  isRefetching,
  onRetry,
}: {
  error: unknown;
  ownCopies: BrokerOwnCopy[];
  isRefetching: boolean;
  onRetry: () => void;
}) => (
  <Alert testId="shadow-box-status-error" variant="destructive">
    <AlertTitle>Couldn’t read the fence</AlertTitle>
    <AlertDescription>
      <p>{describeShadowBoxReadError(error)}</p>
      <OwnCopies copies={ownCopies} />
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <Button isLoading={isRefetching} onClick={onRetry} size="sm" variant="outline">
        Try again
      </Button>
    </div>
  </Alert>
);

type StatusQuery = ReturnType<typeof useShadowBoxStatusQuery>;

/** Shown above the box when a refresh failed, so the status below reads as possibly out of date. */
const StaleStatusAlert = ({
  error,
  now,
  dataUpdatedAt,
  ownCopies,
}: Pick<StatusQuery, 'error' | 'dataUpdatedAt' | 'ownCopies'> & { now: number }) => (
  <Alert testId="shadow-box-status-stale" variant="warning">
    <AlertTitle>Couldn’t refresh the fence</AlertTitle>
    <AlertDescription>
      <p>{describeShadowBoxReadError(error)}</p>
      <p>Showing its status from {formatBoxDuration(now - dataUpdatedAt)} ago.</p>
      <OwnCopies copies={ownCopies} />
    </AlertDescription>
  </Alert>
);

const BoxStatusCard = ({
  summary,
  brokers,
  readers,
  now,
  actions,
}: {
  summary: BoxSummary;
  brokers: BrokerProgress[];
  readers: ShadowLinkReader[] | undefined;
  now: number;
  actions: ReactNode;
}) => {
  const { phase } = summary;
  const changedAt = summary.stateChangedAt;
  const held = describeHeldMove(summary, brokers, now);
  return (
    <Card size="full" testId="shadow-box-status-card" variant="standard">
      <CardContent>
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-heading-xs">Cluster fence</h3>
                <ShadowBoxStateBadge phase={phase} />
              </div>
              <p className="text-body-sm text-muted-foreground" data-testid="shadow-box-since">
                {changedAt
                  ? `Since ${formatSince(changedAt, now)}, ${formatBoxDuration(now - changedAt.getTime())} ago · `
                  : ''}
                {summary.revision === -1n ? 'No changes yet' : `revision ${summary.revision.toString()}`}
              </p>
            </div>
            {actions}
          </div>
          <p className="text-body" data-testid="shadow-box-headline">
            {describeBoxPhase(summary, brokers)}
            {held ? ` ${held}` : ''}
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-label">What clients see now</h4>
              <ClientEffects effects={getClientEffects({ summary, brokers, links: readers })} />
            </div>
            {brokers.length > 0 ? <BrokersTable brokers={brokers} /> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

type SourceDialog = 'box' | 'unbox' | 'settings';

const DIALOG_FOR_ACTION = { exempt: 'settings', fence: 'box', unfence: 'unbox' } as const;

const URL_ACTIONS = Object.keys(DIALOG_FOR_ACTION) as (keyof typeof DIALOG_FOR_ACTION)[];

/**
 * `?action=` opens a dialog for links from elsewhere: `exempt` the settings with `principal` already
 * added (from a shadow cluster's Failover tab), `fence` the Fence dialog, and `unfence` the Unfence
 * dialog unless the cluster is already unfenced. The params stay in the URL until the dialog
 * closes: embedded, Console can remount while the host settles its route, and the dialog then
 * reopens instead of vanishing. Returns the principal and an `onOpenChange` for each dialog.
 */
const useDialogFromUrl = (phase: BoxPhase, setDialog: (dialog: SourceDialog | null) => void) => {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = (location.search as { action?: unknown }).action;
  const action = URL_ACTIONS.find((candidate) => candidate === requested);
  const handled = useRef(false);
  useEffect(() => {
    if (!action || handled.current) {
      return;
    }
    handled.current = true;
    if (!(action === 'unfence' && phase === 'unboxed')) {
      setDialog(DIALOG_FOR_ACTION[action]);
    }
  }, [action, phase, setDialog]);
  return {
    // The raw query string: the parsed search turns a name like `1001` into a number.
    principal:
      action === 'exempt' ? (new URLSearchParams(location.searchStr).get('principal') ?? undefined) : undefined,
    onOpenChange: (dialog: SourceDialog) => (open: boolean) => {
      setDialog(open ? dialog : null);
      if (!open && action) {
        navigate({ to: '/shadowlinks', search: { tab: 'source' }, replace: true }).catch((error: unknown) => {
          toast.error('Failed to navigate', { description: String(error) });
        });
      }
    },
  };
};

const SourcePanelBody = ({ status }: { status: StatusQuery }) => {
  const { summary, brokers, error, dataUpdatedAt, ownCopies } = status;
  const topology = useShadowBoxStore((state) => state.topology);
  const ownLinks = useListShadowLinksQuery({}).data?.shadowLinks ?? [];
  const now = useNow();
  const [dialog, setDialog] = useState<SourceDialog | null>(null);
  const fromUrl = useDialogFromUrl(summary.phase, setDialog);
  const readers = topology ? topology.readers : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="shadow-box-source-panel">
      {error ? <StaleStatusAlert dataUpdatedAt={dataUpdatedAt} error={error} now={now} ownCopies={ownCopies} /> : null}
      <BoxStatusCard
        actions={
          <BoxActions
            onBox={() => setDialog('box')}
            onUnbox={() => setDialog('unbox')}
            phase={summary.phase}
            stopsBox={linksThatStopBox(ownLinks).map((link) => link.name)}
          />
        }
        brokers={brokers}
        now={now}
        readers={readers}
        summary={summary}
      />

      <SettingsCard onEdit={() => setDialog('settings')} summary={summary} />

      <ReadersCard
        incomplete={topology?.readersIncomplete ?? false}
        readers={readers}
        resolving={topology?.resolving ?? false}
        summary={summary}
      />

      <BoxClusterDialog onOpenChange={fromUrl.onOpenChange('box')} open={dialog === 'box'} />
      <UnboxClusterDialog
        clusterName={topology?.clusterName}
        onOpenChange={fromUrl.onOpenChange('unbox')}
        open={dialog === 'unbox'}
      />
      <ShadowBoxSettingsDialog
        addPrincipal={fromUrl.principal}
        onOpenChange={fromUrl.onOpenChange('settings')}
        open={dialog === 'settings'}
      />
    </div>
  );
};

/** The Shadow Links page's view of this cluster as a link source: its box, and who reads from it. */
export const ShadowBoxSourcePanel = () => {
  const status = useShadowBoxStatusQuery();

  if (status.isLoading) {
    return (
      <div className="flex flex-col gap-4" data-testid="shadow-box-source-loading">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status.access === 'forbidden') {
    return (
      <Alert testId="shadow-box-forbidden" variant="informative">
        <AlertTitle>You can’t view this cluster’s fence</AlertTitle>
        <AlertDescription>
          <p>
            You don’t have permission to view this cluster’s fence, so Console can’t show whether it’s fenced. While it
            is, writes and most changes a shadow link copies are rejected.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.unreadable) {
    return (
      <Alert testId="shadow-box-unreadable" variant="warning">
        <AlertTitle>Console can’t tell what state this fence is in</AlertTitle>
        <AlertDescription>
          <p>The cluster reported a fence this version of Console doesn’t understand, so it won’t guess.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.error && !status.data) {
    return (
      <ReadProblem
        error={status.error}
        isRefetching={status.isRefetching}
        onRetry={() => status.refetch()}
        ownCopies={status.ownCopies}
      />
    );
  }

  return <SourcePanelBody status={status} />;
};
