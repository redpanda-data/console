import { render, screen } from '@testing-library/react';
import {
  PartitionTransformStatus_PartitionStatus,
  TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/transform_pb';
import { transformsApi } from '../../../state/backendApi';
import TransformDetails from './Transform.Details';
import TransformsList from './Transforms.List';

function setTransformData(...transforms: TransformMetadata[]) {
  transformsApi.transforms = [...transforms];
  transformsApi.transformDetails.clear();
  for (const t of transformsApi.transforms) transformsApi.transformDetails.set(t.name, t);
}

const exampleTransformData = [
  new TransformMetadata({
    name: 'transform 1',
    inputTopicName: 'inputA',
    outputTopicNames: ['out1', 'out2', 'out3'],
    statuses: [
      { brokerId: 0, partitionId: 0, lag: 5, status: PartitionTransformStatus_PartitionStatus.RUNNING },
      { brokerId: 0, partitionId: 1, lag: 0, status: PartitionTransformStatus_PartitionStatus.RUNNING },
      { brokerId: 0, partitionId: 2, lag: 11, status: PartitionTransformStatus_PartitionStatus.RUNNING },
    ],
  }),
  new TransformMetadata({
    name: 'transform2',
    inputTopicName: 'inputB',
    outputTopicNames: ['out4', 'out5', 'out6'],
    statuses: [
      { brokerId: 0, partitionId: 0, lag: 5, status: PartitionTransformStatus_PartitionStatus.RUNNING },
      { brokerId: 1, partitionId: 1, lag: 0, status: PartitionTransformStatus_PartitionStatus.ERRORED },
      { brokerId: 0, partitionId: 2, lag: 11, status: PartitionTransformStatus_PartitionStatus.RUNNING },
    ],
  }),
];

it('renders the transform list showing example data', () => {
  setTransformData(...exampleTransformData);

  render(<TransformsList matchedPath="/transforms" />);

  expect(screen.getByText('Running')).toBeInTheDocument();
  expect(screen.getByText('transform 1')).toBeInTheDocument();
  expect(screen.getByText('inputA')).toBeInTheDocument();
  expect(screen.getByText('transform2')).toBeInTheDocument();

  expect(screen.getByText('out1')).toBeInTheDocument();
  expect(screen.getByText('out2')).toBeInTheDocument();
});

it('renders transform2 properly', () => {
  setTransformData(...exampleTransformData);

  render(<TransformDetails matchedPath="/transforms/transform2" transformName="transform2" />);

  expect(screen.getByText('Errored')).toBeInTheDocument();
  expect(screen.getByText('inputB')).toBeInTheDocument();
  expect(screen.getByText('out4')).toBeInTheDocument();
  expect(screen.getByText('out5')).toBeInTheDocument();
  expect(screen.getByText('out6')).toBeInTheDocument();
});
