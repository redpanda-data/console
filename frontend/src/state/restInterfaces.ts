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

export interface ApiError {
  statusCode: number;
  message: string;
}

export function isApiError(obj: any): obj is ApiError {
  if (obj && typeof obj === 'object')
    if (typeof obj.statusCode === 'number') if (typeof obj.message === 'string') return true;

  return false;
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

export interface Topic {
  topicName: string;
  isInternal: boolean;
  partitionCount: number;
  replicationFactor: number;
  cleanupPolicy: string;
  documentation: 'UNKNOWN' | 'NOT_CONFIGURED' | 'NOT_EXISTENT' | 'AVAILABLE';
  logDirSummary: TopicLogDirSummary;
  allowedActions: TopicAction[] | undefined;
}

export interface TopicLogDirSummary {
  totalSizeBytes: number; // how much space this topic takes up (files in its log dir)
  replicaErrors:
    | {
        brokerId: number;
        error: string | null;
      }[]
    | null;
  hint: string | null;
}

export interface GetTopicsResponse {
  topics: Topic[];
}

export interface Partition {
  id: number;

  // When set, all props from replicas to partitionLogDirs are null
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

  // When set, waterMarkLow/High are not set
  waterMarksError: string | null;
  waterMarkLow: number;
  waterMarkHigh: number;

  // added by frontend:
  replicaSize: number; // largest known/reported size of any replica; used for estimating how much traffic a reassignment would cause
  topicName: string; // used for finding the actual topic this partition belongs to (in case we pass around a partition reference on its own)
  hasErrors: boolean; // just (partitionError || waterMarksError)
}

export interface GetPartitionsResponse {
  topicName: string;
  error: string | null; // only set if metadata request has failed for the whole topic
  partitions: Partition[];
}

export interface GetAllPartitionsResponse {
  topics: {
    topicName: string;
    error: string | null;
    partitions: Partition[];
  }[];
}

export interface DeleteRecordsResponseData {
  topicName: string;
  partitions: [
    {
      partitionId: number;
      lowWaterMark: number;
      error: string;
    },
  ];
}

export interface TopicConsumer {
  groupId: string;
  summedLag: number;
}

export interface GetTopicConsumersResponse {
  topicName: string;
  topicConsumers: TopicConsumer[];
}

export type MessageDataType =
  | 'null'
  | 'avro'
  | 'protobuf'
  | 'json'
  | 'xml'
  | 'text'
  | 'utf8WithControlChars'
  | 'consumerOffsets'
  | 'binary'
  | 'msgpack'
  | 'uint'
  | 'smile'
  | 'cbor';
export enum CompressionType {
  Unknown = 'unknown',

  Uncompressed = 'uncompressed',
  GZip = 'gzip',
  Snappy = 'snappy',
  LZ4 = 'lz4',
  ZStd = 'zstd',
}

export interface Payload {
  payload: any; // json obj
  isPayloadNull: boolean;
  encoding: MessageDataType; // actual format of the message (before the backend converted it to json)
  schemaId: number;
  size: number;

  troubleshootReport?: TroubleshootReport[];
  isPayloadTooLarge?: boolean;
  normalizedPayload?: Uint8Array; // used to show hex bytes if payload couldn't be decoded
  rawBytes?: Uint8Array;
}

export interface TopicMessage {
  partitionID: number;
  offset: number;
  timestamp: number;

  compression: CompressionType;
  isTransactional: boolean;

  headers: {
    key: string;
    value: Payload;
  }[];
  key: Payload;
  value: Payload;

  // Added by the frontend
  valueJson: string; // Value json is what is used for (local) filtering
  valueBinHexPreview: string;
  keyJson: string;
  keyBinHexPreview: string;
}

export interface ListMessageResponse {
  elapsedMs: number;
  fetchedMessages: number;
  isCancelled: boolean;
  messages: TopicMessage[];
}

export interface GetTopicMessagesResponse {
  kafkaMessages: ListMessageResponse;
}

export interface KafkaError {
  code: number;
  message: string;
  description: string;
}

export type ConfigType = 'BOOLEAN' | 'STRING' | 'INT' | 'SHORT' | 'LONG' | 'DOUBLE' | 'LIST' | 'CLASS' | 'PASSWORD';

export interface ConfigEntry {
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
}

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

  // added by frontend
  currentValue: string | number | null | undefined;
};

export interface ConfigEntrySynonym {
  name: string;
  value: string | null;
  source: string;

  // added by frontend
  type: string | null;
}

export interface TopicDescription {
  topicName: string;
  configEntries: ConfigEntryExtended[];
  error: KafkaError | null;
}
export interface TopicConfigResponse {
  topicDescription: TopicDescription;
}
export interface PartialTopicConfigsResponse {
  topicDescriptions: TopicDescription[];
}
export interface TopicDocumentation {
  // if false: topic documentation is not configured
  isEnabled: boolean;
  // empty: actually empty
  // null:  no .md docu file found for this topic
  markdown: string | null; // base64

  // added by frontend:
  text: string | null; // atob(markdown)
}
export interface TopicDocumentationResponse {
  topicName: string;
  documentation: TopicDocumentation;
}

export interface GroupMemberAssignment {
  topicName: string;
  partitionIds: number[];
}
export interface GroupMemberDescription {
  id: string; // unique ID assigned to the member after login
  clientId: string; // custom id reported by the member
  clientHost: string; // address/host of the connection
  assignments: GroupMemberAssignment[]; // topics+partitions that the worker is assigned to

  // added by frontend:
  hasMissingPartitionIds: boolean;
  hasMissingAssignments: boolean;
}

export const GroupActions = ['seeConsumerGroup', 'editConsumerGroup', 'deleteConsumerGroup'] as const;
export type GroupAction = 'all' | (typeof GroupActions)[number];

export interface GroupDescription {
  groupId: string; // name of the group
  state: string; // Dead, Initializing, Rebalancing, Stable
  protocol: string;
  protocolType: string; // Will be "consumer" if we can decode the members; otherwise ".members" will be empty, which happens for "sr" (for schema registry) for example
  members: GroupMemberDescription[]; // members (consumers) that are currently present in the group
  coordinatorId: number;
  topicOffsets: GroupTopicOffsets[];
  allowedActions: GroupAction[] | null;

  // Added by frontend
  lagSum: number; // sum of lag for all topic offsets

  // reasons for why the group can't be editted
  isInUse: boolean;
  noEditPerms: boolean;
  noDeletePerms: boolean;
}

export interface GroupTopicOffsets {
  topic: string;
  summedLag: number; // summed lag of all partitions (non consumed partitions are not considered)
  partitionCount: number;
  partitionsWithOffset: number; // number of partitions that have an active group offset
  partitionOffsets: GroupPartitionOffset[];
}

// PartitionOffset describes the kafka lag for a partition for a single consumer group
export interface GroupPartitionOffset {
  partitionId: number;
  groupOffset: number;

  error: string | undefined; // Error will be set when the high water mark could not be fetched
  highWaterMark: number;
  lag: number;
}

export interface EditConsumerGroupOffsetsRequest {
  groupId: string;
  topics: EditConsumerGroupOffsetsTopic[];
}

export interface EditConsumerGroupOffsetsTopic {
  topicName: string;
  partitions: {
    partitionId: number;
    offset: number; // -1 latest, -2 earliest
  }[];
}

export interface EditConsumerGroupOffsetsResponse {
  error: string | undefined;
  topics: EditConsumerGroupOffsetsResponseTopic[];
}

export interface EditConsumerGroupOffsetsResponseTopic {
  topicName: string;
  partitions: {
    partitionID: number;
    error: string;
  }[];
}

export interface DeleteConsumerGroupRequest {
  groupId: string;
}
export interface DeleteConsumerGroupOffsetsRequest {
  groupId: string;
  topics: DeleteConsumerGroupOffsetsTopic[];
}
export interface DeleteConsumerGroupOffsetsTopic {
  topicName: string;
  partitions: {
    partitionId: number;
  }[];
}

export interface DeleteConsumerGroupOffsetsResponse {
  topics: DeleteConsumerGroupOffsetsResponseTopic[];
}

export interface DeleteConsumerGroupOffsetsResponseTopic {
  topicName: string;
  partitions: {
    partitionID: number;
    error: string | undefined;
  }[];
}

export interface GetTopicOffsetsByTimestampRequest {
  topics: GetTopicOffsetsByTimestampRequestTopic[];
  timestamp: number; // unix ms
}
export interface GetTopicOffsetsByTimestampRequestTopic {
  topicName: string;
  partitionIds: number[];
}

export interface GetTopicOffsetsByTimestampResponse {
  topicOffsets: TopicOffset[];
}
export interface TopicOffset {
  topicName: string;
  partitions: PartitionOffset[];
}

export interface PartitionOffset {
  error: string | undefined;
  partitionId: number;

  // will return the first message after the given timestamp
  // if there is no message at or after this timestamp, the offset will be -1
  offset: number;

  // unix ms
  // if offset is not -1, this will tell us the timestamp of that message
  timestamp: number;
}

export interface TopicLag {
  topic: string; // name
  summedLag: number;

  partitionCount: number; // number of partitions the topic has
  partitionsWithOffset: number; // number of partitions that have an active offset in this group

  // only lists partitions that have a commited offset (independent of whether or not a member is currently assigned to it)
  partitionLags: PartitionLag[];
}

export interface PartitionLag {
  partitionId: number;
  offset: number;
  lag: number;
}

export interface GetConsumerGroupsResponse {
  consumerGroups: GroupDescription[];
}
export interface GetConsumerGroupResponse {
  consumerGroup: GroupDescription;
}

export interface ClusterInfoResponse {
  clusterInfo: ClusterInfo;
}
export interface ClusterInfo {
  controllerId: number;
  brokers: Broker[];
  kafkaVersion: string;
}
export interface Broker {
  brokerId: number;
  logDirSize: number; // bytes of the whole directory
  address: string;
  rack: string | null;

  config: BrokerConfig;
}
export interface BrokerConfig {
  configs: ConfigEntry[] | undefined;
  error: string | undefined;
}

export interface EndpointCompatibilityResponse {
  licenses: RedpandaLicense[];
  endpointCompatibility: EndpointCompatibility;
}

export interface RedpandaLicense {
  // Source is where the license is used (e.g. Redpanda Cluster, Console)
  source: 'console' | 'cluster' | string;
  // Type is the type of license (free, trial, enterprise)
  type: 'free_trial' | 'open_source' | 'enterprise' | string;
  // unix seconds
  expiresAt: number;
}

export interface EndpointCompatibility {
  kafkaVersion: string;
  endpoints: EndpointCompatibilityEntry[];
}

export interface EndpointCompatibilityEntry {
  endpoint: string;
  method: string;
  isSupported: boolean;
}

// Response when requesting configuration of a single broker
export interface BrokerConfigResponse {
  brokerConfigs: ConfigEntry[];
}

// Current user
export interface User {
  id: string;
  internalIdentifier: string;
  providerID: number;
  providerName: string;
  meta: {
    email: string;
    name: string;
    avatarUrl: string;
  };
}
export interface Seat {
  id: string; // id of seat
  licenseId: string; // shouldn't that be censored??
  user: User; // user representation of firestore? should be removed...
  lastActivity: string; // is a datetime string, should probably be a "UnixMillis"
}
export interface UserData {
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
}
export type UserPermissions = Exclude<keyof UserData, 'user' | 'seat'>;

export interface AdminInfo {
  roles: Role[];
  roleBindings: RoleBinding[];
  users: UserDetails[];
}

export interface UserDetails {
  internalIdentifier: string;
  oauthUserId: string;
  loginProviderId: number;
  loginProvider: string;
  bindingIds: string[]; // rolebindings
  audits: {
    [roleName: string]: string[]; // roleName to (RoleBinding.ephemeralID)[]
  };

  // Added by frontend:
  bindings: RoleBinding[];
  grantedRoles: {
    role: Role;
    grantedBy: RoleBinding[];
  }[];
}

export interface PermissionAudit {
  roleName: string; // Role.name
  grantedBy: string; // RoleBinding.ephemeralId
}

export interface RoleBinding {
  ephemeralId: string;
  metadata: { [key: string]: string };
  subjects: Subject[];
  roleName: string;

  // Added by frontend:
  resolvedRole: Role;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

export interface Permission {
  resourceName: string;
  resourceId: number;

  // Those 3 may be missing or contain a single empty string.
  // The frontend fixes / normalizes those cases to '[]'.
  allowedActions: string[];
  includes: string[];
  excludes: string[];
}

export interface Subject {
  name: string;

  organization: string;

  subjectKind: number;
  subjectKindName: string;

  provider: number;
  providerName: string;
}

export interface TopicPermissions {
  canSeeTopic: boolean;
  canViewTopicPartitions: boolean;
  canSeeTopicConfig: boolean;
  canUseSearchFilters: boolean;
  canViewTopicMessages: boolean;
  canViewTopicConsumers: boolean;
  canEditTopicConfig: boolean;
}

//
// Listing ACLs

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L47
export enum AclResourceType {
  Unknown = 0,
  Any = 1,
  Topic = 2,
  Group = 3,
  Cluster = 4,
  TransactionalID = 5,
  DelegationToken = 6,
}

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L59
export enum AclResourcePatternType {
  Unknown = 0,
  Any = 1,
  Match = 2,
  Literal = 3,
  Prefixed = 4,
}

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L81
export enum AclOperation {
  Unknown = 0,
  Any = 1,
  All = 2,
  Read = 3,
  Write = 4,
  Create = 5,
  Delete = 6,
  Alter = 7,
  Describe = 8,
  ClusterAction = 9,
  DescribeConfigs = 10,
  AlterConfigs = 11,
  IdempotentWrite = 12,
}

// https://github.com/twmb/franz-go/blob/master/generate/definitions/enums#L71
export enum AclPermission {
  Unknown = 0,
  Any = 1,
  Deny = 2,
  Allow = 3,
}

// list all:
//   /api/acls?resourceType=1&resourcePatternTypeFilter=1&operation=1&permissionType=1
export interface GetAclsRequest {
  resourceType: AclStrResourceType;
  resourceName?: string;
  resourcePatternTypeFilter: AclStrResourcePatternType;
  principal?: string;
  host?: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
}

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

export interface GetAclOverviewResponse {
  aclResources: AclResource[];
  isAuthorizerEnabled: boolean;
}

export interface AclResource {
  resourceType: AclStrResourceType;
  resourceName: string;
  resourcePatternType: AclStrResourcePatternType;
  acls: AclRule[];
}

export interface AclRule {
  principal: string;
  host: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
}

export interface CreateACLRequest {
  // ResourceType is the type of resource this acl entry will be on.
  // It is invalid to use UNKNOWN or ANY.
  resourceType: AclStrResourceType;

  // ResourceName is the name of the resource this acl entry will be on.
  // For CLUSTER, this must be "kafka-cluster".
  resourceName: string;

  // ResourcePatternType is the pattern type to use for the resource name.
  // This cannot be UNKNOWN or MATCH (i.e. this must be LITERAL or PREFIXED).
  // The default for pre-Kafka 2.0.0 is effectively LITERAL.
  //
  // This field has a default of 3 (prefixed).
  resourcePatternType: ('Literal' | 'Prefixed') & AclStrResourcePatternType;

  // Principal is the user to apply this acl for. With the Kafka simple
  // authorizer, this must begin with "User:".
  principal: string;

  // Host is the host address to use for this acl. Each host to allow
  // the principal access from must be specified as a new creation. KIP-252
  // might solve this someday. The special wildcard host "*" allows all hosts.
  host: '*' | string;

  // Operation is the operation this acl is for. This must not be UNKNOWN or
  // ANY.
  operation: Exclude<AclStrOperation, 'Unknown' | 'Any'>;

  // PermissionType is the permission of this acl. This must be either ALLOW
  // or DENY.
  permissionType: ('Allow' | 'Deny') & AclStrPermission;
}

export interface DeleteACLsRequest {
  resourceType: AclStrResourceType;

  // Unset will match any resource name
  resourceName?: string;

  resourcePatternType: AclStrResourcePatternType;

  // Unset will match any principal
  principal?: string;

  // Unset will match any host
  host?: string;

  operation: AclStrOperation;

  permissionType: AclStrPermission;
}

export interface QuotaResponse {
  error?: string;
  items: QuotaResponseItem[];
}

export interface QuotaResponseItem {
  entityType: 'client-id' | 'user' | 'ip';
  entityName?: string;
  settings: QuotaResponseSetting[];
}

export enum QuotaType {
  // A rate representing the upper bound (bytes/sec) for producer traffic
  PRODUCER_BYTE_RATE = 'producer_byte_rate',
  // A rate representing the upper bound (bytes/sec) for consumer traffic.
  CONSUMER_BYTE_RATE = 'consumer_byte_rate',
  // A percentage representing the upper bound of time spent for processing requests.
  REQUEST_PERCENTAGE = 'request_percentage',
  // The rate at which mutations are accepted for the create "topics request,
  // the create partitions request and the delete topics request. The rate is accumulated by
  // the number of partitions created or deleted.
  CONTROLLER_MUTATION_RATE = 'controller_mutation_rate',
  // An int representing the upper bound of connections accepted for the specified IP.
  CONNECTION_CREATION_RATE = 'connection_creation_rate',
}

export interface QuotaResponseSetting {
  key: QuotaType;
  value: number;
}

export enum SchemaType {
  AVRO = 'AVRO',
  JSON = 'JSON',
  PROTOBUF = 'PROTOBUF',
}

// Partition Reassignments - Get
export interface PartitionReassignmentsResponse {
  topics: PartitionReassignments[];
}
export interface PartitionReassignments {
  topicName: string;
  partitions: PartitionReassignmentsPartition[];
}
export interface PartitionReassignmentsPartition {
  partitionId: number;
  addingReplicas: number[];
  removingReplicas: number[];
  replicas: number[];
}

// PartitionReassignments - Patch
export interface PartitionReassignmentRequest {
  topics: TopicAssignment[];
}
export type TopicAssignment = {
  topicName: string; // name of topic to change
  partitions: {
    // partitions to reassign
    partitionId: number;
    replicas: number[] | null;
    // Entries are brokerIds.
    // Since the replicationFactor of a partition tells us the total number
    // of 'instances' of a partition (leader + follower replicas) the length of the array is always 'replicationFactor'.
    // The first entry in the array is the brokerId that will host the leader replica
    // Since Kafka rebalances the leader partitions across the brokers periodically, it is not super important which broker is the leader.
    //
    // Can also be null to cancel a pending reassignment.
  }[];
};

export interface AlterPartitionReassignmentsResponse {
  reassignPartitionsResponses: {
    topicName: string;
    partitions: AlterPartitionReassignmentsPartitionResponse[];
  }[];
}
export interface AlterPartitionReassignmentsPartitionResponse {
  partitionId: number;
  errorCode: string;
  errorMessage: string | null;
}

// Change broker config
// PATCH api/operations/configs
export enum ConfigResourceType {
  Unknown = 0,
  Topic = 2,
  Broker = 4,
  BrokerLogger = 8,
}

// export enum ConfigSource {
//     Unknown = 0,
//     DynamicTopicConfig = 1,
//     DynamicBrokerConfig = 2,
//     DynamicDefaultBrokerConfig = 3,
//     StaticBrokerConfig = 4,
//     DefaultConfig = 5,
//     DynamicBrokerLoggerConfig = 6,
// }

export enum AlterConfigOperation {
  Set = 0, // set a config key
  Delete = 1, // remove/unset a config key
  Append = 2, // add a value to a list
  Subtract = 3, // remove a value from a list
}

export interface IncrementalAlterConfigsRequestResourceConfig {
  // name of key to modify (e.g segment.bytes)
  name: string;

  // set(0) value must not be null
  // delete(1) delete a config key
  // append(2) append value to list of values, the config entry must be a list
  // subtract(3) remove an entry from a list of values
  op: AlterConfigOperation;

  // value to set the key to
  value?: string;
}

// Example
// To throttle replication rate for reassignments (bytes per second):
// - On the leader
//      --add-config 'leader.replication.throttled.rate=10000'
//      --entity-type broker
//      --entity-name brokerId
//
// - On the follower
//      --add-config 'follower.replication.throttled.rate=10000'
//      --entity-type broker
//      --entity-name brokerId

export interface ResourceConfig {
  // ResourceType is an enum that represents TOPIC, BROKER or BROKER_LOGGER
  resourceType: ConfigResourceType;

  // ResourceName is the name of config to alter.
  //
  // If the requested type is a topic, this corresponds to a topic name.
  //
  // If the requested type if a broker, this should either be empty or be
  // the ID of the broker this request is issued to. If it is empty, this
  // updates all broker configs. If a specific ID, this updates just the
  // broker. Using a specific ID also ensures that brokers reload config
  // or secret files even if the file path has not changed. Lastly, password
  // config options can only be defined on a per broker basis.
  //
  // If the type is broker logger, this must be a broker ID.
  resourceName: string;

  // key/value config pairs to set on the resource.
  configs: IncrementalAlterConfigsRequestResourceConfig[];
}
export interface PatchConfigsRequest {
  resources: ResourceConfig[];
}

export interface PatchConfigsResponse {
  patchedConfigs: {
    error?: string;
    resourceName: string;
    resourceType: ConfigResourceType;
  }[];
}

export interface PatchTopicConfigsEntry {
  key: string; // segment.bytes, ...
  op: 'SET' | 'DELETE' | 'APPEND' | 'SUBTRACT';
  value?: string;
}
export interface PatchTopicConfigsRequest {
  configs: PatchTopicConfigsEntry[];
}

// GET "/kafka-connect/clusters"
export interface ConnectClusters {
  // response
  clusterShards: ConnectClusterShard[];
  filtered: {
    clusterCount: number;
    connectorCount: number;
  };
}
export interface ConnectClusterShard {
  // GetClusterShard
  clusterName: string;
  clusterAddress: string;
  clusterInfo: {
    // RootResource
    version: string;
    commit: string;
    kafka_cluster_id: string;
  };

  runningConnectors: number;
  totalConnectors: number;
  runningTasks: number;
  totalTasks: number;

  error?: string;
}

// GET "/kafka-connect/connectors"
export interface KafkaConnectors {
  // response
  clusters: ClusterConnectors[] | null; // only null when isConfigured=false
  isConfigured: boolean;
}

export const ConnectClusterActions = ['viewConnectCluster', 'editConnectCluster', 'deleteConnectCluster'] as const;
export type ConnectClusterAction = 'all' | (typeof ConnectClusterActions)[number];

export interface ClusterConnectors {
  // ClusterConnectors
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

  // Added by frontend
  canViewCluster: boolean;
  canEditCluster: boolean;
  canDeleteCluster: boolean;
}

// https://docs.confluent.io/home/connect/monitoring.html#connector-and-task-status
export enum ConnectorState {
  Unassigned = 'UNASSIGNED',
  Running = 'RUNNING',
  Paused = 'PAUSED',
  Failed = 'FAILED',
}

export type ConnectorStatus = 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'PAUSED' | 'RESTARTING';

export interface ConnectorError {
  type: 'ERROR' | 'WARNING';
  title: string;
  content: string;
}

export type TaskState = ConnectorState;

export type ConnectorPossibleStatesLiteral = `${ConnectorState}`;

export interface ClusterConnectorInfo {
  name: string;
  class: string; // java class name
  config: object; // map[string]string
  type: string; // Source or Sink
  topic: string; // Kafka Topic name
  state: ConnectorState;
  status: ConnectorStatus;
  errors: ConnectorError[];

  totalTasks: number;
  runningTasks: number;
  trace?: string;
  tasks: ClusterConnectorTaskInfo[];

  // added by frontend
  jsonConfig: string;
}

export interface ClusterConnectorTaskInfo {
  taskId: number;
  state: TaskState;
  workerId: string;
  trace?: string; // error message
}

// GET "/kafka-connect/clusters/{clusterName}"
export interface ClusterAdditionalInfo {
  clusterName: string;
  host: string;
  clusterVersion: string;
  plugins: {
    class: string;
    type: 'sink' | 'source';
    version?: string;
  }[];
  enabledFeatures?: string[];
}

/*
// GET "/kafka-connect/clusters/{clusterName}/connectors"
export interface GetConnectorsShard { // GetConnectorsShard
    clusterName: string;
    clusterAddress: string; // useless?
    connectors: {
        [connectorName: string]: ListConnectorsExpanded;
    };
    error?: string;
}
export interface ListConnectorsExpanded { // ListConnectorsResponseExpanded
    info: null | {
        name: string;
        config: { [key: string]: string };
        tasks: {
            connector: string;
            task: number;
        }[];
        type: string;
    };
    status: null | {
        name: string;
        Connector: {
            state: string;
            worker_id: string;
        };
        tasks: {
            id: number;
            state: string;
            worker_id: string;
        }[];
        type: string;
    };
}


// GET "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
export interface KafkaConnectorInfoWithStatus { // ConnectorInfoWithStatus
    // embedded ConnectorStateInfo
    name: string;
    connector: { // ConnectorState
        state: string;
        worker_id: string;
    };
    tasks: { // TaskState
        id: number;
        state: string;
        worker_id: string;
    }[];
    type: string;

    // Additional Props
    config: {
        [key: string]: string;
    };
}
*/

// DELETE "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
// PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause"  (idempotent)
// PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume" (idempotent)
// POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart"
// all 4 return either nothing (code 200), or an ApiError

export interface ConnectorValidationResult {
  name: string;
  configs: ConnectorProperty[];
  steps: ConnectorStep[];
}

export interface ConnectorStep {
  name: string;
  description?: string;
  groups: ConnectorGroup[];

  // added by frontend:
  stepIndex: number;
}

export interface ConnectorGroup {
  name?: string;
  description?: string;
  documentation_link?: string;
  config_keys: string[];
}

interface ConnectorRecommendedValueEntry {
  value: string;
  display_name: string;
}

export interface ConnectorProperty {
  definition: {
    name: string;
    type: DataType;
    required: boolean;
    default_value: null | string;
    importance: PropertyImportance;
    documentation: string;
    // group: null | string;
    width: PropertyWidth;
    display_name: string;
    dependents: string[];
    order: number;

    // added by backend
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
}

export enum PropertyImportance {
  Low = 'LOW',
  Medium = 'MEDIUM',
  High = 'HIGH',
}

export enum DataType {
  Boolean = 'BOOLEAN',
  Class = 'CLASS',
  Int = 'INT',
  List = 'LIST',
  Long = 'LONG',
  Float = 'FLOAT',
  Double = 'DOUBLE',
  Short = 'SHORT',
  String = 'STRING',
  Password = 'PASSWORD',
}

export enum PropertyWidth {
  None = 'NONE',
  Short = 'SHORT',
  Medium = 'MEDIUM',
  Long = 'LONG',
}

export enum CompressionTypeNum {
  None = 0,
  GZip = 1,
  Snappy = 2,
  LZ4 = 3,
  ZStd = 4,
}

export function compressionTypeToNum(type: CompressionType) {
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
export interface PublishRecordsRequest {
  // TopicNames is a list of topic names into which the records shall be produced to.
  topicNames: string[];

  // CompressionType that shall be used when producing the records to Kafka.
  compressionType: CompressionTypeNum;

  // UseTransactions indicates whether we should produce the records transactional. If only one record shall
  // be produced this option should always be false.
  useTransactions: boolean;

  // Records contains one or more records (key, value, headers) that shall be produced.
  records: PublishRecord[];
}

export interface PublishRecord {
  key: string; // base64
  value: null | string; // base64

  headers: {
    key: string; // base64
    value: string; // base64
  }[];

  partitionId: number; // -1 for automatic
}

export interface ProduceRecordsResponse {
  records: ProduceRecordResponse[];
  // Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
  // when transactions were enabled. Another option could be that the Kafka client creation has failed because
  // brokers are temporarily offline.
  error?: string;
}

export interface ProduceRecordResponse {
  topicName: string;
  partitionId: number;
  offset: number;
  error?: string;
}

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

export interface CreateTopicRequest {
  topicName: string;
  partitionCount: number; // -1 for default
  replicationFactor: number; // -1 for default
  configs: TopicConfigEntry[];
}

export interface CreateTopicResponse {
  topicName: string;
  partitionCount: number;
  replicationFactor: number;
  configs: TopicConfigEntry[];
}

// GET api/users
export interface GetUsersResponse {
  users: string[];
  isComplete: boolean;
}

// POST api/users
export interface CreateUserRequest {
  username: string;
  password: string;
  mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
}

export interface CreateSecretRequest {
  connectorName: string;
  clusterName: string;
  secretData: string;
  labels: Record<string, string>;
}

export interface CreateSecretResponse {
  secretId: string;
  labels: Record<string, string>;
}

export interface ClusterOverview {
  kafkaAuthorizerInfo: GetKafkaAuthorizerInfoResponse | null;
  kafka: GetKafkaInfoResponse | null;
  redpanda: GetRedpandaInfoResponse | null;
  console: GetConsoleInfoResponse | null;
  kafkaConnect: GetKafkaConnectInfoResponse | null;
  schemaRegistry: GetSchemaRegistryInfoResponse | null;
}

export interface OverviewStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  statusReason?: string;
}

// GET /api/brokers
// from pkg/console/brokers.go
export interface BrokerWithConfigAndStorage {
  brokerId: number;
  isController: boolean;
  address: string;
  rack?: string;
  // TotalLogDirSizeBytes is the total sum of bytes that is returned via the
  // DescribeLogDirs API. Thus, this also includes replicas stored on that
  // broker. If we fail to retrieve the storage for this broker this
  // will be nil.
  totalLogDirSizeBytes?: number;
  // TotalPrimaryLogDirSizeBytes is the log dir size of the unique/leading partitions only.
  // It represents the data size without replication.
  totalPrimaryLogDirSizeBytes?: number;
}

// GET /schema-registry/mode
export type SchemaRegistryModeResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  mode: string;
};

// GET /schema-registry/config
export type SchemaRegistryCompatibilityMode =
  | 'NONE'
  | 'BACKWARD'
  | 'BACKWARD_TRANSITIVE'
  | 'FORWARD'
  | 'FORWARD_TRANSITIVE'
  | 'FULL'
  | 'FULL_TRANSITIVE';
export type SchemaRegistryConfigResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  compatibility: SchemaRegistryCompatibilityMode;
};

// PUT /schema-registry/config
export type SchemaRegistrySetCompatibilityModeRequest = {
  compatibility: SchemaRegistryCompatibilityMode;
};

// GET /schema-registry/subjects
export type SchemaRegistrySubject = {
  name: string;
  isSoftDeleted: boolean;
};

// GET /schema-registry/schemas/types
export type SchemaRegistrySchemaTypesResponse = {
  isConfigured?: false; // can only ever be undefined (schema reg is configured properly), or false (is not configured)
  schemaTypes: string[];
};

// GET /schema-registry/subjects/{subject}/versions/{version}
// version can be 'all' or 'latest'
export type SchemaRegistrySubjectDetails = {
  name: string;
  type: SchemaType;
  compatibility: 'DEFAULT' | SchemaRegistryCompatibilityMode;
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
  type: SchemaType;
  schema: string;
  references: SchemaReference[];
};

export type SchemaReference = {
  name: string;
  subject: string;
  version: number;
};

// DELETE /schema-registry/subjects/{subject}/versions/{version}
export type SchemaRegistryDeleteSubjectVersionResponse = {
  deletedVersion: number;
};

// DELETE /schema-registry/subjects/{subject}?permanent=false
export type SchemaRegistryDeleteSubjectResponse = {
  deletedVersions: number[];
};

// POST /schema-registry/subjects/{subject}/versions
export type SchemaRegistryCreateSchema = {
  schema: string;
  schemaType: SchemaType;
  references: SchemaReference[];
};

export type SchemaRegistryCreateSchemaResponse = {
  id: number;
};

// POST /schema-registry/subjects/{subject}/versions/{version}/validate
export type SchemaRegistryValidateSchemaResponse = {
  compatibility: {
    isCompatible: boolean;
  };
  parsingError?: string;
  isValid: boolean;
};

// GET /schema-registry/subjects/{subject}/versions/{version}/referencedby
export type SchemaReferencedByEntry = {
  schemaId: number;
  error?: string;
  usages: SchemaReferencedByUsage[];
};
export type SchemaReferencedByUsage = {
  subject: string;
  version: number;
};

// GET /schema-registry/schemas/ids/{id}/versions
export type SchemaVersion = {
  subject: string;
  version: number;
};
