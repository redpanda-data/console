import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import type { GroupDescription } from 'state/rest-interfaces';

export type GetConsumerGroupsResponse = {
  consumerGroups: GroupDescription[];
};

export type ConsumerGroupOption = {
  groupId: string;
};

/**
 * We need to use legacy API to list consumer groups for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListConsumerGroupsQuery = (options?: { enabled?: boolean }) => {
  const legacyListConsumerGroupsResult = useTanstackQuery<GetConsumerGroupsResponse>({
    queryKey: ['consumer-groups'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/consumer-groups`, {
        method: 'GET',
        headers: {},
      });

      const data = await response.json();

      return data;
    },
    enabled: options?.enabled,
  });

  const consumerGroups: ConsumerGroupOption[] =
    legacyListConsumerGroupsResult.data?.consumerGroups.map((group) => ({
      groupId: group.groupId,
    })) ?? [];

  return {
    ...legacyListConsumerGroupsResult,
    data: {
      consumerGroups,
    },
  };
};

export type GetConsumerGroupResponse = {
  consumerGroup: GroupDescription;
};

/**
 * Fetches details for a specific consumer group using the legacy REST API.
 * Used for knowledge base indexer consumer group monitoring.
 */
export const useLegacyConsumerGroupDetailsQuery = (groupId: string, options?: { enabled?: boolean }) => {
  return useTanstackQuery<GroupDescription>({
    queryKey: ['consumer-group', groupId],
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch consumer group: ${response.statusText}`);
      }

      const data: GetConsumerGroupResponse = await response.json();
      // Extract the consumerGroup from the wrapper response
      return data.consumerGroup;
    },
    enabled: options?.enabled && !!groupId,
    retry: (failureCount, error) => {
      // Don't retry on 404 - consumer group might not exist yet
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
