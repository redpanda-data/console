import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import type { GroupDescription } from 'state/rest-interfaces';

export type GetConsumerGroupsResponse = {
  consumerGroups: GroupDescription[];
};

/**
 * Lists consumer groups with full {@link GroupDescription} details (state, members,
 * coordinator, topic offsets) and the frontend-derived fields the list table needs.
 *
 * Uses the legacy REST API because authorization is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListConsumerGroupsFullQuery = (options?: { enabled?: boolean }) => {
  const result = useTanstackQuery<GetConsumerGroupsResponse>({
    queryKey: ['consumer-groups', 'full'],
    queryFn: async () => {
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

      // Enrich with the frontend-only fields (mirrors addFrontendFieldsForConsumerGroup in backend-api.ts).
      for (const group of data.consumerGroups ?? []) {
        group.lagSum = group.topicOffsets.sum((o) => o.summedLag);
        group.isInUse = group.state.toLowerCase() !== 'empty';
        if (group.allowedActions && !group.allowedActions.includes('all')) {
          group.noEditPerms = !group.allowedActions.includes('editConsumerGroup');
          group.noDeletePerms = !group.allowedActions.includes('deleteConsumerGroup');
        }
      }

      return data;
    },
    enabled: options?.enabled,
  });

  return {
    ...result,
    data: {
      consumerGroups: result.data?.consumerGroups ?? [],
    },
  };
};
