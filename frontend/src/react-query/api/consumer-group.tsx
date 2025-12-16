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
