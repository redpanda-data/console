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

import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import { Loader2 } from 'lucide-react';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useGetShadowMetricsQuery } from 'react-query/api/shadowlink';

const getStateDisplay = (state: ShadowLinkState): string => {
  const stateMap = {
    [ShadowLinkState.UNSPECIFIED]: 'Unknown',
    [ShadowLinkState.ACTIVE]: 'Active',
    [ShadowLinkState.PAUSED]: 'Paused',
  };
  return stateMap[state] || 'Unknown';
};

interface ShadowLinkMetricsProps {
  shadowLink: ShadowLink;
}

export const ShadowLinkMetrics = ({ shadowLink }: ShadowLinkMetricsProps) => {
  const {
    data: metricsData,
    isFetching,
    error,
  } = useGetShadowMetricsQuery({ name: shadowLink.name }, { refetchInterval: 5000 });

  if (error) {
    return (
      <Card testId="shadow-link-metrics-error">
        <CardContent className="pt-6">
          <Text className="text-destructive">Failed to load metrics: {error.message}</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* State */}
      <Card testId="shadow-link-metric-state">
        <CardContent className="relative pt-6">
          {isFetching && <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />}
          <Text className="text-muted-foreground text-sm" testId="metric-label-state">
            State
          </Text>
          <Text className="mt-2 font-semibold text-2xl" testId="metric-value-state">
            {getStateDisplay(shadowLink.state)}
          </Text>
        </CardContent>
      </Card>

      {/* Topics replicated */}
      <Card testId="shadow-link-metric-replicated">
        <CardContent className="relative pt-6">
          {isFetching && <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />}
          <Text className="text-muted-foreground text-sm" testId="metric-label-replicated">
            Topics replicated
          </Text>
          <Text className="mt-2 font-semibold text-2xl" testId="metric-value-replicated">
            {metricsData?.totalTopicsReplicated?.toString() ?? '-'}
          </Text>
        </CardContent>
      </Card>

      {/* Failed over topics */}
      <Card testId="shadow-link-metric-failedover">
        <CardContent className="relative pt-6">
          {isFetching && <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />}
          <Text className="text-muted-foreground text-sm" testId="metric-label-failedover">
            Failed over topics
          </Text>
          <Text className="mt-2 font-semibold text-2xl" testId="metric-value-failedover">
            {metricsData?.failedOverTopics?.toString() ?? '-'}
          </Text>
        </CardContent>
      </Card>

      {/* Errored topics */}
      <Card testId="shadow-link-metric-error">
        <CardContent className="relative pt-6">
          {isFetching && <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />}
          <Text className="text-muted-foreground text-sm" testId="metric-label-error">
            Errored topics
          </Text>
          <Text className="mt-2 font-semibold text-2xl" testId="metric-value-error">
            {metricsData?.errorTopics?.toString() ?? '-'}
          </Text>
        </CardContent>
      </Card>
    </div>
  );
};
