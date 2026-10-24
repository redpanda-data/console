import { create } from '@bufbuild/protobuf';
import { createClient, createRouterTransport } from '@connectrpc/connect';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { CompressionType, PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  KafkaRecordPayloadSchema,
  ListMessagesResponse_DataMessageSchema,
  ListMessagesResponse_StreamCompletedMessageSchema,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { Topic } from 'state/rest-interfaces';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { TopicMessagesView } from './topic-messages-view';

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

const jsonPayload = (json: string) =>
  create(KafkaRecordPayloadSchema, {
    normalizedPayload: new TextEncoder().encode(json),
    encoding: PayloadEncoding.JSON,
    payloadSize: json.length,
  });

const dataFrame = (offset: number, key: string, status: string) =>
  create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'data',
      value: create(ListMessagesResponse_DataMessageSchema, {
        partitionId: 0,
        offset: BigInt(offset),
        timestamp: BigInt(1_700_000_000_000 + offset),
        compression: CompressionType.UNCOMPRESSED,
        key: jsonPayload(JSON.stringify(key)),
        value: jsonPayload(JSON.stringify({ status })),
      }),
    },
  });

const doneFrame = () =>
  create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'done',
      value: create(ListMessagesResponse_StreamCompletedMessageSchema, { elapsedMs: 5n, bytesConsumed: 64n }),
    },
  });

const originalConsoleClient = config.consoleClient;

/** Points the page's stream at an in-memory ConsoleService that answers every search with the same rows. */
function serveMessages() {
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, {
      listMessages: () =>
        createAsyncIterable([dataFrame(1, 'order-1', 'created'), dataFrame(2, 'order-2', 'shipped'), doneFrame()]),
    });
  });
  config.consoleClient = createClient(ConsoleService, transport);
}

function renderPage() {
  return renderWithFileRoutes(
    <NuqsTestingAdapter hasMemory>
      <TopicMessagesView topic={topic} />
    </NuqsTestingAdapter>,
    { initialLocation: '/topics/orders' }
  );
}

describe('topicMessagesView', () => {
  beforeEach(() => {
    serveMessages();
  });

  afterEach(() => {
    config.consoleClient = originalConsoleClient;
  });

  test('searches the topic on mount and lists the streamed rows', async () => {
    renderPage();

    expect(await screen.findByText('"order-1"')).toBeVisible();
    expect(screen.getByText('"order-2"')).toBeVisible();
    expect(screen.getAllByTestId('messages-table-row')).toHaveLength(2);
  });

  test('the filter bar narrows the loaded rows', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('"order-1"');

    await user.click(screen.getByTestId('messages-filter-input'));
    await user.paste('shipped');

    await waitFor(() => expect(screen.getAllByTestId('messages-table-row')).toHaveLength(1));
    expect(screen.getByText('"order-2"')).toBeVisible();
  });

  test('clicking a row docks its detail next to the table, and Expand swaps it for the sheet', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('"order-2"'));
    const panel = await screen.findByTestId('message-detail-panel');
    expect(within(panel).getByTestId('detail-metadata-section')).toBeVisible();

    await user.click(within(panel).getByTestId('detail-expand'));
    expect(await screen.findByTestId('message-detail-sheet')).toBeVisible();
    expect(screen.queryByTestId('message-detail-panel')).not.toBeInTheDocument();
  });
});
