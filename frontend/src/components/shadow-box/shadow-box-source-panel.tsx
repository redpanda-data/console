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
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Dd, Dl, Dt } from 'components/redpanda-ui/components/typography';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import type { ShadowLinkReader } from 'federation/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeShadowBoxReadError, useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { BoxClusterDialog } from './box-cluster-dialog';
import {
  type BoxPhase,
  type BrokerProgress,
  canBoxFromPhase,
  formatBoxDuration,
  isBlockingPhase,
  isTransitionPhase,
  SHADOW_CLUSTER_CANT_BOX,
  unreachableBrokersSubject,
} from './shadow-box-model';
import { ShadowBoxSettingsDialog } from './shadow-box-settings-dialog';
import { ShadowBoxStateBadge } from './shadow-box-state-badge';
import { UnboxClusterDialog } from './unbox-cluster-dialog';
import { useNow } from './use-now';

const PHASE_DESCRIPTION: Record<BoxPhase, string> = {
  unboxed:
    'This cluster isn’t boxed. Box it just before you fail over a shadow link that reads from it, so the link can catch up with nothing new to copy.',
  boxing:
    'Brokers are applying the box. Those that have applied it reject writes, and the box is in force once every broker confirms.',
  boxed: 'Every broker enforces the box. Client writes and cluster changes are rejected until you unbox it.',
  unboxing: 'Brokers are releasing the box. Some may still reject writes until every broker confirms.',
};

/** A broker that doesn't answer keeps a transition from finishing; say so next to the phase. */
const unreachableNote = (brokers: BrokerProgress[], phase: BoxPhase): string => {
  const ids = brokers.filter((broker) => broker.status === 'unreachable').map((broker) => broker.nodeId);
  if (ids.length === 0 || !isTransitionPhase(phase)) {
    return '';
  }
  return ` ${unreachableBrokersSubject(ids)} responding, so this can’t finish until ${ids.length === 1 ? 'it’s' : 'they’re'} back.`;
};

const BROKER_STATUS: Record<
  BrokerProgress['status'],
  { label: string; variant: 'success' | 'informative' | 'destructive' }
> = {
  applied: { label: 'Applied', variant: 'success' },
  pending: { label: 'Waiting', variant: 'informative' },
  unreachable: { label: 'Not responding', variant: 'destructive' },
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clockFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Just the time for today, as in "Boxed since 14:02"; the date too for anything older. */
const formatSince = (date: Date, now: number) =>
  new Date(now).toDateString() === date.toDateString() ? clockFormatter.format(date) : timeFormatter.format(date);

const SINCE_LABEL: Record<BoxPhase, string> = {
  unboxed: 'Unboxed since',
  boxing: 'Boxing since',
  boxed: 'Boxed since',
  unboxing: 'Unboxing since',
};

const BrokerProgressTable = ({ brokers, phase }: { brokers: BrokerProgress[]; phase: BoxPhase }) => (
  <Table testId="shadow-box-broker-progress">
    <TableHeader>
      <TableRow>
        <TableHead>Broker</TableHead>
        <TableHead>{phase === 'unboxing' ? 'Box released' : 'Box applied'}</TableHead>
        <TableHead>Detail</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {brokers.map((broker) => {
        const status = BROKER_STATUS[broker.status];
        return (
          <TableRow key={broker.nodeId} testId={`shadow-box-broker-${broker.nodeId}`}>
            <TableCell className="tabular-nums">{broker.nodeId}</TableCell>
            <TableCell>
              <StatusBadge pulsing={broker.status === 'pending'} size="sm" variant={status.variant}>
                {status.label}
              </StatusBadge>
            </TableCell>
            <TableCell className="text-muted-foreground">{broker.errorMessage ?? '–'}</TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

const ReadPolicyValue = ({
  allowAllReads,
  exemptPrincipals,
  phase,
}: {
  allowAllReads: boolean;
  exemptPrincipals: string[];
  phase: BoxPhase;
}) => {
  if (allowAllReads) {
    return 'Not needed: every consumer can keep reading';
  }
  if (exemptPrincipals.length === 0) {
    return (
      <span className="text-warning">
        {isBlockingPhase(phase)
          ? 'No one is exempt, so every consumer is blocked'
          : 'No one is exempt, so a box would block every consumer'}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {exemptPrincipals.map((principal) => (
        <Badge className="font-mono" key={principal} tone="default" variant="outline">
          {principal || '(no SASL or mTLS)'}
        </Badge>
      ))}
    </span>
  );
};

const ReaderAccessBadge = ({
  reader,
  exemptPrincipals,
  allowAllReads,
}: {
  reader: ShadowLinkReader;
  exemptPrincipals: string[];
  allowAllReads: boolean;
}) => {
  if (allowAllReads || (reader.principal && exemptPrincipals.includes(reader.principal))) {
    return (
      <Badge tone="success" variant="subtle">
        Exempt
      </Badge>
    );
  }
  if (!reader.principal) {
    return (
      <Badge tone="default" variant="subtle">
        Unknown user
      </Badge>
    );
  }
  return (
    <Badge tone="warning" variant="subtle">
      Not exempt
    </Badge>
  );
};

const ReadersCard = ({
  readers,
  resolving,
  incomplete,
  exemptPrincipals,
  allowAllReads,
}: {
  readers: ShadowLinkReader[] | undefined;
  /** The host is still finding links, so an empty list doesn't mean none read from this cluster yet. */
  resolving: boolean;
  /** The host couldn't check every link, so the list may be missing some. */
  incomplete: boolean;
  exemptPrincipals: string[];
  allowAllReads: boolean;
}) => {
  const openCluster = useShadowBoxStore((state) => state.openCluster);
  const settledEmpty = readers?.length === 0 && !resolving && !incomplete;

  return (
    <Card size="full" testId="shadow-box-readers" variant="standard">
      <CardContent className="flex flex-col gap-3">
        <h3 className="text-heading-xs">Links reading from this cluster</h3>
        {readers === undefined ? (
          <p className="text-body-sm text-muted-foreground">
            Redpanda doesn’t record which shadow links read from a cluster, so Console can’t list them. Check the Shadow
            Links page on each shadow cluster, and make sure each link’s user is exempt before you box.
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
                Redpanda Cloud couldn’t check every shadow link, so this list may be missing some. Make sure each link’s
                user is exempt before you box.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        {settledEmpty ? (
          <Empty className="py-6">
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Link</TableHead>
                  <TableHead>Shadow cluster</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Exempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readers.map((reader) => (
                  <TableRow
                    key={`${reader.shadowClusterId}-${reader.linkName}`}
                    testId={`shadow-box-reader-${reader.linkName}`}
                  >
                    <TableCell weight="medium">
                      {openCluster ? (
                        <Button
                          className="h-auto p-0"
                          onClick={() =>
                            openCluster(
                              reader.shadowClusterId,
                              `/shadowlinks/${encodeURIComponent(reader.linkName)}?tab=cutover`
                            )
                          }
                          variant="link"
                        >
                          {reader.linkName}
                        </Button>
                      ) : (
                        reader.linkName
                      )}
                    </TableCell>
                    <TableCell>{reader.shadowClusterName}</TableCell>
                    <TableCell className="font-mono">{reader.principal ?? '–'}</TableCell>
                    <TableCell>
                      <ReaderAccessBadge
                        allowAllReads={allowAllReads}
                        exemptPrincipals={exemptPrincipals}
                        reader={reader}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-body-sm text-muted-foreground">
              Only links created in Redpanda Cloud with this cluster as the source appear here.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

type UrlAction = 'box' | 'unbox' | 'exempt';
type DialogSetters = Record<UrlAction, (open: boolean) => void>;

/** Box only from a phase Box accepts, Unbox only from one it doesn't; settings open in any phase. */
const actionFits = (action: UrlAction, phase: BoxPhase) => {
  if (action === 'exempt') {
    return true;
  }
  return action === 'box' ? canBoxFromPhase(phase) : !canBoxFromPhase(phase);
};

/**
 * Opens the dialog `?action=box`, `unbox` or `exempt` asks for, once the box is known, so another
 * page (such as a shadow cluster's Cutover tab) can link straight to it. The action stays in the URL
 * until that dialog closes: embedded, Console can remount on arrival while the host settles its
 * route, and the dialog then reopens instead of vanishing. Returns a wrapper for a dialog's
 * `onOpenChange` that clears the action as the dialog closes.
 */
const useActionFromUrl = (known: boolean, phase: BoxPhase, setters: DialogSetters) => {
  const action = (useLocation().search as { action?: unknown }).action;
  const navigate = useNavigate();
  const handled = useRef(false);
  const pending = action === 'box' || action === 'unbox' || action === 'exempt';
  const clear = useCallback(() => {
    if (pending) {
      navigate({ to: '/shadowlinks', search: { tab: 'source' }, replace: true });
    }
  }, [pending, navigate]);
  useEffect(() => {
    if (!(known && pending) || handled.current) {
      return;
    }
    handled.current = true;
    if (actionFits(action, phase)) {
      setters[action](true);
    } else {
      clear();
    }
  }, [known, pending, action, phase, setters, clear]);
  return useCallback(
    (setOpen: (open: boolean) => void) => (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        clear();
      }
    },
    [clear]
  );
};

const BoxActions = ({
  phase,
  hasOwnLinks,
  onEditSettings,
  onBox,
  onUnbox,
}: {
  phase: BoxPhase;
  /** A cluster with shadow links of its own is a shadow, which can't be boxed. */
  hasOwnLinks: boolean;
  onEditSettings: () => void;
  onBox: () => void;
  onUnbox: () => void;
}) => (
  <div className="flex flex-wrap gap-2">
    <Button onClick={onEditSettings} size="sm" testId="edit-shadow-box-settings" variant="outline">
      Edit settings
    </Button>
    {canBoxFromPhase(phase) ? (
      <DisabledReasonTooltip reason={hasOwnLinks ? SHADOW_CLUSTER_CANT_BOX : undefined}>
        <Button disabled={hasOwnLinks} onClick={onBox} size="sm" testId="open-box-cluster" variant="destructive">
          Box cluster
        </Button>
      </DisabledReasonTooltip>
    ) : (
      <Button onClick={onUnbox} size="sm" testId="open-unbox-cluster">
        Unbox cluster
      </Button>
    )}
  </div>
);

/** The Shadow Links page's view of this cluster as a link source: its box, and who reads from it. */
export const ShadowBoxSourcePanel = () => {
  const { summary, brokers, data, isLoading, error, refetch, isRefetching, dataUpdatedAt, known } =
    useShadowBoxStatusQuery();
  const topology = useShadowBoxStore((state) => state.topology);
  const ownLinks = useListShadowLinksQuery({}).data?.shadowLinks ?? [];
  const now = useNow();
  const [boxOpen, setBoxOpen] = useState(false);
  const [unboxOpen, setUnboxOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const setters = useMemo<DialogSetters>(() => ({ box: setBoxOpen, unbox: setUnboxOpen, exempt: setSettingsOpen }), []);
  const { principal } = useLocation().search as { principal?: string };
  const closingClears = useActionFromUrl(known, summary.phase, setters);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" data-testid="shadow-box-source-loading">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert testId="shadow-box-status-error" variant="destructive">
        <AlertTitle>Couldn’t load the shadow box</AlertTitle>
        <AlertDescription>
          <p>{describeShadowBoxReadError(error)}</p>
        </AlertDescription>
        <div className="col-start-2 mt-2">
          <Button isLoading={isRefetching} onClick={() => refetch()} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  const { phase } = summary;
  const showBrokers = isTransitionPhase(phase) || brokers.some((broker) => broker.status === 'unreachable');
  const changedAt = summary.stateChangedAt;

  return (
    <div className="flex flex-col gap-4" data-testid="shadow-box-source-panel">
      {error ? (
        <Alert testId="shadow-box-status-stale" variant="warning">
          <AlertTitle>Couldn’t refresh the shadow box</AlertTitle>
          <AlertDescription>
            <p>{describeShadowBoxReadError(error)}</p>
            <p>Showing its status from {formatBoxDuration(now - dataUpdatedAt)} ago. Console keeps trying.</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card size="full" testId="shadow-box-status-card" variant="standard">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-heading-xs">Shadow box</h3>
                <ShadowBoxStateBadge phase={phase} />
              </div>
              {changedAt ? (
                <p className="text-body-sm text-muted-foreground" data-testid="shadow-box-since">
                  {SINCE_LABEL[phase]} {formatSince(changedAt, now)}, {formatBoxDuration(now - changedAt.getTime())} ago
                  · revision {summary.revision.toString()}
                </p>
              ) : null}
            </div>
            <BoxActions
              hasOwnLinks={ownLinks.length > 0}
              onBox={() => setBoxOpen(true)}
              onEditSettings={() => setSettingsOpen(true)}
              onUnbox={() => setUnboxOpen(true)}
              phase={phase}
            />
          </div>
          <p className="text-body">
            {PHASE_DESCRIPTION[phase]}
            {unreachableNote(brokers, phase)}
          </p>

          <Dl className="my-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body-sm">
            <Dt className="font-normal text-muted-foreground">Scope</Dt>
            <Dd>Entire cluster</Dd>
            <Dt className="font-normal text-muted-foreground">Exempt principals</Dt>
            <Dd data-testid="shadow-box-read-policy">
              <ReadPolicyValue
                allowAllReads={summary.allowAllReads}
                exemptPrincipals={summary.exemptPrincipals}
                phase={phase}
              />
            </Dd>
            <Dt className="font-normal text-muted-foreground">Open transactions</Dt>
            <Dd>
              {summary.skipTransactionExpiration
                ? 'Left to time out on their own'
                : 'Aborted when each broker applies the box'}
            </Dd>
          </Dl>

          {showBrokers ? <BrokerProgressTable brokers={brokers} phase={phase} /> : null}
        </CardContent>
      </Card>

      <ReadersCard
        allowAllReads={summary.allowAllReads}
        exemptPrincipals={summary.exemptPrincipals}
        incomplete={topology?.readersIncomplete ?? false}
        readers={topology ? topology.readers : undefined}
        resolving={topology?.resolving ?? false}
      />

      <BoxClusterDialog onOpenChange={closingClears(setBoxOpen)} open={boxOpen} />
      <UnboxClusterDialog
        clusterName={topology?.clusterName}
        onOpenChange={closingClears(setUnboxOpen)}
        open={unboxOpen}
      />
      <ShadowBoxSettingsDialog
        addPrincipal={principal}
        onOpenChange={closingClears(setSettingsOpen)}
        open={settingsOpen}
      />
    </div>
  );
};
