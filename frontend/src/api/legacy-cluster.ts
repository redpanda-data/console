/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/*eslint block-scoped-var: "error"*/

import { ConnectError } from '@connectrpc/connect';

import { aclRequestToQuery, normalizeAcls, prepareSynonyms } from './legacy-api-formatters';
import type { LegacyApiServices } from './legacy-api-services';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import type {
  BrokerConfigResponse,
  BrokerWithConfigAndStorage,
  ClusterInfo,
  ClusterInfoResponse,
  ConfigEntry,
  EndpointCompatibilityResponse,
  GetAclOverviewResponse,
  GetAclsRequest,
} from '../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../state/supported-features';
import { isNonEmptyString } from '../utils/string-utils';
import { isPresent } from '../utils/type-guards';

export function createLegacyClusterOverviewActions(set: SetApiState, get: GetApiState, services: LegacyApiServices) {
  const { rest, cachedApiRequest, addError } = services;
  return {
    async refreshAcls(request: GetAclsRequest, force?: boolean): Promise<void> {
      const query = aclRequestToQuery(request);
      await cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force).then(
        (v) => {
          if (v) {
            normalizeAcls(v.aclResources);
            set({ ACLs: v });
          } else {
            set({ ACLs: null });
          }
        },
        addError
      );
    },
    async refreshSupportedEndpoints(): Promise<EndpointCompatibilityResponse | null> {
      try {
        const r = await rest<EndpointCompatibilityResponse>(`${appConfig.restBasePath}/console/endpoints`);
        if (!r) {
          return null;
        }
        // IMPORTANT: Update useSupportedFeaturesStore BEFORE useApiStore.
        // The useApiStore subscription in config.ts fires synchronously and calls
        // updateSidebarItems(), which reads feature support from useSupportedFeaturesStore.
        // If useApiStore is updated first, the subscription sees stale feature data.
        useSupportedFeaturesStore.getState().setEndpointCompatibility(r.endpointCompatibility);
        set({ endpointCompatibility: r.endpointCompatibility });
        return r;
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('Failed to fetch supported endpoints:', error);
        return null;
      }
    },
    async refreshClusterOverview() {
      const client = appConfig.clusterStatusClient;

      if (!client) {
        throw new Error('Cluster status client is not initialized');
      }

      // A tuple keeps each response's type; a failed request is logged and stored as null.
      const [kafkaAuthorizerInfo, consoleInfo, kafka, redpanda, kafkaConnect, schemaRegistry] = await Promise.all([
        client.getKafkaAuthorizerInfo({}).catch((error: unknown) => {
          set((s) => ({ clusterOverview: { ...s.clusterOverview, kafkaAuthorizerError: ConnectError.from(error) } }));
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(error);
          return null;
        }),
        client.getConsoleInfo({}).catch((error: unknown) => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(error);
          return null;
        }),
        client.getKafkaInfo({}).catch((error: unknown) => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(error);
          return null;
        }),
        client.getRedpandaInfo({}).catch((error: unknown) => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(error);
          return null;
        }),
        client.getKafkaConnectInfo({}).catch((error: unknown) => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(error);
          return null;
        }),
        // Schema registry info is only requested for users who can view schemas
        get().userData?.canViewSchemas === true
          ? client.getSchemaRegistryInfo({}).catch((error: unknown) => {
              // biome-ignore lint/suspicious/noConsole: intentional console usage
              console.error(error);
              return null;
            })
          : null,
      ]);

      set((s) => ({
        clusterOverview: {
          ...s.clusterOverview,
          kafkaAuthorizerInfo,
          console: consoleInfo,
          kafka,
          redpanda,
          schemaRegistry,
          kafkaConnect,
        },
      }));
    },
  };
}

export function createLegacyBrokerActions(set: SetApiState, get: GetApiState, services: LegacyApiServices) {
  const { cachedApiRequest, addError } = services;
  return {
    refreshBrokers(force?: boolean) {
      cachedApiRequest<BrokerWithConfigAndStorage[]>(`${appConfig.restBasePath}/brokers`, force).then((v) => {
        set({ brokers: v });
      }, addError);
    },
    refreshCluster(force?: boolean) {
      cachedApiRequest<ClusterInfoResponse>(`${appConfig.restBasePath}/cluster`, force).then((v) => {
        if (v?.clusterInfo !== null && v?.clusterInfo !== undefined) {
          prepareBrokerSynonyms(v.clusterInfo);
          const newBrokerConfigs = brokerConfigMap(v.clusterInfo, get().brokerConfigs);
          set({ clusterInfo: v.clusterInfo, brokerConfigs: newBrokerConfigs });
        }
      }, addError);
    },
    refreshBrokerConfig(brokerId: number, force?: boolean) {
      cachedApiRequest<BrokerConfigResponse>(`${appConfig.restBasePath}/brokers/${brokerId}/config`, force)
        .then((v) => {
          prepareSynonyms(v.brokerConfigs);
          set((s) => ({ brokerConfigs: new Map(s.brokerConfigs).set(brokerId, v.brokerConfigs) }));
        })
        .catch((error: unknown) => {
          set((s) => ({ brokerConfigs: new Map(s.brokerConfigs).set(brokerId, String(error)) }));
        });
    },
  };
}

function prepareBrokerSynonyms(cluster: ClusterInfo) {
  for (const broker of cluster.brokers) {
    if (isPresent(broker.config) && !isNonEmptyString(broker.config.error)) {
      prepareSynonyms(broker.config.configs ?? []);
    }
  }
}

function brokerConfigMap(
  cluster: ClusterInfo,
  previous: Map<number, ConfigEntry[] | string>
): Map<number, ConfigEntry[] | string> {
  const configs = new Map(previous);
  for (const broker of cluster.brokers) {
    configs.set(
      broker.brokerId,
      isNonEmptyString(broker.config.error) ? broker.config.error : (broker.config.configs ?? [])
    );
  }
  return configs;
}
