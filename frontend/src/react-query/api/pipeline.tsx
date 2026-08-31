import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { callUnaryMethod, createConnectQueryKey, useMutation, useQuery, useTransport } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  GetPipelineRequestSchema,
  type GetPipelineResponse,
  GetPipelinesBySecretsRequestSchema,
  GetPipelinesForSecretRequestSchema,
  type ListPipelinesRequest,
  ListPipelinesRequestSchema,
  type ListPipelinesResponse,
  PipelineService,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  createPipeline,
  deletePipeline,
  getPipeline,
  getPipelinesBySecrets,
  getPipelinesForSecret,
  listPipelines,
  startPipeline,
  stopPipeline,
  updatePipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  GetPipelineRequestSchema as GetPipelineRequestSchemaDataPlane,
  GetPipelinesBySecretsRequestSchema as GetPipelinesBySecretsRequestSchemaDataPlane,
  GetPipelinesForSecretRequestSchema as GetPipelinesForSecretRequestSchemaDataPlane,
  type ListPipelinesRequest as ListPipelinesRequestDataPlane,
  ListPipelinesRequestSchema as ListPipelinesRequestSchemaDataPlane,
  type Pipeline,
  Pipeline_State,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useCallback, useMemo } from 'react';
import { type MessageInit, type QueryOptions, SHORT_POLLING_INTERVAL } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
export const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
export const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;
const transitionalStates: Pipeline_State[] = [Pipeline_State.STARTING, Pipeline_State.STOPPING];

// The server does the same work per call at any page size (it lists everything and slices), and the
// list drains page-by-page — so ask for the legacy page's 500, under the proto max.
const LIST_PIPELINES_PAGE_SIZE = 500;

export const useGetPipelineQuery = (
  { id }: { id: Pipeline['id'] },
  options?: QueryOptions<GenMessage<GetPipelineResponse>, GetPipelineResponse> & {
    refetchInterval?: number | false | ((query: { state?: { data?: GetPipelineResponse } }) => number | false);
    refetchIntervalInBackground?: boolean;
    refetchOnWindowFocus?: 'always' | boolean;
  }
) => {
  const getPipelineRequestDataPlane = create(GetPipelineRequestSchemaDataPlane, { id });
  const getPipelineRequest = create(GetPipelineRequestSchema, {
    request: getPipelineRequestDataPlane,
  });
  return useQuery(getPipeline, getPipelineRequest, {
    enabled: options?.enabled,
    refetchInterval:
      options?.refetchInterval ??
      ((query) => {
        const state = query?.state?.data?.response?.pipeline?.state;
        // Poll every 2 seconds when pipeline is in transitional state (STARTING or STOPPING)
        const shouldPoll = state && transitionalStates.includes(state);
        return shouldPoll ? SHORT_POLLING_INTERVAL : false;
      }),
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
};

/**
 * DANGER, and the reason there is only one caller shape: **the input never reaches the query key**, so
 * every mounted `useListPipelinesQuery` shares one cache entry regardless of what it asked for.
 *
 * connect-query omits the `pageParamKey` field from the key (it is the cursor, and keying on it would
 * give every page its own entry). The console-layer `ListPipelinesRequest` has exactly one field —
 * `request`, the dataplane request — and that is the page param, because the page token lives inside
 * it. So the whole filter, page size and all, is omitted: `{}` for every input.
 *
 * A caller that narrows the input therefore does not get its own filtered view; it overwrites the one
 * entry the pipeline list renders from. That is exactly what a name-filtered lookup on the editor page
 * did — after saving a draft, the list showed only that draft. Anything needing a different filter must
 * go around the cache (`callUnaryMethod`, as `useFetchPipelineNames` below does), or the whole list has
 * to be fetched and filtered client-side. `useListPipelinesQuery.test` locks this behaviour down.
 */
export const useListPipelinesQuery = (
  input?: MessageInit<ListPipelinesRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListPipelinesRequest>, ListPipelinesResponse> & {
    /** Enable smart polling when pipelines are in transitional states (STARTING/STOPPING) */
    enableSmartPolling?: boolean;
  }
) => {
  // Stabilize request objects to prevent unnecessary re-renders
  const listPipelinesRequestDataPlane = useMemo(
    () =>
      create(ListPipelinesRequestSchemaDataPlane, {
        pageSize: LIST_PIPELINES_PAGE_SIZE,
        pageToken: '',
        ...input,
      }),
    [input]
  );

  const listPipelinesRequest = useMemo(
    () =>
      create(ListPipelinesRequestSchema, {
        request: listPipelinesRequestDataPlane,
      }) as ListPipelinesRequest & Required<Pick<ListPipelinesRequest, 'request'>>,
    [listPipelinesRequestDataPlane]
  );

  const listPipelinesResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    enabled: options?.enabled,
    refetchInterval: options?.enableSmartPolling
      ? (query) => {
          const pages = query?.state?.data?.pages;
          const hasTransitional = pages?.some((page) =>
            page?.response?.pipelines?.some((p) => transitionalStates.includes(p?.state))
          );
          return hasTransitional ? SHORT_POLLING_INTERVAL : false;
        }
      : false,
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      const nextPageToken = lastPage?.response?.nextPageToken;
      // Any token already requested, not just the last one: keyset tokens only move forward, so a
      // repeat means the server sent us backwards (A→A, or a longer A→B→A cycle) and the drain would
      // never end.
      if (!nextPageToken || allPageParams.some((param) => param?.pageToken === nextPageToken)) {
        return;
      }
      return create(ListPipelinesRequestSchemaDataPlane, {
        ...listPipelinesRequestDataPlane,
        pageToken: nextPageToken,
      });
    },
    pageParamKey: 'request',
  });

  // Deduplicated by id: the token names the next page's first id, so a server resolving it by exact
  // match replays page one when that pipeline is deleted mid-drain. Later pages win.
  const pipelines = useMemo(() => {
    const pages = listPipelinesResult?.data?.pages;
    if (!pages) {
      return [];
    }
    const byId = new Map<string, Pipeline>();
    for (const page of pages) {
      for (const pipeline of page?.response?.pipelines ?? []) {
        byId.set(pipeline.id, pipeline);
      }
    }
    return [...byId.values()];
  }, [listPipelinesResult.data]);

  const data = useMemo(() => ({ pipelines }), [pipelines]);

  return {
    ...listPipelinesResult,
    data,
  };
};

/**
 * One page is the whole answer here: the caller is numbering `Untitled pipeline 2`, `3`, … past the
 * names already taken, and a hundredth untitled draft falls back to a timestamp rather than paging.
 */
const NAME_LOOKUP_PAGE_SIZE = 100;

/**
 * `ListPipelinesRequest.Filter.name_contains` is validated server-side against
 * `^[A-Za-z0-9-_ /]+$` with a 128-character cap, so a name holding anything else — a
 * dot, a bracket, an accent — is rejected as a malformed request rather than matching
 * nothing.
 *
 * Everything outside the pattern is dropped instead. A substring filter that has lost
 * some characters returns a superset of what was asked for, which is harmless for
 * every caller here (they are checking which names are already taken); a 400 is not.
 * Nothing left to match on means no filter at all, i.e. the first page unfiltered.
 */
const DISALLOWED_IN_NAME_FILTER = /[^A-Za-z0-9\-_ /]/g;
const NAME_FILTER_MAX_LENGTH = 128;

export const toNameContainsFilter = (nameContains: string): string =>
  nameContains.replace(DISALLOWED_IN_NAME_FILTER, '').slice(0, NAME_FILTER_MAX_LENGTH);

/**
 * Display names already in use, matched by substring — fetched on demand rather than subscribed to.
 *
 * Two reasons it is not a query. It is needed once, at the moment a draft is saved with the name field
 * left empty, so a standing query would drain the list on every editor mount for a value usually never
 * read. And a filtered `useListPipelinesQuery` cannot exist: see the warning on that hook — it would
 * land in the same cache entry as the pipeline list and replace it with the filtered result.
 */
export const useFetchPipelineNames = () => {
  const transport = useTransport();
  return useCallback(
    async (nameContains: string): Promise<string[]> => {
      const safeNameContains = toNameContainsFilter(nameContains);
      const response = await callUnaryMethod(
        transport,
        listPipelines,
        create(ListPipelinesRequestSchema, {
          request: create(ListPipelinesRequestSchemaDataPlane, {
            pageSize: NAME_LOOKUP_PAGE_SIZE,
            // Omitted rather than sent empty: the field ignores an empty value anyway, and
            // being explicit keeps "nothing usable to filter on" readable at the call site.
            filter: { includeDrafts: true, ...(safeNameContains ? { nameContains: safeNameContains } : {}) },
          }),
        })
      );
      return (response.response?.pipelines ?? []).map((pipeline) => pipeline.displayName);
    },
    [transport]
  );
};

export const useCreatePipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createPipeline, {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: PipelineService.method.listPipelines,
            cardinality: 'infinite',
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: PipelineService.method.getPipeline,
            cardinality: 'finite',
          }),
          exact: false,
        }),
      ]);
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'pipeline',
      }),
  });
};

export const useUpdatePipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updatePipeline, {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: PipelineService.method.listPipelines,
            cardinality: 'infinite',
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: PipelineService.method.getPipeline,
            cardinality: 'finite',
          }),
          exact: false,
        }),
      ]);
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'pipeline',
      }),
  });
};

export const useStartPipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(startPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: PipelineService.method.listPipelines,
          cardinality: 'infinite',
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: PipelineService.method.getPipeline,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'start',
        entity: 'pipeline',
      }),
  });
};

export const useStopPipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(stopPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: PipelineService.method.listPipelines,
          cardinality: 'infinite',
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: PipelineService.method.getPipeline,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'stop',
        entity: 'pipeline',
      }),
  });
};

export const useDeletePipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deletePipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: PipelineService.method.listPipelines,
          cardinality: 'infinite',
        }),
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'pipeline',
      }),
  });
};

export const useGetPipelinesForSecretQuery = ({ secretId }: { secretId: Secret['id'] }) => {
  const getPipelinesForSecretRequestDataPlane = create(GetPipelinesForSecretRequestSchemaDataPlane, {
    secretId,
  });

  const getPipelinesForSecretRequest = create(GetPipelinesForSecretRequestSchema, {
    request: getPipelinesForSecretRequestDataPlane,
  });

  return useQuery(getPipelinesForSecret, getPipelinesForSecretRequest, {
    enabled: secretId !== '',
  });
};

export const useGetPipelinesBySecretsQuery = () => {
  const getPipelinesBySecretsRequestDataPlane = create(GetPipelinesBySecretsRequestSchemaDataPlane);

  const getPipelinesBySecretsRequest = create(GetPipelinesBySecretsRequestSchema, {
    request: getPipelinesBySecretsRequestDataPlane,
  });
  return useQuery(getPipelinesBySecrets, getPipelinesBySecretsRequest);
};
