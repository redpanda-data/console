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
import { useLegacyConsumerGroupDetailsQuery } from 'react-query/api/consumer-group';

import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Text } from '../../redpanda-ui/components/typography';

type ConsumerLagProps = {
  consumerGroupId: string;
  enabled?: boolean;
};

/**
 * Formats a number with thousands separators and optional unit suffix (k, M).
 * @param value - The numeric value to format
 * @returns Formatted string with unit suffix if applicable
 */
function formatNumber(value: number): string {
  const million = 1000 * 1000;

  let decimals: number;
  let unit = '';
  let formattedValue = value;

  if (value >= million) {
    unit = 'M';
    formattedValue = value / million;
    decimals = 2;
  } else if (value >= 1000) {
    unit = 'k';
    formattedValue = value / 1000;
    decimals = 1;
  } else {
    decimals = 1;
  }

  const valString = Number(formattedValue.toFixed(decimals)).toLocaleString();
  return unit ? valString + unit : valString;
}

export const ConsumerLag = React.memo<ConsumerLagProps>(({ consumerGroupId, enabled = true }) => {
  const { data: consumerGroup, isLoading } = useLegacyConsumerGroupDetailsQuery(consumerGroupId, {
    enabled: enabled && !!consumerGroupId,
  });

  if (isLoading) {
    return <Skeleton className="h-7 w-32" />;
  }

  if (!consumerGroup) {
    return (
      <Text className="text-xl" variant="muted">
        -
      </Text>
    );
  }

  const lagValue = consumerGroup.lagSum ?? 0;

  return (
    <div className="flex items-baseline gap-2">
      <span className="font-semibold text-xl">{formatNumber(lagValue)}</span>
      <Text className="text-sm" variant="muted">
        messages
      </Text>
    </div>
  );
});

ConsumerLag.displayName = 'ConsumerLag';
