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

import { fireEvent, render, screen } from '@testing-library/react';
import type { Topic } from '../../../../state/restInterfaces';
import DeleteRecordsModal from './DeleteRecordsModal';

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
      <DeleteRecordsModal
        topic={testTopic}
        visible={true}
        onCancel={vi.fn()}
        onFinish={vi.fn()}
        afterClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Delete records in topic')).toBeInTheDocument();
    expect(screen.getByText('All Partitions')).toBeInTheDocument();
    expect(screen.getByText('Specific Partition')).toBeInTheDocument();
    expect(screen.getByText('Choose End Offset')).toBeInTheDocument();
  });
});
