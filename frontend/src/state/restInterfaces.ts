

export class TopicDetail {
    topicName: string;
    isInternal: boolean;
    partitionCount: number;
    replicationFactor: number;
    cleanupPolicy: string;

    // Added by frontend
    // messageCount: number;
}

export class GetTopicsResponse {
    topics: TopicDetail[];
}

export interface Partition {
    id: number;
    waterMarkLow: number;
    waterMarkHigh: number;
}

export interface GetPartitionsResponse {
    topicName: string;
    partitions: Partition[];
}





export interface TopicMessage {
    offset: number,
    timestamp: number,
    partitionID: number,
    key: string, // base64 encoded key of the message
    value: any, // json representation of the message value (xml, avro, etc will get converted)
    valueType: 'json' | 'xml' | 'avro' | 'text' | 'binary', // actual format the message (before being converted to json)
    size: number, // size in bytes of the kafka message

    // Added by the frontend (sometimes)
    valueJson: string,
    valueBinHexPreview: string,
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





export interface TopicConfigEntry {
    name: string,
    value: string,
    isDefault: boolean,
}
export interface TopicDescription {
    topicName: string
    configEntries: TopicConfigEntry[]
}
export interface TopicConfigResponse {
    topicDescription: TopicDescription
}






export class GroupMemberAssignment {
    topicName: string;
    partitionIds: number[];

}
export class GroupMemberDescription {
    id: string; // unique ID assigned to the member after login
    clientId: string; // custom id reported by the member
    clientHost: string; // address/host of the connection
    assignments: GroupMemberAssignment[]; // topics+partitions that the worker is assigned to

}
export class GroupDescription {
    groupId: string; // name of the group
    state: string; // Dead, Initializing, Rebalancing, Stable
    members: GroupMemberDescription[]; // members (consumers) that are currently present in the group
}

export class GetConsumerGroupsResponse {
    consumerGroups: GroupDescription[];
}







export interface Broker {
    brokerId: number;
    address: string;
    rack: string;
}

export interface ClusterInfo {
    controllerId: number;
    brokers: Broker[];
}

export interface ClusterInfoResponse {
    clusterInfo: ClusterInfo;
}




export interface UserData {
    UserName: string,
}



