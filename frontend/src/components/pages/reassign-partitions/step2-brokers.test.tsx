import { afterEach, expect, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

import { StepSelectBrokers } from './step2-brokers';
import { useApiStore } from '../../../state/backend-api';

const initialState = useApiStore.getState();
afterEach(() => useApiStore.setState(initialState, true));

const seedBrokers = () =>
  useApiStore.setState({
    clusterInfo: {
      controllerId: 1,
      kafkaVersion: '4.0',
      brokers: [
        { brokerId: 1, address: 'one', rack: 'a', logDirSize: 1000, config: { configs: undefined, error: undefined } },
        { brokerId: 2, address: 'two', rack: 'b', logDirSize: 100, config: { configs: undefined, error: undefined } },
      ],
    },
  });

async function sortByUsedSpace(user: UserEvent, direction: 'Asc' | 'Desc') {
  await user.click(screen.getByRole('button', { name: 'Used Space' }));
  await user.click(screen.getByRole('menuitem', { name: direction }));
}

test('sorts target brokers by space without changing selection identity', async () => {
  seedBrokers();
  const user = userEvent.setup();
  const onSelectionChange = rs.fn();
  render(<StepSelectBrokers onSelectionChange={onSelectionChange} partitionSelection={{}} selectedBrokerIds={[]} />);
  await sortByUsedSpace(user, 'Asc');
  expect(within(screen.getAllByRole('row')[1]).getByRole('checkbox', { name: 'Select broker 2' })).toBeVisible();
  await user.click(screen.getByRole('checkbox', { name: 'Select broker 2' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith([2]);
  await sortByUsedSpace(user, 'Desc');
  expect(within(screen.getAllByRole('row')[1]).getByRole('checkbox', { name: 'Select broker 1' })).toBeVisible();
});
