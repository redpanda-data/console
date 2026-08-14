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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Loader2, RefreshCw } from 'lucide-react';
import { useGetShadowMetricsQuery } from 'react-query/api/shadowlink';

import { SHORT_LIVED_CACHE_STALE_TIME } from '../../../../react-query/react-query.utils';
import { type UnifiedShadowLink, type UnifiedShadowLinkState, UnifiedShadowLinkStateLabel } from '../model';

const getStateDisplay = (state: UnifiedShadowLinkState): string => UnifiedShadowLinkStateLabel[state] || 'Unknown';

const MetricCardRefreshButton = ({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) =>
  isFetching ? (
    <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />
  ) : (
    <Button
      className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
      onClick={onRefresh}
      size="icon"
      variant="ghost"
    >
      <RefreshCw className="h-4 w-4" />
    </Button>
  );

type ShadowLinkMetricsProps = {
  shadowLink: UnifiedShadowLink;
};

export const ShadowLinkMetrics = ({ shadowLink }: ShadowLinkMetricsProps) => {
  const {
    data: metricsData,
    isFetching,
    error,
    refetch,
  } = useGetShadowMetricsQuery({ name: shadowLink.name }, { refetchInterval: SHORT_LIVED_CACHE_STALE_TIME });

  if (error) {
    return (
      <Card testId="shadow-link-metrics-error">
        <CardContent className="pt-6">
          <div className="text-body text-destructive">Failed to load metrics: {error.message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* State */}
      <Card className="group" testId="shadow-link-metric-state">
        <CardContent className="relative pt-6">
          <MetricCardRefreshButton isFetching={isFetching} onRefresh={() => refetch()} />
          <div className="text-body text-muted-foreground" data-testid="metric-label-state">
            State
          </div>
          <div className="mt-2 font-semibold text-2xl" data-testid="metric-value-state">
            {getStateDisplay(shadowLink.state)}
          </div>
        </CardContent>
      </Card>

      {/* Replicated topics */}
      <Card className="group" testId="shadow-link-metric-replicated">
        <CardContent className="relative pt-6">
          <MetricCardRefreshButton isFetching={isFetching} onRefresh={() => refetch()} />
          <div className="text-body text-muted-foreground" data-testid="metric-label-replicated">
            Replicated topics
          </div>
          <div className="mt-2 font-semibold text-2xl" data-testid="metric-value-replicated">
            {metricsData?.totalTopicsReplicated?.toString() ?? '-'}
          </div>
        </CardContent>
      </Card>

      {/* Failed over topics */}
      <Card className="group" testId="shadow-link-metric-failedover">
        <CardContent className="relative pt-6">
          <MetricCardRefreshButton isFetching={isFetching} onRefresh={() => refetch()} />
          <div className="text-body text-muted-foreground" data-testid="metric-label-failedover">
            Failed over topics
          </div>
          <div className="mt-2 font-semibold text-2xl" data-testid="metric-value-failedover">
            {metricsData?.failedOverTopics?.toString() ?? '-'}
          </div>
        </CardContent>
      </Card>

      {/* Errored topics */}
      <Card className="group" testId="shadow-link-metric-error">
        <CardContent className="relative pt-6">
          <MetricCardRefreshButton isFetching={isFetching} onRefresh={() => refetch()} />
          <div className="text-body text-muted-foreground" data-testid="metric-label-error">
            Errored topics
          </div>
          <div className="mt-2 font-semibold text-2xl" data-testid="metric-value-error">
            {metricsData?.errorTopics?.toString() ?? '-'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
