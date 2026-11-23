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
  /** An omitted list permits all topic actions. */
  allowedActions: TopicAction[] | undefined;
};

export type TopicLogDirSummary = {
  /** Total size of this topic's log directory files, in bytes. */
  totalSizeBytes: number;
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
  /** Broker IDs hosting a replica, including the leader. */
  replicas: number[];
  offlineReplicas: number[] | null;
  /** Broker IDs in the in-sync replica set. */
  inSyncReplicas: number[];
  leader: number;
  partitionLogDirs: {
    /** Empty when the log directory was described successfully. */
    error: string;
    brokerId: number;
    partitionId: number;
    /** Log directory size in bytes on this broker. */
    size: number;
  }[];

  waterMarksError: string | null;
  waterMarkLow: number;
  waterMarkHigh: number;

  /** Largest reported replica size, used to estimate reassignment traffic. */
  replicaSize: number;
  topicName: string;
  /** Whether partition metadata or water mark lookup failed. */
  hasErrors: boolean;
};

export type GetPartitionsResponse = {
  topicName: string;
  /** Set only when metadata lookup failed for the whole topic. */
  error: string | null;
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
  payload: unknown;
  isPayloadNull: boolean;
  /** Original wire encoding before the backend converted the payload to JSON. */
  encoding: MessageDataType;
  schemaId: number;
  size: number;

  troubleshootReport?: TroubleshootReport[];
  isPayloadTooLarge?: boolean;
  /** Bytes used for the hex preview when the payload cannot be decoded. */
  normalizedPayload?: Uint8Array;
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

  /** Serialized value used by client-side message filters. */
  valueJson: string;
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
  /** Base64-encoded Markdown. */
  markdown: string | null;

  /** Decoded Markdown. */
  text: string | null;
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
  /** ID assigned by the broker when the member joins. */
  id: string;
  instanceId?: string;
  /** Client identifier reported by the member. */
  clientId: string;
  clientHost: string;
  assignments: GroupMemberAssignment[];

  /** Only available for KIP-848 consumer groups. */
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
  groupId: string;
  groupType: GroupType;
  state: string;
  /** Classic group balancer or KIP-848 consumer group assignor. */
  protocol: string;
  /** Only consumer-protocol member metadata is decoded; other types, such as Schema Registry's "sr", have no decoded members. */
  protocolType: string;
  /** Only available for KIP-848 groups the broker could describe. */
  groupEpoch?: number;
  targetAssignmentEpoch?: number;
  members: GroupMemberDescription[];
  coordinatorId: number;
  topicOffsets: GroupTopicOffsets[];
  allowedActions: GroupAction[] | null;

  lagSum: number;

  isInUse: boolean;
  noEditPerms: boolean;
  noDeletePerms: boolean;
};

export type GroupTopicOffsets = {
  topic: string;
  /** Total lag across partitions with committed offsets. */
  summedLag: number;
  partitionCount: number;
  partitionsWithOffset: number;
  partitionOffsets: GroupPartitionOffset[];
};

export type GroupPartitionOffset = {
  partitionId: number;
  /** Null when this group has no committed offset for the partition. */
  groupOffset: number | null;

  /** Set when the high water mark could not be fetched. */
  error: string | undefined;
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
    /** Use -1 for the latest and -2 for the earliest offset. */
    offset: number;
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
  /** Unix timestamp in milliseconds. */
  timestamp: number;
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
  topic: string;
  summedLag: number;

  partitionCount: number;
  partitionsWithOffset: number;

  /** Includes partitions with committed offsets, even when no group member owns them. */
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
  /** Total log directory size, in bytes. */
  logDirSize: number;
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
  /** Product where the license is active, such as Console or the Redpanda cluster. */
  source: 'console' | 'cluster' | string;
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
  id: string;
  licenseId: string;
  user: User;
  /** Date-time string, not a Unix timestamp. */
  lastActivity: string;
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

/** @see https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L47 */
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

/** @see https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L59 */
export const AclResourcePatternType = {
  Unknown: 0,
  Any: 1,
  Match: 2,
  Literal: 3,
  Prefixed: 4,
} as const;

export type AclResourcePatternTypeType = (typeof AclResourcePatternType)[keyof typeof AclResourcePatternType];

/** @see https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L81 */
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

/** @see https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L71 */
export const AclPermission = {
  Unknown: 0,
  Any: 1,
  Deny: 2,
  Allow: 3,
} as const;

export type AclPermissionType = (typeof AclPermission)[keyof typeof AclPermission];

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
  topicName: string;
  partitions: {
    partitionId: number;
    /** Null cancels the pending reassignment. Kafka may rebalance partition leadership later. */
    replicas: number[] | null;
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
  Set: 0,
  Delete: 1,
  Append: 2,
  Subtract: 3,
} as const;

export type AlterConfigOperationType = (typeof AlterConfigOperation)[keyof typeof AlterConfigOperation];

export type IncrementalAlterConfigsRequestResourceConfig = {
  name: string;

  /** Set requires a non-null value; Append requires a list-valued config entry. */
  op: AlterConfigOperationType;

  value?: string;
};

export type ResourceConfig = {
  resourceType: ConfigResourceTypeType;

  /** Broker logger updates require a broker ID. Password settings are per-broker. */
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
  key: string;
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
  /** Null when Kafka Connect is not configured. */
  clusters: ClusterConnectors[] | null;
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

/** @see https://docs.confluent.io/home/connect/monitoring.html#connector-and-task-status */
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
  /** Java class name of the connector plugin. */
  class: string;
  /** Connector configuration keys and their string values. */
  config: object;
  /** Whether this connector is a source or sink. */
  type: string;
  topic: string;
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
  trace?: string;
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

  /** Whether to publish records inside a transaction. */
  useTransactions: boolean;

  records: PublishRecord[];
};

export type PublishRecord = {
  /** Base64-encoded record key. */
  key: string;
  /** Base64-encoded record value; null encodes a tombstone. */
  value: null | string;

  headers: {
    /** Base64-encoded header key. */
    key: string;
    /** Base64-encoded header value. */
    value: string;
  }[];

  /** Use -1 to let the producer choose the partition. */
  partitionId: number;
};

export type ProduceRecordsResponse = {
  records: ProduceRecordResponse[];
  /** Batch-level failure, such as failure to start the transaction or create the Kafka client. */
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
  /** Use -1 to use the broker's default partition count. */
  partitionCount: number;
  /** Use -1 to use the broker's default replication factor. */
  replicationFactor: number;
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
  /** Log directory size in bytes counting only partitions this broker leads. */
  totalPrimaryLogDirSizeBytes?: number;
};

export type SchemaRegistryMode = 'READWRITE' | 'READONLY' | 'IMPORT';
export type SchemaRegistryModeWithDefault = 'DEFAULT' | SchemaRegistryMode;

export type SchemaRegistryModeResponse = {
  /** Present and false only when Schema Registry has not been configured. */
  isConfigured?: false;
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
  /** Present and false only when Schema Registry has not been configured. */
  isConfigured?: false;
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
  /** Present and false only when Schema Registry has not been configured. */
  isConfigured?: false;
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
