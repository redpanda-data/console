import type { Partition } from '../state/rest-interfaces';
import { arrayMax } from '../utils/array-utils';
import { isNonEmptyString } from '../utils/string-utils';

type PartitionLogDir = Partition['partitionLogDirs'][number];

// Largest size reported by a healthy log dir, used as the partition's replica size.
function largestLogDirSize(logDirs: PartitionLogDir[], isHealthy: (logDir: PartitionLogDir) => boolean): number {
  const validLogDirs = logDirs.filter((e) => isHealthy(e) && e.size >= 0);
  const replicaSize = validLogDirs.length > 0 ? arrayMax(validLogDirs, (e) => e.size) : 0;
  return Math.max(replicaSize, 0);
}

const isLogDirErrorFree = (logDir: PartitionLogDir) => logDir.error === null || logDir.error === '';

// Add some local/cached properties to make working with the data easier
export function annotateTopicPartitions(topicName: string, partitions: Partition[]) {
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    // An errored partition is flagged and gets no cached replica size
    if ((p.partitionError ?? '') || isNonEmptyString(p.waterMarksError)) {
      p.hasErrors = true;
      continue;
    }

    p.replicaSize = largestLogDirSize(p.partitionLogDirs, (e) => !e.error);
  }
}

type PartitionErrorLists = {
  partitionErrors: Array<{
    id: number;
    partitionError: string;
  }>;
  waterMarksErrors: Array<{
    id: number;
    waterMarksError: string;
  }>;
};

function recordPartitionErrors(p: Partition, lists: PartitionErrorLists) {
  if (isNonEmptyString(p.partitionError)) {
    lists.partitionErrors.push({
      id: p.id,
      partitionError: p.partitionError,
    });
  }
  if (isNonEmptyString(p.waterMarksError)) {
    lists.waterMarksErrors.push({
      id: p.id,
      waterMarksError: p.waterMarksError,
    });
  }
}

// Collects every partition's errors; once one has errored, the rest get no cached replica size.
export function collectPartitionErrors(topicName: string, partitions: Partition[]): PartitionErrorLists {
  const lists: PartitionErrorLists = { partitionErrors: [], waterMarksErrors: [] };

  // Add some local/cached properties to make working with the data easier
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    recordPartitionErrors(p, lists);
    if (lists.partitionErrors.length > 0 || lists.waterMarksErrors.length > 0) {
      continue;
    }

    // replicaSize
    p.replicaSize = largestLogDirSize(p.partitionLogDirs, isLogDirErrorFree);
  }

  return lists;
}

export type TopicPartitionState = {
  topicPartitions: Map<string, Partition[] | null>;
  topicPartitionErrors: Map<string, PartitionErrorLists['partitionErrors']>;
  topicWatermarksErrors: Map<string, PartitionErrorLists['waterMarksErrors']>;
};

// Without errors the topic's partitions replace its recorded errors; with errors only the errors are recorded.
export function topicPartitionsUpdate(topicName: string, partitions: Partition[], lists: PartitionErrorLists) {
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

export function logPartitionErrorLists(topicName: string, lists: PartitionErrorLists) {
  if (lists.partitionErrors.length > 0 || lists.waterMarksErrors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(
      `refreshPartitionsForTopic: response has partition errors (t=${topicName} p=${lists.partitionErrors.length}, w=${lists.waterMarksErrors.length})`
    );
  }
}
type PartitionErrorCounts = {
  partitionErrors: number;
  waterMarkErrors: number;
};
function countPartitionErrors(p: Partition, counts: PartitionErrorCounts) {
  if (isNonEmptyString(p.partitionError)) {
    counts.partitionErrors += 1;
  }
  if (isNonEmptyString(p.waterMarksError)) {
    counts.waterMarkErrors += 1;
  }
}

// Flags every partition from the first errored one on, which also keeps their cached replica size unset.
export function flagErroredPartitions(topicName: string, partitions: Partition[]): PartitionErrorCounts {
  const counts: PartitionErrorCounts = { partitionErrors: 0, waterMarkErrors: 0 };

  // Add some local/cached properties to make working with the data easier
  for (const p of partitions) {
    // topicName
    p.topicName = topicName;

    countPartitionErrors(p, counts);
    if (Boolean(counts.partitionErrors) || Boolean(counts.waterMarkErrors)) {
      p.hasErrors = true;
      continue;
    }

    // replicaSize
    p.replicaSize = largestLogDirSize(p.partitionLogDirs, isLogDirErrorFree);
  }

  return counts;
}

export function warnPartitionErrorCounts(topicName: string, counts: PartitionErrorCounts) {
  if (counts.partitionErrors > 0 || counts.waterMarkErrors > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn(
      `refreshPartitionsForTopic: response has partition errors (topic=${topicName} partitionErrors=${counts.partitionErrors}, waterMarkErrors=${counts.waterMarkErrors})`
    );
  }
}
