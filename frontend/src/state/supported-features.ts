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

import type { EndpointCompatibility } from './rest-interfaces';

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
  static readonly SchemaRegistryContexts: FeatureEntry = {
    endpoint: '/api/schema-registry/contexts',
    method: 'GET',
  };
}

/**
 * Compute whether a feature is supported given endpoint compatibility data.
 * Pure function — no side effects.
 */
function computeSupported(f: FeatureEntry, c: EndpointCompatibility | null): { supported: boolean; error?: string } {
  if (!c) {
    switch (f.endpoint) {
      case Feature.SchemaRegistryACLApi.endpoint:
      case Feature.ShadowLinkService.endpoint:
      case Feature.TracingService.endpoint:
      case Feature.GetQuotas.endpoint:
      case Feature.SchemaRegistryContexts.endpoint:
        return { supported: false };
      default:
        return { supported: true };
    }
  }

  for (const e of c.endpoints) {
    if (e.method === f.method && e.endpoint === f.endpoint) {
      return { supported: e.isSupported };
    }
  }

  if (
    f.endpoint.includes('.SecurityService') ||
    f.endpoint.includes('.SecretService') ||
    f.endpoint.includes('.MCPServerService')
  ) {
    return { supported: false };
  }

  return {
    supported: false,
    error: `Unable to check if feature "${f.method} ${f.endpoint}" is supported because the backend did not return any information about it.`,
  };
}

/**
 * Check if a feature is supported. Reads from the Zustand store.
 * For reactive usage in React components, prefer using the store selector directly:
 *   useSupportedFeaturesStore((s) => s.schemaRegistryACLApi)
 */
export function isSupported(f: FeatureEntry): boolean {
  const state = useSupportedFeaturesStore.getState();
  const result = computeSupported(f, state.endpointCompatibility);
  if (result.error) {
    state.addFeatureError(result.error);
  }
  return result.supported;
}

/**
 * A list of features we should hide instead of showing a disabled message.
 */
const HIDE_IF_NOT_SUPPORTED_FEATURES = [Feature.GetQuotas, Feature.TracingService];
export function shouldHideIfNotSupported(f: FeatureEntry): boolean {
  return HIDE_IF_NOT_SUPPORTED_FEATURES.includes(f);
}

/** Compute all feature flags from endpoint compatibility data */
function computeAllFeatures(c: EndpointCompatibility | null) {
  const errors: string[] = [];
  const compute = (f: FeatureEntry) => {
    const result = computeSupported(f, c);
    if (result.error) {
      errors.push(result.error);
    }
    return result.supported;
  };

  return {
    clusterConfig: compute(Feature.ClusterConfig),
    consumerGroups: compute(Feature.ConsumerGroups),
    getReassignments: compute(Feature.GetReassignments),
    patchReassignments: compute(Feature.PatchReassignments),
    patchGroup: compute(Feature.PatchGroup),
    deleteGroup: compute(Feature.DeleteGroup),
    deleteGroupOffsets: compute(Feature.DeleteGroupOffsets),
    deleteRecords: compute(Feature.DeleteRecords),
    getQuotas: compute(Feature.GetQuotas),
    createUser: compute(Feature.CreateUser),
    deleteUser: compute(Feature.DeleteUser),
    rolesApi: compute(Feature.SecurityService),
    pipelinesApi: compute(Feature.PipelineService),
    debugBundle: compute(Feature.DebugBundleService),
    rpcnSecretsApi: compute(Feature.SecretService),
    remoteMcpApi: compute(Feature.RemoteMcpService),
    schemaRegistryACLApi: compute(Feature.SchemaRegistryACLApi),
    shadowLinkService: compute(Feature.ShadowLinkService),
    tracingService: compute(Feature.TracingService),
    schemaRegistryContexts: compute(Feature.SchemaRegistryContexts),
    featureErrors: errors,
  };
}

type SupportedFeaturesStore = {
  // State
  endpointCompatibility: EndpointCompatibility | null;
  featureErrors: string[];

  // Feature flags (recomputed when endpointCompatibility changes)
  clusterConfig: boolean;
  consumerGroups: boolean;
  getReassignments: boolean;
  patchReassignments: boolean;
  patchGroup: boolean;
  deleteGroup: boolean;
  deleteGroupOffsets: boolean;
  deleteRecords: boolean;
  getQuotas: boolean;
  createUser: boolean;
  deleteUser: boolean;
  rolesApi: boolean;
  pipelinesApi: boolean;
  debugBundle: boolean;
  rpcnSecretsApi: boolean;
  remoteMcpApi: boolean;
  schemaRegistryACLApi: boolean;
  shadowLinkService: boolean;
  tracingService: boolean;
  schemaRegistryContexts: boolean;

  // Actions
  setEndpointCompatibility: (ec: EndpointCompatibility) => void;
  addFeatureError: (error: string) => void;
  clearFeatureErrors: () => void;
};

const initialFeatures = computeAllFeatures(null);

export const useSupportedFeaturesStore = create<SupportedFeaturesStore>((set) => ({
  // Initial state
  endpointCompatibility: null,
  ...initialFeatures,

  // Actions
  setEndpointCompatibility: (ec: EndpointCompatibility) =>
    set({
      endpointCompatibility: ec,
      ...computeAllFeatures(ec),
    }),

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
  get schemaRegistryContexts() {
    return useSupportedFeaturesStore.getState().schemaRegistryContexts;
  },
};

export { Features };
