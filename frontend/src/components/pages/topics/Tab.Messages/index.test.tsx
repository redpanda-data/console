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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { CompressionType, type Payload, type Topic, type TopicMessage } from 'state/rest-interfaces';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { TopicMessageView } from '.';

const { startSearchMock } = rs.hoisted(() => ({ startSearchMock: rs.fn() }));

rs.mock('../../../../state/backend-api', () => {
  const actual = rs.requireActual<typeof import('../../../../state/backend-api')>('../../../../state/backend-api');
  return {
    ...actual,
    createMessageSearch: () => ({
      startSearch: startSearchMock,
      loadMore: rs.fn(),
      messages: [],
      nextPageToken: null,
      bytesConsumed: 2048,
      totalMessagesConsumed: 2,
    }),
  };
});

const topic: Topic = {
  topicName: 'orders',
  isInternal: false,
  partitionCount: 3,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
};

function buildPayload(payload: string): Payload {
  return { payload, isPayloadNull: false, encoding: 'text', schemaId: 0, size: payload.length };
}

function buildMessage(offset: number, key: string, value: string): TopicMessage {
  return {
    partitionID: 0,
    offset,
    timestamp: 1_700_000_000_000 + offset,
    compression: CompressionType.Uncompressed,
    isTransactional: false,
    headers: [],
    key: buildPayload(key),
    value: buildPayload(value),
    valueJson: JSON.stringify(value),
    valueBinHexPreview: '',
    keyJson: JSON.stringify(key),
    keyBinHexPreview: '',
  };
}

function renderView() {
  return renderWithFileRoutes(
    <NuqsTestingAdapter hasMemory>
      <TopicMessageView refreshTopicData={rs.fn()} topic={topic} />
    </NuqsTestingAdapter>,
    { initialLocation: '/topics/orders' }
  );
}

describe('topicMessageView', () => {
  beforeEach(() => {
    startSearchMock.mockReset();
  });

  test('searches the topic on mount and lists the returned messages', async () => {
    startSearchMock.mockResolvedValue([buildMessage(1, 'order-1', 'created'), buildMessage(2, 'order-2', 'shipped')]);
    renderView();

    expect(await screen.findByText('order-1')).toBeVisible();
    expect(screen.getByText('shipped')).toBeVisible();
    expect(startSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ topicName: 'orders', maxResults: 50, partitionId: -1, startOffset: -1 }),
      expect.any(AbortSignal)
    );
    expect(screen.getByTestId('save-messages-button')).toBeEnabled();
  });

  test('shows an empty state when the search finds nothing', async () => {
    startSearchMock.mockResolvedValue([]);
    renderView();

    expect(await screen.findByText('No messages')).toBeVisible();
    expect(screen.getByTestId('save-messages-button')).toBeDisabled();
  });

  test('narrows the table with the quick search', async () => {
    const user = userEvent.setup();
    startSearchMock.mockResolvedValue([buildMessage(1, 'order-1', 'created'), buildMessage(2, 'order-2', 'shipped')]);
    renderView();
    await screen.findByText('order-1');

    await user.type(screen.getByTestId('message-quick-search-input'), 'shipped');

    await waitFor(() => expect(screen.queryByText('order-1')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('messages-table')).getByText('order-2')).toBeVisible();
  });

  test('reports a failed search with a retry action', async () => {
    startSearchMock.mockRejectedValue(new Error('broker unavailable'));
    renderView();

    expect(await screen.findByText('Backend Error')).toBeVisible();
    expect(screen.getByText('broker unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry Search' })).toBeVisible();
  });

  test('offers the add filter and settings menus', async () => {
    startSearchMock.mockResolvedValue([]);
    renderView();
    await screen.findByText('No messages');

    expect(screen.getByTestId('add-topic-filter')).toBeVisible();
    expect(screen.getByTestId('message-settings-button')).toBeVisible();
    expect(screen.getByTestId('start-offset-dropdown')).toHaveTextContent('Newest - 50');
  });

  test('searches again from the chosen start offset', async () => {
    const user = userEvent.setup();
    startSearchMock.mockResolvedValue([]);
    renderView();
    await screen.findByText('No messages');

    await user.click(screen.getByTestId('start-offset-dropdown'));
    await user.click(await screen.findByRole('option', { name: 'Beginning' }));

    await waitFor(() =>
      expect(startSearchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ startOffset: -2 }),
        expect.any(AbortSignal)
      )
    );
  });

  test('shows a custom offset input for the Offset origin', async () => {
    const user = userEvent.setup();
    startSearchMock.mockResolvedValue([]);
    renderView();
    await screen.findByText('No messages');

    await user.click(screen.getByTestId('start-offset-dropdown'));
    await user.click(await screen.findByRole('option', { name: 'Offset' }));

    await waitFor(() =>
      expect(startSearchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ startOffset: 0 }),
        expect.any(AbortSignal)
      )
    );
    // The select keeps its own hidden input with the same value, so pick the visible text input.
    const customOffsetInput = screen
      .getAllByDisplayValue('0')
      .find((input) => input.getAttribute('data-slot') === 'input');
    expect(customOffsetInput).toBeVisible();
  });

  test('opens the column settings from the settings menu', async () => {
    const user = userEvent.setup();
    startSearchMock.mockResolvedValue([]);
    renderView();
    await screen.findByText('No messages');

    await user.click(screen.getByTestId('message-settings-button'));
    await user.click(await screen.findByTestId('column-settings-menu-item'));

    expect(await screen.findByRole('dialog', { name: 'Column Settings' })).toBeVisible();
  });
});
