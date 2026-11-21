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

// biome-ignore-all lint/performance/noBarrelFile: preserve the existing host bootstrap API while application imports use runtime-config.

import { ShadowLinkService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { RoleBindingService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import { ServiceAccountService } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { Code, ConnectError, type Interceptor as ConnectRpcInterceptor, createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import memoizeOne from 'memoize-one';
import type * as monaco from 'monaco-editor';
import { protobufRegistry } from 'protobuf-registry';
import { AuthenticationService } from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { ClusterStatusService } from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import { DebugBundleService } from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { LicenseService } from 'protogen/redpanda/api/console/v1alpha1/license_pb';
import { PipelineService } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { SecurityService } from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import { TransformService } from 'protogen/redpanda/api/console/v1alpha1/transform_pb';
import { UserService } from 'protogen/redpanda/api/dataplane/v1/user_pb';

import { FEATURE_FLAGS } from './components/constants';
import { config, getGrpcBasePath, getRestBasePath, type SetConfigArguments, type SidebarItem } from './runtime-config';
import { appGlobal } from './state/app-global';
import { api, useApiStore } from './state/backend-api';
import { useUIStateStore } from './state/ui-state';
import { AppFeatures, getBasePath } from './utils/env';
import { getEmbeddedAvailableRoutes } from './utils/route-utils';
import { isNonEmptyString, removeStringSuffix } from './utils/string-utils';
import { reportActionError } from './utils/toast.utils';
import { isObject, isPresent } from './utils/type-guards';

export type { Breadcrumb, FeatureFlagKey, SetConfigArguments, SidebarItem } from './runtime-config';
// Preserve the host integration API; application consumers read the dependency-free leaf directly.
export {
  config,
  getControlplaneBasePath,
  getGrpcBasePath,
  isEmbedded,
  isFeatureFlagEnabled,
  isServerless,
} from './runtime-config';

declare const __webpack_public_path__: string;

declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: leave as interface due to type checker
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

export const addBearerTokenInterceptor: ConnectRpcInterceptor = (next) => async (request) => {
  if (isNonEmptyString(config.jwt)) {
    request.header.set('Authorization', `Bearer ${config.jwt}`);
  }
  return await next(request);
};

/**
 * Wraps a base `fetch` so REST carries the same Bearer token as gRPC (see
 * {@link addBearerTokenInterceptor}). Under MF v2 the host supplies the token via
 * `getAccessToken`/`config.jwt` rather than a pre-authenticated `fetch`, so Console attaches the
 * header itself — here, to also cover helpers calling `config.fetch` directly instead of `rest<T>()`.
 * Read lazily, since the host may refresh `config.jwt` in place; an existing `Authorization` header
 * from a legacy V1 authenticatedFetch is never overwritten.
 */
export const createAuthInjectingFetch =
  (baseFetch: WindowOrWorkerGlobalScope['fetch']): WindowOrWorkerGlobalScope['fetch'] =>
  (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNonEmptyString(config.jwt) && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${config.jwt}`);
    }
    return baseFetch(input, { ...init, headers });
  };

/**
 * Interceptor to handle license expiration errors in gRPC responses.
 *
 * This interceptor checks if the error is of type `ConnectError` with the
 * code `FailedPrecondition` and inspects the `details` array for an entry
 * with type `google.rpc.ErrorInfo` and a reason of `REASON_ENTERPRISE_LICENSE_EXPIRED`.
 * If such an error is detected, it redirects the user to the `/trial-expired` page.
 *
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const checkExpiredLicenseInterceptor: ConnectRpcInterceptor = (next) => async (request) => {
  try {
    return await next(request);
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.FailedPrecondition) {
      for (const detail of error.details) {
        if (
          'type' in detail &&
          detail.type === 'google.rpc.ErrorInfo' &&
          'debug' in detail &&
          isObject(detail.debug) &&
          detail.debug.reason === 'REASON_ENTERPRISE_LICENSE_EXPIRED'
        ) {
          appGlobal.historyReplace('/trial-expired');
        }
      }
    }
    // Re-throw the error to ensure it's handled by other interceptors or the calling code
    throw error;
  }
};

const setConfig = ({
  fetch,
  urlOverride,
  jwt,
  isServerless: isServerlessMode,
  featureFlags,
  ...args
}: SetConfigArguments) => {
  const assetsUrl =
    urlOverride?.assets === 'WEBPACK' ? removeStringSuffix(__webpack_public_path__, '/') : urlOverride?.assets;

  // instantiate the client once, if we need to add more clients you can add them in here, ideally only one transport is necessary
  const dataplaneTransport = createConnectTransport({
    baseUrl: getGrpcBasePath(urlOverride?.grpc),
    interceptors: [addBearerTokenInterceptor, checkExpiredLicenseInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });

  const controlplaneTransport = createConnectTransport({
    baseUrl: config.controlplaneUrl,
    interceptors: [addBearerTokenInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });

  Object.assign(config, {
    jwt,
    dataplaneTransport,
    isServerless: isServerlessMode ?? false,
    restBasePath: getRestBasePath(urlOverride?.rest),
    grpcBasePath: getGrpcBasePath(urlOverride?.grpc),
    controlplaneUrl: config.controlplaneUrl,
    fetch: createAuthInjectingFetch(fetch ?? window.fetch.bind(window)),
    assetsPath: assetsUrl ?? getBasePath(),
    authenticationClient: createClient(AuthenticationService, dataplaneTransport),
    licenseClient: createClient(LicenseService, dataplaneTransport),
    consoleClient: createClient(ConsoleService, dataplaneTransport),
    debugBundleClient: createClient(DebugBundleService, dataplaneTransport),
    securityClient: createClient(SecurityService, dataplaneTransport),
    pipelinesClient: createClient(PipelineService, dataplaneTransport),
    transformsClient: createClient(TransformService, dataplaneTransport),
    rpcnSecretsClient: createClient(SecretService, dataplaneTransport),
    clusterStatusClient: createClient(ClusterStatusService, dataplaneTransport),
    userClient: createClient(UserService, dataplaneTransport),
    serviceAccountClient: createClient(ServiceAccountService, controlplaneTransport),
    roleBindingClient: createClient(RoleBindingService, controlplaneTransport),
    shadowLinkClient: createClient(ShadowLinkService, controlplaneTransport),
    featureFlags: { ...(featureFlags ?? FEATURE_FLAGS), ...window.__E2E_FEATURE_FLAGS__ }, // Needed for legacy UI purposes where we don't use functional components.
    ...args,
  } satisfies Partial<typeof config>);
  return config;
};

// Subscribe to UI state changes for breadcrumbs and sidebar items.
// Installed from `setup()` so it is tied to the app's lifecycle and can be
// torn down by the returned teardown function — not at module-top-level,
// which previously pinned store subscribers across test-runner module resets.
function installUiStateSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  try {
    // Subscribe to breadcrumbs changes
    let previousBreadcrumbs = useUIStateStore.getState().pageBreadcrumbs;

    const unsubUi = useUIStateStore.subscribe((state) => {
      const setBreadcrumbs = config.setBreadcrumbs;
      if (!isPresent(setBreadcrumbs)) {
        return;
      }

      // Only update if breadcrumbs changed
      if (state.pageBreadcrumbs === previousBreadcrumbs) {
        return;
      }

      previousBreadcrumbs = state.pageBreadcrumbs;

      const breadcrumbs = state.pageBreadcrumbs.map((v) => ({
        title: v.title,
        to: v.linkTo,
      }));

      setBreadcrumbs(breadcrumbs);
    });
    unsubs.push(unsubUi);

    const updateSidebarItems = () => {
      const setSidebarItems = config.setSidebarItems;
      if (!isPresent(setSidebarItems)) {
        return;
      }

      // Don't emit sidebar items until endpoint compatibility is known,
      // otherwise items gated by feature support will flicker.
      if (!api.endpointCompatibility) {
        return;
      }

      const sidebarItems = embeddedAvailableRoutesObservable.routes.map(
        (r, i): SidebarItem => ({
          title: r.title,
          to: r.path,
          icon: r.icon,
          order: i,
          group: r.group,
        })
      );

      setSidebarItems(sidebarItems);
    };

    // Call once on initialization; also re-call whenever endpointCompatibility
    // becomes available (it starts null and is populated after the first API fetch).
    updateSidebarItems();
    const unsubApi = useApiStore.subscribe((state, prev) => {
      if (state.endpointCompatibility !== prev.endpointCompatibility) {
        updateSidebarItems();
      }
    });
    unsubs.push(unsubApi);
  } catch {
    // Ignore errors in test environments where stores might not be properly initialized
  }

  return () => {
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {
        // ignore — teardown is best-effort
      }
    }
  };
}

export const embeddedAvailableRoutesObservable = {
  get routes() {
    return getEmbeddedAvailableRoutes();
  },
};

// Module-level state for cancelling `setup()`'s recursive user-data poll and
// for holding the current setup teardown. `setup` is memoized with
// memoize-one, so repeated calls with the same args no-op; these refs let the
// harness (and app lifecycle) cancel the pending work explicitly.
let checkUserDataCancelled = false;
let currentSetupTeardown: (() => void) | null = null;
let subscriptionInstallTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Cancels the recursive `checkUserData` polling timer started by `setup()`.
 * Exposed for test cleanup + explicit app teardown.
 */
export function cancelCheckUserData(): void {
  checkUserDataCancelled = true;
}

/**
 * Tear down anything `setup()` installed (store subscriptions + polling timer).
 * Safe to call multiple times.
 */
export function teardownSetup(): void {
  if (subscriptionInstallTimeoutId !== null) {
    clearTimeout(subscriptionInstallTimeoutId);
    subscriptionInstallTimeoutId = null;
  }
  cancelCheckUserData();
  if (currentSetupTeardown) {
    const t = currentSetupTeardown;
    currentSetupTeardown = null;
    t();
  }
}

/** setup is synchronous; startup RPC failures must still reach the application error UI. */
function refreshInitialApiData(): void {
  Promise.all([api.listLicenses(), api.refreshSupportedEndpoints()]).catch(reportActionError);
}

export const setup = memoizeOne((setupArgs: SetConfigArguments) => {
  // If setup() is re-invoked (memoize-one only caches the latest args), tear
  // down any state installed by the previous invocation first to avoid
  // stacking subscribers / pending timeouts.
  teardownSetup();

  setConfig(setupArgs);

  // Reset the cancel flag now that we're installing fresh state.
  checkUserDataCancelled = false;

  // Install UI / API store subscriptions on a short delay (matches historical
  // behavior that waited for stores to initialize). Tracked so teardown can
  // unsubscribe and clear the pending timeout.
  subscriptionInstallTimeoutId = setTimeout(() => {
    subscriptionInstallTimeoutId = null;
    currentSetupTeardown = installUiStateSubscriptions();
  }, 50);

  // Get supported endpoints / kafka cluster version
  // In the business version, that endpoint (like any other api endpoint) is
  // protected, so we need to delay the call until the user is logged in.
  if (AppFeatures.SINGLE_SIGN_ON) {
    // Poll for user data instead of using MobX when
    const checkUserData = () => {
      if (checkUserDataCancelled) {
        return;
      }
      if (api.userData) {
        refreshInitialApiData();
      } else {
        setTimeout(checkUserData, 100);
      }
    };
    checkUserData();
  } else {
    refreshInitialApiData();
  }

  return teardownSetup;
});
