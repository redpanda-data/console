import { create } from '@bufbuild/protobuf';
import { afterEach, expect, rs, test } from '@rstest/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TransformDetails from './transform-details';
import {
  PartitionTransformStatus_PartitionStatus,
  TransformMetadataSchema,
} from '../../../protogen/redpanda/api/dataplane/v1/transform_pb';
import { appGlobal } from '../../../state/app-global';
import { useTransformsStore } from '../../../state/backend-api';

const initialState = useTransformsStore.getState();
const initialRefresh = appGlobal.onRefresh;
afterEach(() => {
  // The page is still mounted and subscribed when this runs.
  act(() => {
    useTransformsStore.setState(initialState, true);
  });
  appGlobal.onRefresh = initialRefresh;
});

test('sorts transform partitions by lag in both directions', async () => {
  const user = userEvent.setup();
  const transform = create(TransformMetadataSchema, {
    name: 'example',
    inputTopicName: 'input',
    outputTopicNames: ['output'],
    statuses: [
      { partitionId: 1, brokerId: 1, lag: 100, status: PartitionTransformStatus_PartitionStatus.RUNNING },
      { partitionId: 2, brokerId: 2, lag: 10, status: PartitionTransformStatus_PartitionStatus.RUNNING },
    ],
  });
  useTransformsStore.setState({
    refreshTransforms: rs.fn(),
    transforms: [transform],
    transformDetails: new Map([['example', transform]]),
  });
  render(<TransformDetails matchedPath="/transforms/example" transformName="example" />);
  const table = screen.getByRole('columnheader', { name: 'Lag' }).closest('table');
  if (!table) {
    throw new Error('Missing partition table');
  }
  await user.click(screen.getByRole('button', { name: 'Lag' }));
  await user.click(screen.getByRole('menuitem', { name: 'Asc' }));
  expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('2');
  await user.click(screen.getByRole('button', { name: 'Lag' }));
  await user.click(screen.getByRole('menuitem', { name: 'Desc' }));
  expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('1');
});
