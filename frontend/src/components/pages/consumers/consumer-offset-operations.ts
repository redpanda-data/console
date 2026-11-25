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

import 'components/legacy-layout.css';
import type { GroupOffset } from './modals';
import { api } from '../../../state/backend-api';
import type { TopicOffset } from '../../../state/rest-interfaces';
import type {
  DeleteConsumerGroupOffsetsTopic,
  EditConsumerGroupOffsetsTopic,
  GroupDescription,
} from '../../../types/consumer-groups';
import { arrayFirst, arrayGroupInto } from '../../../utils/array-utils';
import { isNonzeroNumber } from '../../../utils/number-utils';
import { isNonEmptyString } from '../../../utils/string-utils';

type TopicPartitionResults = {
  topicName: string;
  partitions: {
    partitionID: number;
    error: string | undefined;
  }[];
};

/** Keeps only the partitions that report an error, and only the topics that have any. */
export function topicsWithPartitionErrors(topics: TopicPartitionResults[]): TopicPartitionResults[] {
  return topics.flatMap((t) => {
    const erroredTopic = {
      ...t,
      partitions: t.partitions.filter((x) => isNonEmptyString(x.error)),
    };
    return erroredTopic.partitions.length > 0 ? [erroredTopic] : [];
  });
}

export async function applyOffsetEdit(groupId: string, topics: EditConsumerGroupOffsetsTopic[]) {
  const editResponse = await api.editConsumerGroupOffsets(groupId, topics);
  const errors = topicsWithPartitionErrors(editResponse);
  if (errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('apply offsets, backend errors', { errors, request: topics });
    throw new Error(`Apply offsets failed with ${errors.length} errors`);
  }
}

export function assignNewOffset(offsets: GroupOffset[], newOffset: number) {
  for (const x of offsets) {
    x.newOffset = newOffset;
  }
}

export function shiftOffsets(offsets: GroupOffset[], shiftBy: number) {
  for (const x of offsets) {
    if (isNonzeroNumber(x.offset)) {
      x.newOffset = x.offset + shiftBy;
    }
  }
}

export function assignTimestampOffsets(offsets: GroupOffset[], offsetsForTimestamp: TopicOffset[]) {
  for (const x of offsets) {
    const responseOffset = arrayFirst(offsetsForTimestamp, (t) => t.topicName === x.topicName)?.partitions.find(
      (p) => p.partitionId === x.partitionId
    );
    x.newOffset = responseOffset;
  }
}

export function groupOffsetOf(group: GroupDescription, topicName: string, partitionId: number): number | undefined {
  return (
    arrayFirst(group.topicOffsets, (t) => t.topic === topicName)?.partitionOffsets.find(
      (p) => p.partitionId === partitionId
    )?.groupOffset ?? undefined
  );
}

/** Appends every committed offset of `other` that `currentOffsets` doesn't have yet, as a new offset with no current one. */
export function appendMissingOffsets(currentOffsets: GroupOffset[], other: GroupDescription) {
  const otherFlat = other.topicOffsets.flatMap((x) =>
    x.partitionOffsets.flatMap((p) =>
      p.groupOffset === null
        ? []
        : [
            {
              topicName: x.topic,
              partitionId: p.partitionId,
              offset: p.groupOffset,
            },
          ]
    )
  );

  for (const o of otherFlat) {
    if (currentOffsets.every((x) => !(x.topicName === o.topicName && x.partitionId === o.partitionId))) {
      currentOffsets.push({
        topicName: o.topicName,
        partitionId: o.partitionId,
        offset: undefined,
        newOffset: o.offset,
      });
    }
  }
}
export function createEditRequest(offsets: GroupOffset[]): EditConsumerGroupOffsetsTopic[] {
  const getOffset = (x: GroupOffset['newOffset']): number | undefined => {
    // no offset set
    if (x === null) {
      return;
    }

    // from other group
    if (typeof x === 'number') {
      return x;
    }

    // from timestamp
    if (x !== undefined && typeof x === 'object' && 'offset' in x) {
      return x.offset;
    }
  };
  return arrayGroupInto(offsets, (x) => x.topicName)
    .map((topic) => ({
      topicName: topic.key,
      partitions: topic.items.flatMap((partition) => {
        const offset = getOffset(partition.newOffset);
        return offset === undefined ? [] : [{ partitionId: partition.partitionId, offset }];
      }),
    }))
    .filter((topic) => topic.partitions.length > 0);
}

export function createDeleteRequest(offsets: GroupOffset[]): DeleteConsumerGroupOffsetsTopic[] {
  const topicOffsets = arrayGroupInto(offsets, (x) => x.topicName).map((t) => ({
    topicName: t.key,
    partitions: t.items.map((p) => ({
      partitionId: p.partitionId,
    })),
  }));

  // filter topics with zero partitions
  return topicOffsets.filter((t) => t.partitions.length > 0);
}
