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

import { z } from 'zod';

export const topicsSortIds = ['topicName', 'partitionCount', 'replicationFactor', 'size'] as const;
export type TopicsSortId = (typeof topicsSortIds)[number];

export function isTopicsSortId(value: string): value is TopicsSortId {
  return topicsSortIds.some((sortId) => sortId === value);
}

export const topicsSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  showInternal: z.boolean().optional().catch(undefined),
  page: z.number().int().nonnegative().optional().catch(undefined),
  sortId: z.enum(topicsSortIds).optional().catch(undefined),
  sortDesc: z.boolean().optional().catch(undefined),
});

export type TopicsSearch = z.infer<typeof topicsSearchSchema>;
