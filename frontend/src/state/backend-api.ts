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

import { create, type Registry } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { Code } from '@connectrpc/connect';
import { createLinkedAbortController } from '@connectrpc/connect/protocol';
import {
  consoleHasEnterpriseFeature,
  getLatestExpiringLicense,
  getMillisecondsToExpiration,
  isBakedInTrial,
  prettyLicenseType,
} from 'components/license/license-utils';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { TransformMetadata } from 'protogen/redpanda/api/dataplane/v1/transform_pb';
import { useStore } from 'zustand';
import { createStore as zustandCreate } from 'zustand/vanilla';

import { appGlobal } from './app-global';
import {
  AclRequestDefault,
  type AclResource,
  AlterConfigOperation,
  type AlterPartitionReassignmentsResponse,
  type ApiError,
  type Broker,
  type BrokerConfigResponse,
  type BrokerWithConfigAndStorage,
  type ClusterAdditionalInfo,
  type ClusterConnectors,
  type ClusterInfo,
  type ClusterInfoResponse,
  type ClusterOverview,
  type ConfigEntry,
  ConfigResourceType,
  type ConnectorValidationResult,
  type CreateSecretResponse,
  type CreateTopicRequest,
  type CreateTopicResponse,
  type DeleteConsumerGroupOffsetsRequest,
  type DeleteConsumerGroupOffsetsResponse,
  type DeleteConsumerGroupOffsetsResponseTopic,
  type DeleteConsumerGroupOffsetsTopic,
  type DeleteRecordsResponseData,
  type EditConsumerGroupOffsetsRequest,
  type EditConsumerGroupOffsetsResponse,
  type EditConsumerGroupOffsetsResponseTopic,
  type EditConsumerGroupOffsetsTopic,
  type EndpointCompatibility,
  type EndpointCompatibilityResponse,
  type GetAclOverviewResponse,
  type GetAclsRequest,
  type GetAllPartitionsResponse,
  type GetConsumerGroupResponse,
  type GetConsumerGroupsResponse,
  type GetPartitionsResponse,
  type GetTopicConsumersResponse,
  type GetTopicOffsetsByTimestampResponse,
  type GetTopicsResponse,
  type GroupDescription,
  isApiError,
  type KafkaConnectors,
  type PartialTopicConfigsResponse,
  type Partition,
  type PartitionReassignmentRequest,
  type PartitionReassignments,
  type PartitionReassignmentsResponse,
  type PatchConfigsRequest,
  type PatchConfigsResponse,
  type PatchTopicConfigsRequest,
  type ProduceRecordsResponse,
  type PublishRecordsRequest,
  type ResourceConfig,
  type SchemaReferencedByEntry,
  type SchemaRegistryCompatibilityMode,
  type SchemaRegistryCompatibilityModeWithDefault,
  type SchemaRegistryConfigResponse,
  type SchemaRegistryCreateSchema,
  type SchemaRegistryCreateSchemaResponse,
  type SchemaRegistryDeleteSubjectResponse,
  type SchemaRegistryDeleteSubjectVersionResponse,
  type SchemaRegistryModeResponse,
  type SchemaRegistrySchemaTypesResponse,
  type SchemaRegistrySetCompatibilityModeRequest,
  type SchemaRegistrySubject,
  type SchemaRegistrySubjectDetails,
  type SchemaRegistryValidateSchemaResponse,
  type SchemaVersion,
  type Topic,
  type TopicConfigResponse,
  type TopicConsumer,
  type TopicDescription,
  type TopicDocumentation,
  type TopicDocumentationResponse,
  type TopicMessage,
  type TopicOffset,
  type TopicPermissions,
  type UserData,
  WrappedApiError,
} from './rest-interfaces';
import { rpcnEditorAutosave } from './rpcn-editor-autosave';
import { Features, useSupportedFeaturesStore } from './supported-features';
import { PartitionOffsetOrigin } from './ui';
import { uiState } from './ui-state';
import { config as appConfig, isEmbedded } from '../config';
import { addHeapEventProperties, trackHeapUser } from '../heap/heap.helper';
import { trackHubspotUser } from '../hubspot/hubspot.helper';
import {
  AuthenticationMethod,
  type GetIdentityResponse,
  KafkaAclOperation,
  RedpandaCapability,
  SchemaRegistryCapability,
} from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { KafkaDistribution } from '../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import type { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type CreateDebugBundleRequest,
  type CreateDebugBundleResponse,
  type DebugBundleStatus,
  DebugBundleStatus_Status,
  type GetClusterHealthResponse,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type {
  License,
  ListEnterpriseFeaturesResponse_Feature,
  SetLicenseRequest,
  SetLicenseResponse,
} from '../protogen/redpanda/api/console/v1alpha1/license_pb';
import type {
  PublishMessageRequest,
  PublishMessageResponse,
} from '../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import type { ListTransformsResponse } from '../protogen/redpanda/api/console/v1alpha1/transform_pb';
import {
  GetPipelinesBySecretsRequestSchema as GetPipelinesBySecretsRequestSchemaDataPlane,
  type Pipeline,
  type PipelineCreate,
  type PipelineUpdate,
} from '../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  type CreateSecretRequest,
  type DeleteSecretRequest,
  type ListSecretScopesRequest,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
  Scope,
  type Secret,
  type UpdateSecretRequest,
} from '../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appendWithSlackCap, boundedAppend, pruneMapToKeys } from '../utils/bounded-array';
import { getBuildDate } from '../utils/env';
import fetchWithTimeout from '../utils/fetch-with-timeout';
import { toJson } from '../utils/json-utils';
import { LazyMap } from '../utils/lazy-map';
import { convertListMessageData } from '../utils/message-converters';
import { showToast } from '../utils/toast.utils';
import { objToKv } from '../utils/tsx-utils';
import { decodeBase64, getOidcSubject, TimeSince } from '../utils/utils';

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
      .catch((err) => {
        this.lastResult = undefined;
        this.error = err;
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

  error: unknown | null = null;
  lastResult: unknown | undefined; // set automatically
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

  if (entry.isPending) {
    // return already running request
    return entry.lastPromise as Promise<T>;
  }

  if (entry.resultAge > REST_CACHE_DURATION_SEC || force) {
    // expired or force refresh
    const promise = rest<T>(url);
    entry.setPromise(promise);
  }

  // Return last result (can be still pending, or completed but not yet expired)
  return entry.lastPromise as Promise<T>;
}

export async function handleExpiredLicenseError(r: Response) {
  const data = await r.json();
  if (data.message.includes('license expired')) {
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
// Embedded in Cloud, a failed identity call means "no Console permissions", not "log in".
function embeddedUserData(): UserData {
  return {
    displayName: '',
    avatarUrl: '',
    authenticationMethod: AuthenticationMethod.UNSPECIFIED,
    canListAcls: false,
    canListQuotas: false,
    canPatchConfigs: false,
    canReassignPartitions: false,
    canCreateRoles: false,
    canViewPermissionsList: false,
    canManageLicense: false,
    canManageUsers: false,
    canCreateSchemas: false,
    canDeleteSchemas: false,
    canManageSchemaRegistry: false,
    canViewSchemas: false,
    canListTransforms: false,
    canCreateTransforms: false,
    canDeleteTransforms: false,
    canViewDebugBundle: false,
    canViewConsoleUsers: false,
  };
}

type IdentityError = Parameters<typeof getOidcSubject>[0] & { code?: Code };

// Where an identity failure sends the user, or null for a transient error that keeps them on the page.
function authFailureRedirect(err: IdentityError): string | null {
  // Authentication failure (401) - redirect to login
  if (err.code === Code.Unauthenticated) {
    return '/login';
  }

  // Permission denied (403) - redirect with error info
  if (err.code === Code.PermissionDenied) {
    // TODO - solve typings, provide corresponding Reason type
    const subject = getOidcSubject(err);
    return `/login?error_code=permission_denied&oidc_subject=${subject}`;
  }

  return null;
}

type PartitionLogDir = Partition['partitionLogDirs'][number];

// Largest size reported by a healthy log dir, used as the partition's replica size.
function largestLogDirSize(logDirs: PartitionLogDir[], isHealthy: (logDir: PartitionLogDir) => boolean): number {
  const validLogDirs = logDirs.filter((e) => isHealthy(e) && e.size >= 0);
  const replicaSize = validLogDirs.length > 0 ? validLogDirs.max((e) => e.size) : 0;
  return Math.max(replicaSize, 0);
}

const isLogDirErrorFree = (logDir: PartitionLogDir) => logDir.error === null || logDir.error === '';

// Add some local/cached properties to make working with the data easier
function annotateTopicPartitions(topicName: string, partitions: Partition[]) {
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    // An errored partition is flagged and gets no cached replica size
    if (p.partitionError || p.waterMarksError) {
      p.hasErrors = true;
      continue;
    }

    p.replicaSize = largestLogDirSize(p.partitionLogDirs, (e) => !e.error);
  }
}

type PartitionErrorLists = {
  partitionErrors: Array<{ id: number; partitionError: string }>;
  waterMarksErrors: Array<{ id: number; waterMarksError: string }>;
};

function recordPartitionErrors(p: Partition, lists: PartitionErrorLists) {
  if (p.partitionError) {
    lists.partitionErrors.push({
      id: p.id,
      partitionError: p.partitionError,
    });
  }
  if (p.waterMarksError) {
    lists.waterMarksErrors.push({
      id: p.id,
      waterMarksError: p.waterMarksError,
    });
  }
}

// Collects every partition's errors; once one has errored, the rest get no cached replica size.
function collectPartitionErrors(topicName: string, partitions: Partition[]): PartitionErrorLists {
  const lists: PartitionErrorLists = { partitionErrors: [], waterMarksErrors: [] };

  // Add some local/cached properties to make working with the data easier
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    recordPartitionErrors(p, lists);
    if (lists.partitionErrors.length || lists.waterMarksErrors.length) {
      continue;
    }

    // replicaSize
    p.replicaSize = largestLogDirSize(p.partitionLogDirs, isLogDirErrorFree);
  }

  return lists;
}

type TopicPartitionState = {
  topicPartitions: Map<string, Partition[] | null>;
  topicPartitionErrors: Map<string, PartitionErrorLists['partitionErrors']>;
  topicWatermarksErrors: Map<string, PartitionErrorLists['waterMarksErrors']>;
};

// Without errors the topic's partitions replace its recorded errors; with errors only the errors are recorded.
function topicPartitionsUpdate(topicName: string, partitions: Partition[], lists: PartitionErrorLists) {
  if (lists.partitionErrors.length === 0 && lists.waterMarksErrors.length === 0) {
    // Set partitions
    return (s: TopicPartitionState) => {
      const tpe = new Map(s.topicPartitionErrors);
      tpe.delete(topicName);
      const twe = new Map(s.topicWatermarksErrors);
      twe.delete(topicName);
      return {
        topicPartitionErrors: tpe,
        topicWatermarksErrors: twe,
        topicPartitions: new Map(s.topicPartitions).set(topicName, partitions),
      };
    };
  }

  return (s: TopicPartitionState) => ({
    topicPartitionErrors: new Map(s.topicPartitionErrors).set(topicName, lists.partitionErrors),
    topicWatermarksErrors: new Map(s.topicWatermarksErrors).set(topicName, lists.waterMarksErrors),
  });
}

function logPartitionErrorLists(topicName: string, lists: PartitionErrorLists) {
  if (lists.partitionErrors.length > 0 || lists.waterMarksErrors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(
      `refreshPartitionsForTopic: response has partition errors (t=${topicName} p=${lists.partitionErrors.length}, w=${lists.waterMarksErrors.length})`
    );
  }
}

type PartitionErrorCounts = { partitionErrors: number; waterMarkErrors: number };

function countPartitionErrors(p: Partition, counts: PartitionErrorCounts) {
  if (p.partitionError) {
    counts.partitionErrors += 1;
  }
  if (p.waterMarksError) {
    counts.waterMarkErrors += 1;
  }
}

// Flags every partition from the first errored one on, which also keeps their cached replica size unset.
function flagErroredPartitions(topicName: string, partitions: Partition[]): PartitionErrorCounts {
  const counts: PartitionErrorCounts = { partitionErrors: 0, waterMarkErrors: 0 };

  // Add some local/cached properties to make working with the data easier
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    countPartitionErrors(p, counts);
    if (counts.partitionErrors || counts.waterMarkErrors) {
      p.hasErrors = true;
      continue;
    }

    // replicaSize
    p.replicaSize = largestLogDirSize(p.partitionLogDirs, isLogDirErrorFree);
  }

  return counts;
}

function warnPartitionErrorCounts(topicName: string, counts: PartitionErrorCounts) {
  if (counts.partitionErrors > 0 || counts.waterMarkErrors > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn(
      `refreshPartitionsForTopic: response has partition errors (topic=${topicName} partitionErrors=${counts.partitionErrors}, waterMarkErrors=${counts.waterMarkErrors})`
    );
  }
}

// Each store's state is inferred from its creator. The creator's `set` and `get` are typed through
// non-generic function aliases: `StoreApi<ApiState>` there would make the state reference itself.
type ApiState = ReturnType<typeof _apiCreator>;
type SetApiState = (partial: Partial<ApiState> | ((state: ApiState) => Partial<ApiState>)) => void;
type GetApiState = () => ApiState;

const _apiCreator = (set: SetApiState, get: GetApiState) => ({
  // Data
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
  topicPartitionErrors: new Map<string, Array<{ id: number; partitionError: string }>>(),
  topicWatermarksErrors: new Map<string, Array<{ id: number; waterMarksError: string }>>(),
  topicConsumers: new Map<string, TopicConsumer[]>(),
  topicAcls: new Map<string, GetAclOverviewResponse | null>(),

  ACLs: undefined as GetAclOverviewResponse | undefined | null,

  consumerGroups: new Map<string, GroupDescription>(),
  consumerGroupAcls: new Map<string, GetAclOverviewResponse | null>(),

  partitionReassignments: undefined as PartitionReassignments[] | null | undefined,

  connectConnectors: undefined as KafkaConnectors | undefined,
  connectConnectorsError: null as WrappedApiError | null,
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

  async logout() {
    await appConfig.fetch('./auth/logout');
    // Recovery buffers hold unsaved configuration verbatim; they must not outlive the session.
    rpcnEditorAutosave.clearAll();
    set({ userData: null });
  },
  async refreshUserData() {
    // Prevent duplicate concurrent requests to avoid redirect loops
    if (get().isUserDataFetchInProgress) {
      return;
    }
    set({ isUserDataFetchInProgress: true });

    const client = appConfig.authenticationClient;
    if (!client) {
      set({ isUserDataFetchInProgress: false });
      throw new Error('security client is not initialized');
    }

    await client
      .getIdentity({})
      .then((r: GetIdentityResponse) => {
        // Clear any previous error on success
        set({ userDataError: null });
        set({
          userData: {
            displayName: r.displayName,
            avatarUrl: r.avatarUrl,
            authenticationMethod: r.authenticationMethod,

            canListAcls: r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.DESCRIBE),
            canListQuotas: r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.DESCRIBE_CONFIGS),
            canPatchConfigs: r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.ALTER_CONFIGS),
            canReassignPartitions:
              r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.ALTER_CONFIGS) &&
              r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.DESCRIBE_CONFIGS),
            canCreateRoles:
              r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.ALTER) &&
              r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_RBAC),
            canViewPermissionsList:
              r.permissions?.kafkaClusterOperations.includes(KafkaAclOperation.DESCRIBE) &&
              r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_REDPANDA_USERS),

            canManageLicense: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_LICENSE),
            canManageUsers: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_REDPANDA_USERS),
            canCreateSchemas: r.permissions?.schemaRegistry.includes(SchemaRegistryCapability.WRITE),
            canDeleteSchemas: r.permissions?.schemaRegistry.includes(SchemaRegistryCapability.DELETE),
            canManageSchemaRegistry: r.permissions?.schemaRegistry.includes(SchemaRegistryCapability.WRITE),
            canViewSchemas: r.permissions?.schemaRegistry.includes(SchemaRegistryCapability.READ),
            canListTransforms: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
            canCreateTransforms: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
            canDeleteTransforms: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
            canViewDebugBundle: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_DEBUG_BUNDLE),
            canViewConsoleUsers: r.permissions?.redpanda.includes(RedpandaCapability.MANAGE_RBAC),
          } as UserData,
        });

        // Track user in analytics after successful authentication
        if (r.displayName) {
          const userData = {
            firstName: r.displayName.split(' ')[0] || r.displayName,
            lastName: r.displayName.split(' ').slice(1).join(' ') || '',
            email: r.displayName, // Using displayName as email fallback
          };
          trackHubspotUser(userData);
          trackHeapUser(userData);
        }
      })
      .catch((err) => {
        // Clear previous error
        set({ userDataError: null });

        if (isEmbedded()) {
          // Create a mocked empty userData with all permissions set to false
          set({ userData: embeddedUserData() });
          return;
        }

        const redirect = authFailureRedirect(err);
        if (redirect) {
          set({ userData: null });
          appGlobal.historyPush(redirect);
          return;
        }

        // Transient errors (5xx: Unavailable, DeadlineExceeded, Internal, Unknown)
        // Do NOT redirect to login - this causes infinite loops
        // Keep userData as undefined and store error for UI to display
        set({ userDataError: err });
      })
      .finally(() => {
        set({ isUserDataFetchInProgress: false });
        addHeapEventProperties({
          'Product Name': 'Console',
          Platform: api.isRedpanda ? 'Redpanda' : 'Kafka',
          'Cluster Version': api.clusterOverview?.kafka?.version,
          Version: process.env.REACT_APP_CONSOLE_PLATFORM_VERSION,
          'Build Date': getBuildDate(),
        });
      });
  },

  // Fetch errors
  errors: [] as unknown[],

  _msgSearchVersion: 0,

  refreshTopics(force?: boolean): Promise<void> {
    return cachedApiRequest<GetTopicsResponse>(`${appConfig.restBasePath}/topics`, force).then((v) => {
      if (v?.topics !== null && v?.topics !== undefined) {
        for (const t of v.topics) {
          if (!t.allowedActions) {
            // no op - allowedActions may not be set
          }

          // DEBUG: randomly remove some allowedActions
          /*
                        const numToRemove = Math.round(Math.random() * t.allowedActions.length);
                        for (let i = 0; i < numToRemove; i++) {
                            const randomIndex = Math.round(Math.random() * (t.allowedActions.length - 1));
                            t.allowedActions.splice(randomIndex, 1);
                        }
                        */
        }
      }
      const topics = v?.topics;
      if (topics) {
        // Prune topic-keyed caches to the current topic set so entries for deleted topics (or a
        // previous cluster after a remount) don't accumulate for the life of the tab. Pruning to
        // the live set never drops a topic that still exists, so nothing needs re-fetching.
        const validTopicNames = new Set(topics.map((t) => t.topicName));
        set((s: ApiState) => ({
          topics,
          topicConfig: pruneMapToKeys(s.topicConfig, validTopicNames),
          topicDocumentation: pruneMapToKeys(s.topicDocumentation, validTopicNames),
          topicPermissions: pruneMapToKeys(s.topicPermissions, validTopicNames),
          topicPartitions: pruneMapToKeys(s.topicPartitions, validTopicNames),
          topicPartitionErrors: pruneMapToKeys(s.topicPartitionErrors, validTopicNames),
          topicWatermarksErrors: pruneMapToKeys(s.topicWatermarksErrors, validTopicNames),
          topicConsumers: pruneMapToKeys(s.topicConsumers, validTopicNames),
          topicAcls: pruneMapToKeys(s.topicAcls, validTopicNames),
        }));
      } else {
        set({ topics });
      }
    }, addError);
  },

  refreshTopicConfig(topicName: string, force?: boolean): Promise<void> {
    const promise = cachedApiRequest<TopicConfigResponse | null>(
      `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`,
      force
    ).then((v) => {
      if (!v) {
        set((s) => {
          const m = new Map(s.topicConfig);
          m.delete(topicName);
          return { topicConfig: m };
        });
        return;
      }

      if (v.topicDescription.error) {
        set((s) => ({ topicConfig: new Map(s.topicConfig).set(topicName, v.topicDescription) }));
        return;
      }

      // add 'type' to each synonym
      // in the raw data, only the root entries have 'type', but the nested synonyms do not
      // we need 'type' on synonyms as well for filtering
      const topicDescription = v.topicDescription;
      prepareSynonyms(topicDescription.configEntries);
      set((s) => ({ topicConfig: new Map(s.topicConfig).set(topicName, topicDescription) }));
    }, addError); // 403 -> null
    return promise as Promise<void>;
  },

  async getTopicOffsetsByTimestamp(topicNames: string[], timestampUnixMs: number): Promise<TopicOffset[]> {
    const query = `topicNames=${encodeURIComponent(topicNames.join(','))}&timestamp=${timestampUnixMs}`;
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-offsets?${query}`, {
      method: 'GET',
      headers: [['Content-Type', 'application/json']],
    });

    const r = await parseOrUnwrap<GetTopicOffsetsByTimestampResponse>(response, null);
    return r.topicOffsets;
  },

  refreshTopicDocumentation(topicName: string, force?: boolean) {
    cachedApiRequest<TopicDocumentationResponse>(
      `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/documentation`,
      force
    ).then((v) => {
      const text = v.documentation.markdown === null ? null : decodeBase64(v.documentation.markdown);
      v.documentation.text = text;
      set((s) => ({ topicDocumentation: new Map(s.topicDocumentation).set(topicName, v.documentation) }));
    }, addError);
  },

  async deleteTopic(topicName: string) {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}`, {
      method: 'DELETE',
    });
    return parseOrUnwrap<void>(response, null);
  },

  deleteTopicRecords(topicName: string, offset: number, partitionId?: number) {
    const partitions =
      partitionId === undefined
        ? get()
            .topicPartitions?.get(topicName)
            ?.map((partition: Partition) => ({ partitionId: partition.id, offset }))
        : [{ partitionId, offset }];

    if (!partitions || partitions.length === 0) {
      addError(new Error(`Topic ${topicName} doesn't have partitions.`));
      return;
    }

    return get().deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, partitions);
  },

  deleteTopicRecordsFromAllPartitionsHighWatermark(topicName: string) {
    const partitions = get()
      .topicPartitions?.get(topicName)
      ?.map(({ waterMarkHigh, id }: Partition) => ({
        partitionId: id,
        offset: waterMarkHigh,
      }));

    if (!partitions || partitions.length === 0) {
      addError(new Error(`Topic ${topicName} doesn't have partitions.`));
      return;
    }

    return get().deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, partitions);
  },

  deleteTopicRecordsFromMultiplePartitionOffsetPairs(
    topicName: string,
    pairs: Array<{ partitionId: number; offset: number }>
  ) {
    return rest<DeleteRecordsResponseData>(
      `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/records`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({ partitions: pairs }),
      }
    ).catch(addError);
  },

  refreshPartitions(topics: 'all' | string[] = 'all', force?: boolean): Promise<void> {
    const processedTopics = Array.isArray(topics) ? topics.sort().map((t) => encodeURIComponent(t)) : topics;

    const url =
      processedTopics === 'all'
        ? `${appConfig.restBasePath}/operations/topic-details`
        : `${appConfig.restBasePath}/operations/topic-details?topicNames=${processedTopics.joinStr(',')}`;

    return cachedApiRequest<GetAllPartitionsResponse | null>(url, force).then((response) => {
      if (!response?.topics) {
        return;
      }

      const newTopicPartitions = new Map(get().topicPartitions);

      for (const t of response.topics) {
        if (t.error !== null && t.error !== undefined) {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(`refreshAllTopicPartitions: error for topic ${t.topicName}: ${t.error}`);
          continue;
        }

        annotateTopicPartitions(t.topicName, t.partitions);

        // Set partition
        newTopicPartitions.set(t.topicName, t.partitions);
      }

      set({ topicPartitions: newTopicPartitions });
    }, addError);
  },

  refreshPartitionsForTopic(topicName: string, force?: boolean) {
    cachedApiRequest<GetPartitionsResponse | null>(
      `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/partitions`,
      force
    ).then((response) => {
      if (!response?.partitions) {
        // Set null to indicate that we're not allowed to see the partitions
        set((s: TopicPartitionState) => ({ topicPartitions: new Map(s.topicPartitions).set(topicName, null) }));
        return;
      }

      const errorLists = collectPartitionErrors(topicName, response.partitions);
      set(topicPartitionsUpdate(topicName, response.partitions, errorLists));
      logPartitionErrorLists(topicName, errorLists);

      const errorCounts = flagErroredPartitions(topicName, response.partitions);

      // Set partitions
      set((s: TopicPartitionState) => ({
        topicPartitions: new Map(s.topicPartitions).set(topicName, response.partitions),
      }));

      warnPartitionErrorCounts(topicName, errorCounts);
    }, addError);
  },

  refreshTopicAcls(topicName: string, force?: boolean) {
    const query = aclRequestToQuery({
      ...AclRequestDefault,
      resourcePatternTypeFilter: 'Match',
      resourceType: 'Topic',
      resourceName: topicName,
    });
    cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force)
      .then((v) => {
        if (v) {
          normalizeAcls(v.aclResources);
        }
        set((s) => ({ topicAcls: new Map(s.topicAcls).set(topicName, v) }));
      })
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      .catch(console.error);
  },

  refreshTopicConsumers(topicName: string, force?: boolean) {
    cachedApiRequest<GetTopicConsumersResponse>(
      `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/consumers`,
      force
    ).then(
      (v) => set((s) => ({ topicConsumers: new Map(s.topicConsumers).set(topicName, v.topicConsumers) })),
      addError
    );
  },

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
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('Failed to fetch supported endpoints:', err);
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
      client.getKafkaAuthorizerInfo({}).catch((e) => {
        set((s) => ({ clusterOverview: { ...s.clusterOverview, kafkaAuthorizerError: e } }));
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(e);
        return null;
      }),
      client.getConsoleInfo({}).catch((e) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(e);
        return null;
      }),
      client.getKafkaInfo({}).catch((e) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(e);
        return null;
      }),
      client.getRedpandaInfo({}).catch((e) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(e);
        return null;
      }),
      client.getKafkaConnectInfo({}).catch((e) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(e);
        return null;
      }),
      // Schema registry info is only requested for users who can view schemas
      api.userData?.canViewSchemas
        ? client.getSchemaRegistryInfo({}).catch((e) => {
            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.error(e);
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

  refreshBrokers(force?: boolean) {
    cachedApiRequest<BrokerWithConfigAndStorage[]>(`${appConfig.restBasePath}/brokers`, force).then((v) => {
      set({ brokers: v });
    }, addError);
  },

  refreshCluster(force?: boolean) {
    cachedApiRequest<ClusterInfoResponse>(`${appConfig.restBasePath}/cluster`, force).then((v) => {
      if (v?.clusterInfo !== null && v?.clusterInfo !== undefined) {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
        // add 'type' to each synonym entry
        for (const broker of v.clusterInfo.brokers) {
          if (broker.config && !broker.config.error) {
            prepareSynonyms(broker.config.configs ?? []);
          }
        }

        const newBrokerConfigs = new Map(get().brokerConfigs);
        for (const b of v.clusterInfo.brokers) {
          if (b.config.error) {
            newBrokerConfigs.set(b.brokerId, b.config.error);
          } else {
            newBrokerConfigs.set(b.brokerId, b.config.configs ?? []);
          }
        }
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
      .catch((err) => {
        set((s) => ({ brokerConfigs: new Map(s.brokerConfigs).set(brokerId, String(err)) }));
      });
  },

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

    const response = await appConfig.fetch(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      headers: [['Content-Type', 'application/json']],
      body: toJson(request),
    });

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
    const response = await appConfig.fetch(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
      headers: [['Content-Type', 'application/json']],
    });

    await parseOrUnwrap<void>(response, null);
  },

  async refreshSchemaMode() {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/mode`, {
      method: 'GET',
      headers: [['Content-Type', 'application/json']],
    });
    const rq = parseOrUnwrap<SchemaRegistryModeResponse>(response, null);

    return rq
      .then((r) => {
        if (r.isConfigured === false) {
          set({ schemaOverviewIsConfigured: false, schemaMode: null });
        } else {
          set({ schemaOverviewIsConfigured: true, schemaMode: r.mode });
        }
      })
      .catch((err) => {
        set({ schemaMode: 'Unknown' });
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.warn('failed to request schema mode', err);
      });
  },

  async refreshSchemaCompatibilityConfig() {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config`, {
      method: 'GET',
      headers: [['Content-Type', 'application/json']],
    });
    const rq = parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);

    return rq
      .then((r) => {
        if (r.isConfigured === false) {
          set({ schemaOverviewIsConfigured: false, schemaCompatibility: null });
        } else {
          set({ schemaOverviewIsConfigured: true, schemaCompatibility: r.compatibility });
        }
      })
      .catch(addError);
  },

  refreshSchemaSubjects(force?: boolean) {
    cachedApiRequest<SchemaRegistrySubject[]>(`${appConfig.restBasePath}/schema-registry/subjects`, force).then(
      (subjects) => {
        // could also be a "not configured" response
        if (Array.isArray(subjects)) {
          set({ schemaSubjects: subjects });
        }
      },
      addError
    );
  },

  refreshSchemaTypes(force?: boolean) {
    cachedApiRequest<SchemaRegistrySchemaTypesResponse>(
      `${appConfig.restBasePath}/schema-registry/schemas/types`,
      force
    )
      .then((types) => {
        // could also be a "not configured" response
        if (types.schemaTypes) {
          set({ schemaTypes: types.schemaTypes });
        }
      })
      .catch((err) => {
        set({ schemaTypes: undefined });
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.warn('failed to request schema type', err);
      });
  },

  refreshSchemaDetails(subjectName: string, force?: boolean) {
    // Always refresh all versions, otherwise we cannot know wether or not we have to refresh with 'all,
    // If we refresh with 'latest' or specific number, we'd need to keep track of what information we're missing
    const version = 'all';
    const rq = cachedApiRequest(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}`,
      force
    ) as Promise<SchemaRegistrySubjectDetails>;

    return rq
      .then((details) => {
        set((s) => ({ schemaDetails: new Map(s.schemaDetails).set(subjectName, details) }));
      })
      .catch(addError);
  },

  refreshSchemaReferencedBy(subjectName: string, version: number, force?: boolean) {
    const rq = cachedApiRequest<SchemaReferencedByEntry[]>(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/referencedby`,
      force
    );

    return rq
      .then((references) => {
        const cleanedReferences = [] as SchemaReferencedByEntry[];
        for (const ref of references) {
          if (ref.error) {
            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.error('error in refreshSchemaReferencedBy, reference entry has error', {
              subjectName,
              version,
              error: ref.error,
              refRaw: ref,
            });
            continue;
          }
          cleanedReferences.push(ref);
        }

        set((s) => {
          const newOuterMap = new Map(s.schemaReferencedBy);
          const existingInner = newOuterMap.get(subjectName);
          const newInnerMap = new Map<number, SchemaReferencedByEntry[]>(existingInner);
          newInnerMap.set(version, cleanedReferences);
          newOuterMap.set(subjectName, newInnerMap);
          return { schemaReferencedBy: newOuterMap };
        });
      })
      .catch(() => {
        // no op - error handled elsewhere
      });
  },

  async refreshSchemaUsagesById(schemaId: number, force?: boolean): Promise<void> {
    type SchemaNotConfiguredType = { isConfigured: false };
    function isSchemaVersionArray(r: SchemaVersion[] | SchemaNotConfiguredType): r is SchemaVersion[] {
      return Array.isArray(r);
    }

    await cachedApiRequest<SchemaVersion[] | { isConfigured: false }>(
      `${appConfig.restBasePath}/schema-registry/schemas/ids/${schemaId}/versions`,
      force
    ).then(
      (r) => {
        if (isSchemaVersionArray(r)) {
          set((s) => ({ schemaUsagesById: new Map(s.schemaUsagesById).set(schemaId, r) }));
        }
      },
      (err) => {
        // Currently we don't get helpful status codes (502) so we have to inspect the message
        if (err instanceof Error && err.message.includes('404') && err.message.includes('not found')) {
          // Do nothing, most likely cause is that the user has entered a value into the search box that doesn't exist
          return null;
        }
        throw err;
      }
    );
  },

  async setSchemaRegistryCompatibilityMode(
    mode: SchemaRegistryCompatibilityMode
  ): Promise<SchemaRegistryConfigResponse> {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config`, {
      method: 'PUT',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({
        compatibility: mode,
      } as SchemaRegistrySetCompatibilityModeRequest),
    });
    return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
  },

  async setSchemaRegistrySubjectCompatibilityMode(
    subjectName: string,
    mode: SchemaRegistryCompatibilityModeWithDefault
  ): Promise<SchemaRegistryConfigResponse> {
    if (mode === 'DEFAULT') {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
        {
          method: 'DELETE',
        }
      );
      return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
    }
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({
          compatibility: mode,
        } as SchemaRegistrySetCompatibilityModeRequest),
      }
    );
    return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
  },

  async validateSchema(
    subjectName: string,
    version: number | 'latest',
    request: SchemaRegistryCreateSchema
  ): Promise<SchemaRegistryValidateSchemaResponse> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/validate`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(request),
      }
    );
    return parseOrUnwrap<SchemaRegistryValidateSchemaResponse>(response, null);
  },
  async createSchema(
    subjectName: string,
    request: SchemaRegistryCreateSchema
  ): Promise<SchemaRegistryCreateSchemaResponse> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(request),
      }
    );
    return parseOrUnwrap<SchemaRegistryCreateSchemaResponse>(response, null);
  },

  async deleteSchemaSubject(subjectName: string, permanent: boolean): Promise<SchemaRegistryDeleteSubjectResponse> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}?permanent=${permanent ? 'true' : 'false'}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<SchemaRegistryDeleteSubjectResponse>(response, null);
  },

  async deleteSchemaSubjectVersion(
    subjectName: string,
    version: 'latest' | number,
    permanent: boolean
  ): Promise<SchemaRegistryDeleteSubjectVersionResponse> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${encodeURIComponent(version)}?permanent=${permanent ? 'true' : 'false'}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<SchemaRegistryDeleteSubjectVersionResponse>(response, null);
  },

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

  async setThrottledReplicas(
    topicReplicas: {
      topicName: string;
      leaderReplicas: { brokerId: number; partitionId: number }[];
      followerReplicas: { brokerId: number; partitionId: number }[];
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

  async changeConfig(request: PatchConfigsRequest): Promise<PatchConfigsResponse> {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/configs`, {
      method: 'PATCH',
      headers: [['Content-Type', 'application/json']],
      body: toJson(request),
    });
    return await parseOrUnwrap<PatchConfigsResponse>(response, null);
  },

  async refreshConnectClusters(): Promise<void> {
    set({ connectConnectorsError: null });
    const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/connectors`, {
      method: 'GET',
      headers: [['Content-Type', 'application/json']],
    });

    return await parseOrUnwrap<KafkaConnectors | null>(response, null).then(
      (v) => {
        // backend error
        if (!v) {
          set({ connectConnectors: undefined });
          return;
        }

        // not configured
        if (!v.clusters) {
          set({ connectConnectors: v });
          return;
        }

        // prepare helper properties
        for (const cluster of v.clusters) {
          addFrontendFieldsForConnectCluster(cluster);
        }

        set({ connectConnectors: v });
      },
      (error: WrappedApiError) => {
        set({ connectConnectorsError: error });
      }
    );
  },

  // PATCH /topics/{topicName}/configuration   //
  // PATCH /topics/configuration               // default config
  async changeTopicConfig(topicName: string | null, configs: PatchTopicConfigsRequest['configs']): Promise<void> {
    const url = topicName
      ? `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`
      : `${appConfig.restBasePath}/topics/configuration`;

    const response = await appConfig.fetch(url, {
      method: 'PATCH',
      headers: [['Content-Type', 'application/json']],
      body: toJson({ configs }),
    });
    await parseOrUnwrap<void>(response, null);
  },

  // AdditionalInfo = list of plugins
  refreshClusterAdditionalInfo(clusterName: string, force?: boolean): Promise<void> {
    return cachedApiRequest<ClusterAdditionalInfo | null>(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}`,
      force
    ).then((v) => {
      if (v) {
        set((s) => ({
          connectAdditionalClusterInfo: new Map(s.connectAdditionalClusterInfo).set(clusterName, v),
        }));
      } else {
        set((s) => {
          const m = new Map(s.connectAdditionalClusterInfo);
          m.delete(clusterName);
          return { connectAdditionalClusterInfo: m };
        });
      }
    }, addError);
  },

  async deleteConnector(clusterName: string, connector: string): Promise<void> {
    // DELETE "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async pauseConnector(clusterName: string, connector: string): Promise<void> {
    // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause"  (idempotent)
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/pause`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async resumeConnector(clusterName: string, connector: string): Promise<void> {
    // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume" (idempotent)
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/resume`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async restartConnector(clusterName: string, connector: string): Promise<void> {
    // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/restart`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async updateConnector(clusterName: string, connector: string, config: object): Promise<void> {
    // PUT "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({ config }),
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async restartTask(clusterName: string, connector: string, taskID: number): Promise<void> {
    // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/tasks/{taskID}/restart"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/tasks/${String(taskID)}/restart`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
      }
    );

    return parseOrUnwrap<void>(response, null);
  },

  async validateConnectorConfig(
    clusterName: string,
    pluginClassName: string,
    config: object
  ): Promise<ConnectorValidationResult> {
    // PUT "/kafka-connect/clusters/{clusterName}/connector-plugins/{pluginClassName}/config/validate"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connector-plugins/${encodeURIComponent(pluginClassName)}/config/validate`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(config),
      }
    );
    const result = await parseOrUnwrap<ConnectorValidationResult>(response, null);

    for (let i = 0; i < result.steps.length; i++) {
      result.steps[i].stepIndex = i;
    }

    return result;
  },

  async createConnector(
    clusterName: string,
    connectorName: string,
    _pluginClassName: string, // needs to be kept to avoid larger refactor despite not being used.
    config: object
  ): Promise<void> {
    // POST "/kafka-connect/clusters/{clusterName}/connectors"
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({
          connectorName,
          config,
        }),
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async publishRecords(request: PublishRecordsRequest): Promise<ProduceRecordsResponse> {
    // POST "/topics-records"
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-records`, {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify(request),
    });
    return parseOrUnwrap<ProduceRecordsResponse>(response, null);
  },

  // New version of "publishRecords"
  async publishMessage(request: PublishMessageRequest): Promise<PublishMessageResponse> {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.consoleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Console client is not initialized');
    }
    const r = await client.publishMessage(request);

    return r;
  },

  async createTopic(request: CreateTopicRequest): Promise<CreateTopicResponse> {
    // POST "/topics"
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics`, {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify(request),
    });
    return parseOrUnwrap<CreateTopicResponse>(response, null);
  },

  async createSecret(clusterName: string, connectorName: string, secretValue: string): Promise<CreateSecretResponse> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({
          connectorName,
          clusterName,
          secretData: secretValue,
          labels: {
            component: 'connectors',
          },
        }),
      }
    );
    return parseOrUnwrap<CreateSecretResponse>(response, null);
  },

  async updateSecret(clusterName: string, secretId: string, secretValue: string): Promise<void> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({
          secretData: secretValue,
        }),
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async deleteSecret(clusterName: string, secretId: string): Promise<void> {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`,
      {
        method: 'DELETE',
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async uploadLicense(request: SetLicenseRequest): Promise<SetLicenseResponse> {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.licenseClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Console client is not initialized');
    }
    const r = await client.setLicense(request);

    return r;
  },

  async listLicenses(): Promise<void> {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.licenseClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('License client is not initialized');
    }

    await Promise.all([
      client
        .listEnterpriseFeatures({})
        .then((enterpriseFeaturesResponse) => {
          set({
            enterpriseFeaturesUsed: enterpriseFeaturesResponse.features,
            licenseViolation: enterpriseFeaturesResponse.violation,
          });
        })
        .catch((err) => {
          const errorText = err instanceof Error ? err.message : String(err);

          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.log(`error listing enterprise features: ${errorText}`);
        }),
      client
        .listLicenses({})
        .then((licensesResponse) => {
          set({ licenses: licensesResponse.licenses, licensesLoaded: 'loaded' });
        })
        .catch((err) => {
          set({ licensesLoaded: 'failed' });
          const errorText = err instanceof Error ? err.message : String(err);

          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.log(`error refreshing licenses: ${errorText}`);
          return err;
        }),
    ]);

    if (get().licenses.length > 0) {
      const license = getLatestExpiringLicense(get().licenses);
      if (license !== undefined) {
        addHeapEventProperties({
          BakedInTrial: isBakedInTrial(license),
          LicenseType: prettyLicenseType(license),
          MillisecondsToExpiration: getMillisecondsToExpiration(license),
        });
      }
    }
    addHeapEventProperties({
      SSOEnabled: consoleHasEnterpriseFeature('SINGLE_SIGN_ON'),
    });
  },

  refreshClusterHealth() {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Debug bundle client is not initialized');
    }

    return client.getClusterHealth({}).then((response) => {
      set({ clusterHealth: response });
    });
  },

  async refreshDebugBundleStatuses() {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Debug bundle client is not initialized');
    }

    await client
      .getDebugBundleStatus({})
      .then((response) => {
        set({ debugBundleStatuses: response.brokerStatuses, hasDebugProcess: response.hasDebugProcess });
        return response;
      })
      .catch((e) => {
        set({ debugBundleStatuses: [] });
        return e;
      });
  },

  async createDebugBundle(request: CreateDebugBundleRequest): Promise<CreateDebugBundleResponse> {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Debug bundle client is not initialized');
    }

    return await client.createDebugBundle(request).finally(() => {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      get().refreshDebugBundleStatuses().catch(console.error);
    });
  },

  async cancelDebugBundleProcess({ jobId }: { jobId: string }) {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Debug bundle client is not initialized');
    }

    await client
      .cancelDebugBundleProcess({
        jobId,
      })
      .finally(() => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        get().refreshDebugBundleStatuses().catch(console.error);
      });
  },

  async deleteDebugBundleFile() {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
      // this shouldn't happen but better to explicitly throw
      throw new Error('Debug bundle client is not initialized');
    }
    await client
      .deleteDebugBundleFile({
        deleteAll: true,
      })
      .finally(() => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        get().refreshDebugBundleStatuses().catch(console.error);
      });
  },
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

export type RolePrincipal = { name: string; principalType: 'User' | 'Group' };

type SecurityClient = NonNullable<typeof appConfig.securityClient>;

// One page of roles; a failed request is reported and ends the listing like an empty page.
async function fetchRolesPage(client: SecurityClient, pageToken: string, onError: (error: ConnectError) => void) {
  const res = await client.listRoles({ request: { pageSize: 500, pageToken } }).catch((error) => {
    onError(error);
    return null;
  });
  return res?.response;
}

function listAllRoleNames(client: SecurityClient, onError: (error: ConnectError) => void): Promise<string[]> {
  const roles: string[] = [];
  const nextPage = async (pageToken: string): Promise<string[]> => {
    const page = await fetchRolesPage(client, pageToken, onError);
    roles.push(...(page?.roles.map((x) => x.name) ?? []));
    return page?.nextPageToken ? nextPage(page.nextPageToken) : roles;
  };
  return nextPage('');
}

// "User:alice" → { principalType: 'User', name: 'alice' }; anything else is logged and skipped.
function parseRolePrincipal(roleName: string, principal: string): RolePrincipal | null {
  const colonIdx = principal.indexOf(':');
  if (colonIdx < 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('failed to split principal of role', { roleName, principal });
    return null;
  }
  const principalTypeRaw = principal.slice(0, colonIdx);
  if (principalTypeRaw !== 'User' && principalTypeRaw !== 'Group') {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('unsupported principal type in refreshRoleMembers, skipping', { roleName, principal });
    return null;
  }
  return { principalType: principalTypeRaw, name: principal.slice(colonIdx + 1) };
}

type GetRoleResult = { response?: { role?: { name: string }; members: Array<{ principal: string }> } };

// The role's name and members, or null when the reply carries no role.
function roleMembersEntry(res: GetRoleResult): [string, RolePrincipal[]] | null {
  const { response } = res;
  const role = response?.role;
  if (!(response && role)) {
    return null; // how could this ever happen, maybe someone deleted the role right before we retreived the members?
  }
  const members = response.members.map((x) => parseRolePrincipal(role.name, x.principal)).filterNull();
  return [role.name, members];
}

async function collectRoleMembers(rolePromises: Promise<GetRoleResult>[]): Promise<Map<string, RolePrincipal[]>> {
  const roleMembers = new Map<string, RolePrincipal[]>();
  const roles = await Promise.all(rolePromises);
  for (const role of roles) {
    const entry = roleMembersEntry(role);
    if (entry) {
      roleMembers.set(entry[0], entry[1]);
    }
  }
  return roleMembers;
}

type RolesState = ReturnType<typeof _rolesCreator>;
type SetRolesState = (partial: Partial<RolesState>) => void;
type GetRolesState = () => RolesState;

const _rolesCreator = (set: SetRolesState, get: GetRolesState) => ({
  roles: [] as string[],
  roleMembers: new Map<string, RolePrincipal[]>(), // RoleName -> Principals
  rolesError: null as ConnectError | null,

  async refreshRoles(): Promise<void> {
    set({ rolesError: null });
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    const roles = Features.rolesApi ? await listAllRoleNames(client, (error) => set({ rolesError: error })) : [];

    set({ roles });
  },

  async refreshRoleMembers() {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    const rolePromises: Promise<GetRoleResult>[] = Features.rolesApi
      ? get().roles.map((role: string) => client.getRole({ request: { roleName: role } }))
      : [];

    await Promise.allSettled(rolePromises);

    const roleMembers = await collectRoleMembers(rolePromises);
    set({ roleMembers });
  },

  async createRole(name: string) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    if (Features.rolesApi) {
      await client.createRole({ request: { role: { name } } });
    }
  },

  async deleteRole(name: string, deleteAcls: boolean) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    if (Features.rolesApi) {
      await client.deleteRole({ request: { roleName: name, deleteAcls } });
    }
  },

  async updateRoleMembership(roleName: string, add: RolePrincipal[], remove: RolePrincipal[], createRole = false) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    return await client.updateRoleMembership({
      request: {
        roleName,
        add: add.map((p) => ({ principal: `${p.principalType}:${p.name}` })),
        remove: remove.map((p) => ({ principal: `${p.principalType}:${p.name}` })),
        create: createRole,
      },
    });
  },
});
const useRolesStore = zustandCreate(_rolesCreator);

export const rolesApi = new Proxy<RolesState>({} as RolesState, {
  get(_, prop: string | symbol) {
    return Reflect.get(useRolesStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useRolesStore.setState({ [prop]: value });
    return true;
  },
});

type PipelinesState = ReturnType<typeof _pipelinesCreator>;
type SetPipelinesState = (partial: Partial<PipelinesState>) => void;

const _pipelinesCreator = (set: SetPipelinesState) => ({
  pipelines: undefined as undefined | Pipeline[],
  pipelinesError: null as ConnectError | null,

  async refreshPipelines(_force: boolean): Promise<void> {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    set({ pipelinesError: null });
    const pipelines = await collectPages(async (pageToken) => {
      const res = await client.listPipelines({ request: { pageSize: 500, pageToken } }).catch((error: ConnectError) => {
        set({ pipelinesError: error });
      });
      const response = res?.response;
      return response ? { items: response.pipelines, nextPageToken: response.nextPageToken } : undefined;
    });

    set({ pipelines });
  },

  async deletePipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.deletePipeline({ request: { id } });
  },
  async createPipeline(pipeline: PipelineCreate) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    return await client.createPipeline({ request: { pipeline } });
  },
  async updatePipeline(id: string, pipelineUpdate: PipelineUpdate) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    return await client.updatePipeline({
      request: {
        id,
        pipeline: pipelineUpdate,
      },
    });
  },
  async startPipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.startPipeline({ request: { id } });
  },
  async stopPipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.stopPipeline({ request: { id } });
  },
});
const usePipelinesStore = zustandCreate(_pipelinesCreator);

export const pipelinesApi = new Proxy<PipelinesState>({} as PipelinesState, {
  get(_, prop: string | symbol) {
    return Reflect.get(usePipelinesStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    usePipelinesStore.setState({ [prop]: value });
    return true;
  },
});

type RpcnSecretManagerState = ReturnType<typeof _rpcnSecretManagerCreator>;
type SetRpcnSecretManagerState = (partial: Partial<RpcnSecretManagerState>) => void;
type GetRpcnSecretManagerState = () => RpcnSecretManagerState;

const _rpcnSecretManagerCreator = (set: SetRpcnSecretManagerState, get: GetRpcnSecretManagerState) => ({
  secrets: undefined as undefined | Secret[],
  secretsByPipeline: undefined as { secretId: string; pipelines: Pipeline[] }[] | undefined,
  isEnable: true,

  async refreshSecrets(_force: boolean): Promise<void> {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    // handle error in order to avoid crash app for this request
    const secretsByPipeline = await get()
      .getPipelinesBySecret()
      .catch(() => []);
    set({ secretsByPipeline });

    const secrets = await collectPages(async (pageToken) => {
      const res = await client.listSecrets({
        request: create(ListSecretsRequestSchemaDataPlane, { pageToken, pageSize: 100 }),
      });
      const response = res.response;
      return response ? { items: response.secrets, nextPageToken: response.nextPageToken } : undefined;
    });

    set({ secrets });
  },

  async delete(secret: DeleteSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.deleteSecret({ request: secret });
  },
  async create(secret: CreateSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.createSecret({ request: secret });
  },
  async update(_id: string, updateSecretRequest: UpdateSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.updateSecret({ request: updateSecretRequest });
  },
  async checkScope(listSecretScopesRequest: ListSecretScopesRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    const res = await client.listSecretScopes({
      request: listSecretScopesRequest,
    });

    if (!res.response) {
      set({ isEnable: false });
      return;
    }

    const isEnable = res.response?.scopes.some((scope) => scope === Scope.REDPANDA_CONNECT);
    set({ isEnable });
    return isEnable;
  },
  async getPipelinesBySecret() {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('redpanda connect dataplane pipeline is not initialized');
    }

    const pipelinesBySecrets = await client.getPipelinesBySecrets({
      request: create(GetPipelinesBySecretsRequestSchemaDataPlane),
    });
    return pipelinesBySecrets.response?.pipelinesForSecret.map(({ secretId, pipelines }) => ({
      secretId,
      pipelines,
    }));
  },
});
const useRpcnSecretManagerStore = zustandCreate(_rpcnSecretManagerCreator);

export const rpcnSecretManagerApi = new Proxy<RpcnSecretManagerState>({} as RpcnSecretManagerState, {
  get(_, prop: string | symbol) {
    return Reflect.get(useRpcnSecretManagerStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useRpcnSecretManagerStore.setState({ [prop]: value });
    return true;
  },
});

type TransformsClient = NonNullable<typeof appConfig.transformsClient>;

// One page of transforms; a failed request ends the listing like an empty page.
async function fetchTransformsPage(client: TransformsClient, pageToken: string) {
  const res: ListTransformsResponse | null = await client
    .listTransforms({ request: { pageSize: 500, pageToken } })
    .catch(() => null);
  return res?.response;
}

function listAllTransforms(client: TransformsClient): Promise<TransformMetadata[]> {
  const transforms: TransformMetadata[] = [];
  const nextPage = async (pageToken: string): Promise<TransformMetadata[]> => {
    const page = await fetchTransformsPage(client, pageToken);
    transforms.push(...(page?.transforms ?? []));
    return page?.nextPageToken ? nextPage(page.nextPageToken) : transforms;
  };
  return nextPage('');
}

type TransformsState = ReturnType<typeof _transformsCreator>;
type SetTransformsState = (
  partial: Partial<TransformsState> | ((state: TransformsState) => Partial<TransformsState>)
) => void;

const _transformsCreator = (set: SetTransformsState) => ({
  transforms: undefined as undefined | TransformMetadata[],
  transformDetails: new Map<string, TransformMetadata>(),

  async refreshTransforms(_force: boolean): Promise<void> {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }
    const transforms = await listAllTransforms(client);

    const transformDetails = new Map(transforms.map((t) => [t.name, t]));
    set({ transforms, transformDetails });
  },

  async refreshTransformDetails(name: string, _force: boolean): Promise<void> {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }

    const { response: r } = await client.getTransform({ request: { name } });
    if (!r) {
      throw new Error('got empty response from getTransform');
    }

    const transform = r.transform;
    if (!transform) {
      return;
    }

    set((s) => ({ transformDetails: new Map(s.transformDetails).set(transform.name, transform) }));
  },

  async deleteTransform(name: string) {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }

    await client.deleteTransform({ request: { name } });
  },
});
const useTransformsStore = zustandCreate(_transformsCreator);

export const transformsApi = new Proxy<TransformsState>({} as TransformsState, {
  get(_, prop: string | symbol) {
    return Reflect.get(useTransformsStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useTransformsStore.setState({ [prop]: value });
    return true;
  },
});

/**
 * Sliding-window cap for the live-tail / filtered message buffer (`messageSearch.messages`).
 * Those streams append for up to 30 minutes; on a high-volume topic the array would otherwise
 * grow unbounded for the whole window — the dominant long-lived-tab retention vector.
 */
const LIVE_TAIL_MAX_MESSAGES = 50_000;

/**
 * Slack above `LIVE_TAIL_MAX_MESSAGES` before a trim runs, so the O(n) `splice` happens once per
 * ~slack messages instead of on every message past the cap (which would be hottest exactly on the
 * high-volume streams this guards). The memory ceiling stays cap + slack.
 */
const LIVE_TAIL_TRIM_SLACK = 1024;

type MessageSearchState = {
  searchRequest: MessageSearchRequest | null;
  searchPhase: string | null;
  elapsedMs: number | null;
  bytesConsumed: number;
  totalMessagesConsumed: number;
  nextPageToken: string | null;
  isLoadingMore: boolean;
  abortController: AbortController | null;
  messages: TopicMessage[];
};

type ListMessagesControl = ListMessagesResponse['controlMessage'];
type ConsoleClient = NonNullable<typeof appConfig.consoleClient>;

const SEARCH_TIMEOUT_MS = 30 * 1000;
const LIVE_TAIL_TIMEOUT_MS = 30 * 60 * 1000;

function requireConsoleClient(): ConsoleClient {
  // https://connectrpc.com/docs/web/using-clients
  // https://github.com/connectrpc/connect-es
  // https://github.com/connectrpc/examples-es
  const client = appConfig.consoleClient;

  if (!client) {
    // this shouldn't happen but better to explicitly throw
    throw new Error('No console client configured');
  }
  return client;
}

function withCloudAccessToken(searchRequest: MessageSearchRequest): MessageSearchRequest {
  return {
    ...searchRequest,
    ...(appConfig.jwt
      ? {
          enterprise: {
            redpandaCloud: {
              accessToken: appConfig.jwt,
            },
          },
        }
      : {}),
  };
}

function toListMessagesRequest(searchRequest: MessageSearchRequest) {
  return create(ListMessagesRequestSchema, {
    topic: searchRequest.topicName,
    startOffset: BigInt(searchRequest.startOffset),
    startTimestamp: BigInt(searchRequest.startTimestamp),
    partitionId: searchRequest.partitionId,
    maxResults: searchRequest.maxResults,
    pageToken: searchRequest.pageToken ?? '',
    pageSize: searchRequest.pageSize ?? 0,
    filterInterpreterCode: searchRequest.filterInterpreterCode,
    includeOriginalRawPayload: searchRequest.includeRawPayload ?? false,
    ignoreMaxSizeLimit: searchRequest.ignoreSizeLimit ?? false,
    keyDeserializer: searchRequest.keyDeserializer,
    valueDeserializer: searchRequest.valueDeserializer,
    schemaContext: searchRequest.schemaContext ?? '',
  });
}

// For StartOffset = Newest and any set push-down filter we need to bump the default timeout
// from 30s to 30 minutes before ending the request gracefully.
// The same condition marks a live-tail/filtered stream, which appends for the whole window
// and so needs the sliding-window cap below (normal pagination never enters this branch).
function isLiveTailSearch(searchRequest: MessageSearchRequest): boolean {
  return searchRequest.startOffset === PartitionOffsetOrigin.End || searchRequest.filterInterpreterCode !== null;
}

function beginSearch(
  search: MessageSearchState,
  searchRequest: MessageSearchRequest,
  append: boolean,
  notify: () => void
) {
  search.searchRequest = searchRequest;
  search.searchPhase = 'Connecting';
  search.bytesConsumed = 0;
  search.totalMessagesConsumed = 0;
  if (!append) {
    search.messages.length = 0;
    notify();
  }
  search.isLoadingMore = append;
  search.elapsedMs = null;
}

function resetSearchProgress(search: MessageSearchState) {
  search.searchPhase = null;
  search.bytesConsumed = 0;
  search.totalMessagesConsumed = 0;
}

function finishSearch(
  search: MessageSearchState,
  done: Extract<ListMessagesControl, { case: 'done' }>['value'],
  notify: () => void
) {
  search.elapsedMs = Number(done.elapsedMs);
  search.bytesConsumed = Number(done.bytesConsumed);
  search.nextPageToken = done.nextPageToken || null;
  search.isLoadingMore = false;
  search.searchPhase = null;
  notify();
}

// error doesn't necessarily mean the whole request is done
function reportSearchBackendError(message: string) {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.info(`ws backend error: ${message}`);
  showToast({
    title: 'Backend Error',
    description: message,
    status: 'error',
    duration: 5000,
  });
}

function appendSearchMessage(search: MessageSearchState, message: TopicMessage, isLiveTail: boolean) {
  // Bound the live-tail/filtered buffer to a sliding window so a 30-minute stream on
  // a high-volume topic cannot grow the heap without limit. appendWithSlackCap
  // amortizes the O(n) trim to ~once per LIVE_TAIL_TRIM_SLACK messages.
  if (isLiveTail) {
    appendWithSlackCap(search.messages, message, LIVE_TAIL_MAX_MESSAGES, LIVE_TAIL_TRIM_SLACK);
  } else {
    search.messages.push(message);
  }
}

function applySearchControl(
  search: MessageSearchState,
  control: ListMessagesControl,
  isLiveTail: boolean,
  notify: () => void
) {
  switch (control.case) {
    case 'phase':
      search.searchPhase = control.value.phase;
      break;
    case 'progress':
      search.bytesConsumed = Number(control.value.bytesConsumed);
      search.totalMessagesConsumed = Number(control.value.messagesConsumed);
      break;
    case 'done':
      finishSearch(search, control.value, notify);
      break;
    case 'error':
      reportSearchBackendError(control.value.message);
      break;
    case 'data':
      appendSearchMessage(search, convertListMessageData(control.value), isLiveTail);
      break;
    default:
      break;
  }
}

// A malformed frame is logged and skipped, so one bad message doesn't end the stream.
function applySearchResponse(
  search: MessageSearchState,
  res: ListMessagesResponse,
  isLiveTail: boolean,
  notify: () => void
) {
  try {
    applySearchControl(search, res.controlMessage, isLiveTail, notify);
  } catch (e) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('error in listMessages loop', { error: e });
  }
}

// https://connectrpc.com/docs/web/errors
function failSearch(search: MessageSearchState, abortSignal: AbortSignal, error: unknown) {
  resetSearchProgress(search);
  if (abortSignal.aborted) {
    return; // Do not throw, this is a user cancellation
  }
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error('startMessageSearchNew: error in await loop of client.listMessages', { error });
  throw error;
}

async function streamSearchMessages(
  search: MessageSearchState,
  client: ConsoleClient,
  searchRequest: MessageSearchRequest,
  abortSignal: AbortSignal,
  notify: () => void
) {
  const req = toListMessagesRequest(searchRequest);
  const isLiveTail = isLiveTailSearch(searchRequest);
  try {
    for await (const res of client.listMessages(req, {
      signal: abortSignal,
      timeoutMs: isLiveTail ? LIVE_TAIL_TIMEOUT_MS : SEARCH_TIMEOUT_MS,
    })) {
      if (abortSignal.aborted) {
        break;
      }
      applySearchResponse(search, res, isLiveTail, notify);
    }
  } catch (e) {
    failSearch(search, abortSignal, e);
  } finally {
    // Always cleanup the abort controller reference to prevent memory leaks
    // This ensures cleanup happens whether the stream completes, errors, or is cancelled
    search.abortController = null;
  }
}

export function createMessageSearch() {
  const notify = () => useApiStore.setState((s) => ({ _msgSearchVersion: s._msgSearchVersion + 1 }));
  const messageSearch = {
    // Parameters last passed to 'startMessageSearch'
    searchRequest: null as MessageSearchRequest | null,

    // Some statistics that might be interesting to show in the UI
    searchPhase: null as string | null, // A search has different phases, like "waiting for mssages", or "creating consumers", this string is directly reported by the backend
    elapsedMs: null as null | number, // Reported by the backend, only set once the search is done
    bytesConsumed: 0,
    totalMessagesConsumed: 0,

    // Pagination state
    nextPageToken: null as string | null,
    isLoadingMore: false,

    // Call 'stopSearch' instead of using this directly
    abortController: null as AbortController | null,

    // Live view of messages, gets updated as new messages arrive
    messages: [] as TopicMessage[],

    async startSearch(
      _searchRequest: MessageSearchRequest,
      externalSignal?: AbortSignal,
      append = false
    ): Promise<TopicMessage[]> {
      const client = requireConsoleClient();

      if (this.searchPhase) {
        // There is a search running already, abort it
        this.stopSearch('starting a new search');
      }

      const searchRequest = withCloudAccessToken(_searchRequest);
      beginSearch(this, searchRequest, append, notify);

      // Links external signal (component control) with internal controller - both can abort the same stream
      // Ensures cleanup works from component unmount AND direct stopSearch() calls
      const linkedController = createLinkedAbortController(externalSignal);
      this.abortController = linkedController;

      // do it
      await streamSearchMessages(this, client, searchRequest, linkedController.signal, notify);

      // one done
      this.stopSearch();
      return this.messages;
    },

    stopSearch(reason?: string) {
      if (this.abortController) {
        this.abortController.abort(reason ?? 'aborted by user');
        this.abortController = null;
      }

      if (this.searchPhase !== null) {
        resetSearchProgress(this);
      }
    },

    async loadMore(loadMorePageSize?: number, externalSignal?: AbortSignal): Promise<TopicMessage[]> {
      if (!this.nextPageToken) {
        throw new Error('No next page available');
      }

      if (!this.searchRequest) {
        throw new Error('No search request available');
      }

      const nextRequest = {
        ...this.searchRequest,
        pageToken: this.nextPageToken,
        pageSize: loadMorePageSize ?? this.searchRequest.pageSize,
      };

      return await this.startSearch(nextRequest, externalSignal, true);
    },
  };

  return messageSearch;
}
export type MessageSearch = ReturnType<typeof createMessageSearch>;

function addFrontendFieldsForConnectCluster(cluster: ClusterConnectors) {
  const allowedActions = cluster.allowedActions ?? ['all'];
  const allowAll = allowedActions.includes('all');

  cluster.canViewCluster = allowAll || allowedActions.includes('viewConnectCluster');
  cluster.canEditCluster = allowAll || allowedActions.includes('editConnectCluster');
  cluster.canDeleteCluster = allowAll || allowedActions.includes('deleteConnectCluster');

  for (const connector of cluster.connectors) {
    if (connector.config) {
      connector.jsonConfig = JSON.stringify(connector.config, undefined, 4);
    } else {
      connector.jsonConfig = '';
    }
  }
}

function addFrontendFieldsForConsumerGroup(g: GroupDescription) {
  g.lagSum = g.topicOffsets.sum((o) => o.summedLag);

  if (g.allowedActions) {
    if (g.allowedActions.includes('all')) {
      // All perms
    } else {
      // Not all perms, set helper props
      g.noEditPerms = !g.allowedActions?.includes('editConsumerGroup');
      g.noDeletePerms = !g.allowedActions?.includes('deleteConsumerGroup');
    }
  }
  g.isInUse = g.state.toLowerCase() !== 'empty';
}

export const brokerMap = {
  get(): Map<number, Broker> | null {
    const brokers = api.clusterInfo?.brokers;
    if (!brokers) {
      return null;
    }
    return new Map(brokers.map((b: Broker) => [b.brokerId, b]));
  },
};

// 1. add 'type' to each synonym, so when expanding a config entry (to view its synonyms), we can still see the type
// 2. remove redundant synonym entries (those that have the same source as the root config entry)
function prepareSynonyms(configEntries: ConfigEntry[]) {
  if (!Array.isArray(configEntries)) {
    return;
  }

  for (const e of configEntries) {
    if (e.synonyms === undefined) {
      continue;
    }

    // add 'type' from root object
    for (const s of e.synonyms) {
      s.type = e.type;
    }
  }
}

function normalizeAcls(acls: AclResource[]) {
  function upperFirst(str: string): string {
    if (!str) {
      return str;
    }
    const lower = str.toLowerCase();
    const first = lower[0];
    const result = first.toUpperCase() + lower.slice(1);
    return result;
  }

  const specialCaseMap = {
    TRANSACTIONAL_ID: 'TransactionalID',
  } as { [key: string]: string };

  function normalizeStringEnum<T extends string>(str: T): T {
    if (!str) {
      return str;
    }
    if (specialCaseMap[str]) {
      return specialCaseMap[str] as T;
    }

    const parts = str.split('_');
    for (let i = 0; i < parts.length; i++) {
      parts[i] = upperFirst(parts[i].toLowerCase());
    }
    const result = parts.join('');
    return result as T;
  }

  for (const e of acls) {
    e.resourceType = normalizeStringEnum(e.resourceType);
    e.resourcePatternType = normalizeStringEnum(e.resourcePatternType);

    for (const acl of e.acls) {
      acl.operation = normalizeStringEnum(acl.operation);
      acl.permissionType = normalizeStringEnum(acl.permissionType);
    }
  }
}

export function aclRequestToQuery(request: GetAclsRequest): string {
  const filters = objToKv(request)
    .filter((kv) => !!kv.value)
    .map((x) => [x.key, String(x.value)]);

  const searchParams = new URLSearchParams(filters);
  return searchParams.toString();
}

export async function partialTopicConfigs(
  configKeys: string[],
  topics?: string[]
): Promise<PartialTopicConfigsResponse> {
  const keys = configKeys.map((k) => encodeURIComponent(k)).join(',');
  const topicNames = topics?.map((t) => encodeURIComponent(t)).join(',');
  const query = topicNames ? `topicNames=${topicNames}&configKeys=${keys}` : `configKeys=${keys}`;

  const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-configs?${query}`);
  return parseOrUnwrap<PartialTopicConfigsResponse>(response, null);
}

export type MessageSearchRequest = {
  topicName: string;
  startOffset: number;
  startTimestamp: number;
  partitionId: number;
  maxResults: number; // should also support '-1' soon, so we can do live tailing
  pageToken?: string; // Page token for pagination (only used when maxResults = -1)
  pageSize?: number; // Number of messages per page (only used when maxResults = -1, defaults to 50)
  filterInterpreterCode: string; // js code, base64 encoded
  enterprise?: {
    redpandaCloud?: {
      accessToken: string;
    };
  };
  includeRawPayload?: boolean;
  ignoreSizeLimit?: boolean;

  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;
  schemaContext?: string; // '' resolves the topic's context, '.' forces the default.
};

async function parseOrUnwrap<T>(response: Response, text: string | null): Promise<T> {
  const responseText = await readResponseBody(response, text);
  const obj = parseResponseJson(responseText);

  // api error?
  if (isApiError(obj)) {
    throw new WrappedApiError(response, obj);
  }

  // server/proxy error?
  if (!response.ok) {
    const trimmedText = responseText?.trim() ?? '';
    throw new Error(`${response.status} (${trimmedText || response.statusText})`);
  }

  return obj as T;
}

/**
 * Cap on retained API errors. `addError` is called from ~20 legacy refresh paths; on a
 * long-lived tab with auto-refresh enabled and a persistently failing endpoint the array
 * would otherwise grow without bound (each entry retains a stack + the Response body).
 * The error UI only ever surfaces the most recent entries, so a ring buffer loses nothing.
 */
const MAX_TRACKED_ERRORS = 50;

function addError(err: Error) {
  useApiStore.setState((s: ApiState) => ({
    errors: boundedAppend(s.errors, err, MAX_TRACKED_ERRORS),
  }));
}

/** React hook to subscribe to API store state. Use this in components instead of useStore(useApiStore, ...). */
function useApiStoreHook<T>(selector: (state: ApiState) => T): T {
  return useStore(useApiStore, selector);
}

export {
  useApiStore,
  useApiStoreHook,
  usePipelinesStore,
  useRolesStore,
  useRpcnSecretManagerStore,
  useTransformsStore,
};

export const api = new Proxy<apiStoreType>({} as apiStoreType, {
  get(_, prop: string | symbol) {
    const s = useApiStore.getState();
    switch (prop as string) {
      case 'activeRequests':
        return _activeRequests;
      case 'isRedpanda':
        return s.clusterOverview?.kafka?.distribution === KafkaDistribution.REDPANDA;
      case 'isAdminApiConfigured':
        return s.clusterOverview?.redpanda !== null;
      case 'getTopicPartitionArray': {
        const result: string[] = [];
        s.topicPartitions.forEach((partitions, topicName) => {
          if (partitions !== null) {
            for (const partition of partitions) {
              result.push(`${topicName}/${partition.id}`);
            }
          }
        });
        return result;
      }
      case 'isDebugBundleReady':
        return (
          s.debugBundleStatuses.length > 0 &&
          !s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.RUNNING
          )
        );
      case 'canDownloadDebugBundle':
        return (
          s.debugBundleStatuses.length > 0 &&
          !s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.RUNNING
          ) &&
          s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.SUCCESS
          )
        );
      case 'isDebugBundleError':
        return (
          s.debugBundleStatuses.length > 0 &&
          !s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.RUNNING
          ) &&
          s.debugBundleStatuses.every(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.ERROR
          )
        );
      case 'isDebugBundleExpired':
        return (
          s.debugBundleStatuses.length > 0 &&
          !s.debugBundleStatuses.some(
            (status) =>
              status.value.case === 'bundleStatus' && status.value.value.status === DebugBundleStatus_Status.RUNNING
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

function createRestHeaders(initialHeaders?: HeadersInit): Headers {
  // Add JWT Bearer token if available (same as gRPC addBearerTokenInterceptor)
  // Only add if not already set - custom fetch (e.g., Cloud UI's authenticatedFetch) may have already added it
  const headers = new Headers(initialHeaders);
  if (appConfig.jwt && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${appConfig.jwt}`);
  }
  return headers;
}

async function updateLoginError(res: Response): Promise<void> {
  try {
    const text = await res.text();
    const obj = JSON.parse(text);
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`unauthorized message: ${text}`);

    const err = obj as ApiError;
    uiState.loginError = String(err.message);
  } catch (err) {
    uiState.loginError = String(err);
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

function parseResponseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type PaginatedItems<T> = { items: T[]; nextPageToken?: string };

function collectPages<T>(fetchPage: (pageToken: string) => Promise<PaginatedItems<T> | undefined>): Promise<T[]> {
  const items: T[] = [];
  const nextPage = async (pageToken: string): Promise<T[]> => {
    const page = await fetchPage(pageToken);
    if (!page) {
      return items;
    }
    items.push(...page.items);
    if (!page.nextPageToken) {
      return items;
    }
    return nextPage(page.nextPageToken);
  };
  return nextPage('');
}
