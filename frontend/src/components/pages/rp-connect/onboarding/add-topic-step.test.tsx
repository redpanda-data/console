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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { getKafkaInfo } from 'protogen/redpanda/api/console/v1alpha1/cluster_status-ClusterStatusService_connectquery';
import type { CreateTopicRequest } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { type ComponentProps, useRef } from 'react';
import { useApiStore } from 'state/backend-api';
import type { GetTopicsResponse } from 'state/rest-interfaces';
import { cleanup, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { AddTopicStep } from './add-topic-step';
import type { AddTopicFormData, BaseStepRef, StepSubmissionResult } from '../types/wizard';

const TOPIC = 'my-topic';
const NEW_TOPIC = 'new-topic';
const TOPIC_NAME_INPUT = 'Enter a topic name';
const ALREADY_EXISTS = /already exists/u;
const topicsUrl = new URL(`${config.restBasePath}/topics`, window.location.href).href;

const guardedFetch = globalThis.fetch;
const originalRestFetch = config.fetch;
const initialApiState = useApiStore.getState();
const server = setupServer(
  ...[TOPIC, NEW_TOPIC].map((topic) =>
    http.get(`${topicsUrl}/${topic}/configuration`, () =>
      HttpResponse.json({ topicDescription: { configEntries: [] } })
    )
  )
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the topic step');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  useApiStore.setState(initialApiState, true);
});

afterAll(() => {
  config.fetch = originalRestFetch;
  server.close();
});

function topicResponse(names: string[]) {
  return {
    topics: names.map((topicName) => ({
      topicName,
      isInternal: false,
      partitionCount: 1,
      replicationFactor: 3,
      cleanupPolicy: 'delete',
      documentation: 'UNKNOWN',
      logDirSummary: { totalSizeBytes: 0, hint: null, replicaErrors: [] },
      allowedActions: undefined,
    })),
  } satisfies GetTopicsResponse;
}

type TopicResult = StepSubmissionResult<AddTopicFormData>;
type StepMode = ComponentProps<typeof AddTopicStep>['selectionMode'];

function TopicStepHarness({
  selectionMode,
  onResult,
}: {
  selectionMode: StepMode;
  onResult: (result: TopicResult) => void;
}) {
  const step = useRef<BaseStepRef<AddTopicFormData>>(null);
  return (
    <>
      <AddTopicStep hideTitle ref={step} selectionMode={selectionMode} />
      <button
        onClick={async () => {
          if (step.current) {
            onResult(await step.current.triggerSubmit());
          }
        }}
        type="button"
      >
        Submit
      </button>
    </>
  );
}

function renderTopicStep({
  selectionMode = 'new',
  topics = [],
  error,
}: {
  selectionMode?: StepMode;
  topics?: string[];
  error?: ConnectError;
} = {}) {
  const requests: CreateTopicRequest[] = [];
  const results: TopicResult[] = [];
  let names = topics;
  server.use(http.get(topicsUrl, () => HttpResponse.json(topicResponse(names))));
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getKafkaInfo, () => ({ brokersOnline: 3 }));
    rpc(createTopic, (request) => {
      requests.push(request);
      if (error) {
        throw error;
      }
      if (!request.topic) {
        throw new ConnectError('missing topic', Code.InvalidArgument);
      }
      const { name, partitionCount, replicationFactor } = request.topic;
      names = [...names, name];
      return { topicName: name, partitionCount, replicationFactor };
    });
  });
  renderWithFileRoutes(<TopicStepHarness onResult={(result) => results.push(result)} selectionMode={selectionMode} />, {
    transport,
  });
  return { requests, results, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

async function selectTopic(user: User) {
  const input = await screen.findByPlaceholderText('Select a topic');
  await user.click(input);
  await user.type(input, TOPIC);
  await user.click(await screen.findByRole('option', { name: TOPIC }));
}

const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Submit' }));

describe('the pipeline topic step', () => {
  test.each(['existing', 'both'] as const)(
    'uses the selected topic without sending a create request in %s mode',
    async (selectionMode) => {
      const { user, requests, results } = renderTopicStep({ selectionMode, topics: [TOPIC, 'other-topic'] });
      await selectTopic(user);
      await submit(user);

      await waitFor(() => expect(results).toMatchObject([{ success: true, data: { topicName: TOPIC } }]));
      expect(requests).toHaveLength(0);
    }
  );

  test('creates a topic in new-only mode and returns the topic name', async () => {
    const { user, requests, results } = renderTopicStep();
    expect(screen.queryByRole('button', { name: 'Existing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();

    await user.type(await screen.findByPlaceholderText(TOPIC_NAME_INPUT), NEW_TOPIC);
    await submit(user);

    await waitFor(() => expect(results).toMatchObject([{ success: true, message: `Topic "${NEW_TOPIC}" created` }]));
    expect(requests).toMatchObject([{ topic: { name: NEW_TOPIC, partitionCount: 1, replicationFactor: 3 } }]);
  });

  test.each(['', 'bad topic name'])('rejects an invalid name %j before sending a create request', async (name) => {
    const { user, requests, results } = renderTopicStep();
    if (name) {
      await user.type(await screen.findByPlaceholderText(TOPIC_NAME_INPUT), name);
    }
    await submit(user);

    await waitFor(() => expect(results).toMatchObject([{ success: false }]));
    expect(requests).toHaveLength(0);
  });

  test('returns a failure only after a create request is rejected', async () => {
    const { user, requests, results } = renderTopicStep({
      error: new ConnectError('topic creation failed', Code.Internal),
    });
    await user.type(await screen.findByPlaceholderText(TOPIC_NAME_INPUT), NEW_TOPIC);
    await submit(user);

    await waitFor(() =>
      expect(results).toMatchObject([{ success: false, message: 'Failed to save topic configuration' }])
    );
    expect(requests).toMatchObject([{ topic: { name: NEW_TOPIC } }]);
  });

  test('warns in create mode when the typed name belongs to an existing topic', async () => {
    const { user, requests } = renderTopicStep({ selectionMode: 'both', topics: [TOPIC] });
    expect(await screen.findByRole('button', { name: 'Existing' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.type(await screen.findByPlaceholderText(TOPIC_NAME_INPUT), TOPIC);

    expect(await screen.findByText(ALREADY_EXISTS)).toBeVisible();
    expect(requests).toHaveLength(0);
  });
});
