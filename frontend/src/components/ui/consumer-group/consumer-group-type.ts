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

import type { GroupType } from 'state/rest-interfaces';

export const groupTypeLabels: Record<GroupType, string> = {
  classic: 'Classic',
  consumer: 'Consumer',
};

export const formatGroupType = (groupType: GroupType): string => groupTypeLabels[groupType];

export const consumerGroupTypeFilterOptions: { label: string; value: GroupType }[] = [
  { label: groupTypeLabels.classic, value: 'classic' },
  { label: groupTypeLabels.consumer, value: 'consumer' },
];
