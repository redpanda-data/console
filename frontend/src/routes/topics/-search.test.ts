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

import { isTopicsSortId, topicsSearchSchema } from './-search';

it('keeps valid topic-list state and drops malformed shared URL values', () => {
  expect(
    topicsSearchSchema.parse({
      q: 'orders',
      showInternal: true,
      page: 2,
      pageSize: 50,
      sortId: 'topicName',
      sortDesc: true,
    })
  ).toEqual({
    q: 'orders',
    showInternal: true,
    page: 2,
    sortId: 'topicName',
    sortDesc: true,
  });

  expect(
    topicsSearchSchema.parse({
      q: 12,
      showInternal: 'yes',
      page: -3,
      pageSize: 50_000,
      sortId: 'unknown',
      sortDesc: 'down',
    })
  ).toEqual({});
});

it('recognizes only sortable topic columns', () => {
  expect(isTopicsSortId('topicName')).toBe(true);
  expect(isTopicsSortId('cleanupPolicy')).toBe(false);
});
