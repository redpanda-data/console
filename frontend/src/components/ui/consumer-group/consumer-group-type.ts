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

/** The label of a group type as the UI shows it. A broker below ListGroups v5 reports no type, which reads as classic. */
export const formatGroupType = (groupType: string | undefined): string =>
  groupTypeLabels[groupType as GroupType] ?? groupTypeLabels.classic;

export const consumerGroupTypeFilterOptions: { label: string; value: GroupType }[] = [
  { label: groupTypeLabels.consumer, value: 'consumer' },
  { label: groupTypeLabels.classic, value: 'classic' },
];
