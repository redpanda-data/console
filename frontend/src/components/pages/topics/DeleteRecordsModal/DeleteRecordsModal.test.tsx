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
import { Topic } from '../../../../state/restInterfaces';
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

it('renders all expected elements in step 1', () => {
    render(<DeleteRecordsModal topic={testTopic} visible={true} onCancel={jest.fn()} onFinish={jest.fn()} afterClose={jest.fn()} />);

    expect(screen.getByText('Delete records in topic')).toBeInTheDocument();
    expect(screen.getByText('All Partitions')).toBeInTheDocument();
    expect(screen.getByText('Specific Partition')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Choose End Offset')).toBeInTheDocument();

    expect(screen.getByLabelText(/All Partitions/)).toBeChecked();
});

it('renders all expected elements in step 2', () => {
    render(<DeleteRecordsModal topic={testTopic} visible={true} onCancel={jest.fn()} onFinish={jest.fn()} afterClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Choose End Offset'));

    expect(screen.getByText('Manual Offset')).toBeInTheDocument();
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete Records')).toBeInTheDocument();

    expect(screen.getByLabelText(/Manual Offset/)).toBeChecked();
});
