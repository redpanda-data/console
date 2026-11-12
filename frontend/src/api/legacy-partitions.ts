import type { LegacyApiServices } from './legacy-api-services';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import {
  AlterConfigOperation,
  type AlterPartitionReassignmentsResponse,
  ConfigResourceType,
  type PartitionReassignmentRequest,
  type PartitionReassignmentsResponse,
  type PatchConfigsRequest,
  type PatchConfigsResponse,
  type ResourceConfig,
} from '../state/rest-interfaces';
import { toJson } from '../utils/json-utils';

export function createLegacyReassignmentActions(set: SetApiState, get: GetApiState, services: LegacyApiServices) {
  const { cachedApiRequest, parseOrUnwrap, addError } = services;
  return {
    refreshPartitionReassignments(force?: boolean): Promise<void> {
      return cachedApiRequest<PartitionReassignmentsResponse | null>(
        `${appConfig.restBasePath}/operations/reassign-partitions`,
        force
      ).then((v) => {
        if (v === null) {
          set({ partitionReassignments: null });
        } else {
          set({ partitionReassignments: v.topics });
        }
      }, addError);
    },
    async startPartitionReassignment(
      request: PartitionReassignmentRequest
    ): Promise<AlterPartitionReassignmentsResponse> {
      const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/reassign-partitions`, {
        method: 'PATCH',
        headers: [['Content-Type', 'application/json']],
        body: toJson(request),
      });
      return await parseOrUnwrap<AlterPartitionReassignmentsResponse>(response, null);
    },
    async setReplicationThrottleRate(brokerIds: number[], maxBytesPerSecond: number): Promise<PatchConfigsResponse> {
      const ceiledRate = Math.ceil(maxBytesPerSecond);

      const configRequest: PatchConfigsRequest = { resources: [] };

      for (const b of brokerIds) {
        configRequest.resources.push({
          resourceType: ConfigResourceType.Broker,
          resourceName: String(b),
          configs: [
            {
              name: 'leader.replication.throttled.rate',
              op: AlterConfigOperation.Set,
              value: String(ceiledRate),
            },
            {
              name: 'follower.replication.throttled.rate',
              op: AlterConfigOperation.Set,
              value: String(ceiledRate),
            },
          ],
        });
      }

      return await get().changeConfig(configRequest);
    },
    async changeConfig(request: PatchConfigsRequest): Promise<PatchConfigsResponse> {
      const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/configs`, {
        method: 'PATCH',
        headers: [['Content-Type', 'application/json']],
        body: toJson(request),
      });
      return await parseOrUnwrap<PatchConfigsResponse>(response, null);
    },
  };
}

export function createLegacyThrottleActions(_set: SetApiState, get: GetApiState, _services: LegacyApiServices) {
  return {
    async setThrottledReplicas(
      topicReplicas: {
        topicName: string;
        leaderReplicas: {
          brokerId: number;
          partitionId: number;
        }[];
        followerReplicas: {
          brokerId: number;
          partitionId: number;
        }[];
      }[]
    ): Promise<PatchConfigsResponse> {
      const configRequest: PatchConfigsRequest = { resources: [] };

      for (const t of topicReplicas) {
        const res: ResourceConfig = {
          // Set which topics to throttle
          resourceType: ConfigResourceType.Topic,
          resourceName: t.topicName,
          configs: [],
        };

        const leaderReplicas = t.leaderReplicas.map((e) => `${e.partitionId}:${e.brokerId}`).join(',');
        res.configs.push({
          name: 'leader.replication.throttled.replicas',
          op: AlterConfigOperation.Set,
          value: leaderReplicas,
        });
        const followerReplicas = t.followerReplicas.map((e) => `${e.partitionId}:${e.brokerId}`).join(',');
        res.configs.push({
          name: 'follower.replication.throttled.replicas',
          op: AlterConfigOperation.Set,
          value: followerReplicas,
        });

        // individual request for each topic
        configRequest.resources.push(res);
      }

      return await get().changeConfig(configRequest);
    },
    async resetThrottledReplicas(topicNames: string[]): Promise<PatchConfigsResponse> {
      const configRequest: PatchConfigsRequest = { resources: [] };

      // reset throttled replicas for those topics
      for (const t of topicNames) {
        configRequest.resources.push({
          resourceType: ConfigResourceType.Topic,
          resourceName: t,
          configs: [
            {
              name: 'leader.replication.throttled.replicas',
              op: AlterConfigOperation.Delete,
            },
            {
              name: 'follower.replication.throttled.replicas',
              op: AlterConfigOperation.Delete,
            },
          ],
        });
      }

      return await get().changeConfig(configRequest);
    },
    async resetReplicationThrottleRate(brokerIds: number[]): Promise<PatchConfigsResponse> {
      const configRequest: PatchConfigsRequest = { resources: [] };

      // We currently only set replication throttle on each broker, instead of cluster-wide (same effect, but different kind of 'ConfigSource')
      // So we don't remove the cluster-wide setting, only the ones we've set (the per-broker) settings

      // remove throttle configs from all brokers (DYNAMIC_DEFAULT_BROKER_CONFIG)
      // configRequest.resources.push({
      //     resourceType: ConfigResourceType.Broker,
      //     resourceName: "", // empty = all brokers
      //     configs: [
      //         { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Delete },
      //         { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Delete },
      //     ]
      // });

      // remove throttle configs from each broker individually (DYNAMIC_BROKER_CONFIG)
      for (const b of brokerIds) {
        configRequest.resources.push({
          resourceType: ConfigResourceType.Broker,
          resourceName: String(b),
          configs: [
            {
              name: 'leader.replication.throttled.rate',
              op: AlterConfigOperation.Delete,
            },
            {
              name: 'follower.replication.throttled.rate',
              op: AlterConfigOperation.Delete,
            },
          ],
        });
      }

      return await get().changeConfig(configRequest);
    },
  };
}
