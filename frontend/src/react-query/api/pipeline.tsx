import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
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
import { useMemo } from 'react';
import {
  MAX_PAGE_SIZE,
  type MessageInit,
  type QueryOptions,
  SHORT_POLLING_INTERVAL,
} from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
export const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
export const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

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
        const shouldPoll = state === Pipeline_State.STARTING || state === Pipeline_State.STOPPING;
        return shouldPoll ? SHORT_POLLING_INTERVAL : false;
      }),
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
};

export const useListPipelinesQuery = (
  input?: MessageInit<ListPipelinesRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListPipelinesRequest>, ListPipelinesResponse>
) => {
  // Stabilize request objects to prevent unnecessary re-renders
  const listPipelinesRequestDataPlane = useMemo(
    () =>
      create(ListPipelinesRequestSchemaDataPlane, {
        pageSize: MAX_PAGE_SIZE,
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
    getNextPageParam: (lastPage) => {
      const nextPageToken = lastPage?.response?.nextPageToken;
      if (!nextPageToken) {
        return;
      }
      // Return a new request object with the updated pageToken
      return create(ListPipelinesRequestSchemaDataPlane, {
        ...listPipelinesRequestDataPlane,
        pageToken: nextPageToken,
      });
    },
    pageParamKey: 'request',
  });

  // Flatten pipelines from all pages
  const pipelines = useMemo(
    () => listPipelinesResult?.data?.pages?.flatMap((page) => page?.response?.pipelines ?? []) ?? [],
    [listPipelinesResult.data]
  );

  const data = useMemo(() => ({ pipelines }), [pipelines]);

  return {
    ...listPipelinesResult,
    data,
  };
};

export const useCreatePipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createPipeline, {
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
        action: 'create',
        entity: 'pipeline',
      }),
  });
};

export const useUpdatePipelineMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updatePipeline, {
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
