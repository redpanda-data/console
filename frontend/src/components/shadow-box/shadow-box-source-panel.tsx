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
import { cn } from 'components/redpanda-ui/lib/utils';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import type { ShadowLinkReader } from 'federation/types';
import { CheckIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type BrokerOwnCopy, describeShadowBoxReadError, useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { BoxClusterDialog } from './box-cluster-dialog';
import { ShadowBoxClientEffects } from './shadow-box-client-effects';
import {
  BOX_PHASE_LABEL,
  type BoxPhase,
  type BoxSummary,
  type BrokerProgress,
  canBoxFromPhase,
  describeBoxPhase,
  describeHeldMove,
  formatBoxDuration,
  getClientEffects,
  getReadPolicyWarnings,
  isBlockingPhase,
  isLongBox,
  linkCanRead,
  linksThatStopBox,
  MTLS_LINK_NOTE,
  SHADOW_CLUSTER_CANT_BOX,
  SUPERUSERS_NOT_EXEMPT,
} from './shadow-box-model';
import { ShadowBoxSettingsDialog } from './shadow-box-settings-dialog';
import { ShadowBoxStateBadge } from './shadow-box-state-badge';
import { ShadowBoxStateStepper } from './shadow-box-state-stepper';
import { UnboxClusterDialog } from './unbox-cluster-dialog';
import { useNow } from './use-now';

const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clockFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Just the time for today, as in "Boxed since 14:02"; the date too for anything older. */
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

/** Each broker's own copy, as GetShadowBoxStatus lists it: a move waits until every copy matches. */
const BrokersTable = ({ brokers, phase }: { brokers: BrokerProgress[]; phase: BoxPhase }) => (
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
      <TableBody className="[&_tr:hover]:bg-transparent">
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
      </TableBody>
    </Table>
    <p className="text-body-sm text-muted-foreground">
      {phase === 'boxing' || phase === 'unboxing'
        ? `A broker holds the cluster in ${BOX_PHASE_LABEL[phase].toLowerCase()} while its copy is missing or doesn’t match the cluster’s box.`
        : 'Each broker’s copy of the box, as it last answered.'}
    </p>
  </div>
);

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

type SourceStepState = 'done' | 'current' | 'pending' | 'attention';

const STEP_MARKER: Record<SourceStepState, string> = {
  done: 'border-success bg-success text-success-foreground',
  current: 'border-primary text-primary',
  attention: 'border-warning text-warning',
  pending: 'border-border text-muted-foreground',
};

const SourceStep = ({
  index,
  state,
  title,
  children,
  testId,
}: {
  index: number;
  state: SourceStepState;
  title: string;
  children: ReactNode;
  testId: string;
}) => (
  <li className="grid grid-cols-[1.5rem_1fr] gap-3" data-state={state} data-testid={testId}>
    <span
      aria-hidden="true"
      className={cn(
        'flex size-6 items-center justify-center rounded-full border-2 text-caption tabular-nums',
        STEP_MARKER[state]
      )}
    >
      {state === 'done' ? <CheckIcon className="size-3.5" /> : String(index)}
    </span>
    <div className="flex min-w-0 flex-col gap-1">
      <h4 className="text-label">
        <span className="sr-only">{`Step ${index}${state === 'done' ? ', complete' : ''}: `}</span>
        {title}
      </h4>
      <div className="text-body-sm text-muted-foreground">{children}</div>
    </div>
  </li>
);

const boxStepState = (requested: boolean, settingsDone: boolean): SourceStepState => {
  if (requested) {
    return 'done';
  }
  return settingsDone ? 'current' : 'pending';
};

/** How many of the links Cloud knows can read from this cluster under the saved settings. */
const readerAccess = (readers: ShadowLinkReader[] | undefined, summary: BoxSummary) => {
  const results = (readers ?? []).map((reader) => ({ reader, canRead: linkCanRead(summary, reader) }));
  return {
    blocked: results.filter(({ canRead }) => canRead === false).map(({ reader }) => reader),
    unknown: results.filter(({ canRead }) => canRead === undefined).map(({ reader }) => reader),
    total: results.length,
  };
};

const exemptStepText = (access: ReturnType<typeof readerAccess>, summary: BoxSummary) => {
  if (summary.allowAllReads) {
    return 'Allow all reads is on, so every shadow link can keep reading.';
  }
  if (access.blocked.length > 0) {
    const names = access.blocked.map((reader) => reader.linkName).join(', ');
    return `The saved settings block ${names}, so ${access.blocked.length === 1 ? 'it' : 'they'} couldn’t finish copying once boxed. Add ${access.blocked.length === 1 ? 'its user' : 'their users'} to the exempt list.`;
  }
  if (summary.exemptPrincipals.length === 0) {
    return 'No one is exempt yet. By default a box blocks every consumer, every shadow link’s user included.';
  }
  if (access.unknown.length > 0) {
    return `Console can’t check ${access.unknown.map((reader) => reader.linkName).join(', ')}: ${MTLS_LINK_NOTE}`;
  }
  return access.total > 0
    ? 'Every shadow link Redpanda Cloud knows can keep reading.'
    : 'Exempt each shadow link’s user before you box.';
};

/**
 * The source cluster's half of a failover, as the reference lays it out: save the settings, box,
 * and wait until it reports Boxed. Then each link fails over on its own shadow cluster.
 */
const SourceStepsCard = ({
  summary,
  readers,
  brokers,
}: {
  summary: BoxSummary;
  readers: ShadowLinkReader[] | undefined;
  brokers: BrokerProgress[];
}) => {
  const access = readerAccess(readers, summary);
  const exemptDone = summary.allowAllReads || (access.blocked.length === 0 && summary.exemptPrincipals.length > 0);
  const boxed = summary.phase === 'boxed';
  const boxRequested = isBlockingPhase(summary.phase);
  const confirmed = brokers.filter((broker) => broker.status === 'confirmed').length;
  let exemptState: SourceStepState = exemptDone ? 'done' : 'attention';
  if (!(exemptDone || boxRequested) && summary.exemptPrincipals.length === 0 && access.total === 0) {
    exemptState = 'current';
  }
  let waitText = 'Box first. Then wait here until every broker confirms; a healthy cluster takes a second or two.';
  if (boxed) {
    waitText = 'Every broker confirmed, so nothing new is written here. Fail each link over on its shadow cluster.';
  } else if (summary.phase === 'boxing') {
    waitText = `${confirmed} of ${brokers.length} brokers have confirmed.`;
  }
  return (
    <Card size="full" testId="shadow-box-source-steps" variant="standard">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-heading-xs">Before a shadow link fails over</h3>
          <p className="text-body-sm text-muted-foreground">
            These steps run here, on the source cluster. Zero lag, the failover and moving clients happen on each shadow
            cluster.
          </p>
        </div>
        <ol className="flex flex-col gap-4">
          <SourceStep index={1} state={exemptState} testId="shadow-box-step-settings" title="Save settings">
            {exemptStepText(access, summary)}
          </SourceStep>
          <SourceStep index={2} state={boxStepState(boxRequested, exemptDone)} testId="shadow-box-step-box" title="Box">
            {boxRequested
              ? 'Box was called. Each broker rejects writes as soon as it picks it up.'
              : 'Box puts the saved settings in force. It returns at Boxing.'}
          </SourceStep>
          <SourceStep
            index={3}
            state={boxed ? 'done' : boxRequested ? 'current' : 'pending'}
            testId="shadow-box-step-wait"
            title="Wait for Boxed"
          >
            {waitText}
          </SourceStep>
        </ol>
      </CardContent>
    </Card>
  );
};

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
        <Badge className="font-mono" key={principal} tone="default" variant="outline">
          {principal || '(no SASL or mTLS)'}
        </Badge>
      ))}
    </span>
  );
};

const SettingsCard = ({ summary, onEdit }: { summary: BoxSummary; onEdit: () => void }) => {
  const warnings = getReadPolicyWarnings(summary.exemptPrincipals, summary.allowAllReads);
  return (
    <Card size="full" testId="shadow-box-settings-card" variant="standard">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-heading-xs">Settings</h3>
          <Button onClick={onEdit} size="sm" testId="edit-shadow-box-settings" variant="outline">
            Edit settings
          </Button>
        </div>
        <Dl className="my-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body-sm">
          <Dt className="font-normal text-muted-foreground">Scope</Dt>
          <Dd>All resources, the only scope</Dd>
          <Dt className="font-normal text-muted-foreground">Exempt users</Dt>
          <Dd data-testid="shadow-box-read-policy">
            <ExemptValue summary={summary} />
          </Dd>
          <Dt className="font-normal text-muted-foreground">Open transactions</Dt>
          <Dd>
            {summary.skipTransactionExpiration
              ? 'Left open: Skip transaction expiration is on'
              : 'Ended once the cluster is boxed, as a commit if the coordinator had already decided to commit'}
          </Dd>
        </Dl>
        {warnings.map((warning) => (
          <Alert
            key={warning.id}
            testId={`shadow-box-policy-${warning.id}`}
            variant={
              warning.severity === 'info' ? 'informative' : warning.severity === 'danger' ? 'destructive' : 'warning'
            }
          >
            <AlertDescription>
              <p>{warning.message}</p>
            </AlertDescription>
          </Alert>
        ))}
        <p className="text-body-sm text-muted-foreground">
          {summary.allowAllReads ? '' : `${SUPERUSERS_NOT_EXEMPT} `}The cluster keeps one set of settings. Box uses
          them, and they stay saved after Unbox.
        </p>
      </CardContent>
    </Card>
  );
};

const READER_ACCESS_BADGE: Record<'yes' | 'no' | 'unknown', ReactNode> = {
  yes: (
    <Badge tone="success" variant="subtle">
      Can read
    </Badge>
  ),
  no: (
    <Badge tone="warning" variant="subtle">
      Blocked
    </Badge>
  ),
  unknown: (
    <Badge tone="default" variant="subtle">
      Can’t check
    </Badge>
  ),
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
                  <TableHead>Reads as</TableHead>
                  <TableHead>Under these settings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:hover]:bg-transparent">
                {readers.map((reader) => {
                  const canRead = linkCanRead(summary, reader);
                  let access: 'yes' | 'no' | 'unknown' = 'unknown';
                  if (canRead !== undefined) {
                    access = canRead ? 'yes' : 'no';
                  }
                  return (
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
                      <TableCell>{readerUser(reader)}</TableCell>
                      <TableCell>{READER_ACCESS_BADGE[access]}</TableCell>
                    </TableRow>
                  );
                })}
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

const GOOD_TO_KNOW = [
  'Producers get REQUEST_TIMED_OUT and keep retrying until their delivery timeout, so a rejected write looks like a timeout.',
  'Topic config changes still go through. A shadow link copies some topic properties, so a change made while boxed can miss the shadow.',
  'Retention, compaction and DeleteRecords keep running while boxed. Consumer offset expiration pauses.',
  'Data transforms that write to user topics retry, and catch up after Unbox.',
  'Internal topics, such as __consumer_offsets and the audit log, stay writable.',
  'A cluster with a shadow link that hasn’t failed over can’t be boxed, and a boxed cluster rejects new shadow links until it’s unboxed.',
  'When the Admin API doesn’t require auth (admin_api_require_auth off, the default), anyone who can reach it can box.',
];

const GoodToKnowCard = () => (
  <Card size="full" testId="shadow-box-good-to-know" variant="standard">
    <CardContent className="flex flex-col gap-2">
      <h3 className="text-heading-xs">Good to know</h3>
      <ul className="list-disc space-y-1 pl-5 text-body-sm">
        {GOOD_TO_KNOW.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

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
        Box cluster
      </Button>
    </DisabledReasonTooltip>
  ) : (
    <Button onClick={onUnbox} size="sm" testId="open-unbox-cluster">
      Unbox cluster
    </Button>
  );

/** Each broker's own copy, read one by one while there's no controller leader to give the whole status. */
const OwnCopiesList = ({ copies }: { copies: BrokerOwnCopy[] }) => (
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
);

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
    <AlertTitle>Couldn’t read the shadow box</AlertTitle>
    <AlertDescription>
      <p>{describeShadowBoxReadError(error)}</p>
      {ownCopies.length > 0 ? (
        <div className="text-body-sm">
          Each broker’s own copy, read from that broker:
          <OwnCopiesList copies={ownCopies} />
        </div>
      ) : null}
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <Button isLoading={isRefetching} onClick={onRetry} size="sm" variant="outline">
        Try again
      </Button>
    </div>
  </Alert>
);

/** The Shadow Links page's view of this cluster as a link source: its box, and who reads from it. */
export const ShadowBoxSourcePanel = () => {
  const {
    summary,
    brokers,
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
    dataUpdatedAt,
    known,
    access,
    unreadable,
    ownCopies,
  } = useShadowBoxStatusQuery();
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

  if (access === 'forbidden') {
    return (
      <Alert testId="shadow-box-forbidden" variant="informative">
        <AlertTitle>Only superusers can see this cluster’s shadow box</AlertTitle>
        <AlertDescription>
          <p>
            The Shadow Box API is for superusers, so Console can’t show whether this cluster is boxed. While it is,
            writes and most changes a shadow link copies are rejected.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (unreadable) {
    return (
      <Alert testId="shadow-box-unreadable" variant="warning">
        <AlertTitle>Console can’t tell what state this box is in</AlertTitle>
        <AlertDescription>
          <p>The cluster reported a box this version of Console doesn’t understand, so it won’t guess.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (error && !data) {
    return <ReadProblem error={error} isRefetching={isRefetching} onRetry={() => refetch()} ownCopies={ownCopies} />;
  }

  const { phase } = summary;
  const changedAt = summary.stateChangedAt;
  const held = describeHeldMove(summary, brokers, now);
  const readers = topology ? topology.readers : undefined;
  const actions = (
    <BoxActions
      onBox={() => setBoxOpen(true)}
      onUnbox={() => setUnboxOpen(true)}
      phase={phase}
      stopsBox={linksThatStopBox(ownLinks).map((link) => link.name)}
    />
  );

  return (
    <div className="flex flex-col gap-4" data-testid="shadow-box-source-panel">
      {error ? (
        <Alert testId="shadow-box-status-stale" variant="warning">
          <AlertTitle>Couldn’t refresh the shadow box</AlertTitle>
          <AlertDescription>
            <p>{describeShadowBoxReadError(error)}</p>
            <p>Showing its status from {formatBoxDuration(now - dataUpdatedAt)} ago.</p>
            {ownCopies.length > 0 ? (
              <div className="text-body-sm">
                Each broker’s own copy, read from that broker:
                <OwnCopiesList copies={ownCopies} />
              </div>
            ) : null}
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
              <p className="text-body-sm text-muted-foreground" data-testid="shadow-box-since">
                {changedAt
                  ? `${BOX_PHASE_LABEL[phase]} since ${formatSince(changedAt, now)}, ${formatBoxDuration(now - changedAt.getTime())} ago · `
                  : ''}
                {summary.revision === -1n ? 'No changes yet' : `revision ${summary.revision.toString()}`}
              </p>
            </div>
            {actions}
          </div>
          <ShadowBoxStateStepper phase={phase} />
          <p className="text-body" data-testid="shadow-box-headline">
            {describeBoxPhase(summary, brokers)}
            {held ? ` ${held}` : ''}
            {isLongBox(summary, now) ? ' Retention and compaction keep deleting old data while it stays boxed.' : ''}
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-label">What clients see now</h4>
              <ShadowBoxClientEffects effects={getClientEffects({ summary, brokers, links: readers })} />
            </div>
            {brokers.length > 0 ? <BrokersTable brokers={brokers} phase={phase} /> : null}
          </div>
        </CardContent>
      </Card>

      <SourceStepsCard brokers={brokers} readers={readers} summary={summary} />

      <SettingsCard onEdit={() => setSettingsOpen(true)} summary={summary} />

      <ReadersCard
        incomplete={topology?.readersIncomplete ?? false}
        readers={readers}
        resolving={topology?.resolving ?? false}
        summary={summary}
      />

      <GoodToKnowCard />

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
