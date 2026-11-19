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

import type { ConnectError } from '@connectrpc/connect';

import type { AuthenticationMethod } from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import type {
  GetConsoleInfoResponse,
  GetKafkaAuthorizerInfoResponse,
  GetKafkaConnectInfoResponse,
  GetKafkaInfoResponse,
  GetRedpandaInfoResponse,
  GetSchemaRegistryInfoResponse,
} from '../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import type { TroubleshootReport } from '../protogen/redpanda/api/console/v1alpha1/common_pb';

export type ApiError = {
  statusCode: number;
  message: string;
};

export function isApiError(obj: unknown): obj is ApiError {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'statusCode' in obj &&
    typeof (obj as { statusCode: unknown }).statusCode === 'number' &&
    'message' in obj &&
    typeof (obj as { message: unknown }).message === 'string'
  );
}

export class WrappedApiError extends Error {
  statusCode: number;
  path: string;

  constructor(response: Response, apiError: ApiError) {
    super(apiError.message);
    Object.setPrototypeOf(this, WrappedApiError.prototype);

    this.statusCode = apiError.statusCode;

    // try showing only the path of the url
    try {
      const u = new URL(response.url);
      this.path = u.pathname + u.search;
    } catch {
      this.path = response.url;
    }
  }

  toString() {
    return `${this.message} (Status ${this.statusCode})`;
  }
}

export const TopicActions = [
  'seeTopic',
  'viewPartitions',
  'viewMessages',
  'useSearchFilter',
  'viewConsumers',
  'viewConfig',
  'deleteTopic',
  'deleteTopicRecords',
  'editConfig',
] as const;
export type TopicAction = 'all' | (typeof TopicActions)[number];
export type Topic = {
  topicName: string;
  isInternal: boolean;
  partitionCount: number;
  replicationFactor: number;
  cleanupPolicy: string;
  documentation: 'UNKNOWN' | 'NOT_CONFIGURED' | 'NOT_EXISTENT' | 'AVAILABLE';
  logDirSummary: TopicLogDirSummary;
  allowedActions: TopicAction[] | undefined; // undefined means 'all'
};

export type TopicLogDirSummary = {
  totalSizeBytes: number; // how much space this topic takes up (files in its log dir)
  replicaErrors:
    | {
        brokerId: number;
        error: string | null;
      }[]
    | null;
  hint: string | null;
};

export type GetTopicsResponse = {
  topics: Topic[];
};

export type Partition = {
  id: number;

  partitionError: string | null;
  replicas: number[]; // brokerIds of all brokers that host the leader or a replica of this partition
  offlineReplicas: number[] | null;
  inSyncReplicas: number[]; // brokerId (can only be one?) of the leading broker
  leader: number; // id of the "leader" broker for this partition
  partitionLogDirs: {
    error: string; // empty when no error
    brokerId: number;
    partitionId: number; // redundant?
    size: number; // size (in bytes) of log dir on that broker
  }[];

  waterMarksError: string | null;
  waterMarkLow: number;
  waterMarkHigh: number;

  replicaSize: number; // largest known/reported size of any replica; used for estimating how much traffic a reassignment would cause
  topicName: string; // used for finding the actual topic this partition belongs to (in case we pass around a partition reference on its own)
  hasErrors: boolean; // just (partitionError || waterMarksError)
};

export type GetPartitionsResponse = {
  topicName: string;
  error: string | null; // only set if metadata request has failed for the whole topic
  partitions: Partition[];
};

export type GetAllPartitionsResponse = {
  topics: {
    topicName: string;
    error: string | null;
    partitions: Partition[];
  }[];
};

export type DeleteRecordsResponseData = {
  topicName: string;
  partitions: [
    {
      partitionId: number;
      lowWaterMark: number;
      error: string;
    },
  ];
};

export type TopicConsumer = {
  groupId: string;
  summedLag: number;
};

export type GetTopicConsumersResponse = {
  topicName: string;
  topicConsumers: TopicConsumer[];
};

export type MessageDataType =
  | 'null'
  | 'avro'
  | 'protobuf'
  | 'protobufSchema'
  | 'protobufBSR'
  | 'json'
  | 'jsonSchema'
  | 'xml'
  | 'text'
  | 'utf8WithControlChars'
  | 'consumerOffsets'
  | 'binary'
  | 'msgpack'
  | 'uint'
  | 'smile'
  | 'cbor';
export const CompressionType = {
  Unknown: 'unknown',

  Uncompressed: 'uncompressed',
  GZip: 'gzip',
  Snappy: 'snappy',
  LZ4: 'lz4',
  ZStd: 'zstd',
} as const;

export type CompressionTypeType = (typeof CompressionType)[keyof typeof CompressionType];

export type Payload = {
  payload: unknown; // json obj
  isPayloadNull: boolean;
  encoding: MessageDataType; // actual format of the message (before the backend converted it to json)
  schemaId: number;
  size: number;

  troubleshootReport?: TroubleshootReport[];
  isPayloadTooLarge?: boolean;
  normalizedPayload?: Uint8Array; // used to show hex bytes if payload couldn't be decoded
  rawBytes?: Uint8Array;
};

export type TopicMessage = {
  partitionID: number;
  offset: number;
  timestamp: number;

  compression: CompressionTypeType;
  isTransactional: boolean;

  headers: {
    key: string;
    value: Payload;
  }[];
  key: Payload;
  value: Payload;

  valueJson: string; // Value json is what is used for (local) filtering
  valueBinHexPreview: string;
  keyJson: string;
  keyBinHexPreview: string;
};

export type ListMessageResponse = {
  elapsedMs: number;
  fetchedMessages: number;
  isCancelled: boolean;
  messages: TopicMessage[];
};

export type GetTopicMessagesResponse = {
  kafkaMessages: ListMessageResponse;
};

export type KafkaError = {
  code: number;
  message: string;
  description: string;
};

export type ConfigType = 'BOOLEAN' | 'STRING' | 'INT' | 'SHORT' | 'LONG' | 'DOUBLE' | 'LIST' | 'CLASS' | 'PASSWORD';

export type ConfigEntry = {
  name: string;
  value: string | null;
  source: string;
  type: ConfigType;
  isExplicitlySet: boolean;
  isDefaultValue: boolean;
  isReadOnly: boolean;
  isSensitive: boolean;
  synonyms: ConfigEntrySynonym[] | undefined;
  documentation?: string;
};

export type ConfigEntryExtended = ConfigEntry & {
  category?: string;
  frontendFormat?:
    | 'BOOLEAN'
    | 'PASSWORD'
    | 'STRING'
    | 'SELECT'
    | 'MULTI_SELECT'
    | 'BYTE_SIZE'
    | 'RATIO'
    | 'DURATION'
    | 'DECIMAL'
    | 'INTEGER';
  enumValues?: string[];
  noInfiniteValue?: boolean;

  currentValue: string | number | null | undefined;
};

export type ConfigEntrySynonym = {
  name: string;
  value: string | null;
  source: string;

  type: string | null;
};

export type TopicDescription = {
  topicName: string;
  configEntries: ConfigEntryExtended[];
  error: KafkaError | null;
};
export type TopicConfigResponse = {
  topicDescription: TopicDescription;
};
export type PartialTopicConfigsResponse = {
  topicDescriptions: TopicDescription[];
};
export type TopicDocumentation = {
  isEnabled: boolean;
  markdown: string | null; // base64

  text: string | null; // atob(markdown)
};
export type TopicDocumentationResponse = {
  topicName: string;
  documentation: TopicDocumentation;
};

export type GroupMemberAssignment = {
  topicName: string;
  partitionIds: number[];
};
export type GroupMemberDescription = {
  id: string; // unique ID assigned to the member after login
  instanceId?: string;
  clientId: string; // custom id reported by the member
  clientHost: string; // address/host of the connection
  assignments: GroupMemberAssignment[]; // topics+partitions that the worker is assigned to

  // consumer (KIP-848) groups only
  memberEpoch?: number;
  targetAssignments?: GroupMemberAssignment[];
  subscribedTopics?: string[];

  hasMissingPartitionIds: boolean;
  hasMissingAssignments: boolean;
};

export const GroupActions = ['seeConsumerGroup', 'editConsumerGroup', 'deleteConsumerGroup'] as const;
export type GroupAction = 'all' | (typeof GroupActions)[number];

export type GroupType = 'classic' | 'consumer';

export type GroupDescription = {
  groupId: string; // name of the group
  groupType: GroupType;
  state: string;
  protocol: string; // balancer of a classic group, assignor of a consumer group
  protocolType: string; // Will be "consumer" if we can decode the members; otherwise ".members" will be empty, which happens for "sr" (for schema registry) for example
  // consumer (KIP-848) groups only; missing when the broker could not describe the group
  groupEpoch?: number;
  targetAssignmentEpoch?: number;
  members: GroupMemberDescription[]; // members (consumers) that are currently present in the group
  coordinatorId: number;
  topicOffsets: GroupTopicOffsets[];
  allowedActions: GroupAction[] | null;

  lagSum: number; // sum of lag for all topic offsets

  isInUse: boolean;
  noEditPerms: boolean;
  noDeletePerms: boolean;
};

export type GroupTopicOffsets = {
  topic: string;
  summedLag: number; // summed lag of all partitions (non consumed partitions are not considered)
  partitionCount: number;
  partitionsWithOffset: number; // number of partitions that have an active group offset
  partitionOffsets: GroupPartitionOffset[];
};

export type GroupPartitionOffset = {
  partitionId: number;
  groupOffset: number | null; // null when no committed offset exists for this partition

  error: string | undefined; // Error will be set when the high water mark could not be fetched
  highWaterMark: number;
  lag: number;
};

export type EditConsumerGroupOffsetsRequest = {
  groupId: string;
  topics: EditConsumerGroupOffsetsTopic[];
};

export type EditConsumerGroupOffsetsTopic = {
  topicName: string;
  partitions: {
    partitionId: number;
    offset: number; // -1 latest, -2 earliest
  }[];
};

export type EditConsumerGroupOffsetsResponse = {
  error: string | undefined;
  topics: EditConsumerGroupOffsetsResponseTopic[];
};

export type EditConsumerGroupOffsetsResponseTopic = {
  topicName: string;
  partitions: {
    partitionID: number;
    error: string;
  }[];
};

export type DeleteConsumerGroupRequest = {
  groupId: string;
};
export type DeleteConsumerGroupOffsetsRequest = {
  groupId: string;
  topics: DeleteConsumerGroupOffsetsTopic[];
};
export type DeleteConsumerGroupOffsetsTopic = {
  topicName: string;
  partitions: {
    partitionId: number;
  }[];
};

export type DeleteConsumerGroupOffsetsResponse = {
  topics: DeleteConsumerGroupOffsetsResponseTopic[];
};

export type DeleteConsumerGroupOffsetsResponseTopic = {
  topicName: string;
  partitions: {
    partitionID: number;
    error: string | undefined;
  }[];
};

export type GetTopicOffsetsByTimestampRequest = {
  topics: GetTopicOffsetsByTimestampRequestTopic[];
  timestamp: number; // unix ms
};
export type GetTopicOffsetsByTimestampRequestTopic = {
  topicName: string;
  partitionIds: number[];
};

export type GetTopicOffsetsByTimestampResponse = {
  topicOffsets: TopicOffset[];
};
export type TopicOffset = {
  topicName: string;
  partitions: PartitionOffset[];
};

export type PartitionOffset = {
  error: string | undefined;
  partitionId: number;

  offset: number;

  timestamp: number;
};

export type TopicLag = {
  topic: string; // name
  summedLag: number;

  partitionCount: number; // number of partitions the topic has
  partitionsWithOffset: number; // number of partitions that have an active offset in this group

  // only lists partitions that have a commited offset (independent of whether or not a member is currently assigned to it)
  partitionLags: PartitionLag[];
};

export type PartitionLag = {
  partitionId: number;
  offset: number;
  lag: number;
};

export type GetConsumerGroupsResponse = {
  consumerGroups: GroupDescription[];
};
export type GetConsumerGroupResponse = {
  consumerGroup: GroupDescription;
};

export type ClusterInfoResponse = {
  clusterInfo: ClusterInfo;
};
export type ClusterInfo = {
  controllerId: number;
  brokers: Broker[];
  kafkaVersion: string;
};
export type Broker = {
  brokerId: number;
  logDirSize: number; // bytes of the whole directory
  address: string;
  rack: string | null;

  config: BrokerConfig;
};
export type BrokerConfig = {
  configs: ConfigEntry[] | undefined;
  error: string | undefined;
};

export type EndpointCompatibilityResponse = {
  licenses: RedpandaLicense[];
  endpointCompatibility: EndpointCompatibility;
};

export type RedpandaLicense = {
  // Source is where the license is used (e.g. Redpanda Cluster, Console)
  source: 'console' | 'cluster' | string;
  // Type is the type of license (free, trial, enterprise)
  type: 'free_trial' | 'open_source' | 'enterprise' | string;
  expiresAt: number;
};

export type EndpointCompatibility = {
  kafkaVersion: string;
  endpoints: EndpointCompatibilityEntry[];
};

export type EndpointCompatibilityEntry = {
  endpoint: string;
  method: string;
  isSupported: boolean;
};

export type BrokerConfigResponse = {
  brokerConfigs: ConfigEntry[];
};

export type User = {
  id: string;
  internalIdentifier: string;
  providerID: number;
  providerName: string;
  meta: {
    email: string;
    name: string;
    avatarUrl: string;
  };
};
export type Seat = {
  id: string; // id of seat
  licenseId: string; // shouldn't that be censored??
  user: User; // user representation of firestore? should be removed...
  lastActivity: string; // is a datetime string, should probably be a "UnixMillis"
};
export type UserData = {
  displayName: string;
  avatarUrl: string;
  authenticationMethod: AuthenticationMethod;

  canViewConsoleUsers: boolean;
  canListAcls: boolean;
  canListQuotas: boolean;
  canReassignPartitions: boolean;
  canPatchConfigs: boolean;
  canCreateRoles: boolean;
  canManageUsers: boolean;
  canViewPermissionsList: boolean;

  canManageLicense: boolean;
  canViewSchemas: boolean;
  canCreateSchemas: boolean;
  canDeleteSchemas: boolean;
  canManageSchemaRegistry: boolean;
  canViewDebugBundle: boolean;

  canListTransforms: boolean;
  canCreateTransforms: boolean;
  canDeleteTransforms: boolean;
};
export type UserPermissions = Exclude<keyof UserData, 'user' | 'seat'>;

export type TopicPermissions = {
  canSeeTopic: boolean;
  canViewTopicPartitions: boolean;
  canSeeTopicConfig: boolean;
  canUseSearchFilters: boolean;
  canViewTopicMessages: boolean;
  canViewTopicConsumers: boolean;
  canEditTopicConfig: boolean;
};

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L47
export const AclResourceType = {
  Unknown: 0,
  Any: 1,
  Topic: 2,
  Group: 3,
  Cluster: 4,
  TransactionalID: 5,
  DelegationToken: 6,
} as const;

export type AclResourceTypeType = (typeof AclResourceType)[keyof typeof AclResourceType];

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L59
export const AclResourcePatternType = {
  Unknown: 0,
  Any: 1,
  Match: 2,
  Literal: 3,
  Prefixed: 4,
} as const;

export type AclResourcePatternTypeType = (typeof AclResourcePatternType)[keyof typeof AclResourcePatternType];

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L81
export const AclOperation = {
  Unknown: 0,
  Any: 1,
  All: 2,
  Read: 3,
  Write: 4,
  Create: 5,
  Delete: 6,
  Alter: 7,
  Describe: 8,
  ClusterAction: 9,
  DescribeConfigs: 10,
  AlterConfigs: 11,
  IdempotentWrite: 12,
} as const;

export type AclOperationType = (typeof AclOperation)[keyof typeof AclOperation];

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L71
export const AclPermission = {
  Unknown: 0,
  Any: 1,
  Deny: 2,
  Allow: 3,
} as const;

export type AclPermissionType = (typeof AclPermission)[keyof typeof AclPermission];

//   /api/acls?resourceType=1&resourcePatternTypeFilter=1&operation=1&permissionType=1
export type GetAclsRequest = {
  resourceType: AclStrResourceType;
  resourceName?: string;
  resourcePatternTypeFilter: AclStrResourcePatternType;
  principal?: string;
  host?: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
};

export const AclRequestDefault = {
  resourceType: 'Any',
  resourceName: '',
  resourcePatternTypeFilter: 'Any',
  principal: '',
  host: '',
  operation: 'Any',
  permissionType: 'Any',
} as const;

export type AclStrResourceType =
  | 'Unknown'
  | 'Any'
  | 'Topic'
  | 'Group'
  | 'Cluster'
  | 'TransactionalID'
  | 'DelegationToken'
  | 'RedpandaRole';

export type AclStrResourcePatternType = 'Unknown' | 'Any' | 'Match' | 'Literal' | 'Prefixed';

export type AclStrOperation =
  | 'Unknown'
  | 'Any'
  | 'All'
  | 'Read'
  | 'Write'
  | 'Create'
  | 'Delete'
  | 'Alter'
  | 'Describe'
  | 'ClusterAction'
  | 'DescribeConfigs'
  | 'AlterConfigs'
  | 'IdempotentWrite';

export type AclStrPermission = 'Unknown' | 'Any' | 'Deny' | 'Allow';

export type GetAclOverviewResponse = {
  aclResources: AclResource[];
  isAuthorizerEnabled: boolean;
};

export type AclResource = {
  resourceType: AclStrResourceType;
  resourceName: string;
  resourcePatternType: AclStrResourcePatternType;
  acls: AclRule[];
};

export type AclRule = {
  principal: string;
  host: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
};

export const SchemaType = {
  AVRO: 'AVRO',
  JSON: 'JSON',
  PROTOBUF: 'PROTOBUF',
} as const;

export type SchemaTypeType = (typeof SchemaType)[keyof typeof SchemaType];

export type PartitionReassignmentsResponse = {
  topics: PartitionReassignments[];
};
export type PartitionReassignments = {
  topicName: string;
  partitions: PartitionReassignmentsPartition[];
};
export type PartitionReassignmentsPartition = {
  partitionId: number;
  addingReplicas: number[];
  removingReplicas: number[];
  replicas: number[];
};

export type PartitionReassignmentRequest = {
  topics: TopicAssignment[];
};
export type TopicAssignment = {
  topicName: string; // name of topic to change
  partitions: {
    partitionId: number;
    replicas: number[] | null;
    // Since Kafka rebalances the leader partitions across the brokers periodically, it is not super important which broker is the leader.
    // Can also be null to cancel a pending reassignment.
  }[];
};

export type AlterPartitionReassignmentsResponse = {
  reassignPartitionsResponses: {
    topicName: string;
    partitions: AlterPartitionReassignmentsPartitionResponse[];
  }[];
};
export type AlterPartitionReassignmentsPartitionResponse = {
  partitionId: number;
  errorCode: string;
  errorMessage: string | null;
};

export const ConfigResourceType = {
  Unknown: 0,
  Topic: 2,
  Broker: 4,
  BrokerLogger: 8,
} as const;

export type ConfigResourceTypeType = (typeof ConfigResourceType)[keyof typeof ConfigResourceType];

export const AlterConfigOperation = {
  Set: 0, // set a config key
  Delete: 1, // remove/unset a config key
  Append: 2, // add a value to a list
  Subtract: 3, // remove a value from a list
} as const;

export type AlterConfigOperationType = (typeof AlterConfigOperation)[keyof typeof AlterConfigOperation];

export type IncrementalAlterConfigsRequestResourceConfig = {
  name: string;

  // set(0) value must not be null
  // append(2) append value to list of values, the config entry must be a list
  op: AlterConfigOperationType;

  value?: string;
};

export type ResourceConfig = {
  resourceType: ConfigResourceTypeType;

  // even when the path is unchanged, and password options are per-broker only); a broker ID is
  // required for broker logger.
  resourceName: string;

  configs: IncrementalAlterConfigsRequestResourceConfig[];
};
export type PatchConfigsRequest = {
  resources: ResourceConfig[];
};

export type PatchConfigsResponse = {
  patchedConfigs: {
    error?: string;
    resourceName: string;
    resourceType: ConfigResourceTypeType;
  }[];
};

export type PatchTopicConfigsEntry = {
  key: string; // segment.bytes, ...
  op: 'SET' | 'DELETE' | 'APPEND' | 'SUBTRACT';
  value?: string;
};
export type PatchTopicConfigsRequest = {
  configs: PatchTopicConfigsEntry[];
};

export type ConnectClusters = {
  clusterShards: ConnectClusterShard[];
  filtered: {
    clusterCount: number;
    connectorCount: number;
  };
};
export type ConnectClusterShard = {
  clusterName: string;
  clusterAddress: string;
  clusterInfo: {
    version: string;
    commit: string;
    kafka_cluster_id: string;
  };

  runningConnectors: number;
  totalConnectors: number;
  runningTasks: number;
  totalTasks: number;

  error?: string;
};

export type KafkaConnectors = {
  clusters: ClusterConnectors[] | null; // only null when isConfigured=false
  isConfigured: boolean;
};

export const ConnectClusterActions = ['viewConnectCluster', 'editConnectCluster', 'deleteConnectCluster'] as const;
export type ConnectClusterAction = 'all' | (typeof ConnectClusterActions)[number];

export type ClusterConnectors = {
  clusterName: string;
  clusterAddress: string;
  clusterInfo: {
    version: string;
    commit: string;
    kafka_cluster_id: string;
  };

  totalConnectors: number;
  runningConnectors: number;
  connectors: ClusterConnectorInfo[];
  allowedActions: ConnectClusterAction[] | undefined;

  error?: string;

  canViewCluster: boolean;
  canEditCluster: boolean;
  canDeleteCluster: boolean;
};

// https://docs.confluent.io/home/connect/monitoring.html#connector-and-task-status
export const ConnectorState = {
  Unassigned: 'UNASSIGNED',
  Running: 'RUNNING',
  Paused: 'PAUSED',
  Failed: 'FAILED',
} as const;

export type ConnectorStateType = (typeof ConnectorState)[keyof typeof ConnectorState];

export type ConnectorStatus = 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'PAUSED' | 'RESTARTING';

export type ConnectorError = {
  type: 'ERROR' | 'WARNING';
  title: string;
  content: string;
};

export type TaskState = ConnectorStateType;

export type ConnectorPossibleStatesLiteral = `${ConnectorStateType}`;

export type ClusterConnectorInfo = {
  name: string;
  class: string; // java class name
  config: object; // map[string]string
  type: string; // Source or Sink
  topic: string; // Kafka Topic name
  state: ConnectorStateType;
  status: ConnectorStatus;
  errors: ConnectorError[];

  totalTasks: number;
  runningTasks: number;
  trace?: string;
  tasks: ClusterConnectorTaskInfo[];

  jsonConfig: string;
};

export type ClusterConnectorTaskInfo = {
  taskId: number;
  state: TaskState;
  workerId: string;
  trace?: string; // error message
};

export type ClusterAdditionalInfo = {
  clusterName: string;
  host: string;
  clusterVersion: string;
  plugins: {
    class: string;
    type: 'sink' | 'source';
    version?: string;
  }[];
  enabledFeatures?: string[];
};

export type ConnectorValidationResult = {
  name: string;
  configs: ConnectorProperty[];
  steps: ConnectorStep[];
};

export type ConnectorStep = {
  name: string;
  description?: string;
  groups: ConnectorGroup[];

  stepIndex: number;
};

export type ConnectorGroup = {
  name?: string;
  description?: string;
  documentation_link?: string;
  config_keys: string[];
};

type ConnectorRecommendedValueEntry = {
  value: string;
  display_name: string;
};

export type ConnectorProperty = {
  definition: {
    name: string;
    type: DataTypeType;
    required: boolean;
    default_value: null | string;
    importance: PropertyImportanceType;
    documentation: string;
    width: PropertyWidthType;
    display_name: string;
    dependents: string[];
    order: number;

    custom_default_value?: string;
  };
  value: {
    name: string;
    value: null | string;
    recommended_values: string[];
    errors: string[];
    visible: boolean;
  };
  metadata: {
    component_type?: 'RADIO_GROUP';
    recommended_values?: ConnectorRecommendedValueEntry[];
  };
};

export const PropertyImportance = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
} as const;

export type PropertyImportanceType = (typeof PropertyImportance)[keyof typeof PropertyImportance];

export const DataType = {
  Boolean: 'BOOLEAN',
  Class: 'CLASS',
  Int: 'INT',
  List: 'LIST',
  Long: 'LONG',
  Float: 'FLOAT',
  Double: 'DOUBLE',
  Short: 'SHORT',
  String: 'STRING',
  Password: 'PASSWORD',
} as const;

export type DataTypeType = (typeof DataType)[keyof typeof DataType];

export const PropertyWidth = {
  None: 'NONE',
  Short: 'SHORT',
  Medium: 'MEDIUM',
  Long: 'LONG',
} as const;

export type PropertyWidthType = (typeof PropertyWidth)[keyof typeof PropertyWidth];

export const CompressionTypeNum = {
  None: 0,
  GZip: 1,
  Snappy: 2,
  LZ4: 3,
  ZStd: 4,
} as const;

export type CompressionTypeNumType = (typeof CompressionTypeNum)[keyof typeof CompressionTypeNum];

export function compressionTypeToNum(type: CompressionTypeType) {
  switch (type) {
    case CompressionType.GZip:
      return CompressionTypeNum.GZip;
    case CompressionType.Snappy:
      return CompressionTypeNum.Snappy;
    case CompressionType.LZ4:
      return CompressionTypeNum.LZ4;
    case CompressionType.ZStd:
      return CompressionTypeNum.ZStd;
    default:
      return CompressionTypeNum.None;
  }
}
export type PublishRecordsRequest = {
  topicNames: string[];

  compressionType: CompressionTypeNumType;

  // UseTransactions indicates whether we should produce the records transactional. If only one record shall
  useTransactions: boolean;

  records: PublishRecord[];
};

export type PublishRecord = {
  key: string; // base64
  value: null | string; // base64

  headers: {
    key: string; // base64
    value: string; // base64
  }[];

  partitionId: number; // -1 for automatic
};

export type ProduceRecordsResponse = {
  records: ProduceRecordResponse[];
  // Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
  // when transactions were enabled. Another option could be that the Kafka client creation has failed because
  error?: string;
};

export type ProduceRecordResponse = {
  topicName: string;
  partitionId: number;
  offset: number;
  error?: string;
};

type WellKnownTopicConfigEntries =
  | { name: 'cleanup.policy'; value: 'compact' | 'delete' }
  | { name: 'compression.type'; value: string }
  | { name: 'delete.retention.ms'; value: string }
  | { name: 'file.delete.delay.ms'; value: string }
  | { name: 'flush.messages'; value: string }
  | { name: 'flush.ms'; value: string }
  | { name: 'follower.replication.throttled.replicas'; value: string }
  | { name: 'index.interval.bytes'; value: string }
  | { name: 'leader.replication.throttled.replicas'; value: string }
  | { name: 'max.compaction.lag.ms'; value: string }
  | { name: 'max.message.bytes'; value: string }
  | { name: 'message.format.version'; value: string }
  | { name: 'message.timestamp.difference.max.ms'; value: string }
  | { name: 'message.timestamp.type'; value: string }
  | { name: 'min.cleanable.dirty.ratio'; value: string }
  | { name: 'min.compaction.lag.ms'; value: string }
  | { name: 'min.insync.replicas'; value: string }
  | { name: 'preallocate'; value: string }
  | { name: 'retention.bytes'; value: string }
  | { name: 'retention.ms'; value: string }
  | { name: 'segment.bytes'; value: string }
  | { name: 'segment.index.bytes'; value: string }
  | { name: 'segment.jitter.ms'; value: string }
  | { name: 'segment.ms'; value: string }
  | { name: 'unclean.leader.election.enable'; value: string }
  | { name: 'message.downconversion.enable'; value: string };

export type TopicConfigEntry = WellKnownTopicConfigEntries | { name: string; value: string };

export type CreateTopicRequest = {
  topicName: string;
  partitionCount: number; // -1 for default
  replicationFactor: number; // -1 for default
  configs: TopicConfigEntry[];
};

export type CreateTopicResponse = {
  topicName: string;
  partitionCount: number;
  replicationFactor: number;
  configs: TopicConfigEntry[];
};

export type CreateSecretRequest = {
  connectorName: string;
  clusterName: string;
  secretData: string;
  labels: Record<string, string>;
};

export type CreateSecretResponse = {
  secretId: string;
  labels: Record<string, string>;
};

export type ClusterOverview = {
  kafkaAuthorizerInfo: GetKafkaAuthorizerInfoResponse | null;
  kafkaAuthorizerError?: ConnectError | null;
  kafka: GetKafkaInfoResponse | null;
  redpanda: GetRedpandaInfoResponse | null;
  console: GetConsoleInfoResponse | null;
  kafkaConnect: GetKafkaConnectInfoResponse | null;
  schemaRegistry: GetSchemaRegistryInfoResponse | null;
};

export type OverviewStatus = {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  statusReason?: string;
};

export type BrokerWithConfigAndStorage = {
  brokerId: number;
  isController: boolean;
  address: string;
  rack?: string;
  totalLogDirSizeBytes?: number;
  // TotalPrimaryLogDirSizeBytes is the log dir size of the unique/leading partitions only.
  totalPrimaryLogDirSizeBytes?: number;
};

export type SchemaRegistryMode = 'READWRITE' | 'READONLY' | 'IMPORT';
export type SchemaRegistryModeWithDefault = 'DEFAULT' | SchemaRegistryMode;

export type SchemaRegistryModeResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  mode: string;
};

export type SchemaRegistryCompatibilityMode =
  | 'NONE'
  | 'BACKWARD'
  | 'BACKWARD_TRANSITIVE'
  | 'FORWARD'
  | 'FORWARD_TRANSITIVE'
  | 'FULL'
  | 'FULL_TRANSITIVE';

export type SchemaRegistryCompatibilityModeWithDefault = 'DEFAULT' | SchemaRegistryCompatibilityMode;

export const SchemaRegistryCompatibilityModes = {
  DEFAULT: 'DEFAULT',
  NONE: 'NONE',
  BACKWARD: 'BACKWARD',
  BACKWARD_TRANSITIVE: 'BACKWARD_TRANSITIVE',
  FORWARD: 'FORWARD',
  FORWARD_TRANSITIVE: 'FORWARD_TRANSITIVE',
  FULL: 'FULL',
  FULL_TRANSITIVE: 'FULL_TRANSITIVE',
} as const satisfies Record<string, SchemaRegistryCompatibilityModeWithDefault>;
export type SchemaRegistryConfigResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  compatibility: SchemaRegistryCompatibilityMode;
};

export type SchemaRegistrySetCompatibilityModeRequest = {
  compatibility: SchemaRegistryCompatibilityMode;
};

export type SchemaRegistrySubject = {
  name: string;
  isSoftDeleted: boolean;
};

export type SchemaRegistrySchemaTypesResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  schemaTypes: string[];
};

export type SchemaRegistrySubjectDetails = {
  name: string;
  type: SchemaTypeType;
  compatibility: SchemaRegistryCompatibilityModeWithDefault;
  mode: SchemaRegistryModeWithDefault;
  versions: SchemaRegistrySubjectDetailsVersion[];
  latestActiveVersion: number;
  schemas: SchemaRegistryVersionedSchema[];
};

export type SchemaRegistrySubjectDetailsVersion = {
  version: number;
  isSoftDeleted: boolean;
};

export type SchemaRegistryVersionedSchema = {
  id: number;
  version: number;
  isSoftDeleted: boolean;
  type: SchemaTypeType;
  schema: string;
  references: SchemaReference[];
  metadata?: SchemaMetadata;
};

export type SchemaReference = {
  name: string;
  subject: string;
  version: number;
};

export type SchemaMetadata = {
  tags?: Record<string, string[]>;
  properties?: Record<string, string>;
  sensitive?: string[];
};

export type SchemaRegistryDeleteSubjectVersionResponse = {
  deletedVersion: number;
};

export type SchemaRegistryDeleteSubjectResponse = {
  deletedVersions: number[];
};

export type SchemaRegistryCreateSchema = {
  schema: string;
  schemaType: SchemaTypeType;
  references: SchemaReference[];
  metadata?: SchemaMetadata;
  params?: {
    normalize?: boolean;
  };
};

export type SchemaRegistryCreateSchemaResponse = {
  id: number;
};

export type SchemaRegistryValidateSchemaResponse = {
  compatibility: {
    isCompatible: boolean;
    error?: {
      errorType: string;
      description: string;
    };
  };
  parsingError?: string;
  isValid: boolean;
};

export type SchemaReferencedByEntry = {
  schemaId: number;
  error?: string;
  usages: SchemaReferencedByUsage[];
};
export type SchemaReferencedByUsage = {
  subject: string;
  version: number;
};

export type SchemaVersion = {
  subject: string;
  version: number;
};
