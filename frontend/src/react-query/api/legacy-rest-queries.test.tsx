import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';

import { useLegacyListConsumerGroupsFullQuery } from './consumer-group';
import { useKafkaConnectConnectorsQuery } from './kafka-connect';
import { config } from '../../runtime-config';
import { connectQueryWrapper } from '../../test-utils';
import type { GroupDescription } from '../../types/consumer-groups';
import type { KafkaConnectors } from '../../types/kafka-connect';

const NO_RETRY = { defaultOptions: { queries: { retry: false } } };

afterEach(() => {
  rs.restoreAllMocks();
});

test('legacy consumer-group queries retain full details and derive list fields', async () => {
  const group = {
    groupId: 'orders',
    groupType: 'classic',
    state: 'Stable',
    protocol: 'range',
    protocolType: 'consumer',
    coordinatorId: 1,
    members: [],
    allowedActions: ['editConsumerGroup'],
    topicOffsets: [{ topic: 'orders', summedLag: 9, partitionCount: 1, partitionsWithOffset: 1, partitionOffsets: [] }],
  } satisfies Omit<GroupDescription, 'lagSum' | 'isInUse' | 'noEditPerms' | 'noDeletePerms'>;
  const fetch = rs.spyOn(config, 'fetch').mockResolvedValue(Response.json({ consumerGroups: [group] }));
  const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  const { result } = renderHook(() => useLegacyListConsumerGroupsFullQuery(), { wrapper: queryClientWrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.consumerGroups).toEqual([
    { ...group, lagSum: 9, isInUse: true, noEditPerms: false, noDeletePerms: true },
  ]);
  expect(fetch).toHaveBeenCalledWith(
    `${config.restBasePath}/consumer-groups`,
    expect.objectContaining({ method: 'GET' })
  );
});

test('legacy connector queries preserve their configured response', async () => {
  const connectors = { clusters: [], isConfigured: true } satisfies KafkaConnectors;
  const fetch = rs.spyOn(config, 'fetch').mockResolvedValue(Response.json(connectors));
  const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  const { result } = renderHook(() => useKafkaConnectConnectorsQuery(), { wrapper: queryClientWrapper });

  await waitFor(() => expect(result.current.data).toEqual(connectors));
  expect(result.current.isLoading).toBe(false);
  expect(fetch).toHaveBeenCalledWith(
    `${config.restBasePath}/kafka-connect/connectors`,
    expect.objectContaining({ method: 'GET' })
  );
});

describe.each([
  { name: 'consumer groups', useQuery: useLegacyListConsumerGroupsFullQuery, queryKey: ['consumer-groups', 'full'] },
  { name: 'connectors', useQuery: useKafkaConnectConnectorsQuery, queryKey: ['kafka-connect-connectors'] },
])('$name JSON boundary', ({ useQuery, queryKey }) => {
  test('rejects malformed success bodies instead of caching undefined', async () => {
    rs.spyOn(config, 'fetch').mockResolvedValue(new Response('{broken', { status: 200 }));
    const { queryClient, queryClientWrapper } = connectQueryWrapper(NO_RETRY);
    renderHook(() => useQuery(), { wrapper: queryClientWrapper });

    await waitFor(() => expect(queryClient.getQueryState(queryKey)?.status).toBe('error'));
    expect(queryClient.getQueryState(queryKey)?.error).toBeInstanceOf(SyntaxError);
  });
});
