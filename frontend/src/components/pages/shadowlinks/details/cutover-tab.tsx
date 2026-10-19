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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Label } from 'components/redpanda-ui/components/label';
import { Progress } from 'components/redpanda-ui/components/progress';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  brokersPhrase,
  formatBoxDuration,
  type LinkIdentity,
  MTLS_LINK_NOTE,
  unreachableBrokersSubject,
} from 'components/shadow-box/shadow-box-model';
import { ShadowBoxStateBadge } from 'components/shadow-box/shadow-box-state-badge';
import { useNow } from 'components/shadow-box/use-now';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import type { ShadowLinkPeerBox } from 'federation/types';
import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import {
  type CutoverReadiness,
  type CutoverStepState,
  getCutoverStepStates,
  type LagStep,
  type SourceBoxStep,
  topicsSubject,
} from './cutover-model';
import type { UnifiedShadowLink } from '../model';

type CloudStep = Extract<SourceBoxStep, { kind: 'cloud' }>;
type KnownPeerBox = Extract<ShadowLinkPeerBox, { status: 'known' }>;

const MARKER_STYLE: Record<CutoverStepState, string> = {
  done: 'border-success bg-success text-success-foreground',
  current: 'border-primary text-primary',
  attention: 'border-warning text-warning',
  pending: 'border-border text-muted-foreground',
};

const Step = ({
  index,
  state,
  title,
  status,
  children,
  testId,
}: {
  index: number;
  state: CutoverStepState;
  title: string;
  status?: ReactNode;
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
        {status}
      </div>
      {children}
    </div>
  </li>
);

/** One side of the cutover: the source's three steps run there, the last three here. */
const Lane = ({
  title,
  description,
  testId,
  dashed,
  children,
}: {
  title: string;
  description: string;
  testId: string;
  /** Shadow linking's steps, outlined in the reference to set them apart from the shadow box API's. */
  dashed?: boolean;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className={cn('rounded-lg border px-5 pt-4', dashed && 'border-dashed')}
    data-testid={testId}
  >
    <h3 className="text-label">{title}</h3>
    <p className="text-body-sm text-muted-foreground">{description}</p>
    <ol className="flex flex-col">{children}</ol>
  </section>
);

const ADMIN_API_AUTH_NOTE =
  '# These calls need a superuser when the Admin API requires auth. With admin_api_require_auth off (the default), anyone can make them.';

const curl = (method: string, body: string) => [
  'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -H "Content-Type: application/json" \\',
  `  "$ADMIN_API/redpanda.core.admin.v2.ShadowBoxService/${method}" -d '${body}'`,
];

const settingsCommand = (link: LinkIdentity) => {
  const name = link.authentication === 'none' ? '' : (link.principal ?? '<shadow-link-user>');
  return [
    '# On the source cluster: let the shadow link keep reading once boxed.',
    '# This mask only adds names; to remove one, send the whole list with "updateMask":"readPolicy".',
    ADMIN_API_AUTH_NOTE,
    ...curl(
      'UpdateShadowBoxSettings',
      `{"settings":{"readPolicy":{"exemptPrincipals":["${name}"]}},"updateMask":"readPolicy.exemptPrincipals"}`
    ),
  ].join('\n');
};

const boxCommand = () => ['# On the source cluster. Box returns at boxing.', ...curl('Box', '{}')].join('\n');

const statusCommand = () =>
  ['# Repeat until the state is SHADOW_BOX_STATE_BOXED.', ...curl('GetShadowBoxStatus', '{}')].join('\n');

const MANUAL_REASON: Record<Extract<SourceBoxStep, { kind: 'manual' }>['reason'], string> = {
  external:
    'Redpanda Cloud doesn’t manage this link’s source cluster, so Console can’t read its box. Run these steps with its Admin API.',
  unavailable:
    'Console can’t read the source cluster’s box: it doesn’t serve the Shadow Box API, or you can’t read it. Run these steps with its Admin API.',
  unresolved:
    'Redpanda Cloud couldn’t tell which cluster this link reads from, so Console can’t read the source’s box. Run these steps with its Admin API.',
  standalone:
    'A shadow cluster has no view of its source’s box, so Console can’t read it from here. Run these steps with the source cluster’s Admin API.',
};

const PEER_UNAVAILABLE: Record<NonNullable<Extract<ShadowLinkPeerBox, { status: 'unavailable' }>['reason']>, string> = {
  unsupported: 'It doesn’t report a shadow box; it may run a Redpanda version without shadow boxing.',
  forbidden: 'Only superusers can read a cluster’s shadow box.',
  inactive: 'Shadow boxing turns on once every broker runs Redpanda v26.3.1 or later.',
  'no-leader': 'It has no controller leader right now. Redpanda Cloud keeps trying.',
  'not-running': 'It isn’t running.',
  error: 'Redpanda Cloud couldn’t read it.',
};

const ExemptBadge = ({ exempt }: { exempt: boolean | undefined }) => {
  if (exempt === undefined) {
    return (
      <Badge tone="default" variant="subtle">
        Can’t check
      </Badge>
    );
  }
  return exempt ? (
    <Badge tone="success" variant="subtle">
      Exempt
    </Badge>
  ) : (
    <Badge tone="warning" variant="subtle">
      Not exempt
    </Badge>
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

/**
 * Opens a page of the source cluster, where its own Console makes the call: boxing never goes
 * through this shadow cluster. Undefined when no host can open another cluster.
 */
const useOpenSource = (step: CloudStep) => {
  const openCluster = useShadowBoxStore((state) => state.openCluster);
  if (!openCluster) {
    return;
  }
  return (search: Record<string, string>) =>
    openCluster(step.source.clusterId, `/shadowlinks?${new URLSearchParams({ tab: 'source', ...search })}`);
};

const SettingsStepBody = ({ step, link }: { step: CloudStep; link: LinkIdentity }) => {
  const openSource = useOpenSource(step);
  const { box, source } = step;
  const user = linkUserLabel(link);
  const exemptName = link.authentication === 'none' ? '' : link.principal;
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted-foreground">This link reads as</span>
        <span className={link.authentication === 'sasl' ? 'font-mono' : undefined}>{user ?? 'an unknown user'}</span>
        <ExemptBadge exempt={step.linkExempt} />
      </p>
      {step.linkExempt === undefined ? (
        <p className="text-body-sm text-muted-foreground" data-testid="cutover-link-principal-unknown">
          {link.authentication === 'mtls'
            ? MTLS_LINK_NOTE
            : 'Console can’t tell which user this link reads as, so it can’t check the exempt list. Make sure it’s there, or lag can’t reach zero.'}
        </p>
      ) : null}
      {step.linkExempt === false ? (
        <Alert testId="cutover-link-not-exempt" variant="warning">
          <AlertTitle>{source.clusterName}’s settings block this link</AlertTitle>
          <AlertDescription>
            <p>
              {box.state === 'boxing' || box.state === 'boxed'
                ? 'Its brokers reject this link’s fetches, so lag can’t reach zero. Saving the user puts the source back in Boxing until every broker has it; writes stay blocked the whole time.'
                : 'Once the source is boxed, its brokers would reject this link’s fetches and lag couldn’t reach zero. By default a box blocks every consumer, this link’s user included.'}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {step.linkExempt === true ? (
        <p className="text-body-sm text-muted-foreground">
          {box.allowAllReads
            ? `Allow all reads is on for ${source.clusterName}, so this link can keep reading.`
            : `${source.clusterName}’s saved settings let this link keep reading once it’s boxed.`}
        </p>
      ) : null}
      {openSource && step.linkExempt !== true ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              openSource(exemptName === undefined ? { action: 'exempt' } : { action: 'exempt', principal: exemptName })
            }
            size="sm"
            testId="cutover-exempt-link"
            variant={step.linkExempt === false ? 'primary' : 'outline'}
          >
            {step.linkExempt === false && user
              ? `Exempt ${user} on ${source.clusterName}`
              : `Open ${source.clusterName}’s settings`}
          </Button>
        </div>
      ) : null}
    </>
  );
};

const BoxStepBody = ({ step }: { step: CloudStep }) => {
  const openSource = useOpenSource(step);
  const now = useNow();
  const { box, source } = step;
  const requested = box.state === 'boxing' || box.state === 'boxed';
  const since = box.stateChangedAt ? new Date(box.stateChangedAt) : undefined;
  if (requested) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Box was called on {source.clusterName}
        {since && box.state === 'boxing' ? ` ${formatBoxDuration(now - since.getTime())} ago` : ''}. Each broker rejects
        writes as soon as it picks it up.
      </p>
    );
  }
  return (
    <>
      <p className="text-body-sm text-muted-foreground">
        Box runs on {source.clusterName}, with its saved settings. Each broker there rejects writes as soon as it picks
        it up, so do this just before you fail over.
      </p>
      {openSource ? (
        <div className="flex flex-wrap gap-2">
          <DisabledReasonTooltip
            reason={
              step.linkExempt === false ? 'Exempt this link’s user first, or the box would stop it reading.' : undefined
            }
          >
            <Button
              disabled={step.linkExempt === false}
              onClick={() => openSource({ action: 'box' })}
              size="sm"
              testId="cutover-open-source"
              variant="primary"
            >
              Box {source.clusterName}
            </Button>
          </DisabledReasonTooltip>
        </div>
      ) : null}
    </>
  );
};

const brokerCount = (box: KnownPeerBox) => {
  const brokers = box.brokers ?? [];
  return {
    total: brokers.length,
    confirmed: brokers.filter((broker) => broker.status === 'confirmed').length,
    down: brokers.filter((broker) => broker.status === 'not-answering').map((broker) => broker.nodeId),
    behind: brokers.filter((broker) => broker.status === 'behind').map((broker) => broker.nodeId),
  };
};

const BoxedStepBody = ({ step }: { step: CloudStep }) => {
  const openSource = useOpenSource(step);
  const now = useNow();
  const { box, source } = step;
  const since = box.stateChangedAt ? new Date(box.stateChangedAt) : undefined;
  const { total, confirmed, down, behind } = brokerCount(box);
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted-foreground">{source.clusterName} is</span>
        <ShadowBoxStateBadge phase={box.state} testId="cutover-source-box-state" />
        {since ? <span className="text-muted-foreground">for {formatBoxDuration(now - since.getTime())}</span> : null}
      </p>
      {box.state === 'boxing' ? (
        <p className="text-body-sm text-muted-foreground" data-testid="cutover-boxing-progress">
          {total > 0 ? `${confirmed} of ${total} brokers have confirmed. ` : ''}
          {down.length > 0
            ? `${unreachableBrokersSubject(down)} answering, so ${source.clusterName} stays boxing until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster. There’s no timeout.`
            : ''}
          {down.length === 0 && behind.length > 0 ? `Waiting on ${brokersPhrase(behind)}.` : ''}
        </p>
      ) : null}
      {box.state === 'boxed' ? (
        <p className="text-body-sm text-muted-foreground">
          Every broker confirmed, so nothing new is written to {source.clusterName}. Writes accepted just before the box
          can still arrive here.
        </p>
      ) : null}
      {openSource && (box.state === 'boxing' || box.state === 'boxed') ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openSource({})} size="sm" testId="cutover-view-source" variant="outline">
            Open {source.clusterName}
          </Button>
          <Button
            onClick={() => openSource({ action: 'unbox' })}
            size="sm"
            testId="cutover-unbox-source"
            variant="outline"
          >
            Unbox {source.clusterName}
          </Button>
        </div>
      ) : null}
    </>
  );
};

const ManualCommand = ({ code, testId }: { code: string; testId: string }) => (
  <SimpleCodeBlock code={code} language="bash" testId={testId} width="full" />
);

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

const LAG_NOTE: Partial<Record<LagStep['status'], string>> = {
  'waiting-for-box':
    'Lag can still grow until the source reports Boxed, because some of its brokers may still take writes.',
  blocked: 'The source’s box blocks this link’s fetches, so lag can’t drain until the link’s user is exempt.',
};

const LagStaleAlert = ({ onRetry }: { onRetry: () => void }) => (
  <Alert testId="cutover-lag-stale" variant="warning">
    <AlertTitle>Couldn’t refresh the topics’ lag</AlertTitle>
    <AlertDescription>
      <p>These are the last numbers Console read, so they may be out of date. Console keeps trying.</p>
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <Button onClick={onRetry} size="sm" testId="cutover-lag-retry" variant="outline">
        Try again
      </Button>
    </div>
  </Alert>
);

const LagStepBody = ({ lag, failedOver, onRetry }: { lag: LagStep; failedOver: boolean; onRetry: () => void }) => {
  if (failedOver) {
    return <p className="text-body">Every topic has failed over, so nothing is left to sync.</p>;
  }
  if (lag.status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-body text-muted-foreground" data-testid="cutover-lag-loading">
        <Spinner className="size-4" /> Loading each topic’s lag…
      </p>
    );
  }
  if (lag.status === 'unavailable') {
    return (
      <Alert testId="cutover-lag-error" variant="destructive">
        <AlertTitle>Couldn’t load the link’s topics</AlertTitle>
        <AlertDescription>
          <p>Console can’t tell whether every topic has caught up until it can read them.</p>
        </AlertDescription>
        <div className="col-start-2 mt-2">
          <Button onClick={onRetry} size="sm" testId="cutover-lag-retry" variant="outline">
            Try again
          </Button>
        </div>
      </Alert>
    );
  }
  const percent = lag.syncing === 0 ? 100 : Math.round((lag.caughtUp / lag.syncing) * 100);

  return (
    <>
      {lag.stale ? <LagStaleAlert onRetry={onRetry} /> : null}
      <Progress
        aria-label={`${lag.caughtUp} of ${lag.syncing} topics caught up`}
        testId="cutover-lag-progress"
        value={percent}
      />
      <p className="text-body" data-testid="cutover-lag-summary">
        {describeLag(lag)}
      </p>
      <p className="text-body-sm text-muted-foreground">
        {LAG_NOTE[lag.status] ??
          'With the source boxed, nothing new is written there, so lag drains. Writes accepted just before the box can still arrive.'}
      </p>
      {lag.paused.length > 0 ? (
        <Alert testId="cutover-paused-topics" variant="warning">
          <AlertDescription>
            <p>
              {topicsSubject(lag.paused, 'is', 'are')} paused, so {plural(lag.paused.length, 'it', 'they')} won’t catch
              up until resumed.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {lag.faulted.length > 0 ? (
        <Alert testId="cutover-faulted-topics" variant="destructive">
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

const LAG_BADGE: Record<LagStep['status'], ReactNode> = {
  loading: null,
  unavailable: null,
  faulted: (
    <StatusBadge size="sm" variant="destructive">
      Topics faulted
    </StatusBadge>
  ),
  'caught-up': (
    <StatusBadge size="sm" variant="success">
      Caught up
    </StatusBadge>
  ),
  draining: (
    <StatusBadge pulsing size="sm" variant="informative">
      Draining
    </StatusBadge>
  ),
  'waiting-for-box': (
    <StatusBadge size="sm" variant="disabled">
      Waiting for Boxed
    </StatusBadge>
  ),
  blocked: (
    <StatusBadge size="sm" variant="warning">
      Link can’t read
    </StatusBadge>
  ),
};

const STALE_BADGE = (
  <StatusBadge size="sm" variant="warning">
    Out of date
  </StatusBadge>
);

const lagBadge = (lag: LagStep, failedOver: boolean): ReactNode => {
  if (failedOver) {
    return null;
  }
  return lag.stale ? STALE_BADGE : LAG_BADGE[lag.status];
};

const failoverBadge = ({ done, inProgress }: CutoverReadiness['failover']): ReactNode => {
  if (done) {
    return (
      <StatusBadge size="sm" variant="success">
        Failed over
      </StatusBadge>
    );
  }
  return inProgress > 0 ? (
    <StatusBadge pulsing size="sm" variant="informative">
      Failing over
    </StatusBadge>
  ) : null;
};

const FailoverStepBody = ({
  readiness,
  linkName,
  clusterName,
  sourceName,
  onFailoverAll,
  isFailingOver,
}: {
  readiness: CutoverReadiness;
  linkName: string;
  clusterName: string;
  sourceName: string;
  onFailoverAll: () => void;
  isFailingOver: boolean;
}) => {
  const { failover, lag } = readiness;
  if (failover.done) {
    const leftBehind =
      lag.faulted.length === 1
        ? `apart from ${lag.faulted[0]}, which has faulted`
        : `apart from ${lag.faulted.length} faulted topics`;
    return (
      <p className="text-body" data-testid="cutover-done">
        {lag.faulted.length > 0
          ? `${linkName} has failed over, ${leftBehind},`
          : `Every topic of ${linkName} has failed over,`}{' '}
        and {clusterName} accepts writes.
      </p>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!failover.enabled}
          isLoading={isFailingOver}
          onClick={onFailoverAll}
          size="sm"
          testId="cutover-failover-all"
          variant="destructive"
        >
          Fail over all topics
        </Button>
        {failover.reason ? (
          <span className="text-body-sm text-muted-foreground" data-testid="cutover-failover-reason">
            {failover.reason}
          </span>
        ) : null}
      </div>
      <p className="text-body-sm text-muted-foreground">
        If {sourceName} is down and can’t be boxed, use Fail over all topics at the top of the page instead.
      </p>
    </>
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
  <div className="flex flex-col gap-2 text-body-sm" data-testid="cutover-move-clients">
    <p className={failedOver ? undefined : 'text-muted-foreground'}>
      {failedOver ? `${clusterName} now takes writes. Next:` : 'Once the link has failed over:'}
    </p>
    <ul className="list-disc space-y-1 pl-5">
      <li>Repoint producers and consumers to {clusterName}.</li>
      <li>Re-create any Redpanda Connect pipelines here.</li>
      <li>Leave {sourceName} boxed until they have moved, so nothing writes to it by mistake.</li>
      <li>
        To fail back later, unbox {sourceName} first: a boxed cluster rejects a new shadow link with UNAVAILABLE, and
        retrying won’t help.
      </li>
    </ul>
  </div>
);

const DONE_BADGE = (
  <StatusBadge size="sm" variant="success">
    Done
  </StatusBadge>
);

type CutoverTabProps = {
  shadowLink: UnifiedShadowLink;
  readiness: CutoverReadiness;
  linkIdentity: LinkIdentity;
  onManualConfirmChange: (confirmed: boolean) => void;
  onRetryTopics: () => void;
  onFailoverAll: () => void;
  isFailingOver: boolean;
};

const SourceLaneSteps = ({
  box,
  states,
  linkIdentity,
  onManualConfirmChange,
}: {
  box: SourceBoxStep;
  states: ReturnType<typeof getCutoverStepStates>;
  linkIdentity: LinkIdentity;
  onManualConfirmChange: (confirmed: boolean) => void;
}) => {
  if (box.kind === 'loading') {
    return (
      <li className="py-5">
        <p className="flex items-center gap-2 text-body text-muted-foreground" data-testid="cutover-box-loading">
          <Spinner className="size-4" />
          {box.source ? `Reading the box on ${box.source.clusterName}…` : 'Finding the cluster this link reads from…'}
        </p>
      </li>
    );
  }
  if (box.kind === 'manual') {
    const unavailableReason =
      box.source?.kind === 'cloud' && box.source.box.status === 'unavailable' && box.source.box.reason
        ? ` ${PEER_UNAVAILABLE[box.source.box.reason]}`
        : '';
    return (
      <>
        <li className="pt-3 text-body" data-testid="cutover-manual-reason">
          {MANUAL_REASON[box.reason]}
          {unavailableReason}
          {box.source?.kind === 'external' ? (
            <span className="mt-1 block text-body-sm text-muted-foreground">
              Source: <span className="font-mono">{box.source.bootstrapServers.join(', ')}</span>
            </span>
          ) : null}
        </li>
        <Step index={1} state={states.settings} testId="cutover-step-settings" title="Save settings">
          <ManualCommand code={settingsCommand(linkIdentity)} testId="cutover-admin-api-settings" />
        </Step>
        <Step index={2} state={states.box} testId="cutover-step-box" title="Box">
          <ManualCommand code={boxCommand()} testId="cutover-admin-api-box" />
        </Step>
        <Step index={3} state={states.boxed} testId="cutover-step-boxed" title="Wait for Boxed">
          <ManualCommand code={statusCommand()} testId="cutover-admin-api-status" />
          <div className="flex items-start gap-2">
            <Checkbox
              checked={box.confirmed}
              id="cutover-source-boxed-confirmation"
              onCheckedChange={(checked) => onManualConfirmChange(checked === true)}
              testId="cutover-source-boxed-confirmation"
            />
            <Label className="font-normal" htmlFor="cutover-source-boxed-confirmation">
              The source cluster reports Boxed, with this link’s user exempt
            </Label>
          </div>
          <p className="text-body-sm text-muted-foreground">
            This is your confirmation, not a status Console has read, so make sure the box is in place before you fail
            over.
          </p>
        </Step>
      </>
    );
  }
  return (
    <>
      <Step
        index={1}
        state={states.settings}
        status={states.settings === 'done' ? DONE_BADGE : null}
        testId="cutover-step-settings"
        title="Save settings: exempt this link’s user"
      >
        <SettingsStepBody link={linkIdentity} step={box} />
      </Step>
      <Step
        index={2}
        state={states.box}
        status={states.box === 'done' ? DONE_BADGE : null}
        testId="cutover-step-box"
        title="Box"
      >
        <BoxStepBody step={box} />
      </Step>
      <Step index={3} state={states.boxed} testId="cutover-step-boxed" title="Wait for Boxed">
        <BoxedStepBody step={box} />
      </Step>
    </>
  );
};

/**
 * The reference's failover, start to finish: three steps on the source cluster through its shadow
 * box API, then three here through shadow linking. Every source step runs on the source's own
 * Console; this page only reads its box, through the host.
 */
export const CutoverTab = ({
  shadowLink,
  readiness,
  linkIdentity,
  onManualConfirmChange,
  onRetryTopics,
  onFailoverAll,
  isFailingOver,
}: CutoverTabProps) => {
  const clusterName = useShadowBoxStore((state) => state.topology?.clusterName) ?? 'this cluster';
  const { box, lag, failover } = readiness;
  const states = getCutoverStepStates(readiness);
  const sourceName = box.kind !== 'manual' && box.source ? box.source.clusterName : 'the source cluster';

  return (
    <Card size="full" testId="cutover-tab" variant="standard">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading-sm">Cut over from {sourceName}</h2>
          <p className="text-body text-muted-foreground">
            Save the settings, box the source, and wait until it reports Boxed. Then fail the link over here. Don’t skip
            the settings: by default a box blocks every consumer, this link’s user included.
          </p>
        </div>
        <Lane
          description="The shadow box API on the source cluster. Each change runs on its own page."
          testId="cutover-lane-source"
          title={`On ${sourceName}`}
        >
          <SourceLaneSteps
            box={box}
            linkIdentity={linkIdentity}
            onManualConfirmChange={onManualConfirmChange}
            states={states}
          />
        </Lane>
        <Lane
          dashed
          description="Shadow linking on this cluster."
          testId="cutover-lane-shadow"
          title={`On ${clusterName}`}
        >
          <Step
            index={4}
            state={states.lag}
            status={lagBadge(lag, failover.done)}
            testId="cutover-step-lag"
            title="Wait for zero lag"
          >
            <LagStepBody failedOver={failover.done} lag={lag} onRetry={onRetryTopics} />
          </Step>
          <Step
            index={5}
            state={states.failover}
            status={failoverBadge(failover)}
            testId="cutover-step-failover"
            title="Fail over"
          >
            <FailoverStepBody
              clusterName={clusterName}
              isFailingOver={isFailingOver}
              linkName={shadowLink.name}
              onFailoverAll={onFailoverAll}
              readiness={readiness}
              sourceName={sourceName}
            />
          </Step>
          <Step index={6} state={states.clients} testId="cutover-step-clients" title="Move clients">
            <MoveClientsStepBody clusterName={clusterName} failedOver={failover.done} sourceName={sourceName} />
          </Step>
        </Lane>
      </CardContent>
    </Card>
  );
};
