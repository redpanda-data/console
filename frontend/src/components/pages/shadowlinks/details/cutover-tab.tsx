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
import { Dd, Dl, Dt } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { formatBoxDuration } from 'components/shadow-box/shadow-box-model';
import { ShadowBoxStateBadge } from 'components/shadow-box/shadow-box-state-badge';
import { useNow } from 'components/shadow-box/use-now';
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

const MARKER_STYLE: Record<CutoverStepState, string> = {
  done: 'border-success bg-success text-success-foreground',
  current: 'border-primary text-primary',
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
        <h3 className="text-heading-xs">
          <span className="sr-only">{`Step ${index}${state === 'done' ? ', complete' : ''}: `}</span>
          {title}
        </h3>
        {status}
      </div>
      {children}
    </div>
  </li>
);

const adminApiCommands = (principal: string | undefined) => {
  const exempt = principal ? `"${principal}"` : '"<shadow-link-user>"';
  return [
    '# On the source cluster: add the shadow link to the users who can keep reading, then box',
    'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -H "Content-Type: application/json" \\',
    '  "$ADMIN_API/redpanda.core.admin.v2.ShadowBoxService/UpdateShadowBoxSettings" \\',
    `  -d '{"settings":{"readPolicy":{"exemptPrincipals":[${exempt}]}},"updateMask":"readPolicy.exemptPrincipals"}'`,
    'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -H "Content-Type: application/json" \\',
    `  "$ADMIN_API/redpanda.core.admin.v2.ShadowBoxService/Box" -d '{}'`,
    '',
    '# Repeat until the state is SHADOW_BOX_STATE_BOXED',
    'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -H "Content-Type: application/json" \\',
    `  "$ADMIN_API/redpanda.core.admin.v2.ShadowBoxService/GetShadowBoxStatus" -d '{}'`,
  ].join('\n');
};

const MANUAL_REASON: Record<Extract<SourceBoxStep, { kind: 'manual' }>['reason'], string> = {
  external:
    'Redpanda Cloud doesn’t manage this link’s source cluster, so Console can’t read its box. Box it with its Admin API, then confirm here.',
  unavailable:
    'Console can’t read the source cluster’s box, because it doesn’t serve the Shadow Box API or you can’t read it. Box it with its Admin API, then confirm here.',
  unresolved:
    'Redpanda Cloud couldn’t tell which cluster this link reads from, so Console can’t read the source’s box. Box it with its Admin API, then confirm here.',
  standalone:
    'Redpanda doesn’t give a shadow cluster a view of its source’s box, so Console can’t read it from here. Box the source cluster with its Admin API, then confirm here.',
};

const ExemptBadge = ({ exempt }: { exempt: boolean | undefined }) => {
  if (exempt === undefined) {
    return null;
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

/** Whether the link can still read from its boxed source, and what to do when it can't or that's unknown. */
const LinkAccessNote = ({
  step,
  linkPrincipal,
}: {
  step: Extract<SourceBoxStep, { kind: 'cloud' }>;
  linkPrincipal: string | undefined;
}) => {
  if (step.linkExempt === undefined) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="cutover-link-principal-unknown">
        Console can’t tell which user this link reads as, so it can’t check that the box lets it read. Make sure it
        does, or lag can’t reach zero.
      </p>
    );
  }
  if (step.linkExempt) {
    return null;
  }
  const { box, source } = step;
  const needsBox = box.state === 'unboxed' || box.state === 'unboxing';
  return (
    <Alert testId="cutover-link-not-exempt" variant="warning">
      <AlertTitle>{needsBox ? 'Exempt this link when you box' : 'This link can’t finish syncing'}</AlertTitle>
      <AlertDescription>
        <p>
          {needsBox
            ? `${linkPrincipal} isn’t one of ${source.clusterName}’s exempt principals, so once it’s boxed this link couldn’t read from it and lag couldn’t reach zero. The Box dialog on ${source.clusterName} adds the user for you.`
            : `The source’s box blocks reads from ${linkPrincipal}, so lag can’t reach zero. Exempt it on ${source.clusterName}: the brokers apply the change while the cluster stays boxed.`}
        </p>
      </AlertDescription>
    </Alert>
  );
};

/**
 * The source's Box and Unbox live on its own Shadow Links page; these open it with that dialog
 * already showing.
 */
const SourceActions = ({
  step,
  linkPrincipal,
}: {
  step: Extract<SourceBoxStep, { kind: 'cloud' }>;
  linkPrincipal: string | undefined;
}) => {
  const openCluster = useShadowBoxStore((state) => state.openCluster);
  if (!openCluster) {
    return null;
  }
  const { box, source } = step;
  const open = (action?: 'box' | 'unbox') =>
    openCluster(source.clusterId, action ? `/shadowlinks?tab=source&action=${action}` : '/shadowlinks?tab=source');
  if (box.state !== 'unboxed' && box.state !== 'unboxing' && step.linkExempt === false && linkPrincipal) {
    const exempt = new URLSearchParams({ tab: 'source', action: 'exempt', principal: linkPrincipal });
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => openCluster(source.clusterId, `/shadowlinks?${exempt}`)}
          size="sm"
          testId="cutover-exempt-link"
          variant="primary"
        >
          Exempt {linkPrincipal}
        </Button>
        <Button onClick={() => open('unbox')} size="sm" testId="cutover-unbox-source" variant="outline">
          Unbox source
        </Button>
      </div>
    );
  }
  if (box.state === 'unboxed' || box.state === 'unboxing') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => open('box')} size="sm" testId="cutover-open-source" variant="primary">
          Box {source.clusterName}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => open()} size="sm" testId="cutover-open-source" variant="outline">
        Open {source.clusterName}
      </Button>
      <Button onClick={() => open('unbox')} size="sm" testId="cutover-unbox-source" variant="outline">
        Unbox source
      </Button>
    </div>
  );
};

const CloudBoxStep = ({
  step,
  linkPrincipal,
}: {
  step: Extract<SourceBoxStep, { kind: 'cloud' }>;
  linkPrincipal: string | undefined;
}) => {
  const now = useNow();
  const { box, source } = step;
  const since = box.stateChangedAt ? new Date(box.stateChangedAt) : undefined;

  return (
    <>
      <Dl className="my-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-body-sm">
        <Dt className="font-normal text-muted-foreground">Source cluster</Dt>
        <Dd>{source.clusterName}</Dd>
        <Dt className="font-normal text-muted-foreground">Box</Dt>
        <Dd className="flex flex-wrap items-center gap-2">
          <ShadowBoxStateBadge phase={box.state} testId="cutover-source-box-state" />
          {since ? <span className="text-muted-foreground">for {formatBoxDuration(now - since.getTime())}</span> : null}
        </Dd>
        <Dt className="font-normal text-muted-foreground">Link user</Dt>
        <Dd className="flex flex-wrap items-center gap-2">
          <span className={linkPrincipal ? 'font-mono' : 'text-muted-foreground'}>{linkPrincipal ?? 'Unknown'}</span>
          <ExemptBadge exempt={step.linkExempt} />
        </Dd>
      </Dl>
      <LinkAccessNote linkPrincipal={linkPrincipal} step={step} />
      {box.state === 'boxing' ? (
        <p className="text-body-sm text-muted-foreground">
          The source’s brokers are still applying the box. Until every broker confirms, the ones that haven’t applied it
          yet still accept writes.
        </p>
      ) : null}
      <SourceActions linkPrincipal={linkPrincipal} step={step} />
    </>
  );
};

const ManualBoxStep = ({
  step,
  linkPrincipal,
  onConfirmChange,
}: {
  step: Extract<SourceBoxStep, { kind: 'manual' }>;
  linkPrincipal: string | undefined;
  onConfirmChange: (confirmed: boolean) => void;
}) => (
  <>
    <p className="text-body">{MANUAL_REASON[step.reason]}</p>
    {step.source?.kind === 'external' ? (
      <p className="text-body-sm text-muted-foreground">
        Source: <span className="font-mono">{step.source.bootstrapServers.join(', ')}</span>
      </p>
    ) : null}
    <SimpleCodeBlock
      code={adminApiCommands(linkPrincipal)}
      language="bash"
      testId="cutover-admin-api-commands"
      width="full"
    />
    <div className="flex items-start gap-2">
      <Checkbox
        checked={step.confirmed}
        id="cutover-source-boxed-confirmation"
        onCheckedChange={(checked) => onConfirmChange(checked === true)}
        testId="cutover-source-boxed-confirmation"
      />
      <Label className="font-normal" htmlFor="cutover-source-boxed-confirmation">
        The source cluster reports Boxed
      </Label>
    </div>
    <p className="text-body-sm text-muted-foreground">
      This is your confirmation, not a status Console has read, so make sure the box is in place before you fail over.
    </p>
  </>
);

const BoxStepBody = ({
  step,
  linkPrincipal,
  onConfirmChange,
}: {
  step: SourceBoxStep;
  linkPrincipal: string | undefined;
  onConfirmChange: (confirmed: boolean) => void;
}) => {
  if (step.kind === 'loading') {
    return (
      <p className="flex items-center gap-2 text-body text-muted-foreground" data-testid="cutover-box-loading">
        <Spinner className="size-4" />
        {step.source ? `Reading the box on ${step.source.clusterName}…` : 'Finding the cluster this link reads from…'}
      </p>
    );
  }
  if (step.kind === 'cloud') {
    return <CloudBoxStep linkPrincipal={linkPrincipal} step={step} />;
  }
  return <ManualBoxStep linkPrincipal={linkPrincipal} onConfirmChange={onConfirmChange} step={step} />;
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

const LAG_NOTE: Partial<Record<LagStep['status'], string>> = {
  'waiting-for-box': 'Lag can still grow until the source is boxed, because producers can keep writing there.',
  blocked: 'The source’s box blocks this link’s reads, so lag can’t drain until the link’s user is exempt.',
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
      Waiting for the box
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

const DONE_BADGE = (
  <StatusBadge size="sm" variant="success">
    Done
  </StatusBadge>
);

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
      <div className="flex flex-col gap-2 text-body" data-testid="cutover-done">
        <p>
          {lag.faulted.length > 0
            ? `${linkName} has failed over, ${leftBehind},`
            : `Every topic of ${linkName} has failed over,`}{' '}
          and {clusterName} accepts writes. Next:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Repoint producers and consumers to {clusterName}.</li>
          <li>Leave {sourceName} boxed until they have moved, so nothing writes to it by mistake.</li>
          <li>To fail back later, unbox {sourceName} first: a boxed cluster also rejects a shadow link’s writes.</li>
        </ul>
      </div>
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
        After failover, repoint clients to {clusterName} and re-create any Redpanda Connect pipelines there. If{' '}
        {sourceName} is down and can’t be boxed, use Fail over all topics at the top of the page instead.
      </p>
    </>
  );
};

type CutoverTabProps = {
  shadowLink: UnifiedShadowLink;
  readiness: CutoverReadiness;
  linkPrincipal: string | undefined;
  onManualConfirmChange: (confirmed: boolean) => void;
  onRetryTopics: () => void;
  onFailoverAll: () => void;
  isFailingOver: boolean;
};

export const CutoverTab = ({
  shadowLink,
  readiness,
  linkPrincipal,
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
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading-sm">Cut over from {sourceName}</h2>
          <p className="text-body text-muted-foreground">
            Move clients to {clusterName} without losing writes. Each step unlocks when the one before it is done, and
            nothing here runs on its own.
          </p>
        </div>
        <ol className="flex flex-col">
          <Step
            index={1}
            state={states.box}
            status={states.box === 'done' ? DONE_BADGE : null}
            testId="cutover-step-box"
            title="Box the source cluster"
          >
            <BoxStepBody linkPrincipal={linkPrincipal} onConfirmChange={onManualConfirmChange} step={box} />
          </Step>
          <Step
            index={2}
            state={states.lag}
            status={lagBadge(lag, failover.done)}
            testId="cutover-step-lag"
            title="Wait for sync lag to reach zero"
          >
            <LagStepBody failedOver={failover.done} lag={lag} onRetry={onRetryTopics} />
          </Step>
          <Step
            index={3}
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
        </ol>
      </CardContent>
    </Card>
  );
};
