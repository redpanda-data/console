import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import type { GroupDescription } from 'state/rest-interfaces';

export type GetConsumerGroupsResponse = {
  consumerGroups: GroupDescription[];
};

function addListTableFields(group: GroupDescription) {
  group.lagSum = group.topicOffsets.sum((o) => o.summedLag);
  group.isInUse = group.state.toLowerCase() !== 'empty';
  if (group.allowedActions && !group.allowedActions.includes('all')) {
    group.noEditPerms = !group.allowedActions.includes('editConsumerGroup');
    group.noDeletePerms = !group.allowedActions.includes('deleteConsumerGroup');
  }
}

async function fetchConsumerGroupsFull() {
  const headers: HeadersInit = {};
  if (config.jwt) {
    headers.Authorization = `Bearer ${config.jwt}`;
  }

  const response = await config.fetch(`${config.restBasePath}/consumer-groups`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch consumer groups: ${response.statusText}`);
  }

  const data: GetConsumerGroupsResponse = await response.json();
  for (const group of data.consumerGroups ?? []) {
    addListTableFields(group);
  }

  return data;
}

/**
 * Uses legacy REST for compatibility with versions lacking v3 authorization. Adds table-only derived fields to the returned groups.
 */
export const useLegacyListConsumerGroupsFullQuery = (options?: { enabled?: boolean }) => {
  const result = useTanstackQuery<GetConsumerGroupsResponse>({
    queryKey: ['consumer-groups', 'full'],
    queryFn: fetchConsumerGroupsFull,
    enabled: options?.enabled,
  });

  return {
    ...result,
    data: {
      consumerGroups: result.data?.consumerGroups ?? [],
    },
  };
};
