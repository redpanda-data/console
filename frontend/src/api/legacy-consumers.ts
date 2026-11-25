import { aclRequestToQuery, addFrontendFieldsForConsumerGroup, normalizeAcls } from './legacy-api-formatters';
import type { LegacyApiServices } from './legacy-api-services';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import { AclRequestDefault, type GetAclOverviewResponse } from '../state/rest-interfaces';
import type {
  DeleteConsumerGroupOffsetsRequest,
  DeleteConsumerGroupOffsetsResponse,
  DeleteConsumerGroupOffsetsResponseTopic,
  DeleteConsumerGroupOffsetsTopic,
  EditConsumerGroupOffsetsRequest,
  EditConsumerGroupOffsetsResponse,
  EditConsumerGroupOffsetsResponseTopic,
  EditConsumerGroupOffsetsTopic,
  GetConsumerGroupResponse,
  GetConsumerGroupsResponse,
} from '../types/consumer-groups';
import { toJson } from '../utils/json-utils';

export function createLegacyConsumerGroupActions(set: SetApiState, _get: GetApiState, services: LegacyApiServices) {
  const { cachedApiRequest, parseOrUnwrap, addError } = services;
  return {
    refreshConsumerGroup(groupId: string, force?: boolean) {
      cachedApiRequest<GetConsumerGroupResponse>(
        `${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`,
        force
      ).then((v) => {
        addFrontendFieldsForConsumerGroup(v.consumerGroup);
        set((s) => ({ consumerGroups: new Map(s.consumerGroups).set(v.consumerGroup.groupId, v.consumerGroup) }));
      }, addError);
    },
    refreshConsumerGroups(force?: boolean) {
      cachedApiRequest<GetConsumerGroupsResponse>(`${appConfig.restBasePath}/consumer-groups`, force).then((v) => {
        if (v?.consumerGroups !== null && v?.consumerGroups !== undefined) {
          for (const g of v.consumerGroups) {
            addFrontendFieldsForConsumerGroup(g);
          }

          set({ consumerGroups: new Map(v.consumerGroups.map((g) => [g.groupId, g])) });
        }
      }, addError);
    },
    refreshConsumerGroupAcls(groupName: string, force?: boolean) {
      const query = aclRequestToQuery({
        ...AclRequestDefault,
        resourcePatternTypeFilter: 'Match',
        resourceType: 'Group',
        resourceName: groupName,
      });
      cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force)
        .then((v) => {
          if (v) {
            normalizeAcls(v.aclResources);
          }
          set((s) => ({ consumerGroupAcls: new Map(s.consumerGroupAcls).set(groupName, v) }));
        })
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        .catch(console.error);
    },
    async editConsumerGroupOffsets(
      groupId: string,
      topics: EditConsumerGroupOffsetsTopic[]
    ): Promise<EditConsumerGroupOffsetsResponseTopic[]> {
      const request: EditConsumerGroupOffsetsRequest = {
        groupId,
        topics,
      };

      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`,
        {
          method: 'PATCH',
          headers: [['Content-Type', 'application/json']],
          body: toJson(request),
        }
      );

      const r = await parseOrUnwrap<EditConsumerGroupOffsetsResponse>(response, null);
      return r.topics;
    },
    async deleteConsumerGroupOffsets(
      groupId: string,
      topics: DeleteConsumerGroupOffsetsTopic[]
    ): Promise<DeleteConsumerGroupOffsetsResponseTopic[]> {
      const request: DeleteConsumerGroupOffsetsRequest = {
        groupId,
        topics,
      };

      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}/offsets`,
        {
          method: 'DELETE',
          headers: [['Content-Type', 'application/json']],
          body: toJson(request),
        }
      );

      const r = await parseOrUnwrap<DeleteConsumerGroupOffsetsResponse>(response, null);
      return r.topics;
    },
    async deleteConsumerGroup(groupId: string): Promise<void> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`,
        {
          method: 'DELETE',
          headers: [['Content-Type', 'application/json']],
        }
      );

      await parseOrUnwrap<void>(response, null);
    },
  };
}
