import SchemaList from "../components/pages/schemas/Schema.List";

export interface ApiError {
    statusCode: number;
    message: string;
}


export const TopicActions = ['seeTopic', 'viewPartitions', 'viewMessages', 'useSearchFilter', 'viewConsumers', 'viewConfig'] as const;
export type TopicAction = 'all' | typeof TopicActions[number];

export interface Topic {
    topicName: string;
    isInternal: boolean;
    partitionCount: number;
    replicationFactor: number;
    cleanupPolicy: string;
    logDirSummary: TopicLogDirSummary;
    allowedActions: TopicAction[] | undefined;
}

export interface TopicLogDirSummary {
    totalSizeBytes: number; // how much space this topic takes up (files in its log dir)
    replicaErrors: {
        brokerId: number;
        error: string | null;
    }[] | null;
    hint: string | null;
}

export interface GetTopicsResponse {
    topics: Topic[];
}



export interface Partition {
    id: number;
    partitionError: string | null;
    replicas: number[]; // brokerIds of all brokers that host the leader or a replica of this partition
    offlineReplicas: number[] | null;
    inSyncReplicas: number[]; // brokerId (can only be one?) of the leading broker
    leader: number; // id of the "leader" broker for this partition

    waterMarksError: string | null;
    waterMarkLow: number;
    waterMarkHigh: number;

    partitionLogDirs: {
        error: string, // empty when no error
        brokerId: number,
        partitionId: number, // redundant?
        size: number, // size (in bytes) of log dir on that broker
    }[];

    // added by frontend:
    replicaSize: number; // largest known/reported size of any replica; used for estimating how much traffic a reassignment would cause
    topicName: string; // used for finding the actual topic this partition belongs to (in case we pass around a partition reference on its own)
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



export interface TopicConsumer {
    groupId: string
    summedLag: number
}

export interface GetTopicConsumersResponse {
    topicName: string;
    topicConsumers: TopicConsumer[];
}


export type MessageDataType = 'none' | 'json' | 'xml' | 'avro' | 'text' | 'binary';
export type CompressionType = 'uncompressed' | 'gzip' | 'snappy' | 'lz4' | 'zstd' | 'unknown';
export interface Payload {
    payload: any, // json obj
    encoding: MessageDataType, // actual format of the message (before the backend converted it to json)
    avroSchemaId: number,
    size: number,
}

export interface TopicMessage {
    partitionID: number,
    offset: number,
    timestamp: number,

    compression: CompressionType,
    isTransactional: boolean,

    headers: {
        key: string,
        value: Payload,
    }[]
    key: Payload,
    value: Payload,

    isValueNull: boolean, // todo: rename to isTombstone

    // Added by the frontend
    valueJson: string,
    valueBinHexPreview: string,
    keyJson: string,
}

export interface ListMessageResponse {
    elapsedMs: number,
    fetchedMessages: number,
    isCancelled: boolean,
    messages: TopicMessage[],
}

export interface GetTopicMessagesResponse {
    kafkaMessages: ListMessageResponse,
}



export interface KafkaError {
    code: number,
    message: string,
    description: string
}

export interface TopicConfigEntry {
    name: string,
    value: string,
    isDefault: boolean,
}
export interface TopicDescription {
    topicName: string
    configEntries: TopicConfigEntry[]
    error: KafkaError | null
}
export interface TopicConfigResponse {
    topicDescription: TopicDescription
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

}


export const GroupActions = ['seeConsumerGroup'] as const;
export type GroupAction = 'all' | typeof GroupActions[number];

export interface GroupDescription {
    groupId: string; // name of the group
    state: string; // Dead, Initializing, Rebalancing, Stable
    protocolType: string; // Will be "consumer" if we can decode the members; otherwise ".members" will be empty, which happens for "sr" (for schema registry) for example
    members: GroupMemberDescription[]; // members (consumers) that are currently present in the group
    coordinatorId: number;
    lag: GroupLagDescription;
    allowedActions: GroupAction[];

    // Computed by frontend
    lagSum: number;
}

export interface GroupLagDescription {
    groupId: string;
    topicLags: TopicLag[];
}

export interface TopicLag {
    topic: string; // name
    summedLag: number;

    partitionCount: number; // number of partitions the topic has
    partitionsWithOffset: number; // number of partitions that have an active offset in this group

    // only lists partitions that have a commited offset (independent of whether or not a member is currently assigned to it)
    partitionLags: { lag: number, partitionId: number }[]
}

export interface GetConsumerGroupsResponse {
    consumerGroups: GroupDescription[];
}







export interface Broker {
    brokerId: number;
    logDirSize: number; // bytes of the whole directory
    address: string;
    rack: string;
}

export interface ClusterInfo {
    brokers: Broker[];
    controllerId: number;
    kafkaVersion: string;
}

export interface ClusterInfoResponse {
    clusterInfo: ClusterInfo;
}


export interface ClusterConfigResponse {
    clusterConfig: ClusterConfig;
}

export interface ClusterConfig {
    brokerConfigs: BrokerConfig[];
    requestErrors: {
        brokerId: number;
        errorMessage: string;
    }[];
}

export interface BrokerConfig {
    brokerId: number;
    configEntries: BrokerConfigEntry[];
}

export interface BrokerConfigEntry {
    name: string;
    value: string;
    isDefault: boolean;
}




// Current user
export interface User {
    id: string,
    internalIdentifier: string,
    providerID: number,
    providerName: string,
    meta: {
        email: string,
        name: string,
        avatarUrl: string,
    },
}
export interface Seat {
    id: string, // id of seat
    licenseId: string, // shouldn't that be censored??
    user: User, // user representation of firestore? should be removed...
    lastActivity: string, // is a datetime string, should probably be a "UnixMillis"
}
export interface UserData {
    user: User;
    seat: Seat;
    canManageKowl: boolean;
    canListAcls: boolean;
}



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
    metadata: { [key: string]: string; };
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
}


//
// ACLs

// See: https://github.com/Shopify/sarama/blob/master/acl_types.go
export enum AclResourceType {
    AclResourceUnknown,
    AclResourceAny,
    AclResourceTopic,
    AclResourceGroup,
    AclResourceCluster,
    AclResourceTransactionalID
}

export enum AclResourcePatternTypeFilter {
    AclPatternUnknown,
    AclPatternAny,
    AclPatternMatch,
    AclPatternLiteral,
    AclPatternPrefixed
}

export enum AclOperation {
    AclOperationUnknown,
    AclOperationAny,
    AclOperationAll,
    AclOperationRead,
    AclOperationWrite,
    AclOperationCreate,
    AclOperationDelete,
    AclOperationAlter,
    AclOperationDescribe,
    AclOperationClusterAction,
    AclOperationDescribeConfigs,
    AclOperationAlterConfigs,
    AclOperationIdempotentWrite
}

export enum AclPermissionType {
    AclPermissionUnknown,
    AclPermissionAny,
    AclPermissionDeny,
    AclPermissionAllow
}

// list all:
//   /api/acls?resourceType=1&resourcePatternTypeFilter=1&operation=1&permissionType=1
export interface AclRequest {
    resourceType: AclResourceType;
    resourceName?: string;
    resourcePatternTypeFilter: AclResourcePatternTypeFilter;
    principal?: string;
    host?: string;
    operation: AclOperation;
    permissionType: AclPermissionType;
}

export const AclRequestDefault = {
    resourceType: AclResourceType.AclResourceAny,
    resourceName: "",
    resourcePatternTypeFilter: AclResourcePatternTypeFilter.AclPatternAny,
    principal: "",
    host: "",
    operation: AclOperation.AclOperationAny,
    permissionType: AclPermissionType.AclPermissionAny,
} as const;

export interface AclResponse {
    aclResources: AclResource[];
}

export interface AclResource {
    resourceType: string;
    resourceName: string;
    resourcePatternType: string;
    acls: AclRule[];
}

export interface AclRule {
    principal: string;
    host: string;
    operation: string;
    permissionType: string;
}


export interface SchemaOverviewResponse {
    schemaOverview: SchemaOverview;
    isConfigured: boolean;
}

export interface SchemaOverview {
    mode: string;
    compatibilityLevel: string;
    subjects: string[];
    requestErrors: SchemaOverviewRequestError[];
}

export interface SchemaOverviewRequestError {
    requestDescription: string;
    errorMessage: string;
}

export interface SchemaDetailsResponse {
    schemaDetails: SchemaDetails
}

export interface SchemaDetails {
    string: string;
    schemaId: number;
    version: number;
    compatibility: string;
    schema: Schema;
    registeredVersions: number[];
}

export interface Schema {
    doc: string;
    name: string;
    namespace: string;
    type: string;
    fields: SchemaField[];
}

export interface SchemaField {
    name: string;
    type: string | object | null | undefined;
    doc?: string | null | undefined;
    default?: string | object | null | undefined;
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
    partitions: { // partitions to reassign
        partitionId: number;
        replicas: number[] | null;
        // Entries are brokerIds.
        // Since the replicationFactor of a partition tells us the total number
        // of 'instances' of a partition (leader + follower replicas) the length of the array is always 'replicationFactor'.
        // The first entry in the array is the brokerId that will host the leader replica
        // can also be null to cancel a pending reassignment.
        // Since Kafka rebalances the leader partitions across the brokers periodically, it is not super important which broker is the leader.
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
    Set = 0,
    Delete = 1,
    Append = 2,
    Subtract = 3,
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
    resourceName: string

    // key/value config pairs to set on the resource.
    configs: IncrementalAlterConfigsRequestResourceConfig[];
}
export interface PatchConfigsRequest {
    resources: ResourceConfig[];
}

export interface PatchConfigsResponse {
    patchedConfigs: {
        error: string | null;
        resourceName: string;
        resourceType: ConfigResourceType;
    }[];
}