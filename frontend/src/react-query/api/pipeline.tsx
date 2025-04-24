import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
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
  type GetPipelineRequest,
  GetPipelineRequestSchema,
  GetPipelinesBySecretsRequestSchema,
  GetPipelinesForSecretRequestSchema,
  type ListPipelinesRequest,
  ListPipelinesRequestSchema,
  type ListPipelinesResponse,
  PipelineService,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  GetPipelineRequestSchema as GetPipelineRequestSchemaDataPlane,
  type GetPipelineResponse,
  GetPipelinesBySecretsRequestSchema as GetPipelinesBySecretsRequestSchemaDataPlane,
  GetPipelinesForSecretRequestSchema as GetPipelinesForSecretRequestSchemaDataPlane,
  type ListPipelinesRequest as ListPipelinesRequestDataPlane,
  ListPipelinesRequestSchema as ListPipelinesRequestSchemaDataPlane,
  type Pipeline,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
export const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
export const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

export const useGetPipelineQuery = (
  { id }: { id: Pipeline['id'] },
  options?: QueryOptions<GenMessage<GetPipelineRequest>, GetPipelineResponse> & {
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
    refetchOnWindowFocus?: 'always' | boolean;
  },
) => {
  const getPipelineRequestDataPlane = create(GetPipelineRequestSchemaDataPlane, { id });
  const getPipelineRequest = create(GetPipelineRequestSchema, { request: getPipelineRequestDataPlane });
  return useQuery(getPipeline, getPipelineRequest, {
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchIntervalInBackground,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
};

export const useListPipelinesQuery = (
  input?: MessageInit<ListPipelinesRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListPipelinesRequest>, ListPipelinesResponse>,
) => {
  const listPipelinesRequestDataPlane = create(ListPipelinesRequestSchemaDataPlane, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    // TODO: Use once nameContains is not required anymore
    // filter: new ListPipelinesRequest_Filter({
    //   ...input?.filter,
    //   tags: {
    //     ...input?.filter?.tags,
    //     __redpanda_cloud_pipeline_type: 'pipeline',
    //   },
    // }),
    ...input,
  });

  const listPipelinesRequest = create(ListPipelinesRequestSchema, {
    request: listPipelinesRequestDataPlane,
  }) as MessageInit<ListPipelinesRequest> & Required<Pick<MessageInit<ListPipelinesRequest>, 'request'>>;
  const listPipelinesResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    // Need to cast to ensure reflection works properly
    getNextPageParam: (lastPage) => lastPage?.response?.nextPageToken as MessageInit<ListPipelinesRequestDataPlane>,
  });

  const allRetrievedPipelines = listPipelinesResult?.data?.pages?.flatMap(({ response }) => response?.pipelines);

  // TODO: Remove once nameContains is not required anymore
  // const filteredPipelines = allRetrievedPipelines?.filter(
  //   (pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_type !== 'agent',
  // );

  return {
    ...listPipelinesResult,
    data: {
      pipelines: allRetrievedPipelines,
    },
  };
};

export const useCreatePipelineMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PipelineService.typeName] });
      showToast({
        id: TOASTS.PIPELINE.CREATE.SUCCESS,
        title: 'Pipeline created successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.PIPELINE.CREATE.ERROR,
        title: formatToastErrorMessageGRPC({ error, action: 'create', entity: 'pipeline' }),
        status: 'error',
      });
    },
  });
};

export const useUpdatePipelineMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(updatePipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PipelineService.typeName] });
      showToast({
        id: TOASTS.PIPELINE.UPDATE.SUCCESS,
        title: 'Pipeline updated successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.PIPELINE.UPDATE.ERROR,
        title: formatToastErrorMessageGRPC({ error, action: 'update', entity: 'pipeline' }),
        status: 'error',
      });
    },
  });
};

export const useStartPipelineMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(startPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PipelineService.typeName] });
      showToast({
        id: TOASTS.PIPELINE.START.SUCCESS,
        title: 'Pipeline started successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.PIPELINE.START.ERROR,
        title: formatToastErrorMessageGRPC({ error, action: 'start', entity: 'pipeline' }),
        status: 'error',
      });
    },
  });
};

export const useStopPipelineMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(stopPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PipelineService.typeName] });
      showToast({
        id: TOASTS.PIPELINE.STOP.SUCCESS,
        title: 'Pipeline stopped successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.PIPELINE.STOP.ERROR,
        title: formatToastErrorMessageGRPC({ error, action: 'stop', entity: 'pipeline' }),
        status: 'error',
      });
    },
  });
};

export const useDeletePipelineMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(deletePipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PipelineService.typeName] });
      showToast({
        id: TOASTS.PIPELINE.DELETE.SUCCESS,
        title: 'Pipeline deleted successfully',
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.PIPELINE.DELETE.ERROR,
        title: formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'pipeline' }),
        status: 'error',
      });
    },
  });
};

export const useGetPipelinesForSecretQuery = ({ secretId }: { secretId: Secret['id'] }) => {
  const getPipelinesForSecretRequestDataPlane = create(GetPipelinesForSecretRequestSchemaDataPlane);

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
