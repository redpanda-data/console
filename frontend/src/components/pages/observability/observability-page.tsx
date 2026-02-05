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

import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useListQueries } from 'react-query/api/observability';
import { appGlobal } from 'state/app-global';
import { uiState } from 'state/ui-state';

import { MetricChart } from './metric-chart';
import { calculateTimeRange, ObservabilityToolbar, type TimeRange } from './observability-toolbar';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Skeleton } from '../../redpanda-ui/components/skeleton';

const ObservabilityPage: FC = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1h');
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: queries,
    isLoading: isLoadingQueries,
    isError,
    refetch,
  } = useListQueries({
    filter: {
      tags: {
        // We show in the cluster observability page only metric charts marked with (all) the following tags.
        component: 'cluster',
        category: 'overview',
      },
    },
  });

  const refreshData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    refetch();
  }, [refetch]);

  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Metrics', linkTo: '/observability' }];
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers recalculation on refresh
  const timeRange = useMemo(() => calculateTimeRange(selectedTimeRange), [selectedTimeRange, refreshKey]);

  if (isLoadingQueries) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[40px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading metrics</AlertTitle>
        <AlertDescription>Failed to load observability metrics. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ObservabilityToolbar
        onTimeRangeChange={setSelectedTimeRange}
        refreshKey={refreshKey}
        selectedTimeRange={selectedTimeRange}
      />

      {queries?.queries && queries.queries.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {queries.queries.map((query) => (
            <MetricChart key={query.name} queryName={query.name} timeRange={timeRange} />
          ))}
        </div>
      ) : (
        <Alert variant="info">
          <AlertDescription>No metrics queries available at this time.</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ObservabilityPage;
