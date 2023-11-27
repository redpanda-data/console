/* eslint-disable testing-library/no-wait-for-multiple-assertions */
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
import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// TODO: Fix commented out parts
it.skip('renders all expected elements in step 1', async () => {
    render(<DeleteRecordsModal topic={testTopic} visible onCancel={jest.fn()} onFinish={jest.fn()} afterClose={jest.fn()} />);

    await waitFor(() => {

        expect(screen.getByText('Delete records in topic')).toBeInTheDocument();
        expect(screen.getByText('All Partitions')).toBeInTheDocument();
        expect(screen.getByText('Specific Partition')).toBeInTheDocument();
        // expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Choose End Offset')).toBeInTheDocument();
    
        // expect(screen.getByLabelText(/All Partitions/)).toBeChecked();
    })

});

// TODO: Fix commented out parts
it.skip('renders all expected elements in step 2', async () => {
    render(<DeleteRecordsModal topic={testTopic} visible onCancel={jest.fn()} onFinish={jest.fn()} afterClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Choose End Offset'));

    await waitFor(() => {
        // expect(screen.getByText('Manual Offset')).toBeInTheDocument();
        // expect(screen.getByText('Timestamp')).toBeInTheDocument();
        // expect(screen.getByText('Cancel')).toBeInTheDocument();
        // expect(screen.getByText('Delete Records')).toBeInTheDocument();

        // expect(screen.getByLabelText(/Manual Offset/)).toBeChecked();
    })
 
});
