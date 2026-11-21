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

import type { ShadowLinkService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import type { RoleBindingService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import type { ServiceAccountService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import type { Client, Transport } from '@connectrpc/connect';
import type { AuthenticationService } from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import type { ClusterStatusService } from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import type { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import type { DebugBundleService } from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type { LicenseService } from 'protogen/redpanda/api/console/v1alpha1/license_pb';
import type { PipelineService } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import type { SecurityService } from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import type { TransformService } from 'protogen/redpanda/api/console/v1alpha1/transform_pb';
import type { UserService } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import type { JSX } from 'react';

import { DEFAULT_API_BASE, FEATURE_FLAGS } from './components/constants';
import type { SidebarIconComponent } from './types/navigation';
import { getBasePath } from './utils/env';

export const getRestBasePath = (overrideUrl?: string) => overrideUrl ?? DEFAULT_API_BASE;

export const getGrpcBasePath = (overrideUrl?: string) => overrideUrl ?? getBasePath();

const getControlplanePath = () => {
  // TODO: Make this part of config from Cloud UI
  if (window.location.hostname.includes('main')) {
    return 'https://api.ign.cloud.redpanda.com';
  }
  if (window.location.hostname.includes('preprod')) {
    return 'https://api.ppd.cloud.redpanda.com';
  }
  if (window.location.hostname.includes('cloud.redpanda.com')) {
    return 'https://api.cloud.redpanda.com';
  }
  return 'https://api.ign.cloud.redpanda.com';
};

export const getControlplaneBasePath = (overrideUrl?: string) => overrideUrl ?? getControlplanePath();

export type SetConfigArguments = {
  fetch?: WindowOrWorkerGlobalScope['fetch'];
  jwt?: string;
  clusterId?: string;
  urlOverride?: {
    rest?: string;
    ws?: string;
    assets?: string;
    grpc?: string;
  };
  setSidebarItems?: (items: SidebarItem[]) => void;
  setBreadcrumbs?: (items: Breadcrumb[]) => void;
  isServerless?: boolean;
  featureFlags?: Record<keyof typeof FEATURE_FLAGS, boolean>;
};

export type SidebarItem = {
  title: string; // "Topics"
  to: string; // '/topics'
  icon?: JSX.Element | SidebarIconComponent;
  order: number;
  group?: string;
};

export type Breadcrumb = {
  title: string; // "Topics"
  to: string; // '/topics'
};

type Config = {
  controlplaneUrl: string;
  dataplaneTransport?: Transport;
  restBasePath: string;
  grpcBasePath: string;
  authenticationClient?: Client<typeof AuthenticationService>;
  licenseClient?: Client<typeof LicenseService>;
  consoleClient?: Client<typeof ConsoleService>;
  debugBundleClient?: Client<typeof DebugBundleService>;
  securityClient?: Client<typeof SecurityService>;
  pipelinesClient?: Client<typeof PipelineService>;
  rpcnSecretsClient?: Client<typeof SecretService>;
  transformsClient?: Client<typeof TransformService>;
  clusterStatusClient?: Client<typeof ClusterStatusService>;
  userClient?: Client<typeof UserService>;
  serviceAccountClient?: Client<typeof ServiceAccountService>;
  roleBindingClient?: Client<typeof RoleBindingService>;
  shadowLinkClient?: Client<typeof ShadowLinkService>;
  fetch: WindowOrWorkerGlobalScope['fetch'];
  assetsPath: string;
  jwt?: string;
  clusterId?: string;
  setSidebarItems: (items: SidebarItem[]) => void;
  setBreadcrumbs: (items: Breadcrumb[]) => void;
  isServerless: boolean;
  featureFlags: Record<keyof typeof FEATURE_FLAGS, boolean>;
};

// Config object - plain JavaScript object, no longer using MobX observable
export const config: Config = {
  restBasePath: getRestBasePath(),
  grpcBasePath: getGrpcBasePath(),
  controlplaneUrl: '',
  fetch: window.fetch,
  assetsPath: getBasePath(),
  clusterId: 'default',
  setSidebarItems: () => {
    // no op - set by parent application
  },
  setBreadcrumbs: () => {
    // no op - set by parent application
  },
  isServerless: false,
  featureFlags: { ...FEATURE_FLAGS, ...window.__E2E_FEATURE_FLAGS__ },
};

export function isEmbedded() {
  return config.jwt !== null && config.jwt !== undefined;
}

/**
 * Type for feature flag keys - use this for typing mock implementations
 */
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * @description use in non-functional components if you must
 * @param featureFlag feature flag key to track
 * @returns The runtime value if the host (e.g. Cloud UI) provided one, otherwise
 *   the default declared in `FEATURE_FLAGS` (`components/constants.ts`). This lets
 *   `constants.ts` act as the source of truth for defaults — useful in standalone
 *   dev where `config.featureFlags` is never populated.
 */
export function isFeatureFlagEnabled(featureFlag: FeatureFlagKey) {
  return config.featureFlags?.[featureFlag] ?? FEATURE_FLAGS[featureFlag] ?? false;
}

export function isServerless() {
  return config.isServerless;
}
