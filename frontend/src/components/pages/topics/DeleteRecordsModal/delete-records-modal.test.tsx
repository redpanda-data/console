/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';

import DeleteRecordsModal from './delete-records-modal';
import type { Topic } from '../../../../state/rest-interfaces';

const testTopic: Topic = {
  allowedActions: ['all'],
  cleanupPolicy: 'compact',
  partitionCount: 3,
  replicationFactor: 3,
  isInternal: false,
  documentation: 'UNKNOWN',
  topicName: 'test_topic',
  logDirSummary: {
    totalSizeBytes: 1024,
    hint: null,
    replicaErrors: [],
  },
};

describe('DeleteRecordsModal', () => {
  test('renders all expected elements in step 1', () => {
    render(
      <DeleteRecordsModal afterClose={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} topic={testTopic} visible={true} />
    );

    expect(screen.getByText('Delete records in topic')).toBeInTheDocument();
    expect(screen.getByText('All Partitions')).toBeInTheDocument();
    expect(screen.getByText('Specific Partition')).toBeInTheDocument();
    expect(screen.getByText('Choose End Offset')).toBeInTheDocument();
  });
});
