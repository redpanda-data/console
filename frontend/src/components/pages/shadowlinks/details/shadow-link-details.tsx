/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { useMemo, useState } from 'react';
import { useListShadowTopicInfiniteQuery } from 'react-query/api/shadowlink';
import { MAX_PAGE_SIZE, SHORT_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';

import { ShadowLinkDiagram } from './shadow-link-diagram';
import { ShadowLinkMetrics } from './shadow-link-metrics';
import { ShadowTopicsTable } from './shadow-topics-table';

type ShadowLinkDetailsProps = {
  shadowLink: ShadowLink;
  shadowLinkName: string;
  onFailoverTopic: (topicName?: string) => void;
};

export const ShadowLinkDetails = ({ shadowLink, shadowLinkName, onFailoverTopic }: ShadowLinkDetailsProps) => {
  const [topicNameFilter, setTopicNameFilter] = useState('');

  const {
    data: shadowTopicsData,
    refetch: refetchTopics,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isFetchingTopics,
  } = useListShadowTopicInfiniteQuery(
    {
      shadowLinkName,
      filter: topicNameFilter
        ? {
            topicNameContains: topicNameFilter,
          }
        : undefined,
      pageSize: MAX_PAGE_SIZE,
    },
    { refetchInterval: SHORT_LIVED_CACHE_STALE_TIME }
  );

  // Flatten all pages of topics from infinite query
  const topics = useMemo(() => shadowTopicsData?.pages?.flatMap((page) => page.shadowTopics) ?? [], [shadowTopicsData]);

  return (
    <>
      {/* Shadow Link Diagram */}
      <ShadowLinkDiagram shadowLink={shadowLink} />

      {/* Shadow Link Metrics */}
      <ShadowLinkMetrics shadowLink={shadowLink} />

      {/* Topics Section */}
      <ShadowTopicsTable
        getNextTopicPage={async () => {
          await fetchNextPage();
        }}
        hasNextPage={hasNextPage}
        isFetching={isFetchingTopics || isFetchingNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onFailoverTopic={onFailoverTopic}
        onRefresh={refetchTopics}
        onTopicNameFilterChange={setTopicNameFilter}
        topicNameFilter={topicNameFilter}
        topics={topics}
      />
    </>
  );
};
