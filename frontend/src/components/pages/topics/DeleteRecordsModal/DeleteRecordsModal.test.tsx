import { fireEvent, render } from '@testing-library/react';
import { Topic } from '../../../../state/restInterfaces';
import DeleteRecordsModal from './DeleteRecordsModal';

const testTopic: Topic = {
    allowedActions: ['all'],
    cleanupPolicy: 'compact',
    partitionCount: 3,
    replicationFactor: 3,
    isInternal: false,
    topicName: 'test_topic',
    logDirSummary: {
        totalSizeBytes: 1024,
        hint: null,
        replicaErrors: [],
    },
};

it('renders all expected elements in step 1', () => {
    const { getByLabelText, getByText } = render(<DeleteRecordsModal topic={testTopic} visible={true} onCancel={jest.fn()} />);

    expect(getByText('Delete records in topic')).toBeInTheDocument();
    expect(getByText('All Partitions')).toBeInTheDocument();
    expect(getByText('Specific Partition')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
    expect(getByText('Choose End Offset')).toBeInTheDocument();

    expect(getByLabelText(/All Partitions/)).toBeChecked();
});

it('renders all expected elements in step 2', () => {
    const { getByLabelText, getByText } = render(<DeleteRecordsModal topic={testTopic} visible={true} onCancel={jest.fn()} />);

    fireEvent.click(getByText('Choose End Offset'));

    expect(getByText('Manual Offset')).toBeInTheDocument();
    expect(getByText('Timestamp')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
    expect(getByText('Delete Records')).toBeInTheDocument();
    
    expect(getByLabelText(/Manual Offset/)).toBeChecked();
});
