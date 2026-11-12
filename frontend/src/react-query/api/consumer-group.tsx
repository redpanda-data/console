import { useQuery as useTanstackQuery } from '@tanstack/react-query';

import { config } from '../../runtime-config';
import { parseOrUnwrap } from '../../state/backend-api';
import type { GroupDescription } from '../../types/consumer-groups';
import { arraySum } from '../../utils/array-utils';
import { isNonEmptyString } from '../../utils/string-utils';

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
// Enrich with the frontend-only fields (mirrors addFrontendFieldsForConsumerGroup in backend-api.ts).
function addListTableFields(data: GetConsumerGroupsResponse) {
  const consumerGroups = data.consumerGroups ?? [];
  for (const group of consumerGroups) {
    group.lagSum = arraySum(group.topicOffsets, (o) => o.summedLag);
    group.isInUse = group.state.toLowerCase() !== 'empty';
    if (group.allowedActions && !group.allowedActions.includes('all')) {
      group.noEditPerms = !group.allowedActions.includes('editConsumerGroup');
      group.noDeletePerms = !group.allowedActions.includes('deleteConsumerGroup');
    }
  }
}

async function fetchConsumerGroupsFull(): Promise<GetConsumerGroupsResponse> {
  const headers: HeadersInit = {};
  if (isNonEmptyString(config.jwt)) {
    headers.Authorization = `Bearer ${config.jwt}`;
  }

  const response = await config.fetch(`${config.restBasePath}/consumer-groups`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch consumer groups: ${response.statusText}`);
  }

  const data = await parseOrUnwrap<GetConsumerGroupsResponse>(response, null, { throwOnInvalidJson: true });
  addListTableFields(data);

  return data;
}

export const useLegacyListConsumerGroupsFullQuery = (options?: { enabled?: boolean }) => {
  const result = useTanstackQuery<GetConsumerGroupsResponse>({
    queryKey: ['consumer-groups', 'full'],
    queryFn: fetchConsumerGroupsFull,
    enabled: options?.enabled,
  });

  return {
    // biome-ignore lint/nursery/noTanstackQueryRestDestructuring: Legacy callers require the full query result with a non-optional data object.
    ...result,
    data: {
      consumerGroups: result.data?.consumerGroups ?? [],
    },
  };
};
