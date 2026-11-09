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
  brokersPhrase,
  formatFenceDuration,
  isBlockingPhase,
  type LinkIdentity,
  MTLS_LINK_NOTE,
  unreachableBrokersSubject,
} from 'components/cluster-fence/cluster-fence-model';
import { CanReadBadge, ClusterFenceStateBadge, useNow } from 'components/cluster-fence/cluster-fence-ui';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Progress } from 'components/redpanda-ui/components/progress';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ShadowLinkPeerFence } from 'federation/types';
import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

import {
  type FailoverReadiness,
  getFailoverStepStates,
  type LagStep,
  type SourceFenceStep,
  type StepState,
  type TransientReason,
  topicsSubject,
} from './failover-model';
import type { UnifiedShadowLink } from '../model';

type CloudStep = Extract<SourceFenceStep, { kind: 'cloud' }>;
type KnownPeerFence = Extract<ShadowLinkPeerFence, { status: 'known' }>;

const MARKER_STYLE: Record<StepState, string> = {
  done: 'border-success bg-success text-success-foreground',
  current: 'border-primary text-primary',
  attention: 'border-warning text-warning',
  pending: 'border-border text-muted-foreground',
};

type BadgeSpec = { label: string; variant: StatusBadgeVariant; pulsing?: boolean };

const Step = ({
  index,
  state,
  title,
  status,
  children,
  testId,
}: {
  index: number;
  state: StepState;
  title: string;
  status?: BadgeSpec;
  children: ReactNode;
  testId: string;
}) => (
  <li
    className="grid grid-cols-[1.75rem_1fr] gap-4 border-b py-5 last:border-b-0"
    data-state={state}
    data-testid={testId}
  >
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-label tabular-nums',
        MARKER_STYLE[state]
      )}
    >
      {state === 'done' ? <CheckIcon className="size-4" /> : String(index)}
    </span>
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-heading-xs">
          <span className="sr-only">{`Step ${index}${state === 'done' ? ', complete' : ''}: `}</span>
          {title}
        </h4>
        {status ? (
          <StatusBadge pulsing={status.pulsing} size="sm" variant={status.variant}>
            {status.label}
          </StatusBadge>
        ) : null}
      </div>
      {children}
    </div>
  </li>
);

/** One side of the failover: the source's three steps run there, the last three here. */
const Lane = ({
  title,
  description,
  testId,
  dashed,
  action,
  children,
}: {
  title: string;
  description: string;
  testId: string;
  /** Shadow linking's steps, outlined in the reference to set them apart from the cluster fence API's. */
  dashed?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className={cn('rounded-lg border px-5 pt-4', dashed && 'border-dashed')}
    data-testid={testId}
  >
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-label">{title}</h3>
        <p className="text-body-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
    <ol className="flex flex-col">{children}</ol>
  </section>
);

/**
 * The source's steps run on its own Console, so this lane only reports them and links there: to the
 * settings with this link's user already added when they would block it, otherwise to the fence.
 */
const OpenSourceButton = ({ fence, link }: { fence: SourceFenceStep; link: LinkIdentity }) => {
  const openCluster = useClusterFenceStore((state) => state.openCluster);
  const { source } = fence;
  if (!(openCluster && source)) {
    return null;
  }
  const exempt = fence.kind === 'cloud' && fence.linkExempt === false ? link.principal : undefined;
  return (
    <Button
      onClick={() =>
        openCluster(
          source.clusterId,
          exempt
            ? `/shadowlinks?tab=source&action=exempt&principal=${encodeURIComponent(exempt)}`
            : '/shadowlinks?tab=source'
        )
      }
      size="sm"
      testId="failover-open-source"
      variant="outline"
    >
      {exempt ? `Exempt ${exempt} on ${source.clusterName}` : `Open ${source.clusterName}`}
    </Button>
  );
};

const linkUserLabel = (link: LinkIdentity) => {
  if (link.authentication === 'mtls') {
    return 'an mTLS certificate';
  }
  if (link.authentication === 'none') {
    return 'no SASL or mTLS';
  }
  return link.principal;
};

/** Says why the exempt badge reads as it does, when it isn't a plain Exempt. */
const exemptNote = ({ fence, source, linkExempt }: CloudStep, link: LinkIdentity) => {
  if (linkExempt === undefined) {
    return link.authentication === 'mtls'
      ? MTLS_LINK_NOTE
      : 'Console can’t tell which user this link reads as, so it can’t check the exempt list.';
  }
  if (linkExempt === false) {
    return isBlockingPhase(fence.state)
      ? `${source.clusterName}’s fence rejects this link’s fetches, so lag can’t reach zero.`
      : `Once ${source.clusterName} is fenced, it would reject this link’s fetches, so lag couldn’t reach zero.`;
  }
};

const SettingsStepBody = ({ step, link }: { step: CloudStep; link: LinkIdentity }) => {
  const user = linkUserLabel(link);
  const note = exemptNote(step, link);
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted-foreground">This link reads as</span>
        <span className={link.authentication === 'sasl' ? 'font-mono' : undefined}>{user ?? 'an unknown user'}</span>
        <CanReadBadge canRead={step.linkExempt} no="Not exempt" yes="Exempt" />
      </p>
      {note ? (
        <p
          className={cn('text-body-sm', step.linkExempt === undefined && 'text-muted-foreground')}
          data-testid={step.linkExempt === false ? 'failover-link-not-exempt' : 'failover-link-principal-unknown'}
        >
          {note}
        </p>
      ) : null}
    </>
  );
};

const FenceStepBody = ({ step }: { step: CloudStep }) => {
  const { fence, source } = step;
  return (
    <p className="text-body-sm text-muted-foreground">
      {isBlockingPhase(fence.state)
        ? `Fence was called on ${source.clusterName}. Each broker rejects writes as soon as it picks it up.`
        : `Fence runs on ${source.clusterName}, with its saved settings. Each broker there rejects writes as soon as it picks it up, so do this just before you fail over.`}
    </p>
  );
};

const brokerCount = (fence: KnownPeerFence) => {
  const brokers = fence.brokers ?? [];
  return {
    total: brokers.length,
    confirmed: brokers.filter((broker) => broker.status === 'confirmed').length,
    down: brokers.filter((broker) => broker.status === 'not-answering').map((broker) => broker.nodeId),
    behind: brokers.filter((broker) => broker.status === 'behind').map((broker) => broker.nodeId),
  };
};

const FencedStepBody = ({ step }: { step: CloudStep }) => {
  const now = useNow();
  const { fence, source } = step;
  const since = fence.stateChangedAt ? new Date(fence.stateChangedAt) : undefined;
  const { total, confirmed, down, behind } = brokerCount(fence);
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted-foreground">{source.clusterName} is</span>
        <ClusterFenceStateBadge phase={fence.state} testId="failover-source-fence-state" />
        {since ? <span className="text-muted-foreground">for {formatFenceDuration(now - since.getTime())}</span> : null}
      </p>
      {fence.state === 'fencing' ? (
        <p className="text-body-sm text-muted-foreground" data-testid="failover-fencing-progress">
          {total > 0 ? `${confirmed} of ${total} brokers have confirmed. ` : ''}
          {down.length > 0
            ? `${unreachableBrokersSubject(down)} answering, so ${source.clusterName} stays fencing until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster. There’s no timeout.`
            : ''}
          {down.length === 0 && behind.length > 0 ? `Waiting on ${brokersPhrase(behind)}.` : ''}
        </p>
      ) : null}
      {fence.state === 'fenced' ? (
        <p className="text-body-sm text-muted-foreground">
          Every broker confirmed, so nothing new is written to {source.clusterName}. Writes accepted just before the
          fence can still arrive here.
        </p>
      ) : null}
    </>
  );
};

const lagNumber = new Intl.NumberFormat();

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** For example "47 of 48 topics caught up. orders-events is 1,204 messages behind." */
const describeLag = (lag: LagStep): string => {
  if (lag.syncing === 0) {
    return 'No topics are syncing.';
  }
  const summary = `${lag.caughtUp} of ${lag.syncing} ${plural(lag.syncing, 'topic', 'topics')} caught up.`;
  const [worst, ...rest] = lag.behind;
  if (!worst) {
    return summary;
  }
  const messages = plural(Number(worst.lag), 'message', 'messages');
  const others =
    rest.length > 0 ? `, and ${rest.length} more ${plural(rest.length, 'topic is', 'topics are')} behind` : '';
  return `${summary} ${worst.topicName} is ${lagNumber.format(worst.lag)} ${messages} behind${others}.`;
};

const LagRetryButton = ({ onRetry }: { onRetry: () => void }) => (
  <div className="col-start-2 mt-2">
    <Button onClick={onRetry} size="sm" testId="failover-lag-retry" variant="outline">
      Try again
    </Button>
  </div>
);

const LagStepBody = ({ lag, failedOver, onRetry }: { lag: LagStep; failedOver: boolean; onRetry: () => void }) => {
  if (failedOver) {
    return <p className="text-body">Every topic has failed over, so nothing is left to sync.</p>;
  }
  if (lag.status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-body text-muted-foreground" data-testid="failover-lag-loading">
        <Spinner className="size-4" /> Loading each topic’s lag…
      </p>
    );
  }
  if (lag.status === 'unavailable') {
    return (
      <Alert testId="failover-lag-error" variant="destructive">
        <AlertTitle>Couldn’t load the link’s topics</AlertTitle>
        <AlertDescription>
          <p>Console can’t tell whether every topic has caught up until it can read them.</p>
        </AlertDescription>
        <LagRetryButton onRetry={onRetry} />
      </Alert>
    );
  }
  const percent = lag.syncing === 0 ? 100 : Math.round((lag.caughtUp / lag.syncing) * 100);

  return (
    <>
      {lag.stale ? (
        <Alert testId="failover-lag-stale" variant="warning">
          <AlertTitle>Couldn’t refresh the topics’ lag</AlertTitle>
          <AlertDescription>
            <p>These are the last numbers Console read, so they may be out of date. Console keeps trying.</p>
          </AlertDescription>
          <LagRetryButton onRetry={onRetry} />
        </Alert>
      ) : null}
      <Progress
        aria-label={`${lag.caughtUp} of ${lag.syncing} topics caught up`}
        testId="failover-lag-progress"
        value={percent}
      />
      <p className="text-body" data-testid="failover-lag-summary">
        {describeLag(lag)}
      </p>
      {lag.status === 'waiting-for-fence' ? (
        <p className="text-body-sm text-muted-foreground">
          Lag can still grow until the source reports Fenced, because some of its brokers may still take writes.
        </p>
      ) : null}
      {lag.paused.length > 0 ? (
        <Alert testId="failover-paused-topics" variant="warning">
          <AlertDescription>
            <p>
              {topicsSubject(lag.paused, 'is', 'are')} paused, so {plural(lag.paused.length, 'it', 'they')} won’t catch
              up until resumed.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {lag.faulted.length > 0 ? (
        <Alert testId="failover-faulted-topics" variant="destructive">
          <AlertDescription>
            <p>
              {topicsSubject(lag.faulted, 'has', 'have')} faulted, so{' '}
              {plural(lag.faulted.length, 'it isn’t', 'they aren’t')} syncing and failing over leaves{' '}
              {plural(lag.faulted.length, 'it', 'them')} as {plural(lag.faulted.length, 'it is', 'they are')}. Check the
              Overview tab for the reason.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
};

const LAG_BADGE: Partial<Record<LagStep['status'], BadgeSpec>> = {
  faulted: { label: 'Topics faulted', variant: 'destructive' },
  'caught-up': { label: 'Caught up', variant: 'success' },
  draining: { label: 'Draining', variant: 'informative', pulsing: true },
  'waiting-for-fence': { label: 'Waiting', variant: 'disabled' },
  blocked: { label: 'Link can’t read', variant: 'warning' },
};

const lagBadge = (lag: LagStep, failedOver: boolean): BadgeSpec | undefined => {
  if (failedOver) {
    return;
  }
  return lag.stale ? { label: 'Out of date', variant: 'warning' } : LAG_BADGE[lag.status];
};

const failoverBadge = ({ done, inProgress }: FailoverReadiness['failover']): BadgeSpec | undefined => {
  if (done) {
    return { label: 'Failed over', variant: 'success' };
  }
  return inProgress > 0 ? { label: 'Failing over', variant: 'informative', pulsing: true } : undefined;
};

/** Status only: Fail over all topics at the top of the page is the one way to fail over. */
const FailoverStepBody = ({
  readiness,
  linkName,
  clusterName,
}: {
  readiness: FailoverReadiness;
  linkName: string;
  clusterName: string;
}) => {
  const { failover, lag } = readiness;
  if (failover.done) {
    const leftBehind =
      lag.faulted.length === 1
        ? `apart from ${lag.faulted[0]}, which has faulted`
        : `apart from ${lag.faulted.length} faulted topics`;
    return (
      <p className="text-body" data-testid="failover-done">
        {lag.faulted.length > 0
          ? `${linkName} has failed over, ${leftBehind},`
          : `Every topic of ${linkName} has failed over,`}{' '}
        and {clusterName} accepts writes.
      </p>
    );
  }
  return (
    <p className="text-body-sm text-muted-foreground" data-testid="failover-status">
      {failover.reason ?? 'Fail over with Fail over all topics above.'}
    </p>
  );
};

const MoveClientsStepBody = ({
  clusterName,
  sourceName,
  failedOver,
}: {
  clusterName: string;
  sourceName: string;
  failedOver: boolean;
}) => (
  <ul
    className={cn('list-disc space-y-1 pl-5 text-body-sm', !failedOver && 'text-muted-foreground')}
    data-testid="failover-move-clients"
  >
    <li>Repoint producers and consumers to {clusterName}, and re-create any Redpanda Connect pipelines here.</li>
    <li>Leave {sourceName} fenced until they have moved. To fail back later, unfence it first.</li>
  </ul>
);

const UNREADABLE_SENTENCE: Partial<Record<NonNullable<TransientReason>, string>> = {
  'no-leader': 'It has no controller leader. ',
  'not-running': 'It isn’t running. ',
};

/** In place of the source's steps, when its fence was read earlier in this visit but can't be now. */
const UnreadableSource = ({ fence }: { fence: Extract<SourceFenceStep, { kind: 'unreadable' }> }) => (
  <li className="py-5">
    <Alert testId="failover-fence-unreadable" variant="warning">
      <AlertTitle>Can’t read {fence.source.clusterName}’s fence right now</AlertTitle>
      <AlertDescription>
        <p>
          {fence.reason ? (UNREADABLE_SENTENCE[fence.reason] ?? '') : ''}Redpanda Cloud keeps trying, and the steps come
          back once it can read the fence.
        </p>
      </AlertDescription>
    </Alert>
  </li>
);

const SourceLaneSteps = ({
  fence,
  states,
  linkIdentity,
}: {
  fence: SourceFenceStep;
  states: ReturnType<typeof getFailoverStepStates>;
  linkIdentity: LinkIdentity;
}) => {
  if (fence.kind === 'unreadable') {
    return <UnreadableSource fence={fence} />;
  }
  if (fence.kind === 'loading') {
    return (
      <li className="py-5">
        <p className="flex items-center gap-2 text-body text-muted-foreground" data-testid="failover-fence-loading">
          <Spinner className="size-4" />
          {fence.source
            ? `Reading the fence on ${fence.source.clusterName}…`
            : 'Finding the cluster this link reads from…'}
        </p>
      </li>
    );
  }
  return (
    <>
      <Step
        index={1}
        state={states.settings}
        testId="failover-step-settings"
        title="Save settings: exempt this link’s user"
      >
        <SettingsStepBody link={linkIdentity} step={fence} />
      </Step>
      <Step index={2} state={states.fence} testId="failover-step-fence" title="Fence">
        <FenceStepBody step={fence} />
      </Step>
      <Step index={3} state={states.fenced} testId="failover-step-fenced" title="Wait for Fenced">
        <FencedStepBody step={fence} />
      </Step>
    </>
  );
};

type FailoverTabProps = {
  shadowLink: UnifiedShadowLink;
  readiness: FailoverReadiness;
  linkIdentity: LinkIdentity;
  onRetryTopics: () => void;
};

/**
 * The reference's failover, start to finish: three steps on the source cluster through its cluster
 * fence API, then three here through shadow linking. Every source step runs on the source's own
 * Console; this page only reads its fence, through the host.
 */
export const FailoverTab = ({ shadowLink, readiness, linkIdentity, onRetryTopics }: FailoverTabProps) => {
  const clusterName = useClusterFenceStore((state) => state.topology?.clusterName) ?? 'this cluster';
  const { fence, lag, failover } = readiness;
  const states = getFailoverStepStates(readiness);
  const sourceName = fence.source?.clusterName ?? 'the source cluster';

  return (
    <Card size="full" testId="failover-tab" variant="standard">
      <CardContent>
        <div className="flex flex-col gap-8">
          <h2 className="text-heading-sm">Fail over from {sourceName}</h2>
          <Lane
            action={<OpenSourceButton fence={fence} link={linkIdentity} />}
            description={`These run on ${sourceName}’s Cluster fence tab.`}
            testId="failover-lane-source"
            title={`On ${sourceName}`}
          >
            <SourceLaneSteps fence={fence} linkIdentity={linkIdentity} states={states} />
          </Lane>
          <Lane
            dashed
            description="Shadow linking on this cluster."
            testId="failover-lane-shadow"
            title={`On ${clusterName}`}
          >
            <Step
              index={4}
              state={states.lag}
              status={lagBadge(lag, failover.done)}
              testId="failover-step-lag"
              title="Wait for zero lag"
            >
              <LagStepBody failedOver={failover.done} lag={lag} onRetry={onRetryTopics} />
            </Step>
            <Step
              index={5}
              state={states.failover}
              status={failoverBadge(failover)}
              testId="failover-step-failover"
              title="Fail over"
            >
              <FailoverStepBody clusterName={clusterName} linkName={shadowLink.name} readiness={readiness} />
            </Step>
            <Step index={6} state={states.clients} testId="failover-step-clients" title="Move clients">
              <MoveClientsStepBody clusterName={clusterName} failedOver={failover.done} sourceName={sourceName} />
            </Step>
          </Lane>
        </div>
      </CardContent>
    </Card>
  );
};
