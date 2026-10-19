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
  linkCanRead,
  MTLS_LINK_NOTE,
  SHADOW_CLUSTER_CANT_BOX,
  unreachableBrokersSubject,
} from './shadow-box-model';

export type PreflightStatus = 'pending' | 'pass' | 'warn' | 'fail';

export type PreflightCheck = { id: string; status: PreflightStatus; message: string };

type PreflightInput = {
  /**
   * Names of this cluster's own shadow links that haven't failed over; any of them makes it a shadow,
   * which Box refuses. `disabled` when shadow linking is off here, as it usually is on a source.
   */
  linksThatStopBox: string[] | 'loading' | 'error' | 'disabled';
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

const ownLinksCheck = (links: PreflightInput['linksThatStopBox']): PreflightCheck => {
  if (links === 'loading') {
    return { id: 'own-links', status: 'pending', message: 'Checking whether this cluster is a shadow cluster…' };
  }
  if (links === 'error') {
    return {
      id: 'own-links',
      status: 'warn',
      message: 'Couldn’t check this cluster’s own shadow links. Box fails while one of them hasn’t failed over.',
    };
  }
  if (links === 'disabled') {
    return { id: 'own-links', status: 'pass', message: 'Shadow linking is off here, so this isn’t a shadow cluster.' };
  }
  if (links.length > 0) {
    return { id: 'own-links', status: 'fail', message: `${SHADOW_CLUSTER_CANT_BOX} Its links: ${links.join(', ')}.` };
  }
  return { id: 'own-links', status: 'pass', message: 'This cluster has no shadow link that hasn’t failed over.' };
};

const brokersCheck = (brokers: BrokerProgress[]): PreflightCheck | undefined => {
  if (brokers.length === 0) {
    return;
  }
  const down = brokers.filter((broker) => broker.status === 'not-answering').map((broker) => broker.nodeId);
  if (down.length === 0) {
    return { id: 'brokers', status: 'pass', message: `All ${brokers.length} brokers are answering.` };
  }
  return {
    id: 'brokers',
    status: 'warn',
    message: `${unreachableBrokersSubject(down)} answering. Box would stay in Boxing until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster; there’s no timeout.`,
  };
};

const INCOMPLETE_READERS_CHECK: PreflightCheck = {
  id: 'readers-incomplete',
  status: 'warn',
  message:
    'Redpanda Cloud couldn’t check every shadow link, so it may not have found all the links that read from this cluster. Make sure each one’s user is exempt.',
};

const blockedReaderMessage = (reader: ShadowLinkReader) => {
  if (reader.authentication === 'none') {
    return `${reader.linkName} connects without SASL or mTLS, so only an empty exempt name lets it read. Exempt clients without SASL or mTLS above.`;
  }
  return `${reader.linkName} reads as ${reader.principal}, which isn’t exempt, so it couldn’t finish copying.`;
};

const readerChecks = (
  readers: ShadowLinkReader[],
  policy: { exemptPrincipals: string[]; allowAllReads: boolean },
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
  const more = incomplete ? [INCOMPLETE_READERS_CHECK] : [];
  const results = readers.map((reader) => ({ reader, canRead: linkCanRead(policy, reader) }));
  const problems = results.flatMap(({ reader, canRead }): PreflightCheck[] => {
    if (canRead === false) {
      return [{ id: `reader-${reader.linkName}`, status: 'warn', message: blockedReaderMessage(reader) }];
    }
    if (canRead === undefined) {
      return [
        {
          id: `reader-${reader.linkName}`,
          status: 'warn',
          message:
            reader.authentication === 'mtls'
              ? `${reader.linkName}: ${MTLS_LINK_NOTE}`
              : `Console can’t tell which user ${reader.linkName} reads as. Make sure it’s on the exempt list.`,
        },
      ];
    }
    return [];
  });
  if (problems.length > 0) {
    return [...problems, ...more];
  }
  const message =
    readers.length === 1
      ? `${readers[0].linkName} can keep reading, so it can finish copying.`
      : `All ${readers.length} shadow links that read from this cluster can keep reading.`;
  return [{ id: 'readers', status: 'pass', message }, ...more];
};

/**
 * Checks Console can run before Box. Box has no dry run, so these cover what the page already
 * knows; anything else, such as an unfinished data migration, comes back from Box itself.
 */
export const getBoxPreflightChecks = ({
  linksThatStopBox,
  brokers,
  exemptPrincipals,
  allowAllReads,
  readers,
  readersResolving,
  readersIncomplete,
}: PreflightInput): PreflightCheck[] => {
  const checks: PreflightCheck[] = [ownLinksCheck(linksThatStopBox)];
  const brokerCheck = brokersCheck(brokers);
  if (brokerCheck) {
    checks.push(brokerCheck);
  }
  if (!allowAllReads && readers !== undefined) {
    checks.push(
      ...readerChecks(
        readers,
        { exemptPrincipals, allowAllReads },
        { resolving: readersResolving, incomplete: readersIncomplete }
      )
    );
  }
  for (const warning of getReadPolicyWarnings(exemptPrincipals, allowAllReads)) {
    if (warning.severity === 'warning') {
      checks.push({ id: `policy-${warning.id}`, status: 'warn', message: warning.message });
    }
  }
  return checks;
};
