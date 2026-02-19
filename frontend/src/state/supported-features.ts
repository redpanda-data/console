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

//
// We know what features the cluster supports by calling './api/console/endpoints'.
// That only tells us the actual routes we can use though.
// This file translates supported routes to specific frontend features.
// That way we can easily check if (for example) "partition reassignment" should be visible/allowed.
//

import { create } from 'zustand';

import { api } from './backend-api';

export type FeatureEntry = {
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
};

// biome-ignore lint/complexity/noStaticOnlyClass: Feature class groups related constants for better organization
export class Feature {
  static readonly ClusterConfig: FeatureEntry = { endpoint: '/api/cluster/config', method: 'GET' };
  static readonly ConsumerGroups: FeatureEntry = { endpoint: '/api/consumer-groups', method: 'GET' };
  static readonly GetReassignments: FeatureEntry = { endpoint: '/api/operations/reassign-partitions', method: 'GET' };
  static readonly PatchReassignments: FeatureEntry = {
    endpoint: '/api/operations/reassign-partitions',
    method: 'PATCH',
  };
  static readonly PatchGroup: FeatureEntry = { endpoint: '/api/consumer-groups/{groupId}', method: 'PATCH' };
  static readonly DeleteGroup: FeatureEntry = { endpoint: '/api/consumer-groups/{groupId}', method: 'DELETE' };
  static readonly DeleteGroupOffsets: FeatureEntry = {
    endpoint: '/api/consumer-groups/{groupId}/offsets',
    method: 'DELETE',
  };
  static readonly DeleteRecords: FeatureEntry = { endpoint: '/api/topics/{topicName}/records', method: 'DELETE' };
  static readonly GetQuotas: FeatureEntry = { endpoint: '/api/quotas', method: 'GET' };
  static readonly CreateUser: FeatureEntry = { endpoint: '/api/users', method: 'POST' };
  static readonly DeleteUser: FeatureEntry = { endpoint: '/api/users', method: 'DELETE' };
  static readonly SecurityService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.SecurityService',
    method: 'POST',
  };
  static readonly TransformsService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.TransformService',
    method: 'POST',
  };
  static readonly PipelineService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.PipelineService',
    method: 'POST',
  };
  static readonly DebugBundleService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.DebugBundleService',
    method: 'POST',
  };
  static readonly SecretService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.SecretService',
    method: 'POST',
  };
  static readonly RemoteMcpService: FeatureEntry = {
    endpoint: 'redpanda.api.dataplane.v1alpha3.MCPServerService',
    method: 'POST',
  };
  static readonly SchemaRegistryACLApi: FeatureEntry = {
    endpoint: 'redpanda.api.dataplane.v1.ACLService',
    method: 'POST',
  };
  static readonly ShadowLinkService: FeatureEntry = {
    endpoint: 'redpanda.api.console.v1alpha1.ShadowLinkService',
    method: 'POST',
  };
  static readonly TracingService: FeatureEntry = {
    endpoint: 'redpanda.api.dataplane.v1alpha3.TracingService',
    method: 'POST',
  };
}

export function isSupported(f: FeatureEntry): boolean {
  const c = api.endpointCompatibility;
  if (!c) {
    // c could be null, because the call to /api/console/endpoints failed or is not responded yet,
    // in that case those endpoints should be considered unsupported
    switch (f.endpoint) {
      case Feature.SchemaRegistryACLApi.endpoint:
      case Feature.ShadowLinkService.endpoint:
      case Feature.TracingService.endpoint:
        return false;
      default:
        return true;
    }
  }

  for (const e of c.endpoints) {
    if (e.method === f.method && e.endpoint === f.endpoint) {
      return e.isSupported;
    }
  }

  // Special handling for services that may be completely absent from the backend response.
  // SecurityService: absent in community version
  if (f.endpoint.includes('.SecurityService')) {
    return false;
  }

  useSupportedFeaturesStore
    .getState()
    .addFeatureError(
      `Unable to check if feature "${f.method} ${f.endpoint}" is supported because the backend did not return any information about it.`
    );
  return false;
}

/**
 * A list of features we should hide instead of showing a disabled message.
 */
const HIDE_IF_NOT_SUPPORTED_FEATURES = [Feature.GetQuotas, Feature.TracingService];
export function shouldHideIfNotSupported(f: FeatureEntry): boolean {
  return HIDE_IF_NOT_SUPPORTED_FEATURES.includes(f);
}

type SupportedFeaturesStore = {
  // State
  featureErrors: string[];

  // Computed getters (accessed as properties)
  get clusterConfig(): boolean;
  get consumerGroups(): boolean;
  get getReassignments(): boolean;
  get patchReassignments(): boolean;
  get patchGroup(): boolean;
  get deleteGroup(): boolean;
  get deleteGroupOffsets(): boolean;
  get deleteRecords(): boolean;
  get getQuotas(): boolean;
  get createUser(): boolean;
  get deleteUser(): boolean;
  get rolesApi(): boolean;
  get pipelinesApi(): boolean;
  get debugBundle(): boolean;
  get rpcnSecretsApi(): boolean;
  get remoteMcpApi(): boolean;
  get schemaRegistryACLApi(): boolean;
  get shadowLinkService(): boolean;
  get tracingService(): boolean;

  // Actions
  addFeatureError: (error: string) => void;
  clearFeatureErrors: () => void;
};

export const useSupportedFeaturesStore = create<SupportedFeaturesStore>((set) => ({
  // Initial state
  featureErrors: [],

  // Computed getters
  get clusterConfig() {
    return isSupported(Feature.ClusterConfig);
  },
  get consumerGroups() {
    return isSupported(Feature.ConsumerGroups);
  },
  get getReassignments() {
    return isSupported(Feature.GetReassignments);
  },
  get patchReassignments() {
    return isSupported(Feature.PatchReassignments);
  },
  get patchGroup() {
    return isSupported(Feature.PatchGroup);
  },
  get deleteGroup() {
    return isSupported(Feature.DeleteGroup);
  },
  get deleteGroupOffsets() {
    return isSupported(Feature.DeleteGroupOffsets);
  },
  get deleteRecords() {
    return isSupported(Feature.DeleteRecords);
  },
  get getQuotas() {
    return isSupported(Feature.GetQuotas);
  },
  get createUser() {
    return isSupported(Feature.CreateUser);
  },
  get deleteUser() {
    return isSupported(Feature.DeleteUser);
  },
  get rolesApi() {
    return isSupported(Feature.SecurityService);
  },
  get pipelinesApi() {
    return isSupported(Feature.PipelineService);
  },
  get debugBundle() {
    return isSupported(Feature.DebugBundleService);
  },
  get rpcnSecretsApi() {
    return isSupported(Feature.SecretService);
  },
  get remoteMcpApi() {
    return isSupported(Feature.RemoteMcpService);
  },
  get schemaRegistryACLApi() {
    return isSupported(Feature.SchemaRegistryACLApi);
  },
  get shadowLinkService() {
    return isSupported(Feature.ShadowLinkService);
  },
  get tracingService() {
    return isSupported(Feature.TracingService);
  },

  // Actions
  addFeatureError: (error: string) =>
    set((state) => ({
      featureErrors: [...state.featureErrors, error],
    })),
  clearFeatureErrors: () => set({ featureErrors: [] }),
}));

// Create singleton instance for backwards compatibility
const Features = {
  get clusterConfig() {
    return useSupportedFeaturesStore.getState().clusterConfig;
  },
  get consumerGroups() {
    return useSupportedFeaturesStore.getState().consumerGroups;
  },
  get getReassignments() {
    return useSupportedFeaturesStore.getState().getReassignments;
  },
  get patchReassignments() {
    return useSupportedFeaturesStore.getState().patchReassignments;
  },
  get patchGroup() {
    return useSupportedFeaturesStore.getState().patchGroup;
  },
  get deleteGroup() {
    return useSupportedFeaturesStore.getState().deleteGroup;
  },
  get deleteGroupOffsets() {
    return useSupportedFeaturesStore.getState().deleteGroupOffsets;
  },
  get deleteRecords() {
    return useSupportedFeaturesStore.getState().deleteRecords;
  },
  get getQuotas() {
    return useSupportedFeaturesStore.getState().getQuotas;
  },
  get createUser() {
    return useSupportedFeaturesStore.getState().createUser;
  },
  get deleteUser() {
    return useSupportedFeaturesStore.getState().deleteUser;
  },
  get rolesApi() {
    return useSupportedFeaturesStore.getState().rolesApi;
  },
  get pipelinesApi() {
    return useSupportedFeaturesStore.getState().pipelinesApi;
  },
  get debugBundle() {
    return useSupportedFeaturesStore.getState().debugBundle;
  },
  get rpcnSecretsApi() {
    return useSupportedFeaturesStore.getState().rpcnSecretsApi;
  },
  get remoteMcpApi() {
    return useSupportedFeaturesStore.getState().remoteMcpApi;
  },
  get schemaRegistryACLApi() {
    return useSupportedFeaturesStore.getState().schemaRegistryACLApi;
  },
  get shadowLinkService() {
    return useSupportedFeaturesStore.getState().shadowLinkService;
  },
  get tracingService() {
    return useSupportedFeaturesStore.getState().tracingService;
  },
};

export { Features };
