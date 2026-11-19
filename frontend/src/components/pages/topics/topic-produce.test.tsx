import { createClient, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import type { PublishMessageRequest } from 'protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import { useApiStore } from 'state/backend-api';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { TopicProducePage } from './topic-produce';

const originalClient = config.consoleClient;
const { refreshTopics, refreshSchemaSubjects } = useApiStore.getState();
const publishMessage = rs.fn((request: PublishMessageRequest) => ({
  topic: request.topic,
  partitionId: 0,
  offset: 1n,
}));

beforeEach(() => {
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, { publishMessage });
  });
  config.consoleClient = createClient(ConsoleService, transport);
  useApiStore.setState({ refreshTopics: rs.fn().mockResolvedValue(undefined), refreshSchemaSubjects: rs.fn() });
});

afterEach(() => {
  config.consoleClient = originalClient;
  useApiStore.setState({ refreshTopics, refreshSchemaSubjects });
  publishMessage.mockClear();
});

test('publishes a named header with an empty value and skips a blank row', async () => {
  const user = userEvent.setup();
  renderWithFileRoutes(<TopicProducePage topicName="orders" />, { initialLocation: '/topics/orders/produce-record' });

  const addRow = () => user.click(screen.getByTestId('produce-headers-add'));
  await addRow();
  await user.type(screen.getByTestId('produce-headers-key-0'), 'marker');
  await addRow();
  await user.click(screen.getByRole('button', { name: 'Produce', exact: true }));

  await waitFor(() => expect(publishMessage).toHaveBeenCalledTimes(1));
  expect(publishMessage.mock.calls[0]?.[0].headers).toEqual([
    expect.objectContaining({ key: 'marker', value: new Uint8Array(0) }),
  ]);
});
