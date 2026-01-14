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

import { computed, observable } from 'mobx';

import { api } from './backend-api';

export type FeatureEntry = {
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
};

// biome-ignore lint/complexity/noStaticOnlyClass: need to use class to ensure MobX support
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
  // TracingService: may not be implemented in older backends
  if (f.endpoint.includes('.SecurityService') || f.endpoint.includes('.TracingService')) {
    return false;
  }

  featureErrors.push(
    `Unable to check if feature "${f.method} ${f.endpoint}" is supported because the backend did not return any information about it.`
  );
  return false;
}

/**
 * A list of features we should hide instead of showing a disabled message.
 */
const HIDE_IF_NOT_SUPPORTED_FEATURES = [Feature.GetQuotas, Feature.ShadowLinkService, Feature.TracingService];
export function shouldHideIfNotSupported(f: FeatureEntry): boolean {
  return HIDE_IF_NOT_SUPPORTED_FEATURES.includes(f);
}

class SupportedFeatures {
  @computed get clusterConfig(): boolean {
    return isSupported(Feature.ClusterConfig);
  }
  @computed get consumerGroups(): boolean {
    return isSupported(Feature.ConsumerGroups);
  }
  @computed get getReassignments(): boolean {
    return isSupported(Feature.GetReassignments);
  }
  @computed get patchReassignments(): boolean {
    return isSupported(Feature.PatchReassignments);
  }
  @computed get patchGroup(): boolean {
    return isSupported(Feature.PatchGroup);
  }
  @computed get deleteGroup(): boolean {
    return isSupported(Feature.DeleteGroup);
  }
  @computed get deleteGroupOffsets(): boolean {
    return isSupported(Feature.DeleteGroupOffsets);
  }
  @computed get deleteRecords(): boolean {
    return isSupported(Feature.DeleteRecords);
  }
  @computed get getQuotas(): boolean {
    return isSupported(Feature.GetQuotas);
  }
  @computed get createUser(): boolean {
    return isSupported(Feature.CreateUser);
  }
  @computed get deleteUser(): boolean {
    return isSupported(Feature.DeleteUser);
  }
  @computed get rolesApi(): boolean {
    return isSupported(Feature.SecurityService);
  }
  @computed get pipelinesApi(): boolean {
    return isSupported(Feature.PipelineService);
  }
  @computed get debugBundle(): boolean {
    return isSupported(Feature.DebugBundleService);
  }
  @computed get rpcnSecretsApi(): boolean {
    return isSupported(Feature.SecretService);
  }
  @computed get remoteMcpApi(): boolean {
    return isSupported(Feature.RemoteMcpService);
  }
  @computed get schemaRegistryACLApi(): boolean {
    return isSupported(Feature.SchemaRegistryACLApi);
  }
  @computed get shadowLinkService(): boolean {
    return isSupported(Feature.ShadowLinkService);
  }
  @computed get tracingService(): boolean {
    return isSupported(Feature.TracingService);
  }
}

const features = new SupportedFeatures();
const featureErrors: string[] = observable([]);
export { features as Features, featureErrors };
