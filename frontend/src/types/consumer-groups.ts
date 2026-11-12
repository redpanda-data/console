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

  memberEpoch?: number;
  targetAssignments?: GroupMemberAssignment[];
  subscribedTopics?: string[];

  // added by frontend:
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
  // Consumer (KIP-848) groups only; absent when the broker could not describe the group.
  groupEpoch?: number;
  targetAssignmentEpoch?: number;
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
};

export type GroupTopicOffsets = {
  topic: string;
  summedLag: number; // summed lag of all partitions (non consumed partitions are not considered)
  partitionCount: number;
  partitionsWithOffset: number; // number of partitions that have an active group offset
  partitionOffsets: GroupPartitionOffset[];
};

// PartitionOffset describes the kafka lag for a partition for a single consumer group
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

export type GetConsumerGroupsResponse = {
  consumerGroups: GroupDescription[];
};

export type GetConsumerGroupResponse = {
  consumerGroup: GroupDescription;
};
