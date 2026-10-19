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

import { config } from 'config';
import { useCallback, useMemo, useState } from 'react';
import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { getCutoverReadiness, getLinkIdentity, getSourceBoxStep, type TopologyState } from './cutover-model';
import type { UnifiedShadowLink } from '../model';

/** After a failed read, keep trying, but slowly: the shadow cluster may be struggling. */
const ERROR_POLL_MS = 30_000;

/** Scoped to the cluster too: embedded in Cloud, every cluster's Console shares one origin. */
const confirmationKey = (linkName: string) =>
  `shadow-box-cutover-confirmed:${config.clusterId ?? 'default'}:${linkName}`;

const readConfirmation = (key: string) => {
  try {
    return window.sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

/**
 * Everything the Cutover tab and the failover dialog need to say whether failing over is safe: the
 * source cluster's box (read by Cloud, or confirmed by hand) and every topic's lag. Pass a short
 * `pollMs` while the user is watching lag drain, and `enabled: false` to fetch nothing.
 */
export const useCutoverReadiness = (
  link: UnifiedShadowLink | undefined,
  { pollMs, enabled }: { pollMs: number; enabled: boolean }
) => {
  const linkName = link?.name ?? '';
  const key = confirmationKey(linkName);
  const source = useShadowBoxStore((state) => (linkName ? state.topology?.sources[linkName] : undefined));
  const topology = useShadowBoxStore((state): TopologyState => {
    if (!state.topology) {
      return 'none';
    }
    return state.topology.resolving ? 'resolving' : 'resolved';
  });
  // Keyed, so a link that loads after the page (or a different link) reads its own confirmation.
  const [stored, setStored] = useState<{ key: string; confirmed: boolean } | null>(null);
  const manuallyConfirmed = stored?.key === key ? stored.confirmed : readConfirmation(key);

  const topicsQuery = useListShadowTopicQuery(
    { shadowLinkName: linkName, pageSize: -1 },
    {
      enabled: enabled && Boolean(linkName),
      refetchInterval: (query) => (query.state.status === 'error' ? Math.max(pollMs, ERROR_POLL_MS) : pollMs),
    }
  );

  const setConfirmed = useCallback(
    (confirmed: boolean) => {
      setStored({ key, confirmed });
      try {
        window.sessionStorage.setItem(key, String(confirmed));
      } catch {
        // Confirmation then lasts only as long as this page.
      }
    },
    [key]
  );

  const linkIdentity = useMemo(() => getLinkIdentity(link), [link]);
  /** A failed refresh keeps the last topics, which readiness then treats as out of date. */
  const topicsFailed = topicsQuery.isError;
  const readiness = useMemo(
    () =>
      getCutoverReadiness({
        topics: topicsQuery.data?.shadowTopics,
        topicsFailed,
        box: getSourceBoxStep({ source, link: linkIdentity, topology, manuallyConfirmed }),
      }),
    [topicsQuery.data, topicsFailed, source, linkIdentity, topology, manuallyConfirmed]
  );

  return {
    readiness,
    linkIdentity,
    linkPrincipal: linkIdentity.principal,
    refetchTopics: topicsQuery.refetch,
    setManuallyConfirmed: setConfirmed,
  };
};
