/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  type CutoverReadiness,
  getBoxProgress,
  isSourceBoxReady,
  type LagStep,
  pausedTopicsReason,
  topicsSubject,
} from './cutover-model';

type CheckStatus = 'ready' | 'not-ready' | 'unknown';

const CHECK_ICON: Record<CheckStatus, ReactNode> = {
  ready: <CircleCheckIcon aria-label="Ready" className="mt-0.5 size-4 shrink-0 text-success" />,
  'not-ready': <CircleAlertIcon aria-label="Not ready" className="mt-0.5 size-4 shrink-0 text-warning" />,
  unknown: <CircleDashedIcon aria-label="Check yourself" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
};

type Check = { id: string; status: CheckStatus; text: string };

const sourceCheck = (readiness: CutoverReadiness): Check => {
  if (readiness.box.kind === 'loading') {
    return {
      id: 'source',
      status: 'unknown',
      text: 'Stop writes to the source cluster first, by boxing it or stopping its producers, so nothing is left behind.',
    };
  }
  if (getBoxProgress(readiness.box) === 'blocked') {
    return {
      id: 'source',
      status: 'not-ready',
      text: 'The source cluster is boxed, but its box blocks this link’s reads, so the link can’t finish syncing.',
    };
  }
  if (isSourceBoxReady(readiness.box)) {
    return {
      id: 'source',
      status: 'ready',
      text:
        readiness.box.kind === 'manual'
          ? 'You confirmed the source cluster is boxed.'
          : 'The source cluster is boxed, so nothing new is written there.',
    };
  }
  if (readiness.box.kind === 'cloud') {
    return {
      id: 'source',
      status: 'not-ready',
      text:
        readiness.box.box.state === 'boxing'
          ? 'The source cluster is still being boxed. Brokers that haven’t applied it yet accept writes that would never reach this cluster.'
          : 'The source cluster isn’t boxed. Writes it accepts after failover never reach this cluster.',
    };
  }
  return {
    id: 'source',
    status: 'unknown',
    text: 'Console can’t read the source cluster’s box. Make sure it’s boxed, or that its producers are stopped.',
  };
};

const behindCheck = (behind: LagStep['behind'], topicName: string | undefined): Check => ({
  id: 'lag',
  status: 'not-ready',
  text: topicName
    ? `${topicName} is still behind, so its newest records won’t be on this cluster.`
    : `${behind.length} ${behind.length === 1 ? 'topic is' : 'topics are'} still behind, so their newest records won’t be on this cluster.`,
});

const faultedCheck = (faulted: string[], topicName: string | undefined): Check => ({
  id: 'lag',
  status: 'not-ready',
  text: `${topicName ? `${topicName} has` : topicsSubject(faulted, 'has', 'have')} faulted, so ${faulted.length === 1 ? 'it' : 'they'} may be missing records.`,
});

const lagCheck = ({ lag }: CutoverReadiness, topicName: string | undefined, checking: boolean): Check => {
  if (lag.status === 'loading' || checking) {
    return { id: 'lag', status: 'unknown', text: 'Checking each topic’s lag…' };
  }
  if (lag.status === 'unavailable') {
    return {
      id: 'lag',
      status: 'unknown',
      text: 'Console couldn’t read the topics’ lag. Check that every topic has caught up.',
    };
  }
  const behind = topicName ? lag.behind.filter((topic) => topic.topicName === topicName) : lag.behind;
  if (behind.length > 0) {
    return behindCheck(behind, topicName);
  }
  const faulted = topicName ? lag.faulted.filter((name) => name === topicName) : lag.faulted;
  if (faulted.length > 0) {
    return faultedCheck(faulted, topicName);
  }
  if (lag.stale) {
    return {
      id: 'lag',
      status: 'unknown',
      text: 'Console couldn’t refresh the topics’ lag, so the last reading may be out of date. Check that every topic has caught up.',
    };
  }
  return {
    id: 'lag',
    status: 'ready',
    text: topicName ? `${topicName} has caught up.` : 'Every topic has caught up.',
  };
};

/** Fail over all topics is refused while any topic is paused, so say so before the request fails. */
const pausedCheck = ({ lag }: CutoverReadiness): Check | undefined => {
  if (lag.paused.length === 0) {
    return;
  }
  return { id: 'paused', status: 'not-ready', text: pausedTopicsReason(lag.paused) };
};

const failoverLabel = (isLoading: boolean | undefined, unsafe: boolean) => {
  if (isLoading) {
    return 'Failing over…';
  }
  return unsafe ? 'Fail over anyway' : 'Fail over';
};

type FailoverDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicName?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  /** What Console knows about the source's box and each topic's lag; only while shadow boxing is on. */
  readiness?: CutoverReadiness;
  /** A fresh read of the topics' lag is on its way. */
  checkingLag?: boolean;
};

export const FailoverDialog = (props: FailoverDialogProps) =>
  props.readiness ? (
    <CutoverFailoverDialog {...props} readiness={props.readiness} />
  ) : (
    <LegacyFailoverDialog {...props} />
  );

/**
 * Failover stays available even when the checks fail: in a real outage the source can't be boxed,
 * and failing over anyway is the point. The checks follow the safe order: stop writes, let lag
 * drain, fail over, then repoint clients.
 */
const CutoverFailoverDialog = ({
  open,
  onOpenChange,
  topicName,
  onConfirm,
  isLoading,
  readiness,
  checkingLag = false,
}: FailoverDialogProps & { readiness: CutoverReadiness }) => {
  if (!topicName && (readiness.failover.done || readiness.failover.inProgress > 0)) {
    return <FailoverUnderWayDialog onOpenChange={onOpenChange} open={open} readiness={readiness} />;
  }
  const paused = topicName ? undefined : pausedCheck(readiness);
  const checks = [sourceCheck(readiness), lagCheck(readiness, topicName, checkingLag), ...(paused ? [paused] : [])];
  const unsafe = checks.some((check) => check.status === 'not-ready');

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent testId="failover-dialog">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>{topicName ? `Fail over ${topicName}?` : 'Fail over all topics?'}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <div className="flex flex-col gap-4">
              <p className="text-body">
                {topicName
                  ? `This makes ${topicName} writable on this cluster and stops syncing it from the source cluster. You can’t undo it.`
                  : 'This makes every shadow topic writable on this cluster and stops syncing them from the source cluster. You can’t undo it.'}
              </p>
              <div>
                <p className="font-semibold text-body">Before you fail over</p>
                <ul className="mt-2 flex flex-col gap-1.5" data-testid="failover-readiness">
                  {checks.map((check) => (
                    <li
                      className="flex items-start gap-2 text-body"
                      data-status={check.status}
                      data-testid={`failover-check-${check.id}`}
                      key={check.id}
                    >
                      {CHECK_ICON[check.status]}
                      {check.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-body">After you fail over</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li className="text-body">Repoint producers and consumers to this cluster.</li>
                  <li className="text-body">Re-create any Redpanda Connect pipelines on this cluster.</li>
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading || checkingLag}
            onClick={onConfirm}
            testId="confirm-failover"
            variant="destructive"
          >
            {failoverLabel(isLoading, unsafe)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** Nothing left to fail over, or a failover still running: say so instead of offering another. */
const FailoverUnderWayDialog = ({
  open,
  onOpenChange,
  readiness,
}: Pick<FailoverDialogProps, 'open' | 'onOpenChange'> & { readiness: CutoverReadiness }) => {
  const { inProgress, done } = readiness.failover;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent testId="failover-dialog">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>{done ? 'Every topic has failed over' : 'Failover in progress'}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <p className="text-body" data-testid="failover-under-way">
              {done
                ? 'There’s nothing left to fail over. Repoint producers and consumers to this cluster if you haven’t.'
                : `${inProgress} ${inProgress === 1 ? 'topic is' : 'topics are'} still failing over. Wait for ${inProgress === 1 ? 'it' : 'them'} to finish before you repoint clients.`}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel testId="failover-under-way-close">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** The dialog as it was before shadow boxing, shown while that feature is off. */
const LegacyFailoverDialog = ({ open, onOpenChange, topicName, onConfirm, isLoading }: FailoverDialogProps) => {
  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Failover</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="text-body">
              {topicName
                ? `This action will promote the shadow topic "${topicName}" to an active state, allowing writes to this cluster.`
                : 'This action will promote all shadow topics to an active state, allowing writes to this cluster.'}
            </div>
            <div>
              <div className="font-semibold text-body">Before proceeding, ensure:</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <div className="text-body">
                    All applications and clients have been updated to point to this cluster
                  </div>
                </li>
                <li>
                  <div className="text-body">Any Redpanda Connect pipelines have been re-created on this cluster</div>
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isLoading} onClick={onConfirm} testId="confirm-failover">
            {isLoading ? 'Failing over...' : 'Confirm Failover'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
