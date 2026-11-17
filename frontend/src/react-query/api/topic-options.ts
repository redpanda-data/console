import { create } from '@bufbuild/protobuf';
import type { Transport } from '@connectrpc/connect';
import { callUnaryMethod, useTransport } from '@connectrpc/connect-query';
import { ListTopicsRequestSchema, type ListTopicsResponse } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { useMemo } from 'react';

const TOPIC_NAME_FILTER = /^[A-Za-z0-9._-]*$/;
const TOPIC_NAME_MAX_LENGTH = 249;
const TOPIC_OPTIONS_PAGE_SIZE = 100;
type SearchContext = { page: number; signal: AbortSignal };

function topicOptionsLoader(transport: Transport) {
  let tokens = [''];
  const tokenFor = (page: number) => {
    if (page === 0) {
      tokens = [''];
    }
    const token = tokens[page];
    if (token === undefined) {
      throw new Error('Missing topic search page token. Retry the search.');
    }
    return token;
  };
  const nextPage = (page: number, response: ListTopicsResponse) => {
    if (response.nextPageToken && tokens.includes(response.nextPageToken)) {
      throw new Error('Topic search returned a repeated page token.');
    }
    tokens[page + 1] = response.nextPageToken;
    return {
      items: response.topics
        .filter((topic) => !(topic.internal || topic.name.startsWith('_')))
        .map((topic) => topic.name),
      hasMore: Boolean(response.nextPageToken),
    };
  };
  return async (query: string, { page, signal }: SearchContext) => {
    if (query.length > TOPIC_NAME_MAX_LENGTH || !TOPIC_NAME_FILTER.test(query)) {
      return { items: [], hasMore: false };
    }
    signal.throwIfAborted();
    const response = await callUnaryMethod(
      transport,
      listTopics,
      create(ListTopicsRequestSchema, {
        filter: { nameContains: query },
        pageSize: TOPIC_OPTIONS_PAGE_SIZE,
        pageToken: tokenFor(page),
      }),
      { signal }
    );
    signal.throwIfAborted();
    return nextPage(page, response);
  };
}

export function useTopicOptionsLoader() {
  const transport = useTransport();
  return useMemo(() => topicOptionsLoader(transport), [transport]);
}
