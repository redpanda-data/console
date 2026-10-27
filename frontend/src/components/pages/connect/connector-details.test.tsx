import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from 'test-utils';

import KafkaConnectorDetails from './connector-details';
import { type MessageSearchRequest, useApiStore } from '../../../state/backend-api';
import { ConnectClusterStore } from '../../../state/connect/state';
import type { ClusterConnectorInfo, ClusterConnectors, Topic, TopicMessage } from '../../../state/rest-interfaces';

/** Every log search the page started, in order; each stays open until stopped, like the real stream. */
const { logSearches } = rs.hoisted(() => ({ logSearches: [] as FakeLogSearch[] }));

rs.mock('../../../state/backend-api', () => ({
  ...rs.requireActual<typeof import('../../../state/backend-api')>('../../../state/backend-api'),
  createMessageSearch: createFakeLogSearch,
}));

type FakeLogSearch = ReturnType<typeof createFakeLogSearch>;

function createFakeLogSearch() {
  const search = {
    messages: [] as TopicMessage[],
    searchRequest: null as MessageSearchRequest | null,
    startSearch: rs.fn((request: MessageSearchRequest) => {
      search.searchRequest = request;
      return new Promise<TopicMessage[]>(() => {
        // stays open until stopped
      });
    }),
    stopSearch: rs.fn(),
  };
  logSearches.push(search);
  return search;
}

/** The decoded backend filter of the most recent log search. */
function lastLogFilter() {
  const request = logSearches.at(-1)?.searchRequest;
  if (!request) {
    throw new Error('No log search was started');
  }
  return atob(request.filterInterpreterCode);
}

const connectorNamed = (name: string): ClusterConnectorInfo => ({
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
});

/** A cluster store that has already loaded `example` and `other`. */
class LoadedConnectClusterStore extends ConnectClusterStore {
  private readonly remoteConnectors = [connectorNamed('example'), connectorNamed('other')];

  constructor() {
    super('cluster');
    this.isInitialized = true;
    // No installed plugins, so no connector has a config form to load.
    this.additionalClusterInfo = { clusterName: 'cluster', host: '', clusterVersion: '', plugins: [] };
  }

  override get cluster(): ClusterConnectors | null {
    return null;
  }

  override setup() {
    return Promise.resolve();
  }

  override getRemoteConnector(connectorName: string) {
    return this.remoteConnectors.find((c) => c.name === connectorName);
  }
}

const logsTopic: Topic = {
  topicName: '__redpanda.connectors_logs',
  isInternal: true,
  partitionCount: 1,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
};

const initialApiState = useApiStore.getState();

beforeEach(() => {
  rs.spyOn(ConnectClusterStore, 'getInstance').mockReturnValue(new LoadedConnectClusterStore());
  useApiStore.setState({
    topics: [logsTopic],
    refreshConnectClusters: rs.fn(() => Promise.resolve()),
    refreshTopics: rs.fn(),
  });
});

afterEach(() => {
  // The page is still mounted and subscribed when this runs.
  act(() => {
    useApiStore.setState(initialApiState, true);
  });
  rs.restoreAllMocks();
  logSearches.length = 0;
});

/** Opens the Logs tab of connector `example`. */
async function openExampleLogs(user: ReturnType<typeof userEvent.setup>) {
  const view = render(<KafkaConnectorDetails clusterName="cluster" connector="example" matchedPath="/" />);
  await user.click(await screen.findByRole('tab', { name: 'Logs' }));
  expect(lastLogFilter()).toBe('return key == "example";');
  return view;
}

test('restarts the log search for the connector the page now shows', async () => {
  const user = userEvent.setup();
  const { rerender } = await openExampleLogs(user);
  const exampleSearch = logSearches.at(-1);

  rerender(<KafkaConnectorDetails clusterName="cluster" connector="other" matchedPath="/" />);

  expect(lastLogFilter()).toBe('return key == "other";');
  expect(exampleSearch?.stopSearch).toHaveBeenCalled();
});

test('refreshing the logs stops the running search and starts a new one', async () => {
  const user = userEvent.setup();
  await openExampleLogs(user);
  const firstSearch = logSearches.at(-1);

  await user.click(screen.getByRole('button', { name: 'Refresh logs' }));

  expect(logSearches.at(-1)).not.toBe(firstSearch);
  expect(firstSearch?.stopSearch).toHaveBeenCalled();
  expect(lastLogFilter()).toBe('return key == "example";');
});
