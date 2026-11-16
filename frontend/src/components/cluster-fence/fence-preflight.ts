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
  type BrokerProgress,
  linkCanRead,
  MTLS_LINK_NOTE,
  SHADOW_CLUSTER_CANT_FENCE,
  unreachableBrokersSubject,
} from './cluster-fence-model';
import type { ShadowLinkReader } from './shadow-link-topology';

export type PreflightStatus = 'pending' | 'pass' | 'warn' | 'fail';

export type PreflightCheck = { id: string; status: PreflightStatus; message: string };

type PreflightInput = {
  /**
   * Names of this cluster's own shadow links that haven't failed over; any of them makes it a shadow,
   * which Fence refuses. `disabled` when shadow linking is off here, as it usually is on a source.
   */
  linksThatStopFence: string[] | 'loading' | 'error' | 'disabled';
  brokers: BrokerProgress[];
  exemptPrincipals: string[];
  allowAllReads: boolean;
  /** Undefined when Console can't say who reads from this cluster, as outside Redpanda Cloud. */
  readers: ShadowLinkReader[] | undefined;
  /** Links are still being resolved, so `readers` may be missing some. */
  readersResolving: boolean;
  /** Some links couldn't be resolved, so `readers` may be missing some for good. */
  readersIncomplete: boolean;
};

/** Only says something when Fence might fail: a pass would only restate that this isn't a shadow cluster. */
const ownLinksCheck = (links: PreflightInput['linksThatStopFence']): PreflightCheck | undefined => {
  if (links === 'loading') {
    return { id: 'own-links', status: 'pending', message: 'Checking whether this cluster is a shadow cluster…' };
  }
  if (links === 'error') {
    return {
      id: 'own-links',
      status: 'warn',
      message: 'Couldn’t check this cluster’s own shadow links. Fence fails while one of them hasn’t failed over.',
    };
  }
  if (links !== 'disabled' && links.length > 0) {
    return { id: 'own-links', status: 'fail', message: `${SHADOW_CLUSTER_CANT_FENCE} Its links: ${links.join(', ')}.` };
  }
};

const brokersCheck = (brokers: BrokerProgress[]): PreflightCheck | undefined => {
  const down = brokers.filter((broker) => broker.status === 'not-answering').map((broker) => broker.nodeId);
  if (down.length === 0) {
    return;
  }
  return {
    id: 'brokers',
    status: 'warn',
    message: `${unreachableBrokersSubject(down)} answering. Fence would stay in Fencing until ${down.length === 1 ? 'it comes' : 'they come'} back or ${down.length === 1 ? 'leaves' : 'leave'} the cluster; there’s no timeout.`,
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
  if (!reader.principal) {
    return `No one is exempt, so ${reader.linkName} couldn’t read or finish copying.`;
  }
  return `${reader.linkName} reads as ${reader.principal}, which isn’t exempt, so it couldn’t finish copying.`;
};

/** Before any reader is found, says whether Console is still looking, gave up early, or found none. */
const noReadersCheck = ({ resolving, incomplete }: { resolving: boolean; incomplete: boolean }): PreflightCheck => {
  if (resolving) {
    return { id: 'readers', status: 'pending', message: 'Finding the shadow links that read from this cluster…' };
  }
  if (incomplete) {
    return INCOMPLETE_READERS_CHECK;
  }
  return {
    id: 'readers',
    status: 'warn',
    message: 'No shadow link in Redpanda Cloud reads from this cluster. Fence it only if a link outside Cloud does.',
  };
};

const readerProblems = (reader: ShadowLinkReader, canRead: boolean | undefined): PreflightCheck[] => {
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
};

const readerChecks = (
  readers: ShadowLinkReader[],
  policy: { exemptPrincipals: string[]; allowAllReads: boolean },
  { resolving, incomplete }: { resolving: boolean; incomplete: boolean }
): PreflightCheck[] => {
  if (readers.length === 0) {
    return [noReadersCheck({ resolving, incomplete })];
  }
  const more = incomplete ? [INCOMPLETE_READERS_CHECK] : [];
  const problems = readers.flatMap((reader) => readerProblems(reader, linkCanRead(policy, reader)));
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
 * Checks Console can run before Fence. Fence has no dry run, so these cover what the page already
 * knows; anything else, such as an unfinished data migration, comes back from Fence itself. Warnings
 * about the exempt names themselves show in the settings fields, not here. The links that read from
 * this cluster are only checked when Console knows them; the other checks only appear for a problem.
 */
export const getFencePreflightChecks = ({
  linksThatStopFence,
  brokers,
  exemptPrincipals,
  allowAllReads,
  readers,
  readersResolving,
  readersIncomplete,
}: PreflightInput): PreflightCheck[] => {
  const checks = [ownLinksCheck(linksThatStopFence), brokersCheck(brokers)].filter(
    (check): check is PreflightCheck => check !== undefined
  );
  if (!allowAllReads && readers !== undefined) {
    checks.push(
      ...readerChecks(
        readers,
        { exemptPrincipals, allowAllReads },
        { resolving: readersResolving, incomplete: readersIncomplete }
      )
    );
  }
  return checks;
};
