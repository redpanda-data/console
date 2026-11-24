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

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { useApiStore } from 'state/backend-api';
import type { DeleteRecordsResponseData, GetPartitionsResponse, Partition, Topic } from 'state/rest-interfaces';

import DeleteRecordsModal from './delete-records-modal';

const TOPIC_NAME = 'orders';
const topic: Topic = {
  allowedActions: ['all'],
  cleanupPolicy: 'delete',
  partitionCount: 2,
  replicationFactor: 1,
  isInternal: false,
  documentation: 'UNKNOWN',
  topicName: TOPIC_NAME,
  logDirSummary: { totalSizeBytes: 1024, hint: null, replicaErrors: [] },
};

function partition(id: number, waterMarkLow: number) {
  return {
    id,
    topicName: TOPIC_NAME,
    partitionError: null,
    replicas: [1],
    offlineReplicas: null,
    inSyncReplicas: [1],
    leader: 1,
    partitionLogDirs: [],
    waterMarksError: null,
    waterMarkLow,
    waterMarkHigh: waterMarkLow + 500,
    replicaSize: 1024,
    hasErrors: false,
  } satisfies Partition;
}

const server = setupServer();
const guardedFetch = globalThis.fetch;
const originalFetch = config.fetch;
const topicUrl = new URL(`${config.restBasePath}/topics/${TOPIC_NAME}`, window.location.href).href;
const initialState = useApiStore.getState();

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the record deletion tests');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  server.resetHandlers();
  useApiStore.setState(initialState, true);
});

afterAll(() => {
  config.fetch = originalFetch;
  server.close();
});

function Harness() {
  const [visible, setVisible] = useState(true);
  const close = () => setVisible(false);
  return <DeleteRecordsModal afterClose={close} onCancel={close} onFinish={close} topic={topic} visible={visible} />;
}

function renderDeletion() {
  const deletes: unknown[] = [];
  server.use(
    http.get(`${topicUrl}/partitions`, () =>
      HttpResponse.json({
        topicName: TOPIC_NAME,
        error: null,
        partitions: [partition(0, 41), partition(1, 125)],
      } satisfies GetPartitionsResponse)
    ),
    http.delete(`${topicUrl}/records`, async ({ request }) => {
      deletes.push(await request.json());
      return HttpResponse.json({
        topicName: TOPIC_NAME,
        partitions: [{ partitionId: 1, lowWaterMark: 125, error: '' }],
      } satisfies DeleteRecordsResponseData);
    })
  );
  render(<Harness />);
  return deletes;
}

async function choosePartitionOne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Specific Partition'));
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Partition 1' }));
  await user.click(screen.getByRole('button', { name: 'Choose End Offset' }));
}

test('submits the selected partition’s low watermark when the manual offset is untouched', async () => {
  const user = userEvent.setup();
  const deletions = renderDeletion();
  expect(screen.getByRole('dialog', { name: 'Delete records in topic' })).toBeVisible();
  expect(screen.getByText('All Partitions')).toBeVisible();
  await choosePartitionOne(user);
  await user.click(screen.getByText('Manual Offset'));
  expect(await screen.findByLabelText('Offset')).toHaveValue('125');

  await user.click(screen.getByRole('button', { name: 'Delete Records' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(deletions).toEqual([{ partitions: [{ partitionId: 1, offset: 125 }] }]);
});
