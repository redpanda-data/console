import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import { config } from 'config';
import {
  type ListTopicsRequest,
  ListTopicsRequestSchema,
  type ListTopicsResponse,
  TopicService,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { aclRequestToQuery } from 'state/backend-api';
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
  type TopicConsumer,
  type TopicDescription,
  type TopicDocumentation,
  type TopicDocumentationResponse,
  type TopicOffset,
} from 'state/rest-interfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type ListTopicsExtraOptions = {
  hideInternalTopics?: boolean;
};

/**
 * We need to use legacy API to list topics for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  {
    hideInternalTopics = false,
    staleTime,
    refetchOnWindowFocus,
  }: ListTopicsExtraOptions & { staleTime?: number; refetchOnWindowFocus?: boolean } = {}
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const infiniteQueryKey = createConnectQueryKey({
    schema: listTopics,
    input: listTopicsRequest,
    cardinality: 'infinite',
  });

  const legacyListTopicsResult = useTanstackQuery<GetTopicsResponse>({
    queryKey: infiniteQueryKey,
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }

      const response = await config.fetch(`${config.restBasePath}/topics`, {
        method: 'GET',
        headers,
      });

      return response.json();
    },
    staleTime,
    refetchOnWindowFocus,
  });

  const allRetrievedTopics = legacyListTopicsResult?.data?.topics;

  const topics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !(topic.isInternal || topic.topicName.startsWith('_')))
    : allRetrievedTopics;

  return { ...legacyListTopicsResult, data: { topics } };
};

/**
 * Hook to fetch the full list of topics.
 * Replaces api.refreshTopics + api.topics.
 */
export const useTopicsQuery = (options?: { staleTime?: number; refetchOnWindowFocus?: boolean }) =>
  useTanstackQuery<GetTopicsResponse>({
    queryKey: ['topics'],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/topics`, {
        method: 'GET',
        headers,
      });
      return response.json();
    },
    staleTime: options?.staleTime ?? 20 * 1000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });

/**
 * WARNING: Only use once Console v3 is released.
 */
export const useListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  options?: QueryOptions<GenMessage<ListTopicsRequest>, ListTopicsResponse>,
  { hideInternalTopics = false }: ListTopicsExtraOptions = {}
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listTopicsResult = useQuery(listTopics, listTopicsRequest, {
    enabled: options?.enabled,
  });

  const allRetrievedTopics = listTopicsResult?.data?.topics;

  const filteredTopics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !(topic.internal || topic.name.startsWith('_')))
    : allRetrievedTopics;

  return {
    ...listTopicsResult,
    data: {
      topics: filteredTopics,
    },
  };
};

export const useCreateTopicMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createTopic, {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['topics'] }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: TopicService.method.listTopics,
            cardinality: 'infinite',
          }),
          exact: false,
        }),
      ]);
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'topic',
      }),
  });
};

function prepareSynonymsLocal(configEntries: { synonyms?: Array<{ type?: string }>; type?: string }[]) {
  if (!Array.isArray(configEntries)) return;
  for (const e of configEntries) {
    if (e.synonyms === undefined) continue;
    for (const s of e.synonyms) {
      s.type = e.type;
    }
  }
}

/**
 * React Query hook to fetch topic configuration.
 * Replaces api.refreshTopicConfig + api.topicConfig.
 */
export const useTopicConfigQuery = (topicName: string, enabled = true) =>
  useTanstackQuery<TopicDescription | null>({
    queryKey: ['topicConfig', topicName],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(
        `${config.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`,
        { method: 'GET', headers }
      );
      const v: TopicConfigResponse | null = await response.json();
      if (!v) return null;
      if (v.topicDescription.error) return v.topicDescription;
      prepareSynonymsLocal(v.topicDescription.configEntries as Parameters<typeof prepareSynonymsLocal>[0]);
      return v.topicDescription;
    },
    enabled: enabled && !!topicName,
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'statusText' in error) return false;
      return failureCount < 2;
    },
  });

/**
 * Hook to manage topic configuration updates with React Query.
 * Replaces api.changeTopicConfig.
 */
export const useUpdateTopicConfigMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation({
    mutationFn: async ({
      topicName,
      configs,
    }: {
      topicName: string;
      configs: Array<{ key: string; op: 'SET' | 'DELETE'; value?: string }>;
    }) => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(
        `${config.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ configs }),
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to update config: ${response.statusText}`);
      }
      return { topicName, configs };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['topicConfig', data.topicName] });
    },
  });
};

/**
 * Hook to fetch topic documentation.
 * Replaces api.refreshTopicDocumentation + api.topicDocumentation.
 */
export const useTopicDocumentationQuery = (topicName: string, enabled = true) =>
  useTanstackQuery<TopicDocumentation | null>({
    queryKey: ['topicDocumentation', topicName],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(
        `${config.restBasePath}/topics/${encodeURIComponent(topicName)}/documentation`,
        { method: 'GET', headers }
      );
      const v: TopicDocumentationResponse = await response.json();
      const markdown = v.documentation.markdown === null ? null : decodeBase64(v.documentation.markdown);
      return { ...v.documentation, text: markdown };
    },
    enabled: enabled && !!topicName,
    staleTime: 60 * 1000,
  });

function decodeBase64(base64: string): string {
  return decodeURIComponent(
    Array.from(atob(base64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  );
}

/**
 * Hook to fetch topic consumers.
 * Replaces api.refreshTopicConsumers + api.topicConsumers.
 */
export const useTopicConsumersQuery = (topicName: string, enabled = true) =>
  useTanstackQuery<TopicConsumer[]>({
    queryKey: ['topicConsumers', topicName],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/topics/${encodeURIComponent(topicName)}/consumers`, {
        method: 'GET',
        headers,
      });
      const v: GetTopicConsumersResponse = await response.json();
      return v.topicConsumers;
    },
    enabled: enabled && !!topicName,
    staleTime: 20 * 1000,
  });

function normalizeAclsLocal(acls: GetAclOverviewResponse['aclResources']) {
  function upperFirst(str: string) {
    if (!str) return str;
    return str[0].toUpperCase() + str.slice(1).toLowerCase();
  }
  const specialCaseMap: Record<string, string> = { TRANSACTIONAL_ID: 'TransactionalID' };
  function normalizeEnum<T extends string>(str: T): T {
    if (!str) return str;
    if (specialCaseMap[str]) return specialCaseMap[str] as T;
    return str.split('_').map(upperFirst).join('') as T;
  }
  for (const e of acls) {
    e.resourceType = normalizeEnum(e.resourceType);
    e.resourcePatternType = normalizeEnum(e.resourcePatternType);
    for (const acl of e.acls) {
      acl.operation = normalizeEnum(acl.operation);
      acl.permissionType = normalizeEnum(acl.permissionType);
    }
  }
}

/**
 * Hook to fetch ACLs for a topic.
 * Replaces api.refreshTopicAcls + api.topicAcls.
 */
export const useTopicAclsQuery = (topicName: string, enabled = true) =>
  useTanstackQuery<GetAclOverviewResponse | null>({
    queryKey: ['topicAcls', topicName],
    queryFn: async () => {
      const query = aclRequestToQuery({
        ...AclRequestDefault,
        resourcePatternTypeFilter: 'Match',
        resourceType: 'Topic',
        resourceName: topicName,
      });
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/acls?${query}`, {
        method: 'GET',
        headers,
      });
      const v: GetAclOverviewResponse | null = await response.json();
      if (v) normalizeAclsLocal(v.aclResources);
      return v;
    },
    enabled: enabled && !!topicName,
    staleTime: 20 * 1000,
  });

export type TopicPartitionsResult = {
  partitions: Partition[] | null;
  partitionErrors: Array<{ id: number; partitionError: string }>;
  waterMarkErrors: Array<{ id: number; waterMarksError: string }>;
};

function processPartitions(partitions: Partition[], topicName: string): TopicPartitionsResult {
  const partitionErrors: Array<{ id: number; partitionError: string }> = [];
  const waterMarkErrors: Array<{ id: number; waterMarksError: string }> = [];

  for (const p of partitions) {
    p.topicName = topicName;
    if (p.partitionError) partitionErrors.push({ id: p.id, partitionError: p.partitionError });
    if (p.waterMarksError) waterMarkErrors.push({ id: p.id, waterMarksError: p.waterMarksError });
  }

  for (const p of partitions) {
    if (p.partitionError || p.waterMarksError) {
      p.hasErrors = true;
    } else {
      const validLogDirs = p.partitionLogDirs.filter((e) => (e.error === null || e.error === '') && e.size >= 0);
      const replicaSize = validLogDirs.length > 0 ? validLogDirs.max((e) => e.size) : 0;
      p.replicaSize = replicaSize >= 0 ? replicaSize : 0;
    }
  }

  return { partitions, partitionErrors, waterMarkErrors };
}

/**
 * Hook to fetch partitions for a single topic.
 * Replaces api.refreshPartitionsForTopic + api.topicPartitions.
 */
export const useTopicPartitionsQuery = (topicName: string, enabled = true) =>
  useTanstackQuery<TopicPartitionsResult>({
    queryKey: ['topicPartitions', topicName],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/topics/${encodeURIComponent(topicName)}/partitions`, {
        method: 'GET',
        headers,
      });
      const data: GetPartitionsResponse | null = await response.json();
      if (!data?.partitions) {
        return { partitions: null, partitionErrors: [], waterMarkErrors: [] };
      }
      return processPartitions(data.partitions, topicName);
    },
    enabled: enabled && !!topicName,
    staleTime: 20 * 1000,
  });

/**
 * Hook to fetch partitions for all topics (or a specific set).
 * Replaces api.refreshPartitions + api.topicPartitions (full map).
 */
export const useAllTopicPartitionsQuery = (
  topics: 'all' | string[] = 'all',
  options?: { enabled?: boolean; staleTime?: number }
) => {
  const queryKey = topics === 'all' ? ['topicPartitionsAll'] : ['topicPartitionsAll', ...topics.slice().sort()];

  return useTanstackQuery<Map<string, Partition[] | null>>({
    queryKey,
    queryFn: async () => {
      const processedTopics = Array.isArray(topics)
        ? topics
            .slice()
            .sort()
            .map((t) => encodeURIComponent(t))
        : topics;
      const url =
        processedTopics === 'all'
          ? `${config.restBasePath}/operations/topic-details`
          : `${config.restBasePath}/operations/topic-details?topicNames=${processedTopics.join(',')}`;

      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(url, { method: 'GET', headers });
      const data: GetAllPartitionsResponse | null = await response.json();

      const result = new Map<string, Partition[] | null>();
      if (!data?.topics) return result;

      for (const t of data.topics) {
        if (t.error !== null && t.error !== undefined) continue;
        result.set(t.topicName, processPartitions(t.partitions, t.topicName).partitions);
      }
      return result;
    },
    enabled: options?.enabled !== false,
    staleTime: options?.staleTime ?? 20 * 1000,
  });
};

/**
 * Hook to delete a topic.
 * Replaces api.deleteTopic.
 */
export const useDeleteTopicMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation({
    mutationFn: async (topicName: string) => {
      const headers: HeadersInit = {};
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/topics/${encodeURIComponent(topicName)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        throw new Error(`Failed to delete topic: ${response.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
};

/**
 * Hook to delete records from topic partitions.
 * Replaces api.deleteTopicRecordsFromMultiplePartitionOffsetPairs.
 */
export const useDeleteTopicRecordsMutation = () =>
  useTanstackMutation({
    mutationFn: async ({
      topicName,
      pairs,
    }: {
      topicName: string;
      pairs: Array<{ partitionId: number; offset: number }>;
    }) => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }
      const response = await config.fetch(`${config.restBasePath}/topics/${encodeURIComponent(topicName)}/records`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ partitions: pairs }),
      });
      if (!response.ok) {
        throw new Error(`Failed to delete records: ${response.statusText}`);
      }
      return response.json() as Promise<DeleteRecordsResponseData>;
    },
  });

/**
 * Standalone function to get topic offsets by timestamp.
 * Replaces api.getTopicOffsetsByTimestamp.
 */
export async function getTopicOffsetsByTimestamp(
  topicNames: string[],
  timestampUnixMs: number
): Promise<TopicOffset[]> {
  const query = `topicNames=${encodeURIComponent(topicNames.join(','))}&timestamp=${timestampUnixMs}`;
  const headers: HeadersInit = {};
  if (config.jwt) {
    headers.Authorization = `Bearer ${config.jwt}`;
  }
  const response = await config.fetch(`${config.restBasePath}/topics-offsets?${query}`, {
    method: 'GET',
    headers,
  });
  const r: GetTopicOffsetsByTimestampResponse = await response.json();
  return r.topicOffsets;
}
