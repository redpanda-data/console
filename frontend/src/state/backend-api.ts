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

import type { Registry } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { useStore } from 'zustand';
import { createStore as zustandCreate } from 'zustand/vanilla';

import { appGlobal } from './app-global';
import {
  type Broker,
  type BrokerWithConfigAndStorage,
  type ClusterInfo,
  type ClusterOverview,
  type ConfigEntry,
  type EndpointCompatibility,
  type GetAclOverviewResponse,
  isApiError,
  type PartialTopicConfigsResponse,
  type Partition,
  type PartitionReassignments,
  type SchemaReferencedByEntry,
  type SchemaRegistrySubject,
  type SchemaRegistrySubjectDetails,
  type SchemaVersion,
  type Topic,
  type TopicConsumer,
  type TopicDescription,
  type TopicDocumentation,
  type TopicPermissions,
  type UserData,
  WrappedApiError,
} from './rest-interfaces';
import { uiState } from './ui-state';
import { aclRequestToQuery as legacyAclRequestToQuery } from '../api/legacy-api-formatters';
import { createLegacyAuthenticationActions } from '../api/legacy-authentication';
import { createLegacyBrokerActions, createLegacyClusterOverviewActions } from '../api/legacy-cluster';
import {
  type RolePrincipal as LegacyRolePrincipal,
  pipelinesApi as legacyPipelinesApi,
  rolesApi as legacyRolesApi,
  rpcnSecretManagerApi as legacyRpcnSecretManagerApi,
  transformsApi as legacyTransformsApi,
  usePipelinesStore as legacyUsePipelinesStore,
  useRolesStore as legacyUseRolesStore,
  useRpcnSecretManagerStore as legacyUseRpcnSecretManagerStore,
  useTransformsStore as legacyUseTransformsStore,
} from '../api/legacy-connect-stores';
import { createLegacyConnectClusterActions, createLegacyConnectorActions } from '../api/legacy-connectors';
import { createLegacyConsumerGroupActions } from '../api/legacy-consumers';
import { createLegacyDebugBundleActions, createLegacyLicenseActions } from '../api/legacy-license-debug';
import {
  createLegacyMessageSearch,
  type MessageSearchRequest as LegacyMessageSearchRequest,
} from '../api/legacy-message-search';
import { createLegacyReassignmentActions, createLegacyThrottleActions } from '../api/legacy-partitions';
import { createLegacyPublishingActions } from '../api/legacy-publishing';
import {
  createLegacySchemaReadActions,
  createLegacySchemaReferenceActions,
  createLegacySchemaWriteActions,
} from '../api/legacy-schema-registry';
import {
  createLegacyTopicPartitionActions,
  createLegacyTopicReadActions,
  createLegacyTopicRecordActions,
} from '../api/legacy-topics';
import { AuthenticationMethod } from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { KafkaDistribution } from '../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import {
  type DebugBundleStatus,
  DebugBundleStatus_Status,
  type GetClusterHealthResponse,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type {
  License,
  ListEnterpriseFeaturesResponse_Feature,
} from '../protogen/redpanda/api/console/v1alpha1/license_pb';
import { config as appConfig, isEmbedded } from '../runtime-config';
import type { GroupDescription } from '../types/consumer-groups';
import type { ClusterAdditionalInfo, KafkaConnectors } from '../types/kafka-connect';
import { boundedAppend } from '../utils/bounded-array';
import { fetchWithTimeout } from '../utils/fetch-with-timeout';
import { LazyMap } from '../utils/lazy-map';
import { isNonEmptyString } from '../utils/string-utils';
import { TimeSince } from '../utils/utils';

export const useRolesStore = legacyUseRolesStore;
export const usePipelinesStore = legacyUsePipelinesStore;
export const useRpcnSecretManagerStore = legacyUseRpcnSecretManagerStore;
export const useTransformsStore = legacyUseTransformsStore;
export const rolesApi = legacyRolesApi;
export const pipelinesApi = legacyPipelinesApi;
export const rpcnSecretManagerApi = legacyRpcnSecretManagerApi;
export const transformsApi = legacyTransformsApi;
export type RolePrincipal = LegacyRolePrincipal;
export const aclRequestToQuery = legacyAclRequestToQuery;

export type MessageSearchRequest = LegacyMessageSearchRequest;
export function createMessageSearch() {
  return createLegacyMessageSearch(() =>
    useApiStore.setState((state) => ({ _msgSearchVersion: state._msgSearchVersion + 1 }))
  );
}
export type MessageSearch = ReturnType<typeof createMessageSearch>;

const REST_TIMEOUT_SEC = 25;
export const REST_CACHE_DURATION_SEC = 20;

/**
 * Bounded LRU cap for the module-level REST `cache` below. Without it the cache retained one
 * CacheEntry (a full parsed REST body) per distinct URL for the life of the tab. 500 keeps a
 * generous working set; least-recently-used URLs are evicted and simply re-fetched on next use.
 */
const REST_CACHE_MAX_ENTRIES = 500;

declare const registry: Registry;

/*
    - If statusCode is not 2xx (any sort of error) -> response content will always be an `ApiError` json object
    - 2xx does not mean complete success, for some endpoints (e.g.: broker log dirs) we can get partial responses (array with some result entries and some error entries)
*/

/*
 * allow custom fetch or websocket interceptors
 * */
export async function rest<T>(url: string, requestInit?: RequestInit): Promise<T | null> {
  const headers = createRestHeaders(requestInit?.headers);

  const res = await fetchWithTimeout(url, REST_TIMEOUT_SEC * 1000, {
    ...requestInit,
    headers,
  });

  if (res.status === 401) {
    // Unauthorized
    await handle401(res);
    return null;
  }
  if (res.status === 403) {
    // Forbidden
    return null;
  }

  const text = await res.text();

  processVersionInfo(res.headers);

  return parseOrUnwrap<T>(res, text);
}

async function handle401(res: Response) {
  // Logout
  //   Clear our 'User' data if we have any
  //   Any old/invalid JWT will be cleared by the server
  api.userData = null;

  await updateLoginError(res);

  // Save current location url
  // store.urlBeforeLogin = window.location.href;
  // get current path

  // Check if we're in embedded mode using multiple signals to handle V1 Module Federation race conditions
  // where JWT might not be set yet when this function is called
  const inEmbeddedContext =
    isEmbedded() || appConfig.clusterId !== 'default' || window.location.pathname.includes('/clusters/');

  if (inEmbeddedContext) {
    // In embedded mode, emit an event for the host to handle re-authentication
    // instead of redirecting, which breaks the embedded experience
    window.dispatchEvent(
      new CustomEvent('console:auth-error', {
        detail: { clusterId: appConfig.clusterId, path: window.location.pathname },
      })
    );
    // Don't redirect - let the request fail gracefully and allow the host to handle auth
    return;
  }

  // Non-embedded mode: redirect to login
  appGlobal.historyPush('/login');
}

function processVersionInfo(headers: Headers) {
  try {
    for (const [k, v] of headers) {
      if (k.toLowerCase() !== 'app-build-timestamp') {
        continue;
      }

      const serverBuildTimestamp = Number(v);
      if (
        v !== null &&
        v !== '' &&
        Number.isFinite(serverBuildTimestamp) &&
        uiState.serverBuildTimestamp !== serverBuildTimestamp
      ) {
        uiState.serverBuildTimestamp = serverBuildTimestamp;
      }

      return;
    }
  } catch {} // Catch malformed json (old versions where info is not sent as json yet)
}

const _activeRequests: CacheEntry[] = [];

const cache = new LazyMap<string, CacheEntry>((u) => new CacheEntry(u), REST_CACHE_MAX_ENTRIES);
class CacheEntry {
  url: string;

  private readonly timeSinceLastResult = new TimeSince(); // set automatically
  /** How long ago (in seconds) the data was last updated */
  get resultAge() {
    return this.timeSinceLastResult.value / 1000;
  }

  private promise: Promise<unknown>;
  get lastPromise() {
    return this.promise;
  }
  setPromise<T>(promise: Promise<T>) {
    this.timeSinceRequestStarted.reset();

    this.isPending = true;
    this.error = null;
    this.promise = promise;

    promise
      .then((result) => {
        this.timeSinceLastResult.reset();
        this.lastResult = result;
      })
      .catch((error: unknown) => {
        this.lastResult = undefined;
        this.error = error;
      })
      .finally(() => {
        this.lastRequestDurationMs = this.timeSinceRequestStarted.value;
        const index = _activeRequests.indexOf(this);
        if (index > -1) {
          _activeRequests.splice(index, 1);
        }
        this.isPending = false;
      });

    _activeRequests.push(this);
  }

  error: unknown = null;
  lastResult: unknown; // set automatically
  isPending: boolean; // set automatically

  private readonly timeSinceRequestStarted = new TimeSince(); // set automatically
  private lastRequestDurationMs: number; // set automatically
  /** How long (in seconds) the last request took (or is currently taking so far) */
  get requestTime() {
    if (this.isPending) {
      return this.timeSinceRequestStarted.value / 1000;
    }
    return this.lastRequestDurationMs / 1000;
  }

  constructor(url: string) {
    this.url = url;
    const sec = 1000;
    const min = 60 * sec;
    const h = 60 * min;
    this.timeSinceLastResult.reset(100 * h);
  }
}

function cachedApiRequest<T>(url: string, force = false): Promise<T> {
  const entry = cache.get(url);
  if (!entry.isPending && (entry.resultAge > REST_CACHE_DURATION_SEC || force)) {
    entry.setPromise(rest<T>(url));
  }
  // Each URL has one endpoint response contract; callers supply that contract at the REST boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Heterogeneous URL cache retains the endpoint's typed promise without changing or re-decoding it.
  return entry.lastPromise as Promise<T>;
}

export async function handleExpiredLicenseError(r: Response) {
  const data: unknown = await r.json();
  if (isApiError(data) && data.message.includes('license expired')) {
    uiState.isUsingDebugUserLogin = true;
    api.userData = {
      canViewConsoleUsers: false,
      canListAcls: true,
      canListQuotas: true,
      canPatchConfigs: true,
      canCreateRoles: true,
      canReassignPartitions: true,
      canCreateSchemas: true,
      canDeleteSchemas: true,
      canManageSchemaRegistry: true,
      canManageLicense: true,
      canViewPermissionsList: true,
      canManageUsers: true,
      canViewSchemas: true,
      canListTransforms: true,
      canCreateTransforms: true,
      canDeleteTransforms: true,
      canViewDebugBundle: true,
      displayName: '',
      avatarUrl: '',
      authenticationMethod: AuthenticationMethod.UNSPECIFIED,
    };
    appGlobal.historyReplace('/trial-expired');
  }
}

//
// BackendAPI
//
// Each store's state is inferred from its creator. The creator's `set` and `get` are typed through
// non-generic function aliases: `StoreApi<ApiState>` there would make the state reference itself.
export type ApiState = ReturnType<typeof _apiCreator>;
export type SetApiState = (partial: Partial<ApiState> | ((state: ApiState) => Partial<ApiState>)) => void;
export type GetApiState = () => ApiState;

const legacyApiServices = { rest, cachedApiRequest, parseOrUnwrap, addError, handleExpiredLicenseError };

const _apiCreator = (set: SetApiState, get: GetApiState) => ({
  endpointCompatibility: null as EndpointCompatibility | null,
  clusterOverview: {
    kafkaAuthorizerInfo: null,
    kafkaAuthorizerError: null,
    kafka: null,
    redpanda: null,
    console: null,
    kafkaConnect: null,
    schemaRegistry: null,
  } as ClusterOverview,
  brokers: null as BrokerWithConfigAndStorage[] | null,
  clusters: ['A', 'B', 'C'],
  clusterInfo: null as ClusterInfo | null,
  brokerConfigs: new Map<number, ConfigEntry[] | string>(), // config entries, or error string
  schemaOverviewIsConfigured: undefined as boolean | undefined,
  schemaMode: undefined as string | null | undefined, // undefined = not yet known, null = got not configured response
  schemaCompatibility: undefined as string | null | undefined, // undefined = not yet known, null = got not configured response
  schemaSubjects: undefined as SchemaRegistrySubject[] | undefined,
  schemaTypes: undefined as string[] | undefined,
  schemaDetails: new Map<string, SchemaRegistrySubjectDetails>(), // subjectName => details
  schemaReferencedBy: new Map<string, Map<number, SchemaReferencedByEntry[]>>(), // subjectName => version => details
  schemaUsagesById: new Map<number, SchemaVersion[]>(),
  topics: null as Topic[] | null,
  topicConfig: new Map<string, TopicDescription | null>(), // null = not allowed to view config of this topic
  topicDocumentation: new Map<string, TopicDocumentation>(),
  topicPermissions: new Map<string, TopicPermissions | null>(),
  topicPartitions: new Map<string, Partition[] | null>(), // null = not allowed to view partitions of this config
  topicPartitionErrors: new Map<
    string,
    Array<{
      id: number;
      partitionError: string;
    }>
  >(),
  topicWatermarksErrors: new Map<
    string,
    Array<{
      id: number;
      waterMarksError: string;
    }>
  >(),
  topicConsumers: new Map<string, TopicConsumer[]>(),
  topicAcls: new Map<string, GetAclOverviewResponse | null>(),
  ACLs: undefined as GetAclOverviewResponse | undefined | null,
  consumerGroups: new Map<string, GroupDescription>(),
  consumerGroupAcls: new Map<string, GetAclOverviewResponse | null>(),
  partitionReassignments: undefined as PartitionReassignments[] | null | undefined,
  connectConnectors: undefined as KafkaConnectors | undefined,
  connectConnectorsError: null as WrappedApiError | ConnectError | null,
  connectAdditionalClusterInfo: new Map<string, ClusterAdditionalInfo>(), // clusterName => additional info (plugins)
  licenses: [] as License[],
  licenseViolation: false,
  licensesLoaded: undefined as 'loaded' | 'failed' | undefined,
  enterpriseFeaturesUsed: [] as ListEnterpriseFeaturesResponse_Feature[],
  clusterHealth: undefined as GetClusterHealthResponse | undefined,
  debugBundleStatuses: [] as GetDebugBundleStatusResponse_DebugBundleBrokerStatus[],
  hasDebugProcess: false as boolean,

  // undefined = we haven't checked yet
  // null = call completed, and we're not logged in
  userData: undefined as UserData | null | undefined,
  // Track if refreshUserData is in progress to prevent duplicate requests
  isUserDataFetchInProgress: false as boolean,
  // Store transient errors (5xx) to show error UI instead of redirect loop
  userDataError: null as ConnectError | null,
  errors: [] as unknown[],
  _msgSearchVersion: 0,
  ...createLegacyAuthenticationActions(set, get, legacyApiServices),
  ...createLegacyTopicReadActions(set, get, legacyApiServices),
  ...createLegacyTopicRecordActions(set, get, legacyApiServices),
  ...createLegacyTopicPartitionActions(set, get, legacyApiServices),
  ...createLegacyClusterOverviewActions(set, get, legacyApiServices),
  ...createLegacyBrokerActions(set, get, legacyApiServices),
  ...createLegacyConsumerGroupActions(set, get, legacyApiServices),
  ...createLegacySchemaReadActions(set, get, legacyApiServices),
  ...createLegacySchemaReferenceActions(set, get, legacyApiServices),
  ...createLegacySchemaWriteActions(set, get, legacyApiServices),
  ...createLegacyReassignmentActions(set, get, legacyApiServices),
  ...createLegacyThrottleActions(set, get, legacyApiServices),
  ...createLegacyConnectClusterActions(set, get, legacyApiServices),
  ...createLegacyConnectorActions(set, get, legacyApiServices),
  ...createLegacyPublishingActions(set, get, legacyApiServices),
  ...createLegacyLicenseActions(set, get, legacyApiServices),
  ...createLegacyDebugBundleActions(set, get, legacyApiServices),
});
const useApiStore = zustandCreate(_apiCreator);

type apiStoreType = ApiState & {
  // Computed properties resolved by the Proxy get handler
  activeRequests: CacheEntry[];
  isRedpanda: boolean;
  isAdminApiConfigured: boolean;
  getTopicPartitionArray: string[];
  isDebugBundleReady: boolean;
  canDownloadDebugBundle: boolean;
  isDebugBundleError: boolean;
  isDebugBundleExpired: boolean;
  isDebugBundleInProgress: boolean;
  debugBundleStatus: DebugBundleStatus | undefined;
};
export const brokerMap = {
  get(): Map<number, Broker> | null {
    const brokers = api.clusterInfo?.brokers;
    if (!brokers) {
      return null;
    }
    return new Map(brokers.map((b: Broker) => [b.brokerId, b]));
  },
};

export async function partialTopicConfigs(
  configKeys: string[],
  topics?: string[]
): Promise<PartialTopicConfigsResponse> {
  const keys = configKeys.map((k) => encodeURIComponent(k)).join(',');
  const topicNames = topics?.map((t) => encodeURIComponent(t)).join(',');
  const query =
    topicNames !== null && topicNames !== undefined && topicNames !== ''
      ? `topicNames=${topicNames}&configKeys=${keys}`
      : `configKeys=${keys}`;

  const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-configs?${query}`);
  return parseOrUnwrap<PartialTopicConfigsResponse>(response, null);
}

export async function parseOrUnwrap<T>(
  response: Response,
  text: string | null,
  { throwOnInvalidJson = false }: { throwOnInvalidJson?: boolean } = {}
): Promise<T> {
  const responseText = await readResponseBody(response, text);
  const obj = parseResponseJson(responseText, throwOnInvalidJson);

  // api error?
  if (isApiError(obj)) {
    throw new WrappedApiError(response, obj);
  }

  // server/proxy error?
  if (!response.ok) {
    const trimmedText = responseText?.trim() ?? '';
    throw new Error(`${response.status} (${trimmedText || response.statusText})`);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Legacy REST endpoint callers own the response contract; this transport validates HTTP/API errors before returning decoded JSON.
  return obj as T;
}

/**
 * Cap on retained API errors. `addError` is called from ~20 legacy refresh paths; on a
 * long-lived tab with auto-refresh enabled and a persistently failing endpoint the array
 * would otherwise grow without bound (each entry retains a stack + the Response body).
 * The error UI only ever surfaces the most recent entries, so a ring buffer loses nothing.
 */
const MAX_TRACKED_ERRORS = 50;

function addError(err: Error): undefined {
  useApiStore.setState((s: ApiState) => ({
    errors: boundedAppend(s.errors, err, MAX_TRACKED_ERRORS),
  }));
}

/** React hook to subscribe to API store state. Use this in components instead of useStore(useApiStore, ...). */
function useApiStoreHook<T>(selector: (state: ApiState) => T): T {
  return useStore(useApiStore, selector);
}

export { useApiStore, useApiStoreHook };

const apiTarget: apiStoreType = {
  ...useApiStore.getState(),
  activeRequests: _activeRequests,
  isRedpanda: false,
  isAdminApiConfigured: false,
  getTopicPartitionArray: [],
  isDebugBundleReady: false,
  canDownloadDebugBundle: false,
  isDebugBundleError: false,
  isDebugBundleExpired: false,
  isDebugBundleInProgress: false,
  debugBundleStatus: undefined,
};

export const api = new Proxy(apiTarget, {
  get(_, prop: string | symbol): unknown {
    const s = useApiStore.getState();
    switch (prop) {
      case 'activeRequests':
        return _activeRequests;
      case 'isRedpanda':
        return s.clusterOverview?.kafka?.distribution === KafkaDistribution.REDPANDA;
      case 'isAdminApiConfigured':
        return s.clusterOverview?.redpanda !== null;
      case 'getTopicPartitionArray': {
        const result: string[] = [];
        for (const [topicName, partitions] of s.topicPartitions) {
          if (partitions !== null) {
            for (const partition of partitions) {
              result.push(`${topicName}/${partition.id}`);
            }
          }
        }
        return result;
      }
      case 'isDebugBundleReady':
        return (
          s.debugBundleStatuses.length > 0 &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case !== 'bundleStatus' || status.value.value.status !== DebugBundleStatus_Status.RUNNING
          )
        );
      case 'canDownloadDebugBundle':
        return (
          s.debugBundleStatuses.length > 0 &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case !== 'bundleStatus' || status.value.value.status !== DebugBundleStatus_Status.RUNNING
          ) &&
          s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.SUCCESS
          )
        );
      case 'isDebugBundleError':
        return (
          s.debugBundleStatuses.length > 0 &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case !== 'bundleStatus' || status.value.value.status !== DebugBundleStatus_Status.RUNNING
          ) &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.ERROR
          )
        );
      case 'isDebugBundleExpired':
        return (
          s.debugBundleStatuses.length > 0 &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case !== 'bundleStatus' || status.value.value.status !== DebugBundleStatus_Status.RUNNING
          ) &&
          s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.EXPIRED
          )
        );
      case 'isDebugBundleInProgress':
        return s.debugBundleStatuses.some(
          (status) =>
            status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.RUNNING
        );
      case 'debugBundleStatus': {
        // The running job's status when there is one; other brokers can still report an older bundle.
        const bundleStatuses = s.debugBundleStatuses.flatMap((status) =>
          status.value.case === 'bundleStatus' ? [status.value.value] : []
        );
        return bundleStatuses.find((x) => x.status === DebugBundleStatus_Status.RUNNING) ?? bundleStatuses[0];
      }
      default:
        return Reflect.get(s, prop);
    }
  },
  set(_, prop: string | symbol, value: unknown) {
    useApiStore.setState({ [prop]: value });
    return true;
  },
});

// UI navigation reads the live API store without importing this module back into UI state.
uiState.setClusterNamesSource(() => useApiStore.getState().clusters);
appGlobal.setClearApiErrors(() => {
  api.errors = [];
});

function createRestHeaders(initialHeaders?: HeadersInit): Headers {
  // Add JWT Bearer token if available (same as gRPC addBearerTokenInterceptor)
  // Only add if not already set - custom fetch (e.g., Cloud UI's authenticatedFetch) may have already added it
  const headers = new Headers(initialHeaders);
  if (isNonEmptyString(appConfig.jwt) && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${appConfig.jwt}`);
  }
  return headers;
}

async function updateLoginError(res: Response): Promise<void> {
  try {
    const text = await res.text();
    const obj: unknown = JSON.parse(text);
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`unauthorized message: ${text}`);

    if (!isApiError(obj)) {
      throw new Error('Invalid login error response');
    }
    uiState.loginError = obj.message;
  } catch (error) {
    uiState.loginError = String(error);
  }
}

function readResponseBody(response: Response, text: string | null): Promise<string> {
  if (text !== null) {
    return Promise.resolve(text);
  }
  if (response.bodyUsed) {
    return Promise.reject(new Error('response content already consumed'));
  }
  return response.text();
}

function parseResponseJson(text: string, throwOnInvalidJson: boolean): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (throwOnInvalidJson) {
      throw error;
    }
    return undefined;
  }
}
