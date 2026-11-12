import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { type ConnectQueryKey, createConnectQueryKey } from '@connectrpc/connect-query';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  type ListShadowLinkTopicsResponse,
  ListShadowLinkTopicsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { listShadowLinkTopics } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import type { useListShadowTopicQuery } from 'react-query/api/shadowlink';

type TopicsFixture = { data?: MessageInitShape<typeof ListShadowLinkTopicsResponseSchema>; error?: ConnectError };

function topicsQuery({ data, error }: TopicsFixture = {}) {
  const client = new QueryClient();
  const queryKey = createConnectQueryKey({ schema: listShadowLinkTopics, cardinality: 'finite' });
  const query = client
    .getQueryCache()
    .build<
      ListShadowLinkTopicsResponse,
      ConnectError,
      ListShadowLinkTopicsResponse,
      ConnectQueryKey<typeof ListShadowLinkTopicsResponseSchema>
    >(client, { queryKey });
  if (data !== undefined) {
    query.setData(create(ListShadowLinkTopicsResponseSchema, data));
  }
  if (error !== undefined) {
    query.setState({ status: 'error', error, errorUpdateCount: 1 });
  }
  return { client, query, queryKey };
}

export function shadowTopicsResult(fixture: TopicsFixture = {}): ReturnType<typeof useListShadowTopicQuery> {
  const { client, queryKey } = topicsQuery(fixture);
  return new QueryObserver<ListShadowLinkTopicsResponse, ConnectError>(client, {
    queryKey,
    enabled: false,
  }).getCurrentResult();
}

/** Drive the configured interval with a genuine query, not a cast partial of its state. */
export function shadowTopicsInterval(
  options: Parameters<typeof useListShadowTopicQuery>[1],
  status: 'success' | 'error'
) {
  const interval = options?.refetchInterval;
  if (typeof interval !== 'function') {
    throw new Error('Expected the topics polling callback');
  }
  const { query } = topicsQuery(status === 'error' ? { error: new ConnectError('unavailable') } : { data: {} });
  return interval(query);
}
