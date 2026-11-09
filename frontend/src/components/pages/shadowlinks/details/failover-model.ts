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

import { isBlockingPhase, type LinkIdentity, linkCanRead } from 'components/cluster-fence/cluster-fence-model';
import type { ShadowLinkPeerFence, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import type { UnifiedShadowLink } from '../model';

export type FailoverTopic = { topicName: string; state: ShadowTopicState; totalLag: bigint };

export type CloudSource = Extract<ShadowLinkSource, { kind: 'cloud' }>;

type PeerUnavailableReason = Extract<ShadowLinkPeerFence, { status: 'unavailable' }>['reason'];

type NoFenceReason = 'unsupported' | 'inactive' | 'forbidden';

/** The source can't be fenced, or this viewer can't read its fence: no guided failover then. */
const isNoFenceReason = (reason: PeerUnavailableReason): reason is NoFenceReason =>
  reason === 'unsupported' || reason === 'inactive' || reason === 'forbidden';

/** Why a fence that was readable earlier in this visit can't be read now, when the host says. */
export type TransientReason = Exclude<PeerUnavailableReason, NoFenceReason>;

/**
 * Where the source's fence stands, from this shadow cluster's point of view. Only Cloud can read a
 * source cluster's fence, so the Failover tab exists only once it has.
 */
export type SourceFenceStep =
  /** Without a source, the host is still working out which cluster the link reads from. */
  | { kind: 'loading'; source: CloudSource | undefined }
  /** Read earlier in this visit, but not right now, such as while the source has no controller leader. */
  | { kind: 'unreadable'; source: CloudSource; reason: TransientReason }
  | {
      kind: 'cloud';
      source: CloudSource;
      fence: Extract<ShadowLinkPeerFence, { status: 'known' }>;
      fenced: boolean;
      /**
       * Whether the source's saved settings let this link fetch once fenced. They exist before the
       * first Fence, so this is known in every phase. Undefined when Console can't tell, as for mTLS.
       */
      linkExempt: boolean | undefined;
    };

export type LagStep = {
  /** `loading` and `unavailable` mean the topics haven't loaded, so nothing is known about lag. */
  status: 'loading' | 'unavailable' | 'caught-up' | 'draining' | 'faulted' | 'waiting-for-fence' | 'blocked';
  /** The latest read failed, so these counts are the last ones Console had and may be out of date. */
  stale: boolean;
  /** Topics still syncing, so the ones a link failover converts. */
  syncing: number;
  caughtUp: number;
  behind: { topicName: string; lag: bigint }[];
  paused: string[];
  faulted: string[];
};

type FailoverStep = {
  /** Every topic has failed over, apart from faulted ones, which a failover leaves as they are. */
  done: boolean;
  /** Topics a failover has started on but not finished. */
  inProgress: number;
  /** Safe to fail over: the source is fenced and every topic has caught up. */
  ready: boolean;
  /** Why it isn't safe yet, when it isn't. */
  reason?: string;
};

export type FailoverReadiness = {
  fence: SourceFenceStep;
  lag: LagStep;
  failover: FailoverStep;
};

const FAILED_OVER_STATES = new Set([ShadowTopicState.FAILED_OVER, ShadowTopicState.PROMOTED]);
const FAILING_OVER_STATES = new Set([ShadowTopicState.FAILING_OVER, ShadowTopicState.PROMOTING]);

/**
 * How the link authenticates to its source: its SASL user, or a client certificate (whose principal
 * the source's mapping rules decide), or neither.
 */
export const getLinkIdentity = (link: UnifiedShadowLink | undefined): LinkIdentity => {
  const clientOptions = link?.configurations?.clientOptions;
  const username = clientOptions?.authenticationConfiguration?.authentication?.value.username;
  if (username) {
    return { authentication: 'sasl', principal: username };
  }
  const tls = clientOptions?.tlsSettings;
  const certificate =
    tls?.tlsSettings?.case === 'tlsFileSettings' ? tls.tlsSettings.value.certPath : tls?.tlsSettings?.value.cert;
  if (tls?.enabled && certificate) {
    return { authentication: 'mtls' };
  }
  return link ? { authentication: 'none' } : {};
};

const cloudSourceStep = (
  source: CloudSource,
  link: LinkIdentity,
  lastKnown: CloudSource | undefined
): SourceFenceStep | undefined => {
  if (source.fence.status === 'loading') {
    return { kind: 'loading', source };
  }
  if (source.fence.status === 'known') {
    const { fence } = source;
    return { kind: 'cloud', source, fence, fenced: fence.state === 'fenced', linkExempt: linkCanRead(fence, link) };
  }
  const { reason } = source.fence;
  if (isNoFenceReason(reason) || !lastKnown) {
    return;
  }
  return { kind: 'unreadable', source, reason };
};

/**
 * Undefined when there's no guided failover: no host, a source outside Cloud, one that can't be
 * fenced or whose fence this viewer can't read, or one whose fence hasn't been read in this visit
 * (a source already down when the page opened). A fence read earlier in the visit (`lastKnown`)
 * keeps it through a passing failure, which reads as `unreadable`.
 */
export const getSourceFenceStep = ({
  source,
  link,
  resolving,
  lastKnown,
}: {
  source: ShadowLinkSource | undefined;
  link: LinkIdentity;
  /** The host is still resolving links, so a missing source may yet turn up. */
  resolving: boolean;
  /** The source as it was last read with a known fence during this visit. */
  lastKnown?: CloudSource;
}): SourceFenceStep | undefined => {
  if (source?.kind === 'cloud') {
    return cloudSourceStep(source, link, lastKnown);
  }
  if (source !== undefined) {
    return;
  }
  if (resolving) {
    return { kind: 'loading', source: lastKnown };
  }
  return lastKnown ? { kind: 'unreadable', source: lastKnown, reason: undefined } : undefined;
};

/** Fenced, and still readable by this link: a fence that blocks the link would leave its lag stuck. */
export const isSourceFenceReady = (step: SourceFenceStep): boolean =>
  step.kind === 'cloud' && step.fenced && step.linkExempt !== false;

/** `blocked` when the fence is in place but stops this link reading, so its lag can't drain. */
type FenceProgress = 'waiting' | 'ready' | 'blocked';

export const getFenceProgress = (step: SourceFenceStep): FenceProgress => {
  if (isSourceFenceReady(step)) {
    return 'ready';
  }
  return step.kind === 'cloud' && step.fenced ? 'blocked' : 'waiting';
};

const byLagDescending = (a: { lag: bigint }, b: { lag: bigint }) => {
  if (a.lag === b.lag) {
    return 0;
  }
  return a.lag > b.lag ? -1 : 1;
};

const lagStatus = (behind: number, faulted: number, fence: FenceProgress): LagStep['status'] => {
  if (fence === 'waiting') {
    return 'waiting-for-fence';
  }
  if (fence === 'blocked') {
    return 'blocked';
  }
  if (behind > 0) {
    return 'draining';
  }
  return faulted > 0 ? 'faulted' : 'caught-up';
};

/** `topics` is undefined until they load; `failed` says the latest read didn't succeed. */
export const getLagStep = (topics: FailoverTopic[] | undefined, fence: FenceProgress, failed = false): LagStep => {
  if (topics === undefined) {
    return {
      status: failed ? 'unavailable' : 'loading',
      stale: false,
      syncing: 0,
      caughtUp: 0,
      behind: [],
      paused: [],
      faulted: [],
    };
  }
  const syncingTopics = topics.filter(
    (topic) => topic.state === ShadowTopicState.ACTIVE || topic.state === ShadowTopicState.PAUSED
  );
  const behind = syncingTopics
    .filter((topic) => topic.totalLag > 0n)
    .map((topic) => ({ topicName: topic.topicName, lag: topic.totalLag }))
    .sort(byLagDescending);
  const faulted = topics.filter((topic) => topic.state === ShadowTopicState.FAULTED).map((topic) => topic.topicName);
  return {
    status: lagStatus(behind.length, faulted.length, fence),
    stale: failed,
    syncing: syncingTopics.length,
    caughtUp: syncingTopics.length - behind.length,
    behind,
    paused: topics.filter((topic) => topic.state === ShadowTopicState.PAUSED).map((topic) => topic.topicName),
    faulted,
  };
};

/** "orders-events is" for one topic, "3 topics are" for more. */
export const topicsSubject = (names: readonly string[], one: string, many: string) =>
  names.length === 1 ? `${names[0]} ${one}` : `${names.length} topics ${many}`;

/** Why Fail over all topics is refused while a topic is paused, worded the same wherever it shows. */
export const pausedTopicsReason = (paused: readonly string[]) =>
  `${topicsSubject(paused, 'is', 'are')} paused, and Fail over all topics is refused while any topic is paused. Resume ${paused.length === 1 ? 'it' : 'them'} first.`;

const sourceFenceReason = (fence: SourceFenceStep): string | undefined => {
  if (fence.kind === 'unreadable') {
    return 'Not ready until Console can read the source’s fence again.';
  }
  const progress = getFenceProgress(fence);
  if (progress === 'blocked') {
    return 'Not ready until the source’s fence lets this link read, so its lag can reach zero.';
  }
  return progress === 'ready' ? undefined : 'Not ready until the source cluster reports Fenced.';
};

const lagReason = (lag: LagStep): string | undefined => {
  if (lag.stale) {
    return 'Couldn’t refresh the topics’ lag, so Console can’t confirm they’ve caught up.';
  }
  if (lag.paused.length > 0) {
    return pausedTopicsReason(lag.paused);
  }
  if (lag.behind.length > 0) {
    return 'Not ready until every topic has zero lag.';
  }
  if (lag.faulted.length > 0) {
    const one = lag.faulted.length === 1;
    return `${topicsSubject(lag.faulted, 'has', 'have')} faulted, so ${one ? 'it' : 'they'} may be missing records. Fix ${one ? 'it' : 'them'} first, or fail over anyway.`;
  }
};

const failoverReason = (
  topics: FailoverTopic[] | undefined,
  topicsFailed: boolean,
  fence: SourceFenceStep,
  lag: LagStep
): string | undefined => {
  if (topics === undefined) {
    return topicsFailed
      ? 'Couldn’t load the link’s topics, so Console can’t check their lag.'
      : 'Loading the link’s topics.';
  }
  return sourceFenceReason(fence) ?? lagReason(lag);
};

export const getFailoverReadiness = ({
  topics,
  topicsFailed = false,
  fence,
}: {
  /** The last ones read, even when a later read failed. */
  topics: FailoverTopic[] | undefined;
  /** The latest read of the topics failed. */
  topicsFailed?: boolean;
  fence: SourceFenceStep;
}): FailoverReadiness => {
  const lag = getLagStep(topics, getFenceProgress(fence), topicsFailed);
  const inProgress = topics?.filter((topic) => FAILING_OVER_STATES.has(topic.state)).length ?? 0;
  const done =
    (topics?.some((topic) => FAILED_OVER_STATES.has(topic.state)) ?? false) &&
    (topics ?? []).every((topic) => FAILED_OVER_STATES.has(topic.state) || topic.state === ShadowTopicState.FAULTED);
  let reason: string | undefined;
  if (done) {
    reason = 'Every topic has already failed over.';
  } else if (inProgress > 0) {
    reason = `Failing over ${inProgress} ${inProgress === 1 ? 'topic' : 'topics'}…`;
  } else {
    reason = failoverReason(topics, topicsFailed, fence, lag);
  }

  return { fence, lag, failover: { done, inProgress, ready: reason === undefined, reason } };
};

export type StepState = 'done' | 'current' | 'pending' | 'attention';

type FailoverStepId = 'settings' | 'fence' | 'fenced' | 'lag' | 'failover' | 'clients';

type SourceStepStates = Pick<Record<FailoverStepId, StepState>, 'settings' | 'fence' | 'fenced'>;

/** The three steps on the source, as its fence reports them. */
const getSourceStepStates = (fence: SourceFenceStep): SourceStepStates => {
  if (fence.kind !== 'cloud') {
    return { settings: 'current', fence: 'pending', fenced: 'pending' };
  }
  /** A link Console can't check, such as one that uses mTLS, isn't done: the operator still has to look. */
  const settings = fence.linkExempt === true ? 'done' : 'attention';
  if (isBlockingPhase(fence.fence.state)) {
    return { settings, fence: 'done', fenced: fence.fenced ? 'done' : 'current' };
  }
  return { settings, fence: fence.linkExempt === false ? 'pending' : 'current', fenced: 'pending' };
};

/**
 * The reference's six steps, three on the source and three here. Each unlocks when the one before
 * it is done; a finished failover marks the first five done and makes moving clients current. A
 * settings problem shows on step 1 whatever the phase, since the settings exist before Fence.
 */
export const getFailoverStepStates = ({
  fence,
  lag,
  failover,
}: FailoverReadiness): Record<FailoverStepId, StepState> => {
  if (failover.done) {
    return { settings: 'done', fence: 'done', fenced: 'done', lag: 'done', failover: 'done', clients: 'current' };
  }
  const sourceSteps = getSourceStepStates(fence);
  if (!isSourceFenceReady(fence)) {
    return { ...sourceSteps, lag: 'pending', failover: 'pending', clients: 'pending' };
  }
  const lagDone = lag.status === 'caught-up' && !lag.stale;
  return {
    ...sourceSteps,
    lag: lagDone ? 'done' : 'current',
    failover: lagDone ? 'current' : 'pending',
    clients: 'pending',
  };
};
