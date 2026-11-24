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

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { connectQueryWrapper } from 'test-utils';

import { useLegacyListTopicsQuery, useTopicConfigQuery, useUpdateTopicConfigMutation } from './topic';
import { useApiStore } from '../../state/backend-api';
import type { GetTopicsResponse, TopicConfigResponse } from '../../state/rest-interfaces';

const NO_RETRY = { defaultOptions: { queries: { retry: false } } };
const TOPIC = 'orders';
const TOPICS_URL = new URL(`${config.restBasePath}/topics`, window.location.href).href;
const TOPIC_CONFIG_URL = `${TOPICS_URL}/${TOPIC}/configuration`;
const CHANGE = { topicName: TOPIC, configs: [{ key: 'retention.ms', op: 'SET' as const, value: '2000' }] };
const originalRestFetch = config.fetch;
const initialApiState = useApiStore.getState();
const guardedFetch = globalThis.fetch;
const server = setupServer();

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the topic query test');
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

function topicList() {
  return {
    topics: [TOPIC, '_schemas'].map((topicName) => ({
      topicName,
      isInternal: topicName === '_schemas',
      partitionCount: 3,
      replicationFactor: 1,
      cleanupPolicy: 'delete',
      documentation: 'NOT_CONFIGURED',
      logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
      allowedActions: undefined,
    })),
  } satisfies GetTopicsResponse;
}

test('reports forbidden rather than treating a JSON error reply as an empty list', async () => {
  server.use(
    http.get(TOPICS_URL, () => HttpResponse.json({ message: 'forbidden' }, { status: 403, statusText: 'Forbidden' }))
  );
  const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper: queryClientWrapper });

  await waitFor(() => expect(result.current.error?.message).toBe('Failed to fetch topics: 403 Forbidden'));
  expect(result.current.isError).toBe(true);
  expect(result.current.data.topics).toBeUndefined();
});

test('returns visible topics and filters internal ones when requested', async () => {
  server.use(http.get(TOPICS_URL, () => HttpResponse.json(topicList())));
  const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  const { result } = renderHook(() => useLegacyListTopicsQuery(undefined, { hideInternalTopics: true }), {
    wrapper: queryClientWrapper,
  });

  await waitFor(() => expect(result.current.data.topics?.map((topic) => topic.topicName)).toEqual([TOPIC]));
});

function topicConfiguration(retention: string) {
  return {
    topicDescription: {
      topicName: TOPIC,
      error: null,
      configEntries: [
        {
          name: 'retention.ms',
          value: retention,
          type: 'LONG',
          source: 'DYNAMIC_TOPIC_CONFIG',
          isExplicitlySet: true,
          isDefaultValue: false,
          isReadOnly: false,
          isSensitive: false,
          synonyms: [],
          currentValue: undefined,
        },
      ],
    },
  } satisfies TopicConfigResponse;
}

function gateTopicConfigRefresh() {
  const release = Promise.withResolvers<void>();
  const requests: string[] = [];
  const patches: unknown[] = [];
  server.use(
    http.patch(TOPIC_CONFIG_URL, async ({ request }) => {
      requests.push('PATCH');
      patches.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(TOPIC_CONFIG_URL, async () => {
      const updated = requests.includes('PATCH');
      requests.push('GET');
      if (updated) {
        await release.promise;
      }
      return HttpResponse.json(topicConfiguration(updated ? '2000' : '1000'));
    })
  );
  return { requests, patches, releaseRefresh: () => release.resolve() };
}

async function renderTopicEditor() {
  const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  const { result } = renderHook(
    () => ({ topicConfig: useTopicConfigQuery(TOPIC), update: useUpdateTopicConfigMutation() }),
    { wrapper: queryClientWrapper }
  );
  await waitFor(() => expect(result.current.topicConfig.data?.configEntries[0]?.value).toBe('1000'));
  return result;
}

test('keeps a topic update pending until its active configuration query returns fresh data', async () => {
  const { requests, patches, releaseRefresh } = gateTopicConfigRefresh();
  const result = await renderTopicEditor();

  try {
    act(() => result.current.update.mutate(CHANGE));
    await waitFor(() => expect(requests).toEqual(['GET', 'PATCH', 'GET']));
    expect(patches).toEqual([{ configs: CHANGE.configs }]);
    expect(result.current.update.isPending).toBe(true);
  } finally {
    releaseRefresh();
  }

  await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
  expect(result.current.topicConfig.data?.configEntries[0]?.value).toBe('2000');
});
