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

import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { RefreshCw } from 'lucide-react';
import { useGetShadowMetricsQuery } from 'react-query/api/shadowlink';

import { SHORT_LIVED_CACHE_STALE_TIME } from '../../../../react-query/react-query.utils';
import { type UnifiedShadowLink, type UnifiedShadowLinkState, UnifiedShadowLinkStateLabel } from '../model';

const getStateDisplay = (state: UnifiedShadowLinkState): string => UnifiedShadowLinkStateLabel[state] || 'Unknown';

// Revealed while the card is hovered or the button has focus, so it stays out of the way of the value.
const MetricCardRefreshButton = ({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) =>
  isFetching ? (
    <span className="absolute top-2 right-2 flex">
      <TonedIcon icon={Spinner} tone="muted" />
    </span>
  ) : (
    <span className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
      <Button aria-label="Refresh metrics" onClick={onRefresh} size="icon" variant="ghost">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </span>
  );

type MetricCardProps = {
  metric: string;
  label: string;
  value: string;
  isFetching: boolean;
  onRefresh: () => void;
};

const MetricCard = ({ metric, label, value, isFetching, onRefresh }: MetricCardProps) => (
  <Card className="group" testId={`shadow-link-metric-${metric}`}>
    <CardContent className="relative">
      <MetricCardRefreshButton isFetching={isFetching} onRefresh={onRefresh} />
      <div className="text-body text-muted-foreground" data-testid={`metric-label-${metric}`}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold" data-testid={`metric-value-${metric}`}>
        {value}
      </div>
    </CardContent>
  </Card>
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
        <CardContent>
          <div className="text-body text-destructive">Failed to load metrics: {error.message}</div>
        </CardContent>
      </Card>
    );
  }

  const onRefresh = () => refetch();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        isFetching={isFetching}
        label="State"
        metric="state"
        onRefresh={onRefresh}
        value={getStateDisplay(shadowLink.state)}
      />
      <MetricCard
        isFetching={isFetching}
        label="Replicated topics"
        metric="replicated"
        onRefresh={onRefresh}
        value={metricsData?.totalTopicsReplicated?.toString() ?? '-'}
      />
      <MetricCard
        isFetching={isFetching}
        label="Failed over topics"
        metric="failedover"
        onRefresh={onRefresh}
        value={metricsData?.failedOverTopics?.toString() ?? '-'}
      />
      <MetricCard
        isFetching={isFetching}
        label="Errored topics"
        metric="error"
        onRefresh={onRefresh}
        value={metricsData?.errorTopics?.toString() ?? '-'}
      />
    </div>
  );
};
