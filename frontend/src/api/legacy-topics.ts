import { aclRequestToQuery, normalizeAcls, prepareSynonyms } from './legacy-api-formatters';
import type { LegacyApiServices } from './legacy-api-services';
import {
  annotateTopicPartitions,
  collectPartitionErrors,
  flagErroredPartitions,
  logPartitionErrorLists,
  type TopicPartitionState,
  topicPartitionsUpdate,
  warnPartitionErrorCounts,
} from './legacy-topic-partitions';
import { config as appConfig } from '../runtime-config';
import type { ApiState, GetApiState, SetApiState } from '../state/backend-api';
import {
  AclRequestDefault,
  type DeleteRecordsResponseData,
  type GetAclOverviewResponse,
  type GetAllPartitionsResponse,
  type GetPartitionsResponse,
  type GetTopicConsumersResponse,
  type GetTopicOffsetsByTimestampResponse,
  type GetTopicsResponse,
  type Partition,
  type TopicConfigResponse,
  type TopicDocumentationResponse,
  type TopicOffset,
} from '../state/rest-interfaces';
import { arrayJoinStr } from '../utils/array-utils';
import { pruneMapToKeys } from '../utils/bounded-array';
import { compareStrings } from '../utils/string-utils';
import { isPresent } from '../utils/type-guards';
import { decodeBase64 } from '../utils/utils';

export function createLegacyTopicReadActions(set: SetApiState, _get: GetApiState, services: LegacyApiServices) {
  const { cachedApiRequest, parseOrUnwrap, addError } = services;
  return {
    refreshTopics(force?: boolean): Promise<void> {
      return cachedApiRequest<GetTopicsResponse>(`${appConfig.restBasePath}/topics`, force).then((v) => {
        const topics = v?.topics;
        if (isPresent(topics)) {
          // Prune topic-keyed caches to the current topic set so entries for deleted topics (or a
          // previous cluster after a remount) don't accumulate for the life of the tab. Pruning to
          // the live set never drops a topic that still exists, so nothing needs re-fetching.
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
    refreshTopicConfig(topicName: string, force?: boolean): Promise<void> {
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

        // add 'type' to each synonym
        // in the raw data, only the root entries have 'type', but the nested synonyms do not
        // we need 'type' on synonyms as well for filtering
        const topicDescription = v.topicDescription;
        prepareSynonyms(topicDescription.configEntries);
        set((s) => ({ topicConfig: new Map(s.topicConfig).set(topicName, topicDescription) }));
      }, addError); // 403 -> null
      return promise;
    },
    async getTopicOffsetsByTimestamp(topicNames: string[], timestampUnixMs: number): Promise<TopicOffset[]> {
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
  };
}

type LegacyTopicRecordActions = {
  deleteTopic(topicName: string): Promise<void>;
  deleteTopicRecords(
    topicName: string,
    offset: number,
    partitionId?: number
  ): Promise<undefined | DeleteRecordsResponseData | null> | undefined;
  deleteTopicRecordsFromAllPartitionsHighWatermark(
    topicName: string
  ): Promise<undefined | DeleteRecordsResponseData | null> | undefined;
  deleteTopicRecordsFromMultiplePartitionOffsetPairs(
    topicName: string,
    pairs: Array<{
      partitionId: number;
      offset: number;
    }>
  ): Promise<undefined | DeleteRecordsResponseData | null>;
};

export function createLegacyTopicRecordActions(
  _set: SetApiState,
  get: GetApiState,
  services: LegacyApiServices
): LegacyTopicRecordActions {
  const { rest, parseOrUnwrap, addError } = services;
  return {
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
      pairs: Array<{
        partitionId: number;
        offset: number;
      }>
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
  };
}

type LegacyTopicPartitionActions = {
  refreshPartitions(topics?: 'all' | string[], force?: boolean): Promise<void>;
  refreshPartitionsForTopic(topicName: string, force?: boolean): void;
  refreshTopicAcls(topicName: string, force?: boolean): void;
  refreshTopicConsumers(topicName: string, force?: boolean): void;
};

export function createLegacyTopicPartitionActions(
  set: SetApiState,
  get: GetApiState,
  services: LegacyApiServices
): LegacyTopicPartitionActions {
  const { cachedApiRequest, addError } = services;
  return {
    refreshPartitions(topics: 'all' | string[] = 'all', force?: boolean): Promise<void> {
      const processedTopics = Array.isArray(topics)
        ? topics.sort(compareStrings).map((t) => encodeURIComponent(t))
        : topics;

      const url =
        processedTopics === 'all'
          ? `${appConfig.restBasePath}/operations/topic-details`
          : `${appConfig.restBasePath}/operations/topic-details?topicNames=${arrayJoinStr(processedTopics, ',')}`;
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

          // Set partition
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
          // Set null to indicate that we're not allowed to see the partitions
          set((s: TopicPartitionState) => ({ topicPartitions: new Map(s.topicPartitions).set(topicName, null) }));
          return;
        }

        const errorLists = collectPartitionErrors(topicName, response.partitions);
        set(topicPartitionsUpdate(topicName, response.partitions, errorLists));
        logPartitionErrorLists(topicName, errorLists);

        const errorCounts = flagErroredPartitions(topicName, response.partitions);

        // Set partitions
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
  };
}
