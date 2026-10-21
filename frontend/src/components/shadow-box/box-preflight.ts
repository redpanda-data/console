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

import type { ShadowLinkReader } from 'federation/types';

import {
  type BrokerProgress,
  getReadPolicyWarnings,
  SHADOW_CLUSTER_CANT_BOX,
  unreachableBrokersSubject,
} from './shadow-box-model';

export type PreflightStatus = 'pending' | 'pass' | 'warn' | 'fail';

export type PreflightCheck = { id: string; status: PreflightStatus; message: string };

type PreflightInput = {
  /**
   * Names of shadow links configured on this cluster; any of them makes it a shadow, which can't be
   * boxed. `disabled` when shadow linking is off here, as it usually is on a source.
   */
  ownShadowLinks: string[] | 'loading' | 'error' | 'disabled';
  brokers: BrokerProgress[];
  exemptPrincipals: string[];
  allowAllReads: boolean;
  /** Undefined when the host can't say who reads from this cluster (standalone Console). */
  readers: ShadowLinkReader[] | undefined;
  /** The host is still resolving links, so `readers` may be missing some. */
  readersResolving: boolean;
  /** The host couldn't resolve every link, so `readers` may be missing some for good. */
  readersIncomplete: boolean;
};

const ownLinksCheck = (ownShadowLinks: PreflightInput['ownShadowLinks']): PreflightCheck => {
  if (ownShadowLinks === 'loading') {
    return {
      id: 'own-links',
      status: 'pending',
      message: 'Checking whether this cluster has shadow links of its own…',
    };
  }
  if (ownShadowLinks === 'error') {
    return {
      id: 'own-links',
      status: 'warn',
      message: 'Couldn’t check whether this cluster has shadow links of its own. Box fails if it does.',
    };
  }
  if (ownShadowLinks === 'disabled') {
    return {
      id: 'own-links',
      status: 'pass',
      message: 'Shadow linking is off on this cluster, so it has no shadow links of its own.',
    };
  }
  if (ownShadowLinks.length > 0) {
    return {
      id: 'own-links',
      status: 'fail',
      message: `${SHADOW_CLUSTER_CANT_BOX} Its links: ${ownShadowLinks.join(', ')}.`,
    };
  }
  return { id: 'own-links', status: 'pass', message: 'This cluster has no shadow links of its own.' };
};

const brokersCheck = (brokers: BrokerProgress[]): PreflightCheck | undefined => {
  if (brokers.length === 0) {
    return;
  }
  const unreachable = brokers.filter((broker) => broker.status === 'unreachable').map((broker) => broker.nodeId);
  if (unreachable.length === 0) {
    return { id: 'brokers', status: 'pass', message: `All ${brokers.length} brokers are responding.` };
  }
  return {
    id: 'brokers',
    status: 'warn',
    message: `${unreachableBrokersSubject(unreachable)} responding. The box stays in Boxing until every broker confirms, and it can’t be relied on before then.`,
  };
};

const INCOMPLETE_READERS_CHECK: PreflightCheck = {
  id: 'readers-incomplete',
  status: 'warn',
  message:
    'Redpanda Cloud couldn’t check every shadow link, so it may not have found all the links that read from this cluster. Make sure each one’s user is exempt.',
};

const readerChecks = (
  readers: ShadowLinkReader[],
  exemptPrincipals: string[],
  { resolving, incomplete }: { resolving: boolean; incomplete: boolean }
): PreflightCheck[] => {
  if (readers.length === 0 && resolving) {
    return [{ id: 'readers', status: 'pending', message: 'Finding the shadow links that read from this cluster…' }];
  }
  if (readers.length === 0 && incomplete) {
    return [INCOMPLETE_READERS_CHECK];
  }
  if (readers.length === 0) {
    return [
      {
        id: 'readers',
        status: 'warn',
        message: 'No shadow link in Redpanda Cloud reads from this cluster. Box it only if a link outside Cloud does.',
      },
    ];
  }
  const blocked = readers.filter((reader) => !(reader.principal && exemptPrincipals.includes(reader.principal)));
  const more = incomplete ? [INCOMPLETE_READERS_CHECK] : [];
  if (blocked.length === 0) {
    const message =
      readers.length === 1
        ? `${readers[0].linkName} can keep reading, so it can finish syncing.`
        : `All ${readers.length} shadow links that read from this cluster can keep reading.`;
    return [{ id: 'readers', status: 'pass', message }, ...more];
  }
  const blockedChecks = blocked.map(
    (reader): PreflightCheck => ({
      id: `reader-${reader.linkName}`,
      status: 'warn',
      message: reader.principal
        ? `${reader.linkName} reads as ${reader.principal}, which isn’t exempt, so it can’t finish syncing.`
        : `${reader.linkName} doesn’t use SASL, so Cloud can’t tell which principal it reads as. Add it above if you know it.`,
    })
  );
  return [...blockedChecks, ...more];
};

/**
 * Checks Console can run before Box. Box has no dry run, so these cover what the page already
 * knows; anything else, such as an unfinished data migration, comes back from Box itself.
 */
export const getBoxPreflightChecks = ({
  ownShadowLinks,
  brokers,
  exemptPrincipals,
  allowAllReads,
  readers,
  readersResolving,
  readersIncomplete,
}: PreflightInput): PreflightCheck[] => {
  const checks: PreflightCheck[] = [ownLinksCheck(ownShadowLinks)];
  const brokerCheck = brokersCheck(brokers);
  if (brokerCheck) {
    checks.push(brokerCheck);
  }
  const readerResults =
    !allowAllReads && readers !== undefined
      ? readerChecks(readers, exemptPrincipals, { resolving: readersResolving, incomplete: readersIncomplete })
      : [];
  checks.push(...readerResults);
  /** A link already named as blocked says what an empty exempt list would, more precisely. */
  const linkBlocked = readerResults.some((check) => check.id.startsWith('reader-'));
  for (const warning of getReadPolicyWarnings(exemptPrincipals, allowAllReads)) {
    if (!(linkBlocked && warning.id === 'empty')) {
      checks.push({ id: `policy-${warning.id}`, status: 'warn', message: warning.message });
    }
  }
  return checks;
};
