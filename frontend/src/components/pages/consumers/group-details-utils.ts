/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { GroupDescription, GroupMemberAssignment, GroupMemberDescription } from 'state/rest-interfaces';

/** A KIP-848 group the broker listed but did not describe, so it has no epochs and no members. */
export const isConsumerGroupWithoutDetails = (group: GroupDescription) =>
  group.groupType === 'consumer' && group.groupEpoch === undefined;

export const isBehindGroupEpoch = (group: GroupDescription, member: GroupMemberDescription) =>
  group.groupType === 'consumer' &&
  group.groupEpoch !== undefined &&
  member.memberEpoch !== undefined &&
  member.memberEpoch < group.groupEpoch;

export const formatAssignment = (assignment: GroupMemberAssignment) =>
  `${assignment.topicName}: ${[...(assignment.partitionIds ?? [])].sort((a, b) => a - b).join(', ')}`;

export const membersSummary = (group: GroupDescription, members: GroupMemberDescription[]) => {
  let summary = `${members.length} ${members.length === 1 ? 'member' : 'members'}`;
  if (group.groupType === 'consumer') {
    const behindCount = members.filter((m) => isBehindGroupEpoch(group, m)).length;
    summary += behindCount > 0 ? `, ${behindCount} behind the group epoch` : ', all at the group epoch';
  }
  return summary;
};
