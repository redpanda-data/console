// Copyright 2026 Redpanda Data, Inc.

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { GetTopicsResponse, Topic } from 'state/rest-interfaces';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import TopicList from './topic-list-new';

let response: GetTopicsResponse = { topics: [] };
let isLoading = false;

rs.mock('react-query/api/topic', () => {
  const actual = rs.requireActual<typeof import('react-query/api/topic')>('react-query/api/topic');
  return {
    ...actual,
    useLegacyListTopicsQuery: () => ({ data: response, isLoading, isError: false, refetch: rs.fn() }),
  };
});

rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    api: {
      ...actual.api,
      refreshCluster: rs.fn(),
      refreshClusterOverview: rs.fn(),
      refreshClusterHealth: rs.fn().mockResolvedValue(undefined),
    },
  };
});

const TOPIC_LINK_NAME = /^orders-/;

const topics = (count: number): Topic[] =>
  Array.from({ length: count }, (_, i) => ({
    topicName: `orders-${i}`,
    isInternal: false,
    partitionCount: 3,
    replicationFactor: 3,
    cleanupPolicy: 'delete',
    documentation: 'NOT_CONFIGURED',
    logDirSummary: { totalSizeBytes: 1024, replicaErrors: null, hint: null },
    allowedActions: undefined,
  }));

function renderList(page = 2, pageSize = 10) {
  const onUrlUpdate = rs.fn<OnUrlUpdateFunction>();
  const content = () => (
    <NuqsTestingAdapter hasMemory onUrlUpdate={onUrlUpdate} searchParams={`?page=${page}&pageSize=${pageSize}`}>
      <TopicList />
    </NuqsTestingAdapter>
  );
  return {
    ...renderWithFileRoutes(content(), { initialLocation: `/topics?page=${page}&pageSize=${pageSize}` }),
    content,
    onUrlUpdate,
  };
}

async function selectRowsPerPage(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('the TopicList pagination', () => {
  beforeEach(() => {
    response = { topics: topics(21) };
    isLoading = false;
  });

  test('displays an active page size outside the preset options', async () => {
    renderList(0, 15);

    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-14' })).toBeVisible());
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('15');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  test('returns to the last existing page and updates the URL after topics disappear', async () => {
    const { rerender, content, onUrlUpdate } = renderList();
    await waitFor(() => expect(screen.getByRole('link', { name: 'orders-20' })).toBeInTheDocument());

    response = { topics: topics(20) };
    rerender(content());

    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'orders-19' })).toBeInTheDocument();
    expect(screen.queryByText('No topics yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    await waitFor(() => expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get('page')).toBe('1'));
  });

  test('repairs a stale page when loading finishes with an empty list', async () => {
    response = { topics: [] };
    isLoading = true;
    const { rerender, content, onUrlUpdate } = renderList();

    isLoading = false;
    rerender(content());

    await waitFor(() => expect(screen.getByText('No topics yet')).toBeInTheDocument());
    await waitFor(() => expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.has('page')).toBe(false));
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
