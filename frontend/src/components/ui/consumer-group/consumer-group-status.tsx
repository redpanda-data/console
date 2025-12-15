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

import { AlertCircle, Check, Clock, Loader2, StopCircle } from 'lucide-react';
import React from 'react';
import { useLegacyConsumerGroupDetailsQuery } from 'react-query/api/consumer-group';

import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Text } from '../../redpanda-ui/components/typography';

type ConsumerGroupState = 'Stable' | 'Empty' | 'Dead' | 'Unknown' | 'CompletingRebalance' | 'PreparingRebalance';

type ConsumerGroupStatusProps = {
  consumerGroupId: string;
  /**
   * When true, fetches consumer group details to show state and member count.
   * When false, only shows basic configured/topic count info.
   * @default false
   */
  showDetails?: boolean;
  /**
   * When showDetails is false, shows basic info instead of querying the consumer group.
   */
  fallbackInfo?: {
    configured: boolean;
    itemCount?: number;
    itemLabel?: string;
  };
};

export const getConsumerGroupStateDescription = (state?: string): string => {
  if (!state) {
    return '';
  }

  const normalizedState = state.toLowerCase().replace(/\s+/g, '');

  switch (normalizedState) {
    case 'stable':
      return 'Consumer group has members which have been assigned partitions';
    case 'completingrebalance':
      return 'Kafka is assigning partitions to group members';
    case 'preparingrebalance':
      return 'A reassignment of partitions is required, members have been asked to stop consuming';
    case 'empty':
      return 'Consumer group exists, but does not have any members';
    case 'dead':
      return 'Consumer group does not have any members and its metadata has been removed';
    case 'unknown':
      return 'Group state is not known';
    default:
      return '';
  }
};

const getStateIcon = (state?: ConsumerGroupState | string): React.ReactNode => {
  if (!state) {
    return null;
  }

  const normalizedState = state.toLowerCase().replace(/\s+/g, '');

  switch (normalizedState) {
    case 'stable':
      return <Check className="h-4 w-4 text-green-600" />;
    case 'completingrebalance':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case 'preparingrebalance':
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />;
    case 'empty':
      return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    case 'dead':
      return <StopCircle className="h-4 w-4 text-red-600" />;
    case 'unknown':
      return <Clock className="h-4 w-4 text-gray-600" />;
    default:
      return <Clock className="h-4 w-4 text-gray-600" />;
  }
};

export const ConsumerGroupStatus = React.memo<ConsumerGroupStatusProps>(
  ({ consumerGroupId, showDetails = false, fallbackInfo }) => {
    const {
      data: consumerGroup,
      isLoading,
      error,
    } = useLegacyConsumerGroupDetailsQuery(consumerGroupId, {
      enabled: showDetails && !!consumerGroupId,
    });

    const state = consumerGroup?.state;
    const memberCount = consumerGroup?.members?.length;
    const hasError = !!error;

    // Not configured
    if (fallbackInfo && !fallbackInfo.configured) {
      return (
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-gray-600" />
          <Text variant="muted">Not configured</Text>
        </div>
      );
    }

    // If showDetails is false, just show basic info
    if (!showDetails && fallbackInfo) {
      const itemLabel = fallbackInfo.itemLabel || 'item';
      const itemCount = fallbackInfo.itemCount ?? 0;
      return (
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-green-600" />
          <Text variant="default">
            {itemCount} {itemCount === 1 ? itemLabel : `${itemLabel}s`}
          </Text>
        </div>
      );
    }

    // Loading state
    if (isLoading) {
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2" variant="circle" />
          <Skeleton className="h-4" variant="text" width="sm" />
        </div>
      );
    }

    // Error state (consumer group might not exist yet)
    if (hasError) {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-yellow-600" />
          <Text variant="muted">Initializing...</Text>
        </div>
      );
    }

    // No state available - show fallback if provided
    if (!state && fallbackInfo) {
      const itemLabel = fallbackInfo.itemLabel || 'item';
      const itemCount = fallbackInfo.itemCount ?? 0;
      return (
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-green-600" />
          <Text variant="default">
            {itemCount} {itemCount === 1 ? itemLabel : `${itemLabel}s`}
          </Text>
        </div>
      );
    }

    // Show state with member count
    const stateIcon = getStateIcon(state);

    return (
      <div className="flex items-center gap-2">
        <span className="shrink-0">{stateIcon}</span>
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

ConsumerGroupStatus.displayName = 'ConsumerGroupStatus';
