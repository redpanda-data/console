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
  isBlockingPhase,
  type LinkIdentity,
  linkCanRead,
  type StepState,
} from 'components/shadow-box/shadow-box-model';
import type { ShadowLinkPeerBox, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import type { UnifiedShadowLink } from '../model';

export type FailoverTopic = { topicName: string; state: ShadowTopicState; totalLag: bigint };

export type CloudSource = Extract<ShadowLinkSource, { kind: 'cloud' }>;

type PeerUnavailableReason = Extract<ShadowLinkPeerBox, { status: 'unavailable' }>['reason'];

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
export type SourceBoxStep =
  /** Without a source, the host is still working out which cluster the link reads from. */
  | { kind: 'loading'; source: CloudSource | undefined }
  /** Read earlier in this visit, but not right now, such as while the source has no controller leader. */
  | { kind: 'unreadable'; source: CloudSource; reason: TransientReason }
  | {
      kind: 'cloud';
      source: CloudSource;
      box: Extract<ShadowLinkPeerBox, { status: 'known' }>;
      boxed: boolean;
      /**
       * Whether the source's saved settings let this link fetch once fenced. They exist before the
       * first Fence, so this is known in every phase. Undefined when Console can't tell, as for mTLS.
       */
      linkExempt: boolean | undefined;
    };

export type LagStep = {
  /** `loading` and `unavailable` mean the topics haven't loaded, so nothing is known about lag. */
  status: 'loading' | 'unavailable' | 'caught-up' | 'draining' | 'faulted' | 'waiting-for-box' | 'blocked';
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
  box: SourceBoxStep;
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
): SourceBoxStep | undefined => {
  if (source.box.status === 'loading') {
    return { kind: 'loading', source };
  }
  if (source.box.status === 'known') {
    const { box } = source;
    return { kind: 'cloud', source, box, boxed: box.state === 'boxed', linkExempt: linkCanRead(box, link) };
  }
  const { reason } = source.box;
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
export const getSourceBoxStep = ({
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
}): SourceBoxStep | undefined => {
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
export const isSourceBoxReady = (step: SourceBoxStep): boolean =>
  step.kind === 'cloud' && step.boxed && step.linkExempt !== false;

/** `blocked` when the fence is in place but stops this link reading, so its lag can't drain. */
type BoxProgress = 'waiting' | 'ready' | 'blocked';

export const getBoxProgress = (step: SourceBoxStep): BoxProgress => {
  if (isSourceBoxReady(step)) {
    return 'ready';
  }
  return step.kind === 'cloud' && step.boxed ? 'blocked' : 'waiting';
};

const byLagDescending = (a: { lag: bigint }, b: { lag: bigint }) => {
  if (a.lag === b.lag) {
    return 0;
  }
  return a.lag > b.lag ? -1 : 1;
};

const lagStatus = (behind: number, faulted: number, box: BoxProgress): LagStep['status'] => {
  if (box === 'waiting') {
    return 'waiting-for-box';
  }
  if (box === 'blocked') {
    return 'blocked';
  }
  if (behind > 0) {
    return 'draining';
  }
  return faulted > 0 ? 'faulted' : 'caught-up';
};

/** `topics` is undefined until they load; `failed` says the latest read didn't succeed. */
export const getLagStep = (topics: FailoverTopic[] | undefined, box: BoxProgress, failed = false): LagStep => {
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
    status: lagStatus(behind.length, faulted.length, box),
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

const sourceBoxReason = (box: SourceBoxStep): string | undefined => {
  if (box.kind === 'unreadable') {
    return 'Not ready until Console can read the source’s fence again.';
  }
  const progress = getBoxProgress(box);
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
  box: SourceBoxStep,
  lag: LagStep
): string | undefined => {
  if (topics === undefined) {
    return topicsFailed
      ? 'Couldn’t load the link’s topics, so Console can’t check their lag.'
      : 'Loading the link’s topics.';
  }
  return sourceBoxReason(box) ?? lagReason(lag);
};

export const getFailoverReadiness = ({
  topics,
  topicsFailed = false,
  box,
}: {
  /** The last ones read, even when a later read failed. */
  topics: FailoverTopic[] | undefined;
  /** The latest read of the topics failed. */
  topicsFailed?: boolean;
  box: SourceBoxStep;
}): FailoverReadiness => {
  const lag = getLagStep(topics, getBoxProgress(box), topicsFailed);
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
    reason = failoverReason(topics, topicsFailed, box, lag);
  }

  return { box, lag, failover: { done, inProgress, ready: reason === undefined, reason } };
};

type FailoverStepId = 'settings' | 'box' | 'boxed' | 'lag' | 'failover' | 'clients';

type SourceStepStates = Pick<Record<FailoverStepId, StepState>, 'settings' | 'box' | 'boxed'>;

/** The three steps on the source, as its fence reports them. */
const getSourceStepStates = (box: SourceBoxStep): SourceStepStates => {
  if (box.kind !== 'cloud') {
    return { settings: 'current', box: 'pending', boxed: 'pending' };
  }
  /** A link Console can't check, such as one that uses mTLS, isn't done: the operator still has to look. */
  const settings = box.linkExempt === true ? 'done' : 'attention';
  if (isBlockingPhase(box.box.state)) {
    return { settings, box: 'done', boxed: box.boxed ? 'done' : 'current' };
  }
  return { settings, box: box.linkExempt === false ? 'pending' : 'current', boxed: 'pending' };
};

/**
 * The reference's six steps, three on the source and three here. Each unlocks when the one before
 * it is done; a finished failover marks the first five done and makes moving clients current. A
 * settings problem shows on step 1 whatever the phase, since the settings exist before Fence.
 */
export const getFailoverStepStates = ({ box, lag, failover }: FailoverReadiness): Record<FailoverStepId, StepState> => {
  if (failover.done) {
    return { settings: 'done', box: 'done', boxed: 'done', lag: 'done', failover: 'done', clients: 'current' };
  }
  const sourceSteps = getSourceStepStates(box);
  if (!isSourceBoxReady(box)) {
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
