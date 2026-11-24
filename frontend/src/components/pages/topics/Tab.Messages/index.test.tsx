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

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import { afterEach, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { CompressionType, PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  KafkaRecordPayloadSchema,
  type ListMessagesRequest,
  type ListMessagesResponse,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { api } from 'state/backend-api';
import type { Topic } from 'state/rest-interfaces';
import { useTopicSettingsStore } from 'stores/topic-settings-store';
import { cleanup, renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { TopicMessageView } from '.';

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

const BROKER_UNAVAILABLE = /broker unavailable/u;
const FIRST_ORDER_ROW = /\border-1\b/u;
const originalConsoleClient = config.consoleClient;
const initialTopicSettings = useTopicSettingsStore.getState();

afterEach(() => {
  cleanup();
  config.consoleClient = originalConsoleClient;
  useTopicSettingsStore.setState(initialTopicSettings, true);
});

const textPayload = (payload: string, isPayloadTooLarge = false) =>
  create(KafkaRecordPayloadSchema, {
    normalizedPayload: new TextEncoder().encode(payload),
    encoding: PayloadEncoding.TEXT,
    payloadSize: isPayloadTooLarge ? 128 * 1024 : payload.length,
    isPayloadTooLarge,
  });

const dataFrame = (offset: number, key: string, value: string, isPayloadTooLarge = false) =>
  create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'data',
      value: {
        partitionId: 0,
        offset: BigInt(offset),
        timestamp: BigInt(1_700_000_000_000 + offset),
        compression: CompressionType.UNCOMPRESSED,
        key: textPayload(key),
        value: textPayload(value, isPayloadTooLarge),
      },
    },
  });

const doneFrame = create(ListMessagesResponseSchema, {
  controlMessage: { case: 'done', value: { elapsedMs: 5n, bytesConsumed: 64n } },
});

const orders = () => [dataFrame(1, 'order-1', 'created'), dataFrame(2, 'order-2', 'shipped')];

function renderView(reply: (attempt: number) => ListMessagesResponse[] = () => []) {
  const requests: ListMessagesRequest[] = [];
  config.consoleClient = createClient(
    ConsoleService,
    createRouterTransport(({ service }) => {
      service(ConsoleService, {
        listMessages(request) {
          requests.push(request);
          return createAsyncIterable([...reply(requests.length), doneFrame]);
        },
      });
    })
  );
  renderWithFileRoutes(
    <NuqsTestingAdapter hasMemory>
      <TopicMessageView refreshTopicData={api.refreshTopics} topic={topic} />
    </NuqsTestingAdapter>,
    { initialLocation: '/topics/orders' }
  );
  return { requests, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

const saveMessages = () => screen.getByTestId('save-messages-button');
const results = () => within(screen.getByTestId('messages-table'));

async function chooseStartOffset(user: User, name: string) {
  await user.click(screen.getByTestId('start-offset-dropdown'));
  await user.click(await screen.findByRole('option', { name }));
}

test('requests the newest rows and filters the streamed results', async () => {
  const { requests, user } = renderView(orders);
  expect(await screen.findByText('order-1')).toBeVisible();
  expect(saveMessages()).toBeEnabled();
  expect(requests).toMatchObject([
    { topic: 'orders', startOffset: -1n, partitionId: -1, maxResults: 50, includeOriginalRawPayload: true },
  ]);

  await user.type(screen.getByTestId('message-quick-search-input'), 'shipped');

  await waitFor(() => expect(results().queryByText('order-1')).not.toBeInTheDocument());
  expect(results().getByText('order-2')).toBeVisible();
  expect(results().getByText('shipped')).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('shows the empty state and keeps column settings reachable without any messages', async () => {
  const { user } = renderView();
  expect(await screen.findByText('No messages')).toBeVisible();
  expect(saveMessages()).toBeDisabled();
  expect(screen.getByTestId('add-topic-filter')).toBeVisible();
  expect(screen.getByTestId('start-offset-dropdown')).toHaveTextContent('Newest - 50');

  await user.click(screen.getByTestId('message-settings-button'));
  await user.click(await screen.findByTestId('column-settings-menu-item'));

  expect(await screen.findByRole('dialog', { name: 'Column Settings' })).toBeVisible();
});

test('retries the failed stream from the error alert and renders the recovered rows', async () => {
  const { requests, user } = renderView((attempt) => {
    if (attempt === 1) {
      throw new ConnectError('broker unavailable', Code.Unavailable);
    }
    return orders();
  });
  expect(await screen.findByText('Backend Error')).toBeVisible();
  expect(screen.getByText(BROKER_UNAVAILABLE)).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Retry Search' }));

  expect(await screen.findByText('order-1')).toBeVisible();
  expect(screen.queryByText('Backend Error')).not.toBeInTheDocument();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test('sends the selected beginning and custom offsets on the wire', async () => {
  const { requests, user } = renderView();
  await screen.findByText('No messages');

  await chooseStartOffset(user, 'Beginning');
  await waitFor(() => expect(requests.at(-1)).toMatchObject({ startOffset: -2n }));

  await chooseStartOffset(user, 'Offset');
  await waitFor(() => expect(requests.at(-1)).toMatchObject({ startOffset: 0n }));

  const customOffset = screen.getAllByDisplayValue('0').find((input) => input.getAttribute('data-slot') === 'input');
  expect(customOffset).toBeVisible();
});

test('reloads an oversized record in place and opens its single-record download', async () => {
  const { requests, user } = renderView((attempt) =>
    attempt === 1
      ? [dataFrame(1, 'order-1', '', true), dataFrame(2, 'order-2', 'shipped')]
      : [dataFrame(1, 'order-1', 'full order payload')]
  );
  const row = await results().findByRole('row', { name: FIRST_ORDER_ROW });
  await user.click(within(row).getByRole('button', { name: 'Expand row' }));
  await user.click(await screen.findByRole('button', { name: 'Load anyway' }));

  expect(await screen.findByTestId('payload-content')).toHaveTextContent('full order payload');
  expect(requests[1]).toMatchObject({
    topic: 'orders',
    startOffset: 1n,
    partitionId: 0,
    maxResults: 1,
    ignoreMaxSizeLimit: true,
  });
  expect(requests).toHaveLength(2);
  expect(results().getByText('order-2')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Download Record' }));
  expect(await screen.findByRole('dialog', { name: 'Save Message' })).toBeVisible();
});
