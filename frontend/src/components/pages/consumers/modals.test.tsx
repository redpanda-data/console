import { afterEach, beforeEach, describe, expect, onTestFinished, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { useLegacyListConsumerGroupsFullQuery } from 'react-query/api/consumer-group';
import { Toaster, toast } from 'sonner';
import { useApiStore } from 'state/backend-api';
import type { GroupDescription } from 'state/rest-interfaces';
import { render, screen, waitFor, within } from 'test-utils';

import { DeleteOffsetsModal, EditOffsetsModal, type GroupOffset } from './modals';

const group: GroupDescription = {
  groupId: 'test-group',
  groupType: 'classic',
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
      onClose={() => {}}
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

function DeleteGroupHarness() {
  const [open, setOpen] = useState(true);
  const { data } = useLegacyListConsumerGroupsFullQuery();
  return (
    <>
      <Toaster expand />
      <p>Loaded consumer group: {data.consumerGroups[0]?.groupId}</p>
      <DeleteOffsetsModal group={group} mode="group" offsets={open ? offsets : null} onClose={() => setOpen(false)} />
    </>
  );
}

const groupsUrl = new URL(`${config.restBasePath}/consumer-groups`, window.location.href).href;
const guardedFetch = globalThis.fetch;

function serveGroupDeletion(rejectDelete: boolean) {
  const requests: string[] = [];
  let deletionSent = false;
  const server = setupServer(
    http.get(groupsUrl, () => {
      requests.push('GET');
      return deletionSent
        ? HttpResponse.text('refresh failed', { status: 503, statusText: 'Refresh unavailable' })
        : HttpResponse.json({ consumerGroups: [group] });
    }),
    http.delete(`${groupsUrl}/test-group`, () => {
      requests.push('DELETE');
      deletionSent = true;
      return rejectDelete
        ? HttpResponse.text('delete denied', { status: 403 })
        : new HttpResponse(null, { status: 204 });
    })
  );
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the consumer group modal');
    },
  });
  const { fetch } = config;
  const apiState = useApiStore.getState();
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
  onTestFinished(() => {
    config.fetch = fetch;
    server.close();
    useApiStore.setState(apiState, true);
    toast.dismiss();
  });
  return requests;
}

async function confirmDelete(rejectDelete: boolean) {
  const requests = serveGroupDeletion(rejectDelete);
  const user = userEvent.setup();
  render(<DeleteGroupHarness />);
  await screen.findByText('Loaded consumer group: test-group');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  return requests;
}

async function expectRefreshReported(requests: string[]) {
  expect(await screen.findByText('Failed to refresh consumer groups')).toBeVisible();
  expect(screen.getByText('Error: Failed to fetch consumer groups: Refresh unavailable')).toBeVisible();
  expect(requests).toEqual(['GET', 'DELETE', 'GET', 'GET']);
}

const deleteFailureMessage = /Could not delete selected offsets in consumer group test-group/u;

describe('deleteOffsetsModal', () => {
  test('keeps a successful delete when refreshing the groups fails', async () => {
    const requests = await confirmDelete(false);

    expect(await screen.findByText('Deleting offsets - done')).toBeVisible();
    await expectRefreshReported(requests);
    expect(screen.queryByRole('alertdialog', { name: 'Delete consumer group' })).not.toBeInTheDocument();
  });

  test('still reports the delete failure when refreshing the groups also fails', async () => {
    const requests = await confirmDelete(true);

    expect(await screen.findByText(deleteFailureMessage)).toBeVisible();
    await expectRefreshReported(requests);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete consumer group' });
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
