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

import { Alert, AlertIcon, Box, Skeleton, Text } from '@redpanda-data/ui';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useListQueries } from 'react-query/api/observability';
import { appGlobal } from 'state/app-global';
import { uiState } from 'state/ui-state';

import { MetricChart } from './metric-chart';
import { calculateTimeRange, ObservabilityToolbar, type TimeRange } from './observability-toolbar';

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
      <Box display="flex" flexDirection="column" gap={4}>
        <Skeleton height="40px" />
        <Skeleton height="200px" />
        <Skeleton height="200px" />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert status="error">
        <AlertIcon />
        <Box>
          <Text fontWeight="bold">Error loading metrics</Text>
          <Text>Failed to load observability metrics. Please try again later.</Text>
        </Box>
      </Alert>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={6}>
      <ObservabilityToolbar
        onTimeRangeChange={setSelectedTimeRange}
        refreshKey={refreshKey}
        selectedTimeRange={selectedTimeRange}
      />

      {queries?.queries && queries.queries.length > 0 ? (
        <Box
          display="grid"
          gap={6}
          gridTemplateColumns={{
            base: '1fr',
            lg: 'repeat(2, 1fr)',
          }}
        >
          {queries.queries.map((query) => (
            <MetricChart key={query.name} queryName={query.name} timeRange={timeRange} />
          ))}
        </Box>
      ) : (
        <Alert status="info">
          <AlertIcon />
          <Text>No metrics queries available at this time.</Text>
        </Alert>
      )}
    </Box>
  );
};

export default ObservabilityPage;
