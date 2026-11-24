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

import {
  getDefaultProperties,
  getPropertiesByCategory,
  isPropertyAlwaysReplicated,
  isPropertyEditable,
} from './topic-properties-config';
import { expect, test } from 'bun:test';

test('preselects the default replicated topic properties', () => {
  expect(getDefaultProperties().toSorted()).toEqual([
    'compression.type',
    'delete.retention.ms',
    'max.compaction.lag.ms',
    'min.compaction.lag.ms',
    'replication.factor',
    'retention.bytes',
    'retention.ms',
  ]);
});

test('groups retention and compaction properties for the topic configuration form', () => {
  const groups = getPropertiesByCategory();
  expect(groups.get('Retention')?.map(({ name }) => name)).toEqual([
    'retention.bytes',
    'retention.ms',
    'delete.retention.ms',
  ]);
  expect(groups.get('Compaction')?.map(({ name }) => name)).toEqual(
    expect.arrayContaining(['cleanup.policy', 'min.compaction.lag.ms', 'max.compaction.lag.ms'])
  );
});

test.each([
  {
    status: 'optional',
    properties: ['min.cleanable.dirty.ratio', 'retention.bytes', 'write.caching'],
    editable: true,
    always: false,
  },
  {
    status: 'always',
    properties: ['cleanup.policy', 'max.message.bytes', 'message.timestamp.type'],
    editable: false,
    always: true,
  },
  {
    status: 'never',
    properties: ['redpanda.remote.recovery', 'redpanda.remote.readreplica', 'redpanda.virtual.cluster.id'],
    editable: false,
    always: false,
  },
  { status: 'unknown', properties: ['non.existent.property'], editable: false, always: false },
])('applies the replication policy for $status properties', ({ properties, editable, always }) => {
  for (const property of properties) {
    expect(isPropertyEditable(property)).toBe(editable);
    expect(isPropertyAlwaysReplicated(property)).toBe(always);
  }
});
