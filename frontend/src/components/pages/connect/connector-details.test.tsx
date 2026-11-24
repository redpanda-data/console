import { createClient, createRouterTransport, type HandlerContext } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, expect, onTestFinished, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import type { ListMessagesRequest } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { cleanup, render, screen, waitFor } from 'test-utils';

import KafkaConnectorDetails from './connector-details';
import { appGlobal } from '../../../state/app-global';
import { useApiStore } from '../../../state/backend-api';
import { ConnectClusterStore } from '../../../state/connect/state';
import type {
  ClusterAdditionalInfo,
  ClusterConnectorInfo,
  KafkaConnectors,
  Topic,
} from '../../../state/rest-interfaces';

const LOGS_TOPIC = '__redpanda.connectors_logs';
const CLUSTER = 'cluster';
const INITIAL_API = useApiStore.getState();
const ORIGINAL_CONFIG = { consoleClient: config.consoleClient, fetch: config.fetch };
const INITIAL_REFRESH = appGlobal.onRefresh;
const guardedFetch = globalThis.fetch;

const connectorNamed = (name: string) =>
  ({
    name,
    class: 'org.example.Sink',
    config: {},
    type: 'sink',
    topic: 'orders',
    state: 'RUNNING',
    status: 'HEALTHY',
    errors: [],
    totalTasks: 0,
    runningTasks: 0,
    tasks: [],
    jsonConfig: '{}',
  }) satisfies ClusterConnectorInfo;

const logsTopic: Topic = {
  topicName: LOGS_TOPIC,
  isInternal: true,
  partitionCount: 1,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
};

const rest = (path: string) => new URL(`${config.restBasePath}${path}`, window.location.href).href;
const server = setupServer(
  http.get(rest('/kafka-connect/connectors'), () =>
    HttpResponse.json({
      isConfigured: true,
      clusters: [
        {
          clusterName: CLUSTER,
          clusterAddress: 'connect:8083',
          clusterInfo: { version: '3.9.0', commit: 'example', kafka_cluster_id: 'local' },
          connectors: ['example', 'other'].map(connectorNamed),
          totalConnectors: 2,
          runningConnectors: 2,
          allowedActions: ['all'],
          canEditCluster: true,
          canViewCluster: true,
          canDeleteCluster: true,
        },
      ],
    } satisfies KafkaConnectors)
  ),
  http.get(rest(`/kafka-connect/clusters/${CLUSTER}`), () =>
    HttpResponse.json({
      clusterName: CLUSTER,
      host: 'connect:8083',
      clusterVersion: '3.9.0',
      plugins: [],
    } satisfies ClusterAdditionalInfo)
  ),
  http.get(rest('/topics'), () => HttpResponse.json({ topics: [logsTopic] }))
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame while opening connector logs');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  cleanup();
  config.consoleClient = ORIGINAL_CONFIG.consoleClient;
  useApiStore.setState(INITIAL_API, true);
  appGlobal.onRefresh = INITIAL_REFRESH;
  ConnectClusterStore.connectClusters.clear();
});

afterAll(() => {
  config.fetch = ORIGINAL_CONFIG.fetch;
  server.close();
});

type LogStream = { request: ListMessagesRequest; signal: AbortSignal };

function untilAborted(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
    } else {
      signal.addEventListener('abort', () => resolve(), { once: true });
    }
  });
}

function serveLogStreams() {
  const streams: LogStream[] = [];
  const finishFixture = Promise.withResolvers<void>();
  onTestFinished(() => finishFixture.resolve());
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, {
      async *listMessages(request, { signal }: HandlerContext) {
        streams.push({ request, signal });
        yield { controlMessage: { case: 'phase', value: { phase: 'Reading logs' } } };
        await Promise.race([untilAborted(signal), finishFixture.promise]);
      },
    });
  });
  config.consoleClient = createClient(ConsoleService, transport);
  return streams;
}

const filters = (streams: LogStream[]) =>
  streams.map(({ request }) => ({ topic: request.topic, filter: atob(request.filterInterpreterCode) }));

const connectorFilter = (name: string) => ({ topic: LOGS_TOPIC, filter: `return key == "${name}";` });

async function openExampleLogs(user: ReturnType<typeof userEvent.setup>) {
  const streams = serveLogStreams();
  const view = render(<KafkaConnectorDetails clusterName={CLUSTER} connector="example" matchedPath="/" />);
  await user.click(await screen.findByRole('tab', { name: 'Logs' }));
  await waitFor(() => expect(filters(streams)).toEqual([connectorFilter('example')]));
  return { ...view, streams };
}

test('switching connectors cancels the previous log stream and requests the new connector', async () => {
  const user = userEvent.setup();
  const { rerender, streams } = await openExampleLogs(user);

  rerender(<KafkaConnectorDetails clusterName={CLUSTER} connector="other" matchedPath="/" />);

  await waitFor(() => expect(filters(streams)).toEqual([connectorFilter('example'), connectorFilter('other')]));
  expect(streams.map(({ signal }) => signal.aborted)).toEqual([true, false]);
});

test('refresh cancels the live stream, and leaving the page cancels its replacement', async () => {
  const user = userEvent.setup();
  const { streams, unmount } = await openExampleLogs(user);

  await user.click(screen.getByRole('button', { name: 'Refresh logs' }));
  await waitFor(() => expect(filters(streams)).toEqual([connectorFilter('example'), connectorFilter('example')]));
  expect(streams.map(({ signal }) => signal.aborted)).toEqual([true, false]);

  unmount();
  await waitFor(() => expect(streams.every(({ signal }) => signal.aborted)).toBe(true));
});
