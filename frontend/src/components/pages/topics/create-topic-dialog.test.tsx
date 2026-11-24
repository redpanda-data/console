/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Code, ConnectError, createClient, createRouterTransport, type MethodImpl } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { ClusterStatusService, KafkaDistribution } from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { DebugBundleService } from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type { CreateTopicRequest } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, useApiStore } from 'state/backend-api';
import type { ClusterInfoResponse } from 'state/rest-interfaces';
import { act, cleanup, fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { CreateTopicDialog } from './create-topic-dialog';

const guardedFetch = globalThis.fetch;
const initialFetch = config.fetch;
const initialClusterStatusClient = config.clusterStatusClient;
const initialDebugBundleClient = config.debugBundleClient;
const initialApiState = useApiStore.getState();
const clusterUrl = new URL(`${config.restBasePath}/cluster`, window.location.href).href;
const topicsUrl = new URL(`${config.restBasePath}/topics`, window.location.href).href;
const server = setupServer(
  http.get(clusterUrl, () =>
    HttpResponse.json({
      clusterInfo: { brokers: [], controllerId: 0, kafkaVersion: '3.0' },
    } satisfies ClusterInfoResponse)
  ),
  http.get(topicsUrl, () => HttpResponse.json({ topics: [] }))
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the create-topic dialog');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  cleanup();
  config.clusterStatusClient = initialClusterStatusClient;
  config.debugBundleClient = initialDebugBundleClient;
  useApiStore.setState(initialApiState, true);
  toast.dismiss();
});

afterAll(() => {
  config.fetch = initialFetch;
  server.close();
});

type User = ReturnType<typeof userEvent.setup>;

function DialogLauncher() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open topic dialog
      </button>
      <CreateTopicDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

const createdTopic: MethodImpl<typeof createTopic> = (request) => ({
  topicName: request.topic?.name,
  partitionCount: 12,
  replicationFactor: 3,
});

function renderDialog({
  create = createdTopic,
  distribution = KafkaDistribution.APACHE_KAFKA,
}: {
  create?: MethodImpl<typeof createTopic>;
  distribution?: KafkaDistribution;
} = {}) {
  const requests: CreateTopicRequest[] = [];
  let currentDistribution = distribution;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(ClusterStatusService.method.getKafkaInfo, () => ({ distribution: currentDistribution }));
    rpc(ClusterStatusService.method.getKafkaAuthorizerInfo, () => ({}));
    rpc(ClusterStatusService.method.getConsoleInfo, () => ({}));
    rpc(ClusterStatusService.method.getRedpandaInfo, () => ({}));
    rpc(ClusterStatusService.method.getKafkaConnectInfo, () => ({}));
    rpc(DebugBundleService.method.getClusterHealth, () => ({}));
    rpc(createTopic, (request, context) => {
      requests.push(request);
      return create(request, context);
    });
  });
  config.clusterStatusClient = createClient(ClusterStatusService, transport);
  config.debugBundleClient = createClient(DebugBundleService, transport);
  renderWithFileRoutes(<DialogLauncher />, { initialLocation: '/topics', transport });
  return {
    requests,
    setDistribution: (next: KafkaDistribution) => {
      currentDistribution = next;
    },
    user: userEvent.setup(),
  };
}

const topicName = () => screen.getByRole('textbox', { name: 'Topic name' });
const createButton = () => screen.getByRole('button', { name: 'Create' });
const minInSyncReplicas = () => screen.queryByRole('textbox', { name: 'Min in-sync replicas' });

async function enterName(user: User, name: string) {
  const input = topicName();
  await user.click(input);
  await user.paste(name);
  await user.tab();
  return input;
}

async function submit(user: User) {
  await waitFor(() => expect(createButton()).toBeEnabled());
  await user.click(createButton());
}

async function submitOwningForm(input: HTMLElement) {
  const form = input.closest('form');
  if (!form) {
    throw new Error('Topic name must belong to the create form');
  }
  await act(() => {
    fireEvent.submit(form);
  });
}

async function fillCounts(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Partitions' }), '5');
  await user.type(screen.getByRole('textbox', { name: 'Replication factor' }), '3');
}

async function expectCreatedCounts(name: string, partitions: number, replicationFactor: number) {
  const dialog = await screen.findByRole('dialog', { name: 'Topic created' });
  expect(dialog).toHaveTextContent(name);
  expect(dialog).toHaveTextContent(`${partitions}Partitions`);
  expect(dialog).toHaveTextContent(`${replicationFactor}Replication factor`);
}

test.each([
  ['topic with spaces', 'Topic name cannot contain spaces'],
  ['orders/', 'Use only letters, numbers, dots, underscores, and hyphens'],
  ['orders-消費者', 'Use only letters, numbers, dots, underscores, and hyphens'],
  ['.', 'Topic name cannot be . or ..'],
  ['..', 'Topic name cannot be . or ..'],
  ['a'.repeat(250), 'Topic name must be 249 characters or fewer'],
])('rejects invalid topic name %s without an RPC', async (name, message) => {
  const { requests, user } = renderDialog();
  const input = await enterName(user, name);

  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(message);
  expect(createButton()).toBeDisabled();
  await submitOwningForm(input);
  expect(requests).toHaveLength(0);
});

test('sends the 249-character boundary unchanged and shows the broker counts', async () => {
  const { requests, user } = renderDialog();
  const name = `orders.${'a'.repeat(239)}_-9`;
  expect(createButton()).toBeDisabled();
  await enterName(user, name);
  await submit(user);

  await expectCreatedCounts(name, 12, 3);
  expect(requests.map((request) => request.topic?.name)).toEqual([name]);
});

test('rejects zero partitions during entry', async () => {
  const { user } = renderDialog();
  await enterName(user, 'orders');
  const input = screen.getByRole('textbox', { name: 'Partitions' });
  await user.type(input, '0');

  expect(await screen.findByText('Must be at least 1')).toBeInTheDocument();
  expect(createButton()).toBeDisabled();
});

test('rejects an even replication factor on Redpanda', async () => {
  const { user } = renderDialog({ distribution: KafkaDistribution.REDPANDA });
  await waitFor(() => expect(api.isRedpanda).toBe(true));
  await enterName(user, 'orders');
  await user.type(screen.getByRole('textbox', { name: 'Replication factor' }), '2');

  expect(await screen.findByText('Replication factor must be an odd number', { exact: false })).toBeInTheDocument();
  expect(createButton()).toBeDisabled();
});

test('shows requested counts when the broker responds with -1', async () => {
  const { requests, user } = renderDialog({
    create: () => ({ topicName: 'orders', partitionCount: -1, replicationFactor: -1 }),
  });
  await enterName(user, 'orders');
  await fillCounts(user);
  await submit(user);

  await expectCreatedCounts('orders', 5, 3);
  expect(requests.map((request) => [request.topic?.partitionCount, request.topic?.replicationFactor])).toEqual([
    [5, 3],
  ]);
});

test('keeps the form open with the real duplicate-topic error', async () => {
  const { user } = renderDialog({
    create: () => {
      throw new ConnectError('topic already exists', Code.AlreadyExists);
    },
  });
  await enterName(user, 'orders');
  await submit(user);

  expect(await screen.findByText('[already_exists] topic already exists')).toBeInTheDocument();
  expect(topicName()).toHaveValue('orders');
  expect(createButton()).toBeEnabled();
});

test('refreshes cluster distribution on reopen and hides the Kafka-only field on Redpanda', async () => {
  const { setDistribution, user } = renderDialog();
  await waitFor(() => expect(api.clusterOverview?.kafka?.distribution).toBe(KafkaDistribution.APACHE_KAFKA));
  expect(minInSyncReplicas()).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  setDistribution(KafkaDistribution.REDPANDA);
  await user.click(screen.getByRole('button', { name: 'Open topic dialog' }));

  await waitFor(() => expect(minInSyncReplicas()).not.toBeInTheDocument());
  expect(topicName()).toBeInTheDocument();
});

async function addConfiguration(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'Property name' }), 'compression.type');
  await user.type(screen.getByRole('textbox', { name: 'Property value' }), 'zstd');
  await user.click(screen.getByRole('button', { name: 'Add entry' }));
  await user.type(screen.getAllByRole('textbox', { name: 'Property name' })[1], 'segment.bytes');
  await user.type(screen.getAllByRole('textbox', { name: 'Property value' })[1], '1048576');
  await user.click(screen.getAllByRole('button', { name: 'Remove entry' })[1]);
}

test('submits the retained topic configuration but not the removed entry', async () => {
  const { requests, user } = renderDialog();
  await enterName(user, 'orders');
  await addConfiguration(user);
  await submit(user);

  await expectCreatedCounts('orders', 12, 3);
  expect(requests[0]?.topic?.configs.map(({ name, value }) => ({ name, value }))).toEqual([
    { name: 'compression.type', value: 'zstd' },
    { name: 'cleanup.policy', value: 'delete' },
  ]);
});
