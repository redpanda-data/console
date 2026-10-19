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

export type BoxPhase = 'unboxed' | 'boxing' | 'boxed' | 'unboxing';

export const BOX_PHASE_LABEL: Record<BoxPhase, string> = {
  unboxed: 'Unboxed',
  boxing: 'Boxing',
  boxed: 'Boxed',
  unboxing: 'Unboxing',
};

/**
 * A box that has been running this long is probably forgotten, not part of a cutover. Retention and
 * compaction keep running while boxed, so the UI starts saying so.
 */
export const LONG_BOX_THRESHOLD_MS = 60 * 60 * 1000;

export const toBoxPhase = (state: ShadowBoxState | undefined): BoxPhase => {
  switch (state) {
    case ShadowBoxState.BOXING:
      return 'boxing';
    case ShadowBoxState.BOXED:
      return 'boxed';
    case ShadowBoxState.UNBOXING:
      return 'unboxing';
    default:
      return 'unboxed';
  }
};

/** Brokers can reject writes in every phase but `unboxed`: while unboxing, some still enforce the box. */
export const isFencedPhase = (phase: BoxPhase): boolean => phase !== 'unboxed';

/**
 * The phases an operator asked for a box in, so Console disables the writes it rejects. While
 * unboxing they stay enabled: most brokers already accept them, and a broker that never confirms
 * would otherwise leave every control disabled with nothing left to do.
 */
export const isBlockingPhase = (phase: BoxPhase): boolean => phase === 'boxing' || phase === 'boxed';

export const isTransitionPhase = (phase: BoxPhase): boolean => phase === 'boxing' || phase === 'unboxing';

/** Box is accepted from these phases; the others already have a box requested. */
export const canBoxFromPhase = (phase: BoxPhase): boolean => phase === 'unboxed' || phase === 'unboxing';

type BrokerProgressStatus = 'applied' | 'pending' | 'unreachable';

export type BrokerProgress = {
  nodeId: number;
  status: BrokerProgressStatus;
  errorMessage?: string;
};

/** A broker has caught up once its copy of the box carries the controller leader's revision. */
export const getBrokerProgress = (response: GetShadowBoxStatusResponse | undefined): BrokerProgress[] => {
  const revision = response?.box?.revision;
  return (response?.brokers ?? []).map((broker) => {
    if (!broker.box) {
      return { nodeId: broker.nodeId, status: 'unreachable', errorMessage: broker.errorMessage };
    }
    return { nodeId: broker.nodeId, status: broker.box.revision === revision ? 'applied' : 'pending' };
  });
};

export type BoxSummary = {
  phase: BoxPhase;
  revision: bigint;
  stateChangedAt?: Date;
  exemptPrincipals: string[];
  allowAllReads: boolean;
  skipTransactionExpiration: boolean;
};

export const summarizeBox = (box: ShadowBox | undefined): BoxSummary => ({
  phase: toBoxPhase(box?.state),
  revision: box?.revision ?? BigInt(-1),
  stateChangedAt: box?.stateChangedAt ? timestampDate(box.stateChangedAt) : undefined,
  exemptPrincipals: box?.settings?.readPolicy?.exemptPrincipals ?? [],
  allowAllReads: box?.settings?.readPolicy?.allowAllReads ?? false,
  skipTransactionExpiration: box?.settings?.skipTransactionExpiration ?? false,
});

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

const USER_PREFIX = 'User:';

type PrincipalWarning = { id: string; message: string };

/** The same cases the broker logs a warning for when it applies a Box or a settings change. */
export const getReadPolicyWarnings = (principals: string[], allowAllReads: boolean): PrincipalWarning[] => {
  if (allowAllReads) {
    return [];
  }
  const warnings: PrincipalWarning[] = [];
  if (principals.length === 0) {
    warnings.push({
      id: 'empty',
      message:
        'With no exempt principals, shadow links can’t read from this cluster, so they can’t finish their final sync.',
    });
  }
  if (principals.includes('')) {
    warnings.push({
      id: 'blank',
      message: 'An empty name exempts every client that connects without SASL or mTLS.',
    });
  }
  for (const principal of principals) {
    if (principal.startsWith(USER_PREFIX)) {
      warnings.push({
        id: `prefix-${principal}`,
        message: `“${principal}” matches no connection. Enter the bare user name, “${principal.slice(USER_PREFIX.length)}”.`,
      });
    }
  }
  return warnings;
};

/**
 * Field mask paths for the settings the Box dialog edits. Naming `read_policy` replaces the whole
 * policy; naming `read_policy.exempt_principals` would only add names.
 */
export const BOX_SETTINGS_UPDATE_PATHS = ['read_policy', 'skip_transaction_expiration'];

const BOXED_READ_REJECTION = /POLICY_VIOLATION|configured (?:cluster )?policy|shadow.?box/i;

/** A failed message search that reads like the box turned the fetch away, not like a bad filter. */
export const isBoxedReadError = (message: string): boolean => BOXED_READ_REJECTION.test(message);

/** A cluster with a shadow link of its own is a shadow, and Box refuses it. */
export const SHADOW_CLUSTER_CANT_BOX =
  'This cluster has a shadow link of its own, so it’s a shadow cluster. Only a shadow link’s source cluster can be boxed.';

/** "Broker 2 isn’t" or "Brokers 1, 2 aren’t", for sentences about brokers that don't answer. */
export const unreachableBrokersSubject = (nodeIds: readonly number[]) =>
  nodeIds.length === 1 ? `Broker ${nodeIds[0]} isn’t` : `Brokers ${nodeIds.join(', ')} aren’t`;

/** For a message search the box rejected; Console's own user is rarely exempt. */
export const BOXED_READS_TITLE = 'Reading is blocked while this cluster is shadow boxed';
export const BOXED_READS_DESCRIPTION =
  'The box only lets exempt principals read topics. If Console’s own user isn’t exempt, unbox the cluster or add that user to the exempt principals.';
