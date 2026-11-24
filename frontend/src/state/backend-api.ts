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
  type DeleteConsumerGroupOffsetsTopic,
  type DeleteRecordsResponseData,
  type EditConsumerGroupOffsetsRequest,
  type EditConsumerGroupOffsetsResponse,
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
  type TopicPermissions,
  type UserData,
  WrappedApiError,
} from './rest-interfaces';
import { rpcnEditorAutosave } from './rpcn-editor-autosave';
import { Features, useSupportedFeaturesStore } from './supported-features';
import { PartitionOffsetOrigin } from './ui';
import { uiState } from './ui-state';
import { config as appConfig, isEmbedded } from '../config';
import { addHeapEventProperties, trackHeapUser } from '../heap/heap-tracking';
import { trackHubspotUser } from '../hubspot/hubspot-tracking';
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
  type DebugBundleStatus,
  DebugBundleStatus_Status,
  type GetClusterHealthResponse,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type {
  License,
  ListEnterpriseFeaturesResponse_Feature,
  SetLicenseRequest,
} from '../protogen/redpanda/api/console/v1alpha1/license_pb';
import type { PublishMessageRequest } from '../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
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

const REST_CACHE_MAX_ENTRIES = 500;

declare const registry: Registry;

/**
 * Uses the configured fetch and auth handling. A non-2xx response is handled as an API error; a successful response can still contain per-item errors, such as failed broker log directories.
 */
export async function rest<T>(url: string, requestInit?: RequestInit) {
  const headers = createRestHeaders(requestInit?.headers);

  const res = await fetchWithTimeout(url, REST_TIMEOUT_SEC * 1000, {
    ...requestInit,
    headers,
  });

  if (res.status === 401) {
    await handle401(res);
    return null;
  }
  if (res.status === 403) {
    return null;
  }

  const text = await res.text();

  processVersionInfo(res.headers);

  return parseOrUnwrap<T>(res, text);
}

async function handle401(res: Response) {
  api.userData = null;

  await updateLoginError(res);

  const inEmbeddedContext =
    isEmbedded() || appConfig.clusterId !== 'default' || window.location.pathname.includes('/clusters/');

  if (inEmbeddedContext) {
    // WARNING: Delegate embedded reauthentication to the host; redirecting the child can navigate the user away from the host shell.
    window.dispatchEvent(
      new CustomEvent('console:auth-error', {
        detail: { clusterId: appConfig.clusterId, path: window.location.pathname },
      })
    );
    // WARNING: Do not navigate the embedded app on auth failure; the host owns sign-in and the request must still fail.
    return;
  }

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
  } catch {
    // WARNING: Keep legacy non-JSON version metadata from breaking the current request.
  }
}

const _activeRequests: CacheEntry[] = [];

const cache = new LazyMap<string, CacheEntry>((u) => new CacheEntry(u), REST_CACHE_MAX_ENTRIES);
class CacheEntry {
  url: string;

  private readonly timeSinceLastResult = new TimeSince();
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
  lastResult: unknown | undefined;
  isPending: boolean;

  private readonly timeSinceRequestStarted = new TimeSince();
  private lastRequestDurationMs: number;
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

function cachedApiRequest<T>(url: string, force = false) {
  const entry = cache.get(url);

  if (entry.isPending) {
    return entry.lastPromise as Promise<T>;
  }

  if (entry.resultAge > REST_CACHE_DURATION_SEC || force) {
    const promise = rest<T>(url);
    entry.setPromise(promise);
  }

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

function embeddedUserData() {
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
  } satisfies UserData;
}

type IdentityError = Parameters<typeof getOidcSubject>[0] & { code?: Code };

function authFailureRedirect(err: IdentityError) {
  if (err.code === Code.Unauthenticated) {
    return '/login';
  }

  if (err.code === Code.PermissionDenied) {
    const subject = getOidcSubject(err);
    return `/login?error_code=permission_denied&oidc_subject=${subject}`;
  }

  return null;
}

type PartitionLogDir = Partition['partitionLogDirs'][number];

function largestLogDirSize(logDirs: PartitionLogDir[], isHealthy: (logDir: PartitionLogDir) => boolean) {
  const validLogDirs = logDirs.filter((e) => isHealthy(e) && e.size >= 0);
  const replicaSize = validLogDirs.length > 0 ? validLogDirs.max((e) => e.size) : 0;
  return Math.max(replicaSize, 0);
}

const isLogDirErrorFree = (logDir: PartitionLogDir) => logDir.error === null || logDir.error === '';

function annotateTopicPartitions(topicName: string, partitions: Partition[]) {
  for (const p of partitions) {
    p.topicName = topicName;

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

function collectPartitionErrors(topicName: string, partitions: Partition[]) {
  const lists: PartitionErrorLists = { partitionErrors: [], waterMarksErrors: [] };

  for (const p of partitions) {
    p.topicName = topicName;

    recordPartitionErrors(p, lists);
    if (lists.partitionErrors.length || lists.waterMarksErrors.length) {
      continue;
    }

    p.replicaSize = largestLogDirSize(p.partitionLogDirs, isLogDirErrorFree);
  }

  return lists;
}

type TopicPartitionState = {
  topicPartitions: Map<string, Partition[] | null>;
  topicPartitionErrors: Map<string, PartitionErrorLists['partitionErrors']>;
  topicWatermarksErrors: Map<string, PartitionErrorLists['waterMarksErrors']>;
};

function topicPartitionsUpdate(topicName: string, partitions: Partition[], lists: PartitionErrorLists) {
  if (lists.partitionErrors.length === 0 && lists.waterMarksErrors.length === 0) {
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

function flagErroredPartitions(topicName: string, partitions: Partition[]) {
  const counts: PartitionErrorCounts = { partitionErrors: 0, waterMarkErrors: 0 };

  for (const p of partitions) {
    p.topicName = topicName;

    countPartitionErrors(p, counts);
    if (counts.partitionErrors || counts.waterMarkErrors) {
      p.hasErrors = true;
      continue;
    }

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

type ApiState = ReturnType<typeof _apiCreator>;
type SetApiState = (partial: Partial<ApiState> | ((state: ApiState) => Partial<ApiState>)) => void;
type GetApiState = () => ApiState;

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

  brokerConfigs: new Map<number, ConfigEntry[] | string>(),

  schemaOverviewIsConfigured: undefined as boolean | undefined,

  schemaMode: undefined as string | null | undefined,
  schemaCompatibility: undefined as string | null | undefined,
  schemaSubjects: undefined as SchemaRegistrySubject[] | undefined,
  schemaTypes: undefined as string[] | undefined,
  schemaDetails: new Map<string, SchemaRegistrySubjectDetails>(),
  schemaReferencedBy: new Map<string, Map<number, SchemaReferencedByEntry[]>>(),
  schemaUsagesById: new Map<number, SchemaVersion[]>(),

  topics: null as Topic[] | null,
  topicConfig: new Map<string, TopicDescription | null>(),
  topicDocumentation: new Map<string, TopicDocumentation>(),
  topicPermissions: new Map<string, TopicPermissions | null>(),
  topicPartitions: new Map<string, Partition[] | null>(),
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
  connectAdditionalClusterInfo: new Map<string, ClusterAdditionalInfo>(),

  licenses: [] as License[],
  licenseViolation: false,
  licensesLoaded: undefined as 'loaded' | 'failed' | undefined,

  enterpriseFeaturesUsed: [] as ListEnterpriseFeaturesResponse_Feature[],

  clusterHealth: undefined as GetClusterHealthResponse | undefined,
  debugBundleStatuses: [] as GetDebugBundleStatusResponse_DebugBundleBrokerStatus[],
  hasDebugProcess: false as boolean,

  userData: undefined as UserData | null | undefined,
  isUserDataFetchInProgress: false as boolean,
  userDataError: null as ConnectError | null,

  async logout() {
    await appConfig.fetch('./auth/logout');
    // WARNING: Clear recovery buffers on logout; they contain unsaved configuration verbatim.
    rpcnEditorAutosave.clearAll();
    set({ userData: null });
  },
  async refreshUserData() {
    // WARNING: Keep one login request in flight; competing responses can cause redirect loops.
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

        if (r.displayName) {
          const userData = {
            firstName: r.displayName.split(' ')[0] || r.displayName,
            lastName: r.displayName.split(' ').slice(1).join(' ') || '',
            email: r.displayName,
          };
          trackHubspotUser(userData);
          trackHeapUser(userData);
        }
      })
      .catch((err) => {
        set({ userDataError: null });

        if (isEmbedded()) {
          set({ userData: embeddedUserData() });
          return;
        }

        const redirect = authFailureRedirect(err);
        if (redirect) {
          set({ userData: null });
          appGlobal.historyPush(redirect);
          return;
        }

        // WARNING: Do not redirect on transient identity failures; redirecting retries the failing request in a loop.
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

  errors: [] as unknown[],

  _msgSearchVersion: 0,

  refreshTopics(force?: boolean) {
    return cachedApiRequest<GetTopicsResponse>(`${appConfig.restBasePath}/topics`, force).then((v) => {
      if (v?.topics !== null && v?.topics !== undefined) {
        for (const t of v.topics) {
          if (!t.allowedActions) {
          }
        }
      }
      const topics = v?.topics;
      if (topics) {
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

  refreshTopicConfig(topicName: string, force?: boolean) {
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

      const topicDescription = v.topicDescription;
      prepareSynonyms(topicDescription.configEntries);
      set((s) => ({ topicConfig: new Map(s.topicConfig).set(topicName, topicDescription) }));
    }, addError);
    return promise as Promise<void>;
  },

  async getTopicOffsetsByTimestamp(topicNames: string[], timestampUnixMs: number) {
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

  refreshPartitions(topics: 'all' | string[] = 'all', force?: boolean) {
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
        set((s: TopicPartitionState) => ({ topicPartitions: new Map(s.topicPartitions).set(topicName, null) }));
        return;
      }

      const errorLists = collectPartitionErrors(topicName, response.partitions);
      set(topicPartitionsUpdate(topicName, response.partitions, errorLists));
      logPartitionErrorLists(topicName, errorLists);

      const errorCounts = flagErroredPartitions(topicName, response.partitions);

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

  async refreshAcls(request: GetAclsRequest, force?: boolean) {
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

  async refreshSupportedEndpoints() {
    try {
      const r = await rest<EndpointCompatibilityResponse>(`${appConfig.restBasePath}/console/endpoints`);
      if (!r) {
        return null;
      }
      // WARNING: Publish capability state before API state; synchronous sidebar subscribers read the capability store.
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

  async editConsumerGroupOffsets(groupId: string, topics: EditConsumerGroupOffsetsTopic[]) {
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

  async deleteConsumerGroupOffsets(groupId: string, topics: DeleteConsumerGroupOffsetsTopic[]) {
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

  async deleteConsumerGroup(groupId: string) {
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
    // WARNING: Refresh all subject versions together; a latest-only refresh cannot distinguish obsolete entries from absent ones.
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
      .catch(() => {});
  },

  async refreshSchemaUsagesById(schemaId: number, force?: boolean) {
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
        if (err instanceof Error && err.message.includes('404') && err.message.includes('not found')) {
          return null;
        }
        throw err;
      }
    );
  },

  async setSchemaRegistryCompatibilityMode(mode: SchemaRegistryCompatibilityMode) {
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
  ) {
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

  async validateSchema(subjectName: string, version: number | 'latest', request: SchemaRegistryCreateSchema) {
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
  async createSchema(subjectName: string, request: SchemaRegistryCreateSchema) {
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

  async deleteSchemaSubject(subjectName: string, permanent: boolean) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}?permanent=${permanent ? 'true' : 'false'}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<SchemaRegistryDeleteSubjectResponse>(response, null);
  },

  async deleteSchemaSubjectVersion(subjectName: string, version: 'latest' | number, permanent: boolean) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${encodeURIComponent(version)}?permanent=${permanent ? 'true' : 'false'}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<SchemaRegistryDeleteSubjectVersionResponse>(response, null);
  },

  refreshPartitionReassignments(force?: boolean) {
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

  async startPartitionReassignment(request: PartitionReassignmentRequest) {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/reassign-partitions`, {
      method: 'PATCH',
      headers: [['Content-Type', 'application/json']],
      body: toJson(request),
    });
    return await parseOrUnwrap<AlterPartitionReassignmentsResponse>(response, null);
  },

  async setReplicationThrottleRate(brokerIds: number[], maxBytesPerSecond: number) {
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
  ) {
    const configRequest: PatchConfigsRequest = { resources: [] };

    for (const t of topicReplicas) {
      const res: ResourceConfig = {
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

      configRequest.resources.push(res);
    }

    return await get().changeConfig(configRequest);
  },

  async resetThrottledReplicas(topicNames: string[]) {
    const configRequest: PatchConfigsRequest = { resources: [] };

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

  async resetReplicationThrottleRate(brokerIds: number[]) {
    const configRequest: PatchConfigsRequest = { resources: [] };

    // WARNING: Reset only per-broker throttles set by Console; the cluster-wide setting has another owner.

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

  async changeConfig(request: PatchConfigsRequest) {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/configs`, {
      method: 'PATCH',
      headers: [['Content-Type', 'application/json']],
      body: toJson(request),
    });
    return await parseOrUnwrap<PatchConfigsResponse>(response, null);
  },

  async refreshConnectClusters() {
    set({ connectConnectorsError: null });
    const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/connectors`, {
      method: 'GET',
      headers: [['Content-Type', 'application/json']],
    });

    return await parseOrUnwrap<KafkaConnectors | null>(response, null).then(
      (v) => {
        if (!v) {
          set({ connectConnectors: undefined });
          return;
        }

        if (!v.clusters) {
          set({ connectConnectors: v });
          return;
        }

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

  async changeTopicConfig(topicName: string | null, configs: PatchTopicConfigsRequest['configs']) {
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

  refreshClusterAdditionalInfo(clusterName: string, force?: boolean) {
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

  async deleteConnector(clusterName: string, connector: string) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`,
      {
        method: 'DELETE',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async pauseConnector(clusterName: string, connector: string) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/pause`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async resumeConnector(clusterName: string, connector: string) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/resume`,
      {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async restartConnector(clusterName: string, connector: string) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/restart`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async updateConnector(clusterName: string, connector: string, config: object) {
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

  async restartTask(clusterName: string, connector: string, taskID: number) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/tasks/${String(taskID)}/restart`,
      {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
      }
    );

    return parseOrUnwrap<void>(response, null);
  },

  async validateConnectorConfig(clusterName: string, pluginClassName: string, config: object) {
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

  async createConnector(clusterName: string, connectorName: string, _pluginClassName: string, config: object) {
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

  async publishRecords(request: PublishRecordsRequest) {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-records`, {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify(request),
    });
    return parseOrUnwrap<ProduceRecordsResponse>(response, null);
  },

  async publishMessage(request: PublishMessageRequest) {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.consoleClient!;
    if (!client) {
      throw new Error('Console client is not initialized');
    }
    const r = await client.publishMessage(request);

    return r;
  },

  async createTopic(request: CreateTopicRequest) {
    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics`, {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify(request),
    });
    return parseOrUnwrap<CreateTopicResponse>(response, null);
  },

  async createSecret(clusterName: string, connectorName: string, secretValue: string) {
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

  async updateSecret(clusterName: string, secretId: string, secretValue: string) {
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

  async deleteSecret(clusterName: string, secretId: string) {
    const response = await appConfig.fetch(
      `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`,
      {
        method: 'DELETE',
      }
    );
    return parseOrUnwrap<void>(response, null);
  },

  async uploadLicense(request: SetLicenseRequest) {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.licenseClient!;
    if (!client) {
      throw new Error('Console client is not initialized');
    }
    const r = await client.setLicense(request);

    return r;
  },

  async listLicenses() {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.licenseClient!;
    if (!client) {
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

  async createDebugBundle(request: CreateDebugBundleRequest) {
    // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
    const client = appConfig.debugBundleClient!;
    if (!client) {
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

async function fetchRolesPage(client: SecurityClient, pageToken: string, onError: (error: ConnectError) => void) {
  const res = await client.listRoles({ request: { pageSize: 500, pageToken } }).catch((error) => {
    onError(error);
    return null;
  });
  return res?.response;
}

function listAllRoleNames(client: SecurityClient, onError: (error: ConnectError) => void) {
  const roles: string[] = [];
  const nextPage: (pageToken: string) => Promise<string[]> = async (pageToken) => {
    const page = await fetchRolesPage(client, pageToken, onError);
    roles.push(...(page?.roles.map((x) => x.name) ?? []));
    return page?.nextPageToken ? nextPage(page.nextPageToken) : roles;
  };
  return nextPage('') satisfies Promise<string[]>;
}

function parseRolePrincipal(roleName: string, principal: string) {
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
  return { principalType: principalTypeRaw, name: principal.slice(colonIdx + 1) } satisfies RolePrincipal;
}

type GetRoleResult = { response?: { role?: { name: string }; members: Array<{ principal: string }> } };

function roleMembersEntry(res: GetRoleResult) {
  const { response } = res;
  const role = response?.role;
  if (!(response && role)) {
    return null;
  }
  const members = response.members.map((x) => parseRolePrincipal(role.name, x.principal)).filterNull();
  const entry: [string, RolePrincipal[]] = [role.name, members];
  return entry;
}

async function collectRoleMembers(rolePromises: Promise<GetRoleResult>[]) {
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
  roleMembers: new Map<string, RolePrincipal[]>(),
  rolesError: null as ConnectError | null,

  async refreshRoles() {
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

  async refreshPipelines(_force: boolean) {
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

  async refreshSecrets(_force: boolean) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

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

async function fetchTransformsPage(client: TransformsClient, pageToken: string) {
  const res: ListTransformsResponse | null = await client
    .listTransforms({ request: { pageSize: 500, pageToken } })
    .catch(() => null);
  return res?.response;
}

function listAllTransforms(client: TransformsClient) {
  const transforms: TransformMetadata[] = [];
  const nextPage: (pageToken: string) => Promise<TransformMetadata[]> = async (pageToken) => {
    const page = await fetchTransformsPage(client, pageToken);
    transforms.push(...(page?.transforms ?? []));
    return page?.nextPageToken ? nextPage(page.nextPageToken) : transforms;
  };
  return nextPage('') satisfies Promise<TransformMetadata[]>;
}

type TransformsState = ReturnType<typeof _transformsCreator>;
type SetTransformsState = (
  partial: Partial<TransformsState> | ((state: TransformsState) => Partial<TransformsState>)
) => void;

const _transformsCreator = (set: SetTransformsState) => ({
  transforms: undefined as undefined | TransformMetadata[],
  transformDetails: new Map<string, TransformMetadata>(),

  async refreshTransforms(_force: boolean) {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }
    const transforms = await listAllTransforms(client);

    const transformDetails = new Map(transforms.map((t) => [t.name, t]));
    set({ transforms, transformDetails });
  },

  async refreshTransformDetails(name: string, _force: boolean) {
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

const LIVE_TAIL_MAX_MESSAGES = 50_000;

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

function requireConsoleClient() {
  const client = appConfig.consoleClient;

  if (!client) {
    throw new Error('No console client configured');
  }
  return client;
}

function withCloudAccessToken(searchRequest: MessageSearchRequest) {
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
  } satisfies MessageSearchRequest;
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

function isLiveTailSearch(searchRequest: MessageSearchRequest) {
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

function failSearch(search: MessageSearchState, abortSignal: AbortSignal, error: unknown) {
  resetSearchProgress(search);
  if (abortSignal.aborted) {
    return;
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
    search.abortController = null;
  }
}

/**
 * Live streams are capped with slack so an O(n) trim does not run on every incoming message. Search phase and elapsed time come from the server; elapsed time arrives on completion. User cancellation is not an error.
 */
export function createMessageSearch() {
  const notify = () => useApiStore.setState((s) => ({ _msgSearchVersion: s._msgSearchVersion + 1 }));
  const messageSearch = {
    searchRequest: null as MessageSearchRequest | null,

    searchPhase: null as string | null,
    elapsedMs: null as null | number,
    bytesConsumed: 0,
    totalMessagesConsumed: 0,

    nextPageToken: null as string | null,
    isLoadingMore: false,

    abortController: null as AbortController | null,

    messages: [] as TopicMessage[],

    async startSearch(_searchRequest: MessageSearchRequest, externalSignal?: AbortSignal, append = false) {
      const client = requireConsoleClient();

      if (this.searchPhase) {
        this.stopSearch('starting a new search');
      }

      const searchRequest = withCloudAccessToken(_searchRequest);
      beginSearch(this, searchRequest, append, notify);

      const linkedController = createLinkedAbortController(externalSignal);
      this.abortController = linkedController;

      await streamSearchMessages(this, client, searchRequest, linkedController.signal, notify);

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

    async loadMore(loadMorePageSize?: number, externalSignal?: AbortSignal) {
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
    } else {
      g.noEditPerms = !g.allowedActions?.includes('editConsumerGroup');
      g.noDeletePerms = !g.allowedActions?.includes('deleteConsumerGroup');
    }
  }
  g.isInUse = g.state.toLowerCase() !== 'empty';
}

export const brokerMap = {
  get() {
    const brokers = api.clusterInfo?.brokers;
    if (!brokers) {
      return null;
    }
    return new Map(brokers.map((b: Broker) => [b.brokerId, b]));
  },
};

function prepareSynonyms(configEntries: ConfigEntry[]) {
  if (!Array.isArray(configEntries)) {
    return;
  }

  for (const e of configEntries) {
    if (e.synonyms === undefined) {
      continue;
    }

    for (const s of e.synonyms) {
      s.type = e.type;
    }
  }
}

function normalizeAcls(acls: AclResource[]) {
  function upperFirst(str: string) {
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

  function normalizeStringEnum<T extends string>(str: T) {
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

export function aclRequestToQuery(request: GetAclsRequest) {
  const filters = objToKv(request)
    .filter((kv) => !!kv.value)
    .map((x) => [x.key, String(x.value)]);

  const searchParams = new URLSearchParams(filters);
  return searchParams.toString();
}

export async function partialTopicConfigs(configKeys: string[], topics?: string[]) {
  const keys = configKeys.map((k) => encodeURIComponent(k)).join(',');
  const topicNames = topics?.map((t) => encodeURIComponent(t)).join(',');
  const query = topicNames ? `topicNames=${topicNames}&configKeys=${keys}` : `configKeys=${keys}`;

  const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-configs?${query}`);
  return parseOrUnwrap<PartialTopicConfigsResponse>(response, null);
}

/**
 * A maxResults value of -1 enables streaming pages with a token and default size of 50. Filter source is base64-encoded JavaScript. An empty schema context resolves the topic context; a dot forces the default context.
 */
export type MessageSearchRequest = {
  topicName: string;
  startOffset: number;
  startTimestamp: number;
  partitionId: number;
  maxResults: number;
  pageToken?: string;
  pageSize?: number;
  filterInterpreterCode: string;
  enterprise?: {
    redpandaCloud?: {
      accessToken: string;
    };
  };
  includeRawPayload?: boolean;
  ignoreSizeLimit?: boolean;

  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;
  schemaContext?: string;
};

async function parseOrUnwrap<T>(response: Response, text: string | null) {
  const responseText = await readResponseBody(response, text);
  const obj = parseResponseJson(responseText);

  if (isApiError(obj)) {
    throw new WrappedApiError(response, obj);
  }

  if (!response.ok) {
    const trimmedText = responseText?.trim() ?? '';
    throw new Error(`${response.status} (${trimmedText || response.statusText})`);
  }

  return obj as T;
}

const MAX_TRACKED_ERRORS = 50;

function addError(err: Error) {
  useApiStore.setState((s: ApiState) => ({
    errors: boundedAppend(s.errors, err, MAX_TRACKED_ERRORS),
  }));
}

/** React hook to subscribe to API store state. Use this in components instead of useStore(useApiStore, ...). */
function useApiStoreHook<T>(selector: (state: ApiState) => T) {
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

/**
 * The legacy REST cache retains a bounded LRU by URL. Store entries can distinguish an unknown value from an explicitly missing or unauthorized response; a cached broker configuration can carry its error string instead. The error view retains only its most recent entries.
 */
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

function createRestHeaders(initialHeaders?: HeadersInit) {
  // WARNING: Preserve the existing Authorization header; the embedded host may already have attached its own credentials.
  const headers = new Headers(initialHeaders);
  if (appConfig.jwt && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${appConfig.jwt}`);
  }
  return headers;
}

async function updateLoginError(res: Response) {
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

function readResponseBody(response: Response, text: string | null) {
  if (text !== null) {
    return Promise.resolve(text);
  }
  if (response.bodyUsed) {
    return Promise.reject(new Error('response content already consumed'));
  }
  return response.text();
}

function parseResponseJson(text: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return payload;
}

type PaginatedItems<T> = { items: T[]; nextPageToken?: string };

function collectPages<T>(fetchPage: (pageToken: string) => Promise<PaginatedItems<T> | undefined>) {
  const items: T[] = [];
  const nextPage = async (pageToken: string) => {
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
