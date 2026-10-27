import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { useApiStore } from 'state/backend-api';
import type { GroupDescription } from 'state/rest-interfaces';
import { render, screen, waitFor, within } from 'test-utils';

import { DeleteOffsetsModal, EditOffsetsModal, type GroupOffset } from './modals';

const group: GroupDescription = {
  groupId: 'test-group',
  state: 'Empty',
  protocol: '',
  protocolType: 'consumer',
  members: [],
  coordinatorId: 0,
  topicOffsets: [],
  allowedActions: null,
  lagSum: 0,
  isInUse: false,
  noEditPerms: false,
  noDeletePerms: false,
};

const offsets: GroupOffset[] = [
  { topicName: 'orders', partitionId: 0, offset: 5 },
  { topicName: 'orders', partitionId: 1, offset: 3 },
];

function renderModal() {
  return render(
    <EditOffsetsModal
      group={group}
      initialPartition={null}
      initialTopic="orders"
      offsets={offsets}
      onClose={() => {
        // no op - test callback
      }}
    />
  );
}

async function chooseStrategy(user: ReturnType<typeof userEvent.setup>, strategy: string) {
  await user.click(screen.getByRole('combobox', { name: 'Strategy' }));
  await user.click(await screen.findByRole('option', { name: strategy }));
}

describe('editOffsetsModal', () => {
  const initialApiState = useApiStore.getState();

  beforeEach(() => {
    useApiStore.setState({
      consumerGroups: new Map(),
      refreshConsumerGroups: rs.fn(),
      refreshPartitions: rs.fn(() => Promise.resolve()),
    });
  });

  afterEach(() => {
    rs.restoreAllMocks();
    useApiStore.setState(initialApiState, true);
  });

  test('reports a failed watermark refresh when the modal opens', async () => {
    const toastError = rs.spyOn(toast, 'error');
    useApiStore.setState({ refreshPartitions: rs.fn(() => Promise.reject(new Error('watermarks unavailable'))) });

    renderModal();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to load partition offsets', {
        description: 'Error: watermarks unavailable',
      })
    );
  });

  test('labels the topic, partition and strategy selects', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Topic' })).toBeVisible();
    expect(within(dialog).getByRole('combobox', { name: 'Partition' })).toBeVisible();
    expect(within(dialog).getByRole('combobox', { name: 'Strategy' })).toBeVisible();
  });

  test('labels the shift by input', async () => {
    const user = userEvent.setup();
    renderModal();

    await chooseStrategy(user, 'Shift By');

    expect(await screen.findByRole('spinbutton', { name: 'Shift by' })).toBeVisible();
  });

  test('names the timestamp picker group', async () => {
    const user = userEvent.setup();
    renderModal();

    await chooseStrategy(user, 'Specific Time');

    expect(await screen.findByRole('group', { name: 'Timestamp' })).toBeVisible();
  });

  test('labels the copy mode radios', async () => {
    const user = userEvent.setup();
    renderModal();

    await chooseStrategy(user, 'Other Consumer Group');

    expect(await screen.findByRole('radio', { name: 'Copy matching offsets' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Full Copy' })).toBeVisible();
  });
});

describe('deleteOffsetsModal', () => {
  const initialApiState = useApiStore.getState();

  beforeEach(() => {
    useApiStore.setState({ refreshConsumerGroups: rs.fn() });
  });

  afterEach(() => {
    rs.restoreAllMocks();
    useApiStore.setState(initialApiState, true);
  });

  const refreshFailure = { description: 'Error: refresh failed' };

  // Confirms a group delete whose follow-up consumer-group refresh rejects; resolves to the modal's onClose.
  async function confirmDeleteWithFailingRefresh(deleteConsumerGroup: () => Promise<void>) {
    const user = userEvent.setup();
    const onClose = rs.fn();
    useApiStore.setState({ deleteConsumerGroup: rs.fn(deleteConsumerGroup) });
    rs.spyOn(QueryClient.prototype, 'invalidateQueries').mockRejectedValue(new Error('refresh failed'));
    render(<DeleteOffsetsModal group={group} mode="group" offsets={offsets} onClose={onClose} />);
    await user.click(await screen.findByTestId('delete-offsets-confirm-button'));
    return onClose;
  }

  test('keeps a successful delete when refreshing the groups fails', async () => {
    const toastSuccess = rs.spyOn(toast, 'success');
    const toastError = rs.spyOn(toast, 'error');

    const onClose = await confirmDeleteWithFailingRefresh(() => Promise.resolve());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to refresh consumer groups', refreshFailure));
    expect(toastSuccess).toHaveBeenCalledWith('Deleting offsets - done', expect.anything());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useApiStore.getState().refreshConsumerGroups).toHaveBeenCalledWith(true);
  });

  test('still reports the delete failure when refreshing the groups also fails', async () => {
    const toastError = rs.spyOn(toast, 'error');
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleteFailure = new Error('delete denied');

    const onClose = await confirmDeleteWithFailingRefresh(() => Promise.reject(deleteFailure));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to refresh consumer groups', refreshFailure));
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Could not delete selected offsets in consumer group test-group'),
      expect.anything()
    );
    expect(consoleError).toHaveBeenCalledWith(deleteFailure);
    expect(onClose).not.toHaveBeenCalled();
  });
});
