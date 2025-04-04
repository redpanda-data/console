import type { PartialMessage } from '@bufbuild/protobuf';
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
  GetPipelineRequest,
  GetPipelinesBySecretsRequest,
  GetPipelinesForSecretRequest,
  ListPipelinesRequest,
  type ListPipelinesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  GetPipelineRequest as GetPipelineRequestDataPlane,
  type GetPipelineResponse,
  GetPipelinesBySecretsRequest as GetPipelinesBySecretsRequestDataPlane,
  GetPipelinesForSecretRequest as GetPipelinesForSecretRequestDataPlane,
  ListPipelinesRequest as ListPipelinesRequestDataPlane,
  type Pipeline,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
export const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
export const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

export const useGetPipelineQuery = (
  { id }: { id: Pipeline['id'] },
  options?: QueryOptions<GetPipelineRequest, GetPipelineResponse, GetPipelineResponse> & {
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
    refetchOnWindowFocus?: 'always' | boolean;
  },
) => {
  const getPipelineRequestDataPlane = new GetPipelineRequestDataPlane({ id });
  const getPipelineRequest = new GetPipelineRequest({ request: getPipelineRequestDataPlane });
  return useQuery(getPipeline, getPipelineRequest, {
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchIntervalInBackground,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
};

export const useListPipelinesQuery = (
  input?: PartialMessage<ListPipelinesRequestDataPlane>,
  options?: QueryOptions<ListPipelinesRequestDataPlane, ListPipelinesResponse, ListPipelinesResponse>,
) => {
  const listPipelinesRequestDataPlane = new ListPipelinesRequestDataPlane({
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

  const listPipelinesRequest = new ListPipelinesRequest({
    request: listPipelinesRequestDataPlane,
  }) as PartialMessage<ListPipelinesRequest> & Required<Pick<PartialMessage<ListPipelinesRequest>, 'request'>>;

  const listPipelinesResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
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
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
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
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
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
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
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
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
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
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
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
  const getPipelinesForSecretRequestDataPlane = new GetPipelinesForSecretRequestDataPlane({ secretId });

  const getPipelinesForSecretRequest = new GetPipelinesForSecretRequest({
    request: getPipelinesForSecretRequestDataPlane,
  });

  return useQuery(getPipelinesForSecret, getPipelinesForSecretRequest, {
    enabled: secretId !== '',
  });
};

export const useGetPipelinesBySecretsQuery = () => {
  const getPipelinesBySecretsRequestDataPlane = new GetPipelinesBySecretsRequestDataPlane({
    secretId: '',
  });

  const getPipelinesBySecretsRequest = new GetPipelinesBySecretsRequest({
    request: getPipelinesBySecretsRequestDataPlane,
  });
  return useQuery(getPipelinesBySecrets, getPipelinesBySecretsRequest);
};
