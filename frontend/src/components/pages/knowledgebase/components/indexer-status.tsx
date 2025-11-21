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

import React from 'react';

import { Text } from '../../../redpanda-ui/components/typography';

type ConsumerGroupState = 'Stable' | 'Empty' | 'Dead' | 'Unknown' | 'CompletingRebalance' | 'PreparingRebalance';

type IndexerStatusProps = {
  configured: boolean;
  topicCount: number;
  state?: ConsumerGroupState | string;
  memberCount?: number;
  isLoading?: boolean;
  hasError?: boolean;
};

const getStateColor = (state?: ConsumerGroupState | string): string => {
  if (!state) {
    return 'bg-gray-400';
  }

  const normalizedState = state.toLowerCase().replace(/\s+/g, '');

  switch (normalizedState) {
    case 'stable':
      return 'bg-green-500';
    case 'empty':
      return 'bg-yellow-500';
    case 'dead':
      return 'bg-red-500';
    case 'unknown':
      return 'bg-gray-400';
    case 'completingrebalance':
    case 'preparingrebalance':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
};

export const IndexerStatus = React.memo<IndexerStatusProps>(
  ({ configured, topicCount, state, memberCount, isLoading = false, hasError = false }) => {
    // Simple mode: just show configured/not configured with topic count
    if (state === undefined && memberCount === undefined) {
      if (!configured) {
        return (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            <Text variant="muted">Not configured</Text>
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <Text variant="default">
            {topicCount} {topicCount === 1 ? 'topic' : 'topics'}
          </Text>
        </div>
      );
    }

    // Detailed mode: show state with member count
    if (hasError) {
      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          <Text variant="muted">Initializing...</Text>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          <Text variant="muted">Loading...</Text>
        </div>
      );
    }

    if (!state) {
      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <Text variant="muted">-</Text>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${getStateColor(state)}`} />
        <div className="flex items-baseline gap-2">
          <Text variant="default">{state}</Text>
          {memberCount !== undefined && (
            <Text variant="muted">
              ({memberCount} {memberCount === 1 ? 'member' : 'members'})
            </Text>
          )}
        </div>
      </div>
    );
  }
);

IndexerStatus.displayName = 'IndexerStatus';
