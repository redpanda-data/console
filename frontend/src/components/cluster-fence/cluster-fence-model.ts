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

import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  type ClusterFence,
  ClusterFenceState,
  type GetClusterFenceStatusResponse,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

export type FencePhase = 'unfenced' | 'fencing' | 'fenced' | 'unfencing';

export const FENCE_PHASE_LABEL: Record<FencePhase, string> = {
  unfenced: 'Unfenced',
  fencing: 'Fencing',
  fenced: 'Fenced',
  unfencing: 'Unfencing',
};

const BEHIND_NOTICE_MS = 30 * 1000;

const PHASE_BY_STATE: Partial<Record<ClusterFenceState, FencePhase>> = {
  [ClusterFenceState.UNFENCED]: 'unfenced',
  [ClusterFenceState.FENCING]: 'fencing',
  [ClusterFenceState.FENCED]: 'fenced',
  [ClusterFenceState.UNFENCING]: 'unfencing',
};

/** Undefined for a state this version of Console doesn't know, which must never read as unfenced. */
export const toFencePhase = (state: ClusterFenceState | undefined) =>
  state === undefined ? undefined : PHASE_BY_STATE[state];

export const hasFenceActivity = (phase: FencePhase) => phase !== 'unfenced';

/**
 * Each broker starts blocking as soon as it picks up Fence, and stops as soon as it picks up Unfence,
 * so the cluster blocks while fencing and fenced. Console disables the writes a fence rejects in these
 * phases; while unfencing they stay enabled, since brokers accept them again as they pick up Unfence.
 */
export const isBlockingPhase = (phase: FencePhase) => phase === 'fencing' || phase === 'fenced';

export const isTransitionPhase = (phase: FencePhase) => phase === 'fencing' || phase === 'unfencing';

/** Fence while fencing or fenced changes nothing. */
export const canFenceFromPhase = (phase: FencePhase) => phase === 'unfenced' || phase === 'unfencing';

export type BrokerProgress = {
  nodeId: number;
  /** `confirmed` once its copy matches the cluster's fence in state and revision; either other status holds a move. */
  status: 'confirmed' | 'behind' | 'not-answering';
  copy?: {
    phase: FencePhase | undefined;
    revision: bigint;
    /** The read policy this broker enforces, which a settings change reaches one broker at a time. */
    readPolicy?: ReadPolicy;
  };
  /** Whether this broker rejects writes now. Undefined when it didn't answer. */
  blocks: boolean | undefined;
  /** As the broker reported it. Its wording varies, so show it, never match on it. */
  errorMessage?: string;
};

export const getBrokerProgress: (response: GetClusterFenceStatusResponse | undefined) => BrokerProgress[] = (
  response
) => {
  const fence = response?.fence;
  return (response?.brokers ?? []).map((broker): BrokerProgress => {
    if (!broker.fence) {
      return { nodeId: broker.nodeId, status: 'not-answering', blocks: undefined, errorMessage: broker.errorMessage };
    }
    const phase = toFencePhase(broker.fence.state);
    const confirmed =
      fence !== undefined && broker.fence.state === fence.state && broker.fence.revision === fence.revision;
    const readPolicy = broker.fence.settings?.readPolicy;
    return {
      nodeId: broker.nodeId,
      status: confirmed ? 'confirmed' : 'behind',
      copy: {
        phase,
        revision: broker.fence.revision,
        ...(readPolicy && {
          readPolicy: { exemptPrincipals: readPolicy.exemptPrincipals, allowAllReads: readPolicy.allowAllReads },
        }),
      },
      blocks: phase === undefined ? undefined : isBlockingPhase(phase),
    };
  });
};

export type ReadPolicy = { exemptPrincipals: string[]; allowAllReads: boolean };

export type FenceSummary = ReadPolicy & {
  phase: FencePhase;
  /** An int64 that grows by uneven steps; compare for equality only. */
  revision: bigint;
  /** Absent until the state first changes. */
  stateChangedAt?: Date;
};

export const UNFENCED_SUMMARY: FenceSummary = {
  phase: 'unfenced',
  revision: -1n,
  exemptPrincipals: [],
  allowAllReads: false,
};

/** Undefined when the response has no fence, or a state Console doesn't know. */
export const summarizeFence: (fence: ClusterFence | undefined) => FenceSummary | undefined = (fence) => {
  const phase = toFencePhase(fence?.state);
  if (!(fence && phase)) {
    return;
  }
  return {
    phase,
    revision: fence.revision,
    stateChangedAt: fence.stateChangedAt ? timestampDate(fence.stateChangedAt) : undefined,
    exemptPrincipals: fence.settings?.readPolicy?.exemptPrincipals ?? [],
    allowAllReads: fence.settings?.readPolicy?.allowAllReads ?? false,
  };
};

/** Redpanda keeps exempt names as a set, so order and repeats don't count. */
export const sameFenceSettings = (a: ReadPolicy, b: ReadPolicy) => {
  const names = new Set(a.exemptPrincipals);
  const otherNames = new Set(b.exemptPrincipals);
  return (
    a.allowAllReads === b.allowAllReads &&
    names.size === otherNames.size &&
    [...names].every((principal) => otherNames.has(principal))
  );
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Compact time-in-state, such as `12 min`, `2 h 14 min` or `3 days`. */
export const formatFenceDuration = (elapsedMs: number) => {
  if (elapsedMs < MINUTE_MS) {
    return 'less than a minute';
  }
  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)} min`;
  }
  if (elapsedMs < DAY_MS) {
    const hours = Math.floor(elapsedMs / HOUR_MS);
    const minutes = Math.floor((elapsedMs % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? '1 day' : `${days} days`;
};

/** "broker 2" or "brokers 1 and 3", for the middle of a sentence. */
export const brokersPhrase = (nodeIds: readonly number[]) => {
  if (nodeIds.length === 1) {
    return `broker ${nodeIds[0]}`;
  }
  return `brokers ${nodeIds.slice(0, -1).join(', ')} and ${nodeIds.at(-1)}`;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Broker 2 isn’t" or "Brokers 1 and 2 aren’t", for sentences about brokers that don't answer. */
export const unreachableBrokersSubject = (nodeIds: readonly number[]) =>
  `${capitalize(brokersPhrase(nodeIds))} ${nodeIds.length === 1 ? 'isn’t' : 'aren’t'}`;

const idsWith = (brokers: readonly BrokerProgress[], status: BrokerProgress['status']) =>
  brokers.filter((broker) => broker.status === status).map((broker) => broker.nodeId);

/**
 * A settings change while fenced puts the cluster back in Fencing, but brokers keep blocking on their
 * old copy, so writes never unblock. Told apart from a first Fence by a broker still holding a
 * blocking copy of an earlier revision, and none that accepts writes: a Fence sent while unfencing
 * also leaves blocking copies behind, next to brokers that already picked up Unfence.
 */
export const isApplyingNewSettings = (summary: Pick<FenceSummary, 'phase'>, brokers: readonly BrokerProgress[]) =>
  summary.phase === 'fencing' &&
  brokers.some((broker) => broker.status === 'behind' && broker.blocks === true) &&
  !brokers.some((broker) => broker.blocks === false);

const describeFencedReads = ({ allowAllReads }: Pick<FenceSummary, 'allowAllReads'>) =>
  allowAllReads ? 'Consumers can still read.' : 'Only exempt users can read from user topics.';

/**
 * What the phase means for writes and reads. It doesn't name the phase, which the badge or title
 * next to it already shows.
 */
export const describeFencePhase = (
  summary: Pick<FenceSummary, 'phase' | 'allowAllReads'>,
  brokers: readonly BrokerProgress[]
) => {
  switch (summary.phase) {
    case 'unfenced':
      return 'Clients write and read as usual.';
    case 'fencing':
      return isApplyingNewSettings(summary, brokers)
        ? `Writes stay blocked on every broker while the new settings reach them. ${describeFencedReads(summary)}`
        : `Each broker rejects writes as soon as the fence reaches it. ${describeFencedReads(summary)}`;
    case 'fenced':
      return `Every broker rejects writes. ${describeFencedReads(summary)}`;
    default:
      return 'Brokers accept writes and reads again as the change reaches each of them.';
  }
};

/**
 * Why a move hasn't finished, from the brokers themselves: one that isn't answering holds it for as
 * long as it's down, with no timeout. One that answers but is behind is only named once the move is
 * old enough to be worth mentioning; a healthy cluster finishes in a second or two.
 */
export const describeHeldMove = (
  summary: Pick<FenceSummary, 'phase' | 'stateChangedAt'>,
  brokers: readonly BrokerProgress[],
  now: number
) => {
  const down = idsWith(brokers, 'not-answering');
  if (!isTransitionPhase(summary.phase)) {
    return down.length > 0 ? `${unreachableBrokersSubject(down)} answering.` : '';
  }
  if (down.length > 0) {
    return `${unreachableBrokersSubject(down)} answering, so the cluster stays ${FENCE_PHASE_LABEL[summary.phase].toLowerCase()} until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster. There’s no timeout.`;
  }
  const behind = idsWith(brokers, 'behind');
  const old = summary.stateChangedAt !== undefined && now - summary.stateChangedAt.getTime() >= BEHIND_NOTICE_MS;
  if (behind.length > 0 && old) {
    return `The change hasn’t reached ${brokersPhrase(behind)} yet.`;
  }
  return '';
};

/** How a shadow link authenticates to its source, which decides which exempt name lets it read. */
export type LinkIdentity = { authentication?: 'sasl' | 'mtls' | 'none'; principal?: string };

/**
 * Whether a fence with this read policy lets the link fetch. Names are bare user names, matched
 * exactly; an empty name matches clients without SASL or mTLS; superusers get no pass; an empty list
 * blocks every link. Otherwise undefined when Console can't tell: an mTLS link reads as whatever the
 * cluster's mapping rules make of its certificate.
 */
export const linkCanRead = (policy: ReadPolicy, link: LinkIdentity) => {
  if (policy.allowAllReads) {
    return true;
  }
  if (policy.exemptPrincipals.length === 0) {
    return false;
  }
  if (link.authentication === 'none') {
    return policy.exemptPrincipals.includes('');
  }
  if (link.principal) {
    return policy.exemptPrincipals.includes(link.principal);
  }
};

/** The name that would exempt this link, when there is one Console knows. */
export const exemptNameFor = (link: LinkIdentity) => {
  if (link.authentication === 'none') {
    return '';
  }
  return link.principal || undefined;
};

export const MTLS_LINK_NOTE =
  'This link uses mTLS, so its user comes from the cluster’s mapping rules. Check that it’s on the exempt list.';

const USER_PREFIX = 'User:';

/** Exempt names are bare user names, so a `User:` principal loses its prefix. */
export const toExemptName = (principal: string) => {
  const name = principal.trim();
  return name.startsWith(USER_PREFIX) ? name.slice(USER_PREFIX.length) : name;
};

type ReadPolicyWarning = {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  message: string;
  fix?: { label: string; principals: (principals: string[]) => string[] };
};

const EMPTY_EXEMPT_WARNING =
  'No one is exempt, so the fence blocks every consumer, including every shadow link’s user, and no link can finish copying. Redpanda only warns about this in the controller leader’s log.';

export const SUPERUSERS_NOT_EXEMPT = 'Superusers aren’t exempt unless they’re on the list.';

const userPrefixWarning: (principal: string) => ReadPolicyWarning = (principal) => {
  const bare = toExemptName(principal);
  return {
    id: `prefix-${principal}`,
    severity: 'warning',
    message: `Exempt names are bare user names: “${principal}” matches nobody. Use “${bare}”.`,
    fix: {
      label: `Use ${bare}`,
      principals: (current) => Array.from(new Set(current.map((name) => (name === principal ? bare : name)))),
    },
  };
};

/**
 * The cases the broker only logs on the controller leader, plus the rules that surprise people.
 *
 * Distinguishes a policy that locks out all readers from an entry that matches nobody. A warning may include a correction for the exemption list.
 */
export const getReadPolicyWarnings = (principals: string[], allowAllReads: boolean) => {
  if (allowAllReads) {
    return [];
  }
  const warnings: ReadPolicyWarning[] = [];
  if (principals.length === 0) {
    warnings.push({ id: 'empty', severity: 'danger', message: EMPTY_EXEMPT_WARNING });
  }
  warnings.push(...principals.filter((principal) => principal.startsWith(USER_PREFIX)).map(userPrefixWarning));
  if (principals.includes('')) {
    warnings.push({
      id: 'blank',
      severity: 'info',
      message: 'An empty name exempts clients that connect without SASL or mTLS.',
    });
  }
  return warnings;
};

const FENCED_READ_REJECTION = /POLICY_VIOLATION|configured (?:cluster )?policy|shadow.?fence|cluster.?fence/iu;

/**
 * A failed message search that reads like the fence turned the fetch away, not like a bad filter.
 * Only a hint: it's asked only while the cluster is known to block reads.
 */
export const isFencedReadError = (message: string) => FENCED_READ_REJECTION.test(message);

const NON_USER_TOPICS = new Set(['__consumer_offsets', '_schemas', '_redpanda.audit_log', '_redpanda.transform_logs']);

/**
 * Whether a fence rejects creating, deleting or changing the config of this topic.
 *
 * Only Redpanda's known internal Kafka topics are exempt. An underscore prefix alone doesn't make a topic internal.
 */
export const isFencedTopic = (topic: string) => !NON_USER_TOPICS.has(topic);

/** Whether a fence rejects producing to this topic: `_schemas` too, since the fence covers Schema Registry. */
export const isFencedTopicWrite = (topic: string) => topic === '_schemas' || isFencedTopic(topic);

/** Fence fails while the cluster has a shadow link of its own that hasn't failed over. */
export const SHADOW_CLUSTER_CANT_FENCE =
  'This cluster has a shadow link that hasn’t failed over, so it’s still a shadow cluster. Fence its source instead, or fail the link over first.';

/** A link that has failed over no longer makes its cluster a shadow, so it doesn't stop Fence. */
export const linksThatStopFence = <Link extends { state: ShadowLinkState }>(links: readonly Link[]) =>
  links.filter((link) => link.state !== ShadowLinkState.FAILED_OVER);

/** For a message search the fence rejected; Console's own user is rarely exempt. */
export const FENCED_READS_TITLE = 'Reading is blocked while this cluster is fenced';
export const FENCED_READS_DESCRIPTION =
  'The fence only lets exempt users read topics, and superusers aren’t exempt unless they’re listed. Add Console’s user to the exempt list, turn on Allow all reads, or unfence the cluster.';

/** `unknown` when Console can't tell, such as for a link that uses mTLS. */
type ClientEffectVerdict = 'allowed' | 'rejected' | 'partly' | 'ended' | 'open' | 'unknown';

export type ClientEffect = { id: string; label: string; verdict: ClientEffectVerdict; detail: string };

type Verdict = Pick<ClientEffect, 'verdict' | 'detail'>;

const reach = (nodeIds: readonly number[]) => (nodeIds.length === 1 ? 'it' : 'them');

const ALLOWED: Verdict = { verdict: 'allowed', detail: 'Allowed.' };
const REJECTED: Verdict = { verdict: 'rejected', detail: 'Rejected.' };

const moveSplitDetail = (
  phase: FencePhase,
  blocking: readonly number[],
  open: readonly number[],
  words = { allowed: 'Allowed', rejected: 'Rejected' }
) =>
  phase === 'unfencing'
    ? `${words.allowed} again on ${brokersPhrase(open)}. Still ${words.rejected.toLowerCase()} on ${brokersPhrase(blocking)} until the change reaches ${reach(blocking)}.`
    : `${words.rejected} on ${brokersPhrase(blocking)}. Still ${words.allowed.toLowerCase()} on ${brokersPhrase(open)} until the fence reaches ${reach(open)}.`;

const splitVerdict = (
  summary: Pick<FenceSummary, 'phase'>,
  brokers: readonly BrokerProgress[],
  words = { allowed: 'Allowed', rejected: 'Rejected' }
): Verdict => {
  const blocking = brokers.filter((broker) => broker.blocks === true).map((broker) => broker.nodeId);
  const open = brokers.filter((broker) => broker.blocks === false).map((broker) => broker.nodeId);
  if (blocking.length > 0 && open.length > 0) {
    return { verdict: 'partly', detail: moveSplitDetail(summary.phase, blocking, open, words) };
  }
  const blocks = brokers.length > 0 ? blocking.length > 0 : isBlockingPhase(summary.phase);
  return blocks
    ? { verdict: 'rejected', detail: `${words.rejected}.` }
    : { verdict: 'allowed', detail: `${words.allowed}.` };
};

type ReadCheck = (policy: ReadPolicy) => boolean | undefined;

// WARNING: An unanswered broker contributes neither an allow nor a deny verdict.
const brokerRead = (broker: BrokerProgress, policy: ReadPolicy, canRead: ReadCheck) => {
  if (broker.blocks === undefined) {
    return;
  }
  if (!broker.blocks) {
    return 'allows';
  }
  const verdict = canRead(broker.copy?.readPolicy ?? policy);
  if (verdict === undefined) {
    return 'unknown';
  }
  return verdict ? 'allows' : 'rejects';
};

const onEarlierSettings = (broker: BrokerProgress, policy: ReadPolicy) =>
  broker.blocks === true && broker.copy?.readPolicy !== undefined && !sameFenceSettings(broker.copy.readPolicy, policy);

const readSplitDetail = (
  summary: Pick<FenceSummary, 'phase' | 'exemptPrincipals' | 'allowAllReads'>,
  rejecting: readonly BrokerProgress[],
  allowing: readonly BrokerProgress[]
) => {
  const ids = (brokers: readonly BrokerProgress[]) => brokers.map((broker) => broker.nodeId);
  const earlier = (brokers: readonly BrokerProgress[]) => brokers.map((broker) => onEarlierSettings(broker, summary));
  if (earlier(rejecting).every(Boolean) && !earlier(allowing).some(Boolean)) {
    return `Allowed on ${brokersPhrase(ids(allowing))}. Still rejected on ${brokersPhrase(ids(rejecting))} until the new settings reach ${reach(ids(rejecting))}.`;
  }
  if (earlier(allowing).every(Boolean) && !earlier(rejecting).some(Boolean)) {
    return `Rejected on ${brokersPhrase(ids(rejecting))}. Still allowed on ${brokersPhrase(ids(allowing))} until the new settings reach ${reach(ids(allowing))}.`;
  }
  return moveSplitDetail(summary.phase, ids(rejecting), ids(allowing));
};

const UNKNOWN_READ: Verdict = { verdict: 'unknown', detail: MTLS_LINK_NOTE };

const clusterReadVerdict = (summary: Pick<FenceSummary, 'phase'> & ReadPolicy, canRead: ReadCheck) => {
  const verdict = isBlockingPhase(summary.phase) ? canRead(summary) : true;
  if (verdict === undefined) {
    return UNKNOWN_READ;
  }
  return verdict ? ALLOWED : REJECTED;
};

const readVerdict: (
  summary: Pick<FenceSummary, 'phase' | 'exemptPrincipals' | 'allowAllReads'>,
  brokers: readonly BrokerProgress[],
  canRead: ReadCheck
) => Verdict = (summary, brokers, canRead) => {
  if (brokers.length === 0) {
    return clusterReadVerdict(summary, canRead);
  }
  const reads = brokers.map((broker) => brokerRead(broker, summary, canRead));
  if (reads.includes('unknown')) {
    return UNKNOWN_READ;
  }
  const rejecting = brokers.filter((_, index) => reads[index] === 'rejects');
  const allowing = brokers.filter((_, index) => reads[index] === 'allows');
  if (rejecting.length === 0) {
    return ALLOWED;
  }
  return allowing.length === 0
    ? REJECTED
    : { verdict: 'partly', detail: readSplitDetail(summary, rejecting, allowing) };
};

const transactionVerdict: (summary: Pick<FenceSummary, 'phase'>, brokers: readonly BrokerProgress[]) => Verdict = (
  summary,
  brokers
) => {
  const verdict = splitVerdict(summary, brokers, { allowed: 'Open', rejected: 'Ended' });
  if (verdict.verdict === 'rejected') {
    return {
      verdict: 'ended',
      detail: 'Ended: aborted, or committed if the coordinator had already decided to commit.',
    };
  }
  return verdict.verdict === 'allowed' ? { verdict: 'open', detail: 'Open.' } : verdict;
};

/**
 * What a client sees on this cluster right now, row by row, as the reference player shows it.
 * `links` are the shadow links that read from this cluster, when Console knows them.
 *
 * During a move, an answering broker enforces its own fence and read policy, even if it has not received the latest settings. An unanswered broker is unknown. A broker ends its coordinated transactions when the fence reaches it. Without broker copies, use the cluster policy.
 */
export const getClientEffects = ({
  summary,
  brokers,
  links,
}: {
  summary: Pick<FenceSummary, 'phase' | 'exemptPrincipals' | 'allowAllReads'>;
  brokers: readonly BrokerProgress[];
  links?: readonly (LinkIdentity & { linkName: string })[];
}) => {
  const knownLinks = links ?? [];
  const linkRows: ClientEffect[] = knownLinks.map((link) => ({
    id: `link-${link.linkName}`,
    label: link.principal ? `${link.linkName} fetches as ${link.principal}` : `${link.linkName} fetches`,
    ...readVerdict(summary, brokers, (policy) => linkCanRead(policy, link)),
  }));
  const consume = readVerdict(summary, brokers, (policy) => policy.allowAllReads);
  const anyLinkRow: ClientEffect[] =
    knownLinks.length > 0
      ? []
      : [
          {
            id: 'link',
            label: 'A shadow link’s user fetches',
            ...(consume.verdict === 'allowed'
              ? ALLOWED
              : { verdict: 'unknown' as const, detail: 'Allowed only if its user is on the exempt list.' }),
          },
        ];
  const rejected = splitVerdict(summary, brokers);
  return [
    { id: 'produce', label: 'A producer writes', ...rejected },
    {
      id: 'consume',
      label: 'An app’s consumer fetches',
      ...(consume.verdict === 'allowed' && summary.allowAllReads
        ? { verdict: 'allowed' as const, detail: 'Allowed: Allow all reads is on.' }
        : consume),
    },
    ...linkRows,
    { id: 'commit', label: 'A consumer group joins, heartbeats or commits', ...rejected },
    { id: 'topic-config', label: 'A topic config change', ...rejected },
    { id: 'schema', label: 'A Schema Registry write', ...rejected },
    { id: 'transaction', label: 'An open transaction', ...transactionVerdict(summary, brokers) },
    ...anyLinkRow,
  ] satisfies ClientEffect[];
};
