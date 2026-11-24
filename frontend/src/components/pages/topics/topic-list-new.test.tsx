// Copyright 2026 Redpanda Data, Inc.

import { createClient, createRouterTransport } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, onTestFinished, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { ClusterStatusService } from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { DebugBundleService } from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { appGlobal } from 'state/app-global';
import { useApiStore } from 'state/backend-api';
import type { ClusterInfoResponse, GetTopicsResponse, Topic } from 'state/rest-interfaces';
import { useUIStateStore } from 'state/ui-state';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import TopicList from './topic-list-new';
import DataRefreshButton from '../../misc/buttons/data-refresh/component';

const guardedFetch = globalThis.fetch;
const initialFetch = config.fetch;
const clusterUrl = new URL(`${config.restBasePath}/cluster`, window.location.href).href;
const server = setupServer(
  http.get(clusterUrl, () =>
    HttpResponse.json({
      clusterInfo: { brokers: [], controllerId: 0, kafkaVersion: '3.0' },
    } satisfies ClusterInfoResponse)
  )
);
const topicsUrl = new URL(`${config.restBasePath}/topics`, window.location.href).href;
let response: GetTopicsResponse = { topics: [] };

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the topic list');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});
afterAll(() => {
  config.fetch = initialFetch;
  server.close();
});

afterEach(() => server.resetHandlers());

const TOPIC_LINK_NAME = /^orders-/u;

const topics = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      ({
        topicName: `orders-${i}`,
        isInternal: false,
        partitionCount: 3,
        replicationFactor: 3,
        cleanupPolicy: 'delete',
        documentation: 'NOT_CONFIGURED',
        logDirSummary: { totalSizeBytes: 1024, replicaErrors: null, hint: null },
        allowedActions: undefined,
      }) satisfies Topic
  );

const statusTransport = createRouterTransport(({ rpc }) => {
  rpc(ClusterStatusService.method.getKafkaAuthorizerInfo, () => ({}));
  rpc(ClusterStatusService.method.getConsoleInfo, () => ({}));
  rpc(ClusterStatusService.method.getKafkaInfo, () => ({}));
  rpc(ClusterStatusService.method.getRedpandaInfo, () => ({}));
  rpc(ClusterStatusService.method.getKafkaConnectInfo, () => ({}));
  rpc(DebugBundleService.method.getClusterHealth, () => ({}));
});

function configureRefresh() {
  const { clusterStatusClient, debugBundleClient } = config;
  const { onRefresh } = appGlobal;
  const apiState = useApiStore.getState();
  const header = useUIStateStore.getState();
  Object.assign(config, {
    clusterStatusClient: createClient(ClusterStatusService, statusTransport),
    debugBundleClient: createClient(DebugBundleService, statusTransport),
  });
  onTestFinished(() => {
    Object.assign(config, { clusterStatusClient, debugBundleClient });
    appGlobal.onRefresh = onRefresh;
    useApiStore.setState(apiState, true);
    useUIStateStore.setState(header, true);
  });
}

function renderList(page = 2, pageSize = 10) {
  configureRefresh();
  const updates: URLSearchParams[] = [];
  const search = `?page=${page}&pageSize=${pageSize}`;
  renderWithFileRoutes(
    <NuqsTestingAdapter hasMemory onUrlUpdate={({ searchParams }) => updates.push(searchParams)} searchParams={search}>
      <DataRefreshButton />
      <TopicList />
    </NuqsTestingAdapter>,
    { initialLocation: `/topics${search}`, transport: statusTransport }
  );
  return updates;
}

function delayFirstTopicRead() {
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<GetTopicsResponse>();
  server.use(
    http.get(topicsUrl, async () => {
      started.resolve();
      return HttpResponse.json(await reply.promise);
    })
  );
  const sendEmptyList = () => reply.resolve({ topics: [] });
  onTestFinished(sendEmptyList);
  return { requestStarted: started.promise, sendEmptyList };
}

async function selectRowsPerPage(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('the TopicList pagination', () => {
  beforeEach(() => {
    response = { topics: topics(21) };
    server.use(http.get(topicsUrl, () => HttpResponse.json(response)));
  });

  test('displays an active page size outside the preset options', async () => {
    renderList(0, 15);

    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-14' })).toBeVisible());
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('15');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  test('returns to the last existing page and updates the URL after topics disappear', async () => {
    const user = userEvent.setup();
    const updates = renderList();
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-20' })).toBeInTheDocument());

    response = { topics: topics(20) };
    await user.click(screen.getByRole('button', { name: 'Force refresh' }));

    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'orders-19' })).toBeInTheDocument();
    expect(screen.queryByText('No topics yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    await waitFor(() => expect(updates.at(-1)?.get('page')).toBe('1'));
  });

  test('repairs a stale page when loading finishes with an empty list', async () => {
    const { requestStarted, sendEmptyList } = delayFirstTopicRead();
    const updates = renderList();

    await requestStarted;
    expect(updates).toEqual([]);
    sendEmptyList();

    expect(await screen.findByText('No topics yet')).toBeInTheDocument();
    await waitFor(() => expect(updates.at(-1)?.has('page')).toBe(false));
    expect(screen.getByText('Page 0 of 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to first page' })).toBeDisabled();
  });

  test('pagination controls navigate and change the page size without losing topics', async () => {
    const user = userEvent.setup();
    renderList(0);
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-0' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Go to last page' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-20' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Go to previous page' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-10' })).toBeInTheDocument());
    await selectRowsPerPage(user, '50');
    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: TOPIC_LINK_NAME })).toHaveLength(21);
  });

  test('filters by name and clears the filter from the reset button', async () => {
    const user = userEvent.setup();
    renderList(0);
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-0' })).toBeInTheDocument());
    expect(screen.getByTestId('search-field-search-icon')).toBeInTheDocument();

    await user.type(screen.getByTestId('search-field-input'), 'orders-20');

    await waitFor(() => expect(screen.queryByRole('link', { name: 'orders-0' })).not.toBeInTheDocument());
    expect(screen.queryByTestId('search-field-search-icon')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('search-field-reset-icon'));

    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-0' })).toBeInTheDocument());
    expect(screen.getByTestId('search-field-input')).toHaveValue('');
  });
});
