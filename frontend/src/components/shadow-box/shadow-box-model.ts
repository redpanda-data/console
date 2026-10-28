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
  type GetShadowBoxStatusResponse,
  type ShadowBox,
  ShadowBoxState,
} from 'protogen/redpanda/core/admin/v2/shadow_box_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

export type BoxPhase = 'unboxed' | 'boxing' | 'boxed' | 'unboxing';

export const BOX_PHASES: readonly BoxPhase[] = ['unboxed', 'boxing', 'boxed', 'unboxing'];

export const BOX_PHASE_LABEL: Record<BoxPhase, string> = {
  unboxed: 'Unboxed',
  boxing: 'Boxing',
  boxed: 'Boxed',
  unboxing: 'Unboxing',
};

/**
 * A box that has been running this long is probably forgotten, not part of a cutover. Housekeeping
 * keeps running while boxed, so the UI starts saying so.
 */
export const LONG_BOX_THRESHOLD_MS = 60 * 60 * 1000;

/** A move still waiting on an answering broker after this long names that broker. */
const BEHIND_NOTICE_MS = 30 * 1000;

const PHASE_BY_STATE: Partial<Record<ShadowBoxState, BoxPhase>> = {
  [ShadowBoxState.UNBOXED]: 'unboxed',
  [ShadowBoxState.BOXING]: 'boxing',
  [ShadowBoxState.BOXED]: 'boxed',
  [ShadowBoxState.UNBOXING]: 'unboxing',
};

/** Undefined for a state this version of Console doesn't know, which must never read as unboxed. */
export const toBoxPhase = (state: ShadowBoxState | undefined): BoxPhase | undefined =>
  state === undefined ? undefined : PHASE_BY_STATE[state];

/** Every phase but `unboxed`: something about the box is in place or still settling. */
export const hasBoxActivity = (phase: BoxPhase): boolean => phase !== 'unboxed';

/**
 * Each broker starts blocking as soon as it picks up Box, and stops as soon as it picks up Unbox,
 * so the cluster blocks while boxing and boxed. Console disables the writes a box rejects in these
 * phases; while unboxing they stay enabled, since brokers accept them again as they pick up Unbox.
 */
export const isBlockingPhase = (phase: BoxPhase): boolean => phase === 'boxing' || phase === 'boxed';

export const isTransitionPhase = (phase: BoxPhase): boolean => phase === 'boxing' || phase === 'unboxing';

/** Box is accepted from these phases; Box while boxing or boxed changes nothing. */
export const canBoxFromPhase = (phase: BoxPhase): boolean => phase === 'unboxed' || phase === 'unboxing';

/**
 * - `confirmed`: its copy matches the cluster's box, state and revision.
 * - `behind`: it answered with an older copy, so it holds the move.
 * - `not-answering`: it didn't answer, so it holds the move until it comes back or leaves the cluster.
 */
export type BrokerCopyStatus = 'confirmed' | 'behind' | 'not-answering';

export type BrokerProgress = {
  nodeId: number;
  status: BrokerCopyStatus;
  /** The broker's own copy, when it answered. */
  copy?: { phase: BoxPhase | undefined; revision: bigint };
  /** Whether this broker rejects writes now: its copy is boxing or boxed. Undefined when it didn't answer. */
  blocks: boolean | undefined;
  /** As the broker reported it. Its wording varies, so show it, never match on it. */
  errorMessage?: string;
};

export const getBrokerProgress = (response: GetShadowBoxStatusResponse | undefined): BrokerProgress[] => {
  const box = response?.box;
  return (response?.brokers ?? []).map((broker): BrokerProgress => {
    if (!broker.box) {
      return { nodeId: broker.nodeId, status: 'not-answering', blocks: undefined, errorMessage: broker.errorMessage };
    }
    const phase = toBoxPhase(broker.box.state);
    const confirmed = box !== undefined && broker.box.state === box.state && broker.box.revision === box.revision;
    return {
      nodeId: broker.nodeId,
      status: confirmed ? 'confirmed' : 'behind',
      copy: { phase, revision: broker.box.revision },
      blocks: phase === undefined ? undefined : isBlockingPhase(phase),
    };
  });
};

export type BoxSummary = {
  phase: BoxPhase;
  /** An int64 that grows by uneven steps; compare for equality only. */
  revision: bigint;
  /** Absent until the state first changes. */
  stateChangedAt?: Date;
  exemptPrincipals: string[];
  allowAllReads: boolean;
  skipTransactionExpiration: boolean;
};

export const UNBOXED_SUMMARY: BoxSummary = {
  phase: 'unboxed',
  revision: -1n,
  exemptPrincipals: [],
  allowAllReads: false,
  skipTransactionExpiration: false,
};

/** Undefined when the response has no box, or a state Console doesn't know. */
export const summarizeBox = (box: ShadowBox | undefined): BoxSummary | undefined => {
  const phase = toBoxPhase(box?.state);
  if (!(box && phase)) {
    return;
  }
  return {
    phase,
    revision: box.revision,
    stateChangedAt: box.stateChangedAt ? timestampDate(box.stateChangedAt) : undefined,
    exemptPrincipals: box.settings?.readPolicy?.exemptPrincipals ?? [],
    allowAllReads: box.settings?.readPolicy?.allowAllReads ?? false,
    skipTransactionExpiration: box.settings?.skipTransactionExpiration ?? false,
  };
};

type BoxSettingsValues = Pick<BoxSummary, 'exemptPrincipals' | 'allowAllReads' | 'skipTransactionExpiration'>;

export const sameBoxSettings = (a: BoxSettingsValues, b: BoxSettingsValues): boolean =>
  a.allowAllReads === b.allowAllReads &&
  a.skipTransactionExpiration === b.skipTransactionExpiration &&
  a.exemptPrincipals.length === b.exemptPrincipals.length &&
  a.exemptPrincipals.every((principal) => b.exemptPrincipals.includes(principal));

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Compact time-in-state, such as `12 min`, `2 h 14 min` or `3 days`. */
export const formatBoxDuration = (elapsedMs: number): string => {
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

export const isLongBox = (summary: Pick<BoxSummary, 'phase' | 'stateChangedAt'>, now: number): boolean =>
  summary.phase === 'boxed' &&
  summary.stateChangedAt !== undefined &&
  now - summary.stateChangedAt.getTime() >= LONG_BOX_THRESHOLD_MS;

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

const idsWith = (brokers: readonly BrokerProgress[], status: BrokerCopyStatus) =>
  brokers.filter((broker) => broker.status === status).map((broker) => broker.nodeId);

/**
 * A settings change while boxed puts the cluster back in Boxing, but brokers keep blocking on their
 * old copy, so writes never unblock. Told apart from a first Box by a broker still holding a
 * blocking copy of an earlier revision.
 */
export const isApplyingNewSettings = (
  summary: Pick<BoxSummary, 'phase'>,
  brokers: readonly BrokerProgress[]
): boolean =>
  summary.phase === 'boxing' && brokers.some((broker) => broker.status === 'behind' && broker.blocks === true);

const progressCount = (brokers: readonly BrokerProgress[]) =>
  brokers.length > 0 ? ` ${idsWith(brokers, 'confirmed').length} of ${brokers.length} have.` : '';

/** The sentence for where the box stands, as the cluster's brokers report it. */
export const describeBoxPhase = (summary: Pick<BoxSummary, 'phase'>, brokers: readonly BrokerProgress[]): string => {
  switch (summary.phase) {
    case 'unboxed':
      return 'Unboxed. Clients write and read as usual.';
    case 'boxing':
      return isApplyingNewSettings(summary, brokers)
        ? `Applying new settings. Writes stay blocked on every broker while they pick them up.${progressCount(brokers)}`
        : `Boxing. Each broker rejects writes as soon as it picks up the box.${progressCount(brokers)}`;
    case 'boxed':
      return 'Boxed. Every broker rejects writes.';
    default:
      return `Unboxing. Each broker accepts writes again as soon as it picks up Unbox.${progressCount(brokers)}`;
  }
};

/**
 * Why a move hasn't finished, from the brokers themselves: one that isn't answering holds it for as
 * long as it's down, with no timeout. One that answers but is behind is only named once the move is
 * old enough to be worth mentioning; a healthy cluster finishes in a second or two.
 */
export const describeHeldMove = (
  summary: Pick<BoxSummary, 'phase' | 'stateChangedAt'>,
  brokers: readonly BrokerProgress[],
  now: number
): string => {
  const down = idsWith(brokers, 'not-answering');
  if (!isTransitionPhase(summary.phase)) {
    return down.length > 0 ? `${unreachableBrokersSubject(down)} answering.` : '';
  }
  if (down.length > 0) {
    return `${unreachableBrokersSubject(down)} answering, so the cluster stays ${summary.phase} until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster. There’s no timeout.`;
  }
  const behind = idsWith(brokers, 'behind');
  const old = summary.stateChangedAt !== undefined && now - summary.stateChangedAt.getTime() >= BEHIND_NOTICE_MS;
  if (behind.length > 0 && old) {
    return `${capitalize(brokersPhrase(behind))} ${behind.length === 1 ? 'hasn’t' : 'haven’t'} picked up the change yet.`;
  }
  return '';
};

/** How a shadow link authenticates to its source, which decides which exempt name lets it read. */
export type LinkAuthentication = 'sasl' | 'mtls' | 'none';

export type LinkIdentity = { authentication?: LinkAuthentication; principal?: string };

type ReadPolicy = Pick<BoxSummary, 'exemptPrincipals' | 'allowAllReads'>;

/**
 * Whether a box with this read policy lets the link fetch. Names are bare user names, matched
 * exactly; an empty name matches clients without SASL or mTLS; superusers get no pass. Undefined
 * when Console can't tell: an mTLS link reads as whatever the cluster's mapping rules make of its
 * certificate.
 */
export const linkCanRead = (policy: ReadPolicy, link: LinkIdentity): boolean | undefined => {
  if (policy.allowAllReads) {
    return true;
  }
  if (link.authentication === 'none') {
    return policy.exemptPrincipals.includes('');
  }
  if (link.principal) {
    return policy.exemptPrincipals.includes(link.principal);
  }
};

/** The name that would exempt this link, when there is one Console knows. */
export const exemptNameFor = (link: LinkIdentity): string | undefined => {
  if (link.authentication === 'none') {
    return '';
  }
  return link.principal || undefined;
};

export const MTLS_LINK_NOTE =
  'This link uses mTLS, so its user comes from the cluster’s mapping rules. Check that it’s on the exempt list.';

const USER_PREFIX = 'User:';

export type ReadPolicyWarning = {
  id: string;
  /** `danger` locks out every shadow link; `warning` matches nobody; `info` explains a rule. */
  severity: 'danger' | 'warning' | 'info';
  message: string;
  /** A one-click correction, such as the bare name for a `User:` entry. */
  fix?: { label: string; principals: (principals: string[]) => string[] };
};

export const EMPTY_EXEMPT_WARNING =
  'No one is exempt, so the box blocks every consumer, including every shadow link’s user, and no link can finish copying. Redpanda only warns about this in the controller leader’s log.';

export const SUPERUSERS_NOT_EXEMPT = 'Superusers aren’t exempt unless they’re on the list.';

/** The cases the broker only logs on the controller leader, plus the rules that surprise people. */
export const getReadPolicyWarnings = (principals: string[], allowAllReads: boolean): ReadPolicyWarning[] => {
  if (allowAllReads) {
    return [];
  }
  const warnings: ReadPolicyWarning[] = [];
  if (principals.length === 0) {
    warnings.push({ id: 'empty', severity: 'danger', message: EMPTY_EXEMPT_WARNING });
  }
  for (const principal of principals) {
    if (principal.startsWith(USER_PREFIX)) {
      const bare = principal.slice(USER_PREFIX.length);
      warnings.push({
        id: `prefix-${principal}`,
        severity: 'warning',
        message: `Exempt names are bare user names: “${principal}” matches nobody. Use “${bare}”.`,
        fix: {
          label: `Use ${bare}`,
          principals: (current) => Array.from(new Set(current.map((name) => (name === principal ? bare : name)))),
        },
      });
    }
  }
  if (principals.includes('')) {
    warnings.push({
      id: 'blank',
      severity: 'info',
      message: 'An empty name exempts clients that connect without SASL or mTLS.',
    });
  }
  return warnings;
};

/**
 * Field mask paths for the settings Console edits. `read_policy` replaces the whole policy, which
 * is the only way to remove a name; `read_policy.exempt_principals` would only add names.
 */
export const BOX_SETTINGS_UPDATE_PATHS = ['read_policy', 'skip_transaction_expiration'];

const BOXED_READ_REJECTION = /POLICY_VIOLATION|configured (?:cluster )?policy|shadow.?box/i;

/**
 * A failed message search that reads like the box turned the fetch away, not like a bad filter.
 * Only a hint: it's asked only while the cluster is known to block reads.
 */
export const isBoxedReadError = (message: string): boolean => BOXED_READ_REJECTION.test(message);

/** Box fails while the cluster has a shadow link of its own that hasn't failed over. */
export const SHADOW_CLUSTER_CANT_BOX =
  'This cluster has a shadow link that hasn’t failed over, so it’s still a shadow cluster. Box its source instead, or fail the link over first.';

/** A link that has failed over no longer makes its cluster a shadow, so it doesn't stop Box. */
export const linksThatStopBox = <Link extends { state: ShadowLinkState }>(links: readonly Link[]): Link[] =>
  links.filter((link) => link.state !== ShadowLinkState.FAILED_OVER);

/** For a message search the box rejected; Console's own user is rarely exempt. */
export const BOXED_READS_TITLE = 'Reading is blocked while this cluster is shadow boxed';
export const BOXED_READS_DESCRIPTION =
  'The box only lets exempt users read topics, and superusers aren’t exempt unless they’re listed. Add Console’s user to the exempt list, turn on Allow all reads, or unbox the cluster.';

/** `unknown` when Console can't tell, such as for a link that uses mTLS. */
export type ClientEffectVerdict = 'allowed' | 'rejected' | 'partly' | 'ended' | 'open' | 'unknown';

export type ClientEffect = { id: string; label: string; verdict: ClientEffectVerdict; detail: string };

const PRODUCE_REJECTION = 'REQUEST_TIMED_OUT (7), which the client retries until its delivery timeout';

/** Who rejects what right now: during a move, only the brokers that picked it up. */
const blockingSplit = (brokers: readonly BrokerProgress[]) => ({
  blocking: brokers.filter((broker) => broker.blocks === true).map((broker) => broker.nodeId),
  open: brokers.filter((broker) => broker.blocks === false).map((broker) => broker.nodeId),
});

const rejectionVerdict = (
  summary: Pick<BoxSummary, 'phase'>,
  brokers: readonly BrokerProgress[],
  rejection: string
): Pick<ClientEffect, 'verdict' | 'detail'> => {
  const { blocking, open } = blockingSplit(brokers);
  if (brokers.length > 0 && blocking.length > 0 && open.length > 0) {
    return {
      verdict: 'partly',
      detail:
        summary.phase === 'unboxing'
          ? `Allowed again on ${brokersPhrase(open)}. Still rejected on ${brokersPhrase(blocking)} until ${blocking.length === 1 ? 'it picks' : 'they pick'} up Unbox: ${rejection}.`
          : `Rejected on ${brokersPhrase(blocking)}: ${rejection}. Still allowed on ${brokersPhrase(open)} until ${open.length === 1 ? 'it picks' : 'they pick'} up the box.`,
    };
  }
  const blocks = brokers.length > 0 ? blocking.length > 0 : isBlockingPhase(summary.phase);
  return blocks
    ? { verdict: 'rejected', detail: `Rejected: ${rejection}.` }
    : { verdict: 'allowed', detail: 'Allowed.' };
};

/** A settings change while boxed finds open transactions already ended by the first Boxed. */
const transactionEffect = (
  summary: Pick<BoxSummary, 'phase' | 'skipTransactionExpiration'>,
  wasBoxed: boolean
): ClientEffect => {
  const base = { id: 'transaction', label: 'An open transaction' };
  if (!isBlockingPhase(summary.phase)) {
    return { ...base, verdict: 'open', detail: 'Open.' };
  }
  if (summary.skipTransactionExpiration) {
    return {
      ...base,
      verdict: 'open',
      detail: 'Left open: Skip transaction expiration is on. Readers can’t move past it.',
    };
  }
  return summary.phase === 'boxed' || wasBoxed
    ? {
        ...base,
        verdict: 'ended',
        detail:
          'Ended by the box, as a commit if the coordinator had already decided to commit, so readers can move past it.',
      }
    : {
        ...base,
        verdict: 'open',
        detail: 'Can commit or abort, but not grow. The box ends it once the cluster is boxed.',
      };
};

/**
 * What a client sees on this cluster right now, row by row, as the reference player shows it.
 * `links` are the shadow links that read from this cluster, when the host knows them.
 */
export const getClientEffects = ({
  summary,
  brokers,
  links,
}: {
  summary: Pick<BoxSummary, 'phase' | 'exemptPrincipals' | 'allowAllReads' | 'skipTransactionExpiration'>;
  brokers: readonly BrokerProgress[];
  links?: readonly (LinkIdentity & { linkName: string })[];
}): ClientEffect[] => {
  const anyBlocking = brokers.length > 0 ? brokers.some((broker) => broker.blocks) : isBlockingPhase(summary.phase);
  const reads = (rejection: string, canRead: boolean | undefined): Pick<ClientEffect, 'verdict' | 'detail'> => {
    if (canRead === undefined && anyBlocking) {
      return { verdict: 'unknown', detail: MTLS_LINK_NOTE };
    }
    return canRead === false
      ? rejectionVerdict(summary, brokers, rejection)
      : { verdict: 'allowed', detail: 'Allowed.' };
  };
  const fetchRejection = 'POLICY_VIOLATION (44)';
  const linkRows: ClientEffect[] =
    links && links.length > 0
      ? links.map((link) => ({
          id: `link-${link.linkName}`,
          label: `${link.linkName} fetches${link.principal ? ` as ${link.principal}` : ''}`,
          ...reads(fetchRejection, linkCanRead(summary, link)),
        }))
      : [
          {
            id: 'link',
            label: 'A shadow link’s user fetches',
            ...(summary.allowAllReads || !anyBlocking
              ? { verdict: 'allowed' as const, detail: 'Allowed.' }
              : { verdict: 'unknown' as const, detail: 'Allowed only if its user is on the exempt list.' }),
          },
        ];
  return [
    { id: 'produce', label: 'A producer writes', ...rejectionVerdict(summary, brokers, PRODUCE_REJECTION) },
    {
      id: 'consume',
      label: 'An app’s consumer fetches',
      ...(summary.allowAllReads
        ? { verdict: 'allowed' as const, detail: 'Allowed: Allow all reads is on.' }
        : rejectionVerdict(summary, brokers, fetchRejection)),
    },
    ...linkRows,
    {
      id: 'commit',
      label: 'A consumer commits an offset',
      ...rejectionVerdict(summary, brokers, 'POLICY_VIOLATION (44)'),
    },
    { id: 'schema', label: 'A Schema Registry write', ...rejectionVerdict(summary, brokers, 'HTTP 412') },
    transactionEffect(summary, isApplyingNewSettings(summary, brokers)),
  ];
};
