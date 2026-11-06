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

import { useEffect, useMemo, useState } from 'react';
import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { type CloudSource, getFailoverReadiness, getLinkIdentity, getSourceBoxStep } from './failover-model';
import type { UnifiedShadowLink } from '../model';

/** After a failed read, keep trying, but slowly: the shadow cluster may be struggling. */
const ERROR_POLL_MS = 30_000;

/**
 * The source as last read with a known fence while this page has been open, so a passing read
 * failure later in the visit doesn't take the Failover tab away mid-failover.
 */
const useLastKnownSource = (linkName: string, source: CloudSource | undefined) => {
  const [lastKnown, setLastKnown] = useState<Partial<Record<string, CloudSource>>>({});
  const known = source?.box.status === 'known' ? source : undefined;
  useEffect(() => {
    if (known) {
      setLastKnown((previous) => ({ ...previous, [linkName]: known }));
    }
  }, [linkName, known]);
  return known ?? lastKnown[linkName];
};

/**
 * Everything the Failover tab and the guided failover dialog need to say whether failing over is
 * safe: the source cluster's fence, read by Cloud, and every topic's lag. `readiness` is undefined
 * when there's no guided failover: `enabled` is false, or Console can't read the source's fence.
 * `available` once the fence has been read in this visit; until then, `readiness` may only be
 * loading. Pass a short `pollMs` while the user is watching lag drain.
 */
export const useFailoverReadiness = (
  link: UnifiedShadowLink | undefined,
  { pollMs, enabled }: { pollMs: number; enabled: boolean }
) => {
  const linkName = link?.name ?? '';
  const source = useShadowBoxStore((state) => (linkName ? state.topology?.sources[linkName] : undefined));
  const resolving = useShadowBoxStore((state) => state.topology?.resolving ?? false);
  const linkIdentity = useMemo(() => getLinkIdentity(link), [link]);
  const lastKnown = useLastKnownSource(linkName, source?.kind === 'cloud' ? source : undefined);
  const box = useMemo(
    () => (enabled ? getSourceBoxStep({ source, link: linkIdentity, resolving, lastKnown }) : undefined),
    [enabled, source, linkIdentity, resolving, lastKnown]
  );

  const topicsQuery = useListShadowTopicQuery(
    { shadowLinkName: linkName, pageSize: -1 },
    {
      enabled: box !== undefined && Boolean(linkName),
      refetchInterval: (query) => (query.state.status === 'error' ? Math.max(pollMs, ERROR_POLL_MS) : pollMs),
    }
  );

  /** A failed refresh keeps the last topics, which readiness then treats as out of date. */
  const topicsFailed = topicsQuery.isError;
  const readiness = useMemo(
    () => (box ? getFailoverReadiness({ topics: topicsQuery.data?.shadowTopics, topicsFailed, box }) : undefined),
    [topicsQuery.data, topicsFailed, box]
  );

  return {
    readiness,
    available: readiness !== undefined && lastKnown !== undefined,
    linkIdentity,
    refetchTopics: topicsQuery.refetch,
  };
};
