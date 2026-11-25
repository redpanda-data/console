import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import {
  type ListTopicsRequest,
  type ListTopicsResponse,
  ListTopicsResponseSchema,
  TopicService,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { act, render, screen, waitFor } from 'test-utils';

import { TopicSelector } from './topic-selector';

type TopicHandler = (request: ListTopicsRequest, signal: AbortSignal) => Promise<ListTopicsResponse>;
const topicsResponse = (names: string[], nextPageToken = '') =>
  create(ListTopicsResponseSchema, {
    topics: names.map((name) => ({ name })),
    nextPageToken,
  });
function renderPicker(handler: TopicHandler, selectedTopics: string[] = []) {
  const onTopicsChange = rs.fn();
  const transport = createRouterTransport((router) =>
    router.service(TopicService, {
      listTopics: (request, context) => handler(request, context.signal),
    })
  );
  return { ...render(<TopicSelector onTopicsChange={onTopicsChange} selectedTopics={selectedTopics} />, { transport }), onTopicsChange };
}
async function openPicker() {
  await userEvent.click(screen.getByRole('combobox'));
}

test('failed topic searches show a retry action instead of a successful empty list', async () => {
  const handler = rs
    .fn<TopicHandler>()
    .mockRejectedValueOnce(new ConnectError('Temporarily unavailable', Code.Unavailable))
    .mockResolvedValueOnce(topicsResponse(['orders']));
  renderPicker(handler);
  await openPicker();
  await screen.findByText('Could not load topics.');
  expect(screen.queryByText('No topics found')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry topic search' }));
  expect(await screen.findByRole('option', { name: 'orders' })).toBeVisible();
  expect(handler).toHaveBeenCalledTimes(2);
});

type PendingSearch = ReturnType<typeof Promise.withResolvers<ListTopicsResponse>> & { signal: AbortSignal };
function deferredSearches() {
  const pending = new Map<string, PendingSearch>();
  const view = renderPicker((request, signal) => {
    const query = request.filter?.nameContains ?? '';
    if (!query) {
      return Promise.resolve(topicsResponse([]));
    }
    const result = { ...Promise.withResolvers<ListTopicsResponse>(), signal };
    pending.set(query, result);
    return result.promise;
  });
  return { ...view, pending };
}
async function startSearch(pending: Map<string, PendingSearch>, query: string) {
  const input = screen.getByPlaceholderText('Search topics (case-sensitive)...');
  await userEvent.clear(input);
  await userEvent.type(input, query);
  await waitFor(() => expect(pending.has(query)).toBe(true));
  const request = pending.get(query);
  if (!request) {
    throw new Error('Search request missing');
  }
  return request;
}
async function respond(request: PendingSearch, names: string[]) {
  await act(async () => {
    request.resolve(topicsResponse(names));
    await request.promise;
  });
}

test('new searches abort the transport and ignore late results from the old query', async () => {
  const { pending } = deferredSearches();
  await openPicker();
  const older = await startSearch(pending, 'older');
  const newer = await startSearch(pending, 'newer');
  expect(older.signal.aborted).toBe(true);
  await respond(newer, ['newer.topic']);
  expect(await screen.findByRole('option', { name: 'newer.topic' })).toBeVisible();
  await respond(older, ['older.topic']);
  expect(screen.queryByRole('option', { name: 'older.topic' })).not.toBeInTheDocument();
});

test('unmounting a picker aborts its in-flight transport request', async () => {
  const { pending, unmount } = deferredSearches();
  await openPicker();
  const request = await startSearch(pending, 'pending');
  expect(request.signal.aborted).toBe(false);
  unmount();
  try {
    await waitFor(() => expect(request.signal.aborted).toBe(true));
  } finally {
    await respond(request, ['pending.topic']);
  }
});

test('topic search follows opaque page tokens and hides internal topics', async () => {
  const handler = rs
    .fn<TopicHandler>()
    .mockResolvedValueOnce(topicsResponse(['orders', '_internal'], 'second-page'))
    .mockResolvedValueOnce(topicsResponse(['payments']));
  renderPicker(handler);
  await openPicker();
  expect(await screen.findByRole('option', { name: 'orders' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '_internal' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Load more topics' }));
  expect(await screen.findByRole('option', { name: 'payments' })).toBeVisible();
  expect(handler.mock.calls.map(([request]) => request.pageToken)).toEqual(['', 'second-page']);
});

test('selecting a topic keeps preselected values outside the current page', async () => {
  const { onTopicsChange } = renderPicker(() => Promise.resolve(topicsResponse(['orders'], 'second-page')), [
    'zz-not-on-page-1',
  ]);
  await openPicker();
  await userEvent.click(await screen.findByRole('option', { name: 'orders' }));
  expect(onTopicsChange.mock.calls.map(([topics]) => topics)).toEqual([['zz-not-on-page-1', 'orders']]);
});

test('repeated page tokens stop loading and retry resets to the first page', async () => {
  const handler = rs
    .fn<TopicHandler>()
    .mockResolvedValueOnce(topicsResponse(['orders'], 'repeated'))
    .mockResolvedValueOnce(topicsResponse(['payments'], 'repeated'))
    .mockResolvedValueOnce(topicsResponse(['recovered']));
  renderPicker(handler);
  await openPicker();
  await userEvent.click(await screen.findByRole('button', { name: 'Load more topics' }));
  await screen.findByText('Could not load topics.');
  expect(screen.getByRole('option', { name: 'orders' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Retry topic search' }));
  expect(await screen.findByRole('option', { name: 'recovered' })).toBeVisible();
  expect(handler.mock.calls.map(([request]) => request.pageToken)).toEqual(['', 'repeated', '']);
});

test('read-only topic selectors never fetch options', () => {
  const handler = rs.fn<TopicHandler>().mockResolvedValue(topicsResponse(['orders']));
  const transport = createRouterTransport((router) =>
    router.service(TopicService, {
      listTopics: (request, context) => handler(request, context.signal),
    })
  );
  render(<TopicSelector isReadOnly onTopicsChange={rs.fn()} selectedTopics={['orders']} />, { transport });
  expect(screen.getByText('orders')).toBeInTheDocument();
  expect(handler).not.toHaveBeenCalled();
});
