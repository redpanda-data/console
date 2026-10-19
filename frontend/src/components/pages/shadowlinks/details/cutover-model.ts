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

import { type LinkIdentity, linkCanRead } from 'components/shadow-box/shadow-box-model';
import type { ShadowLinkPeerBox, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import type { UnifiedShadowLink } from '../model';

export type CutoverTopic = { topicName: string; state: ShadowTopicState; totalLag: bigint };

/**
 * Where the source's box stands, from this shadow cluster's point of view. Only Cloud can read a
 * source cluster's box; everywhere else the operator boxes it by hand and confirms here.
 */
export type SourceBoxStep =
  /** Without a source, the host is still working out which cluster the link reads from. */
  | { kind: 'loading'; source: Extract<ShadowLinkSource, { kind: 'cloud' }> | undefined }
  | {
      kind: 'cloud';
      source: Extract<ShadowLinkSource, { kind: 'cloud' }>;
      box: Extract<ShadowLinkPeerBox, { status: 'known' }>;
      boxed: boolean;
      /**
       * Whether the source's saved settings let this link fetch once boxed. They exist before the
       * first Box, so this is known in every phase. Undefined when Console can't tell, as for mTLS.
       */
      linkExempt: boolean | undefined;
    }
  | {
      kind: 'manual';
      /** Why Console can't read the source's box. */
      reason: 'external' | 'unavailable' | 'unresolved' | 'standalone';
      source: ShadowLinkSource | undefined;
      confirmed: boolean;
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
  enabled: boolean;
  /** Why Fail over is unavailable, when it is. */
  reason?: string;
};

/** What the page knows about which cluster each link reads from. */
export type TopologyState = 'none' | 'resolving' | 'resolved';

export type CutoverReadiness = {
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

const manualReason = (
  source: ShadowLinkSource | undefined,
  topology: TopologyState
): Extract<SourceBoxStep, { kind: 'manual' }>['reason'] => {
  if (source?.kind === 'external') {
    return 'external';
  }
  return topology === 'resolved' ? 'unresolved' : 'standalone';
};

export const getSourceBoxStep = ({
  source,
  link,
  topology,
  manuallyConfirmed,
}: {
  source: ShadowLinkSource | undefined;
  link: LinkIdentity;
  /** `none` when no host shares its topology: standalone Console, or a host that predates it. */
  topology: TopologyState;
  manuallyConfirmed: boolean;
}): SourceBoxStep => {
  if (source?.kind === 'cloud') {
    if (source.box.status === 'loading') {
      return { kind: 'loading', source };
    }
    if (source.box.status === 'known') {
      const { box } = source;
      return { kind: 'cloud', source, box, boxed: box.state === 'boxed', linkExempt: linkCanRead(box, link) };
    }
    return { kind: 'manual', reason: 'unavailable', source, confirmed: manuallyConfirmed };
  }
  if (source === undefined && topology === 'resolving') {
    return { kind: 'loading', source: undefined };
  }
  return { kind: 'manual', reason: manualReason(source, topology), source, confirmed: manuallyConfirmed };
};

/** Boxed, and still readable by this link: a box that blocks the link would leave its lag stuck. */
export const isSourceBoxReady = (step: SourceBoxStep): boolean =>
  (step.kind === 'cloud' && step.boxed && step.linkExempt !== false) || (step.kind === 'manual' && step.confirmed);

/** `blocked` when the box is in place but stops this link reading, so its lag can't drain. */
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
export const getLagStep = (topics: CutoverTopic[] | undefined, box: BoxProgress, failed = false): LagStep => {
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
    .filter((topic) => topic.totalLag > BigInt(0))
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

/** Why Fail over all topics is locked while a topic is paused, worded the same wherever it shows. */
export const pausedTopicsReason = (paused: readonly string[]) =>
  `${topicsSubject(paused, 'is', 'are')} paused, and Fail over all topics is refused while any topic is paused. Resume ${paused.length === 1 ? 'it' : 'them'} first.`;

const sourceBoxReason = (box: SourceBoxStep): string | undefined => {
  const progress = getBoxProgress(box);
  if (progress === 'blocked') {
    return 'Available once the source’s box lets this link read, so its lag can reach zero.';
  }
  if (progress === 'ready') {
    return;
  }
  return box.kind === 'manual'
    ? 'Available once you confirm the source cluster is boxed.'
    : 'Available once the source cluster reports Boxed.';
};

const failoverReason = (
  topics: CutoverTopic[] | undefined,
  topicsFailed: boolean,
  box: SourceBoxStep,
  lag: LagStep
): string | undefined => {
  if (topics === undefined) {
    return topicsFailed
      ? 'Couldn’t load the link’s topics, so Console can’t check their lag.'
      : 'Loading the link’s topics.';
  }
  const boxReason = sourceBoxReason(box);
  if (boxReason) {
    return boxReason;
  }
  if (lag.stale) {
    return 'Couldn’t refresh the topics’ lag, so Console can’t confirm they’ve caught up.';
  }
  if (lag.paused.length > 0) {
    return pausedTopicsReason(lag.paused);
  }
  if (lag.behind.length > 0) {
    return 'Available when every topic has zero lag.';
  }
  if (lag.faulted.length > 0) {
    return `${topicsSubject(lag.faulted, 'has', 'have')} faulted, so ${lag.faulted.length === 1 ? 'it' : 'they'} may be missing records. Fix ${lag.faulted.length === 1 ? 'it' : 'them'}, or fail over anyway from the top of the page.`;
  }
};

export const getCutoverReadiness = ({
  topics,
  topicsFailed = false,
  box,
}: {
  /** The last ones read, even when a later read failed. */
  topics: CutoverTopic[] | undefined;
  /** The latest read of the topics failed. */
  topicsFailed?: boolean;
  box: SourceBoxStep;
}): CutoverReadiness => {
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

  return { box, lag, failover: { done, inProgress, enabled: reason === undefined, reason } };
};

export type CutoverStepState = 'done' | 'current' | 'pending' | 'attention';

export type CutoverStepId = 'settings' | 'box' | 'boxed' | 'lag' | 'failover' | 'clients';

/**
 * The reference's six steps, three on the source and three here. Each unlocks when the one before
 * it is done; a finished failover marks the first five done and makes moving clients current. A
 * settings problem shows on step 1 whatever the phase, since the settings exist before Box.
 */
export const getCutoverStepStates = ({
  box,
  lag,
  failover,
}: CutoverReadiness): Record<CutoverStepId, CutoverStepState> => {
  if (failover.done) {
    return { settings: 'done', box: 'done', boxed: 'done', lag: 'done', failover: 'done', clients: 'current' };
  }
  const states: Record<CutoverStepId, CutoverStepState> = {
    settings: 'current',
    box: 'pending',
    boxed: 'pending',
    lag: 'pending',
    failover: 'pending',
    clients: 'pending',
  };
  if (box.kind === 'manual') {
    if (box.confirmed) {
      states.settings = 'done';
      states.box = 'done';
      states.boxed = 'done';
    }
  } else if (box.kind === 'cloud') {
    const phase = box.box.state;
    const requested = phase === 'boxing' || phase === 'boxed';
    if (box.linkExempt === false) {
      states.settings = 'attention';
    } else {
      states.settings = 'done';
    }
    if (requested) {
      states.box = 'done';
      states.boxed = box.boxed ? 'done' : 'current';
    } else if (states.settings === 'done') {
      states.box = 'current';
    }
  }
  if (!isSourceBoxReady(box)) {
    return states;
  }
  const lagDone = lag.status === 'caught-up' && !lag.stale;
  states.lag = lagDone ? 'done' : 'current';
  states.failover = lagDone ? 'current' : 'pending';
  return states;
};
