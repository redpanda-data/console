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
import { type MessageSearchRequest, useTransformsStore } from '../../../state/backend-api';
import type { TopicMessage } from '../../../state/rest-interfaces';

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

const initialState = useTransformsStore.getState();
const initialRefresh = appGlobal.onRefresh;
afterEach(() => {
  // The page is still mounted and subscribed when this runs.
  act(() => {
    useTransformsStore.setState(initialState, true);
  });
  appGlobal.onRefresh = initialRefresh;
  logSearches.length = 0;
});

// Two running partitions whose lag order is the reverse of their id order.
function renderTransformWithPartitionLags() {
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
  return table;
}

async function sortByLag(user: ReturnType<typeof userEvent.setup>, direction: 'Asc' | 'Desc') {
  await user.click(screen.getByRole('button', { name: 'Lag' }));
  await user.click(screen.getByRole('menuitem', { name: direction }));
}

const firstRowPartitionCell = (table: HTMLElement) =>
  within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0];

test('sorts transform partitions by lag in both directions', async () => {
  const user = userEvent.setup();
  const table = renderTransformWithPartitionLags();
  await sortByLag(user, 'Asc');
  expect(firstRowPartitionCell(table)).toHaveTextContent('2');
  await sortByLag(user, 'Desc');
  expect(firstRowPartitionCell(table)).toHaveTextContent('1');
});

const transformNamed = (name: string) =>
  create(TransformMetadataSchema, { name, inputTopicName: 'input', outputTopicNames: ['output'] });

/** Opens the Logs tab of `example`, with `other` also deployed. */
async function openExampleLogs(user: ReturnType<typeof userEvent.setup>) {
  const transforms = [transformNamed('example'), transformNamed('other')];
  useTransformsStore.setState({
    refreshTransforms: rs.fn(),
    transforms,
    transformDetails: new Map(transforms.map((t) => [t.name, t])),
  });
  const view = render(<TransformDetails matchedPath="/transforms/example" transformName="example" />);
  await user.click(screen.getByRole('tab', { name: 'Logs' }));
  expect(lastLogFilter()).toBe('return key == "example";');
  return view;
}

test('restarts the log search for the transform the page now shows', async () => {
  const user = userEvent.setup();
  const { rerender } = await openExampleLogs(user);
  const exampleSearch = logSearches.at(-1);

  rerender(<TransformDetails matchedPath="/transforms/other" transformName="other" />);

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
