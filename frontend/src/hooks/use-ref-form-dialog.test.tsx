/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Code, ConnectError, createRouterTransport, type MethodImpl } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { AddTopicStep } from 'components/pages/rp-connect/onboarding/add-topic-step';
import type { AddTopicFormData, BaseStepRef } from 'components/pages/rp-connect/types/wizard';
import { Button } from 'components/redpanda-ui/components/button';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { getKafkaInfo } from 'protogen/redpanda/api/console/v1alpha1/cluster_status-ClusterStatusService_connectquery';
import type { CreateTopicRequest } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApiStore } from 'state/backend-api';
import { act, cleanup, fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { useRefFormDialog } from './use-ref-form-dialog';

const guardedFetch = globalThis.fetch;
const originalRestFetch = config.fetch;
const initialApiState = useApiStore.getState();
const topicsUrl = new URL(`${config.restBasePath}/topics`, window.location.href).href;
const server = setupServer(http.get(topicsUrl, () => HttpResponse.json({ topics: [] })));

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the topic dialog');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  rs.useRealTimers();
  cleanup();
  server.resetHandlers();
  useApiStore.setState(initialApiState, true);
  toast.dismiss();
});

afterAll(() => {
  config.fetch = originalRestFetch;
  server.close();
});

function TopicDialog({ timeout }: { timeout?: number }) {
  const form = useRef<BaseStepRef<AddTopicFormData>>(null);
  const [binding, setBinding] = useState('');
  const [finished, setFinished] = useState(0);
  const dialog = useRefFormDialog<AddTopicFormData, string>({
    ref: form,
    onSuccess: ({ topicName }, target) => setBinding(`${target}: ${topicName}`),
    timeout,
  });
  return (
    <>
      <Button onClick={() => dialog.open('output')} type="button">
        Add output topic
      </Button>
      {dialog.isOpen ? (
        <section aria-label={`Topic in ${dialog.target}`}>
          <AddTopicStep hideTitle ref={form} selectionMode="new" />
          <Button
            disabled={dialog.isSubmitting}
            onClick={async () => {
              await dialog.submit();
              setFinished((count) => count + 1);
            }}
            type="button"
          >
            Save topic
          </Button>
          <Button onClick={dialog.close} type="button">
            Cancel
          </Button>
        </section>
      ) : null}
      <output aria-label="Attached topic">{binding}</output>
      <output aria-label="Finished submissions">{finished}</output>
    </>
  );
}

function createResponse(request: CreateTopicRequest) {
  if (!request.topic?.name) {
    throw new ConnectError('missing topic name', Code.InvalidArgument);
  }
  return {
    topicName: request.topic.name,
    partitionCount: request.topic.partitionCount,
    replicationFactor: request.topic.replicationFactor,
  };
}

function renderTopicDialog({
  createHandler = createResponse,
  timeout,
}: {
  createHandler?: MethodImpl<typeof createTopic>;
  timeout?: number;
} = {}) {
  const requests: CreateTopicRequest[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getKafkaInfo, () => ({ brokersOnline: 3 }));
    rpc(createTopic, (request, context) => {
      requests.push(request);
      return createHandler(request, context);
    });
  });
  renderWithFileRoutes(<TopicDialog timeout={timeout} />, { transport });
  return { requests, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

const topicRegion = () => screen.queryByRole('region', { name: 'Topic in output' });
const saveButton = () => screen.getByRole('button', { name: 'Save topic' });
const finished = () => screen.getByLabelText('Finished submissions');
const attachedTopic = () => screen.getByLabelText('Attached topic');

async function openTopic(user: User) {
  await user.click(screen.getByRole('button', { name: 'Add output topic' }));
  return screen.findByPlaceholderText('Enter a topic name');
}

function pendingTopicCreation() {
  const started = Promise.withResolvers<CreateTopicRequest>();
  const response = Promise.withResolvers<void>();
  return {
    started: started.promise,
    finish: () => response.resolve(),
    async handler(request: CreateTopicRequest) {
      started.resolve(request);
      await response.promise;
      return createResponse(request);
    },
  };
}

async function enterPendingTopic(timeout?: number) {
  const pending = pendingTopicCreation();
  const { user } = renderTopicDialog({ createHandler: pending.handler, timeout });
  await user.type(await openTopic(user), 'orders');
  return { pending, user };
}

async function startPendingSave({ started }: ReturnType<typeof pendingTopicCreation>) {
  await act(async () => {
    fireEvent.click(saveButton());
    expect(await started).toMatchObject({ topic: { name: 'orders' } });
  });
  expect(saveButton()).toBeDisabled();
}

async function expectInvalidTopicForm(requests: CreateTopicRequest[]) {
  expect(await screen.findByText('Topic name is required.')).toBeVisible();
  expect(saveButton()).toBeEnabled();
  expect(requests).toHaveLength(0);
  expect(attachedTopic()).toBeEmptyDOMElement();
}

const expectTopicAttached = () =>
  waitFor(() => {
    expect(attachedTopic()).toHaveTextContent('output: orders');
    expect(topicRegion()).not.toBeInTheDocument();
  });

test('applies the topic to the target and closes the form on success', async () => {
  const { requests, user } = renderTopicDialog();
  expect(topicRegion()).not.toBeInTheDocument();
  await user.type(await openTopic(user), 'orders');
  expect(topicRegion()).toBeVisible();

  await user.click(saveButton());

  await expectTopicAttached();
  expect(requests).toMatchObject([{ topic: { name: 'orders', partitionCount: 1, replicationFactor: 3 } }]);
});

test('keeps invalid input open so the user can correct it and save', async () => {
  const { requests, user } = renderTopicDialog();
  const input = await openTopic(user);
  await user.click(saveButton());

  await expectInvalidTopicForm(requests);

  await user.type(input, 'orders');
  await user.click(saveButton());

  await waitFor(() => expect(finished()).toHaveTextContent('2'));
  expect(requests).toMatchObject([{ topic: { name: 'orders' } }]);
  await expectTopicAttached();
});

test('ignores a create response that arrives after cancellation', async () => {
  const { pending, user } = await enterPendingTopic();
  try {
    await startPendingSave(pending);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(topicRegion()).not.toBeInTheDocument();
  } finally {
    pending.finish();
  }

  await waitFor(() => expect(finished()).toHaveTextContent('1'));
  expect(attachedTopic()).toBeEmptyDOMElement();
});

test('reports the deadline and closes while the create request is still pending', async () => {
  const { pending } = await enterPendingTopic(5000);
  rs.useFakeTimers();

  try {
    await startPendingSave(pending);
    await act(() => rs.advanceTimersByTimeAsync(5000));

    expect(finished()).toHaveTextContent('1');
    expect(toast.getToasts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          title: 'Request timed out',
        }),
      ])
    );
    expect(topicRegion()).not.toBeInTheDocument();
    expect(attachedTopic()).toBeEmptyDOMElement();
  } finally {
    await act(() => pending.finish());
  }
});
