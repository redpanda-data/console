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

import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../utils/fetch-with-timeout', () => ({ default: vi.fn() }));

import { useApiStore } from './backend-api';
import type { TopicConsumer, TopicDescription } from './rest-interfaces';
import fetchWithTimeout from '../utils/fetch-with-timeout';

const topicsResponse = (topicNames: string[]) =>
  new Response(JSON.stringify({ topics: topicNames.map((topicName) => ({ topicName })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('refreshTopics topic-cache pruning (F2)', () => {
  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset();
    // Reset the topic-keyed caches so state does not leak between tests (the api store is a
    // long-lived singleton that the harness does not reset).
    useApiStore.setState({
      topics: null,
      topicConfig: new Map(),
      topicConsumers: new Map(),
    });
  });

  test('drops topic-keyed cache entries for topics that no longer exist', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(topicsResponse(['live-topic']));
    useApiStore.setState({
      topicConfig: new Map<string, TopicDescription | null>([
        ['live-topic', null],
        ['stale-topic', null],
      ]),
      topicConsumers: new Map<string, TopicConsumer[]>([
        ['live-topic', []],
        ['stale-topic', []],
      ]),
    });

    await useApiStore.getState().refreshTopics(true);

    const state = useApiStore.getState();
    expect([...state.topicConfig.keys()]).toEqual(['live-topic']);
    expect([...state.topicConsumers.keys()]).toEqual(['live-topic']);
    expect(state.topics).toEqual([{ topicName: 'live-topic' }]);
  });

  test('keeps cache entries for topics that still exist', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(topicsResponse(['a', 'b']));
    useApiStore.setState({
      topicConfig: new Map<string, TopicDescription | null>([
        ['a', null],
        ['b', null],
      ]),
    });

    await useApiStore.getState().refreshTopics(true);

    expect([...useApiStore.getState().topicConfig.keys()].sort()).toEqual(['a', 'b']);
  });
});
