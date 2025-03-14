import type { PartialMessage } from '@bufbuild/protobuf';
import { useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  createPipeline,
  deletePipeline,
  getPipeline,
  listPipelines,
  stopPipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  GetPipelineRequest,
  ListPipelinesRequest,
  type ListPipelinesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  GetPipelineRequest as GetPipelineRequestDataPlane,
  ListPipelinesRequest as ListPipelinesRequestDataPlane,
  type Pipeline,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import queryClient from 'queryClient';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const REDPANDA_AI_AGENT_PIPELINE_PREFIX = '_redpanda-agent';

export const useGetPipelineQuery = ({ id }: { id: Pipeline['id'] }) => {
  const getPipelineRequestDataPlane = new GetPipelineRequestDataPlane({ id });
  const getPipelineRequest = new GetPipelineRequest({ request: getPipelineRequestDataPlane });
  return useQuery(getPipeline, getPipelineRequest);
};

export const useListPipelinesAndAgentsQuery = (
  input?: PartialMessage<ListPipelinesRequestDataPlane>,
  options?: QueryOptions<ListPipelinesRequestDataPlane, ListPipelinesResponse, ListPipelinesResponse>,
) => {
  const listPipelinesRequestDataPlane = new ListPipelinesRequestDataPlane({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listPipelinesRequest = new ListPipelinesRequest({
    request: listPipelinesRequestDataPlane,
  }) as PartialMessage<ListPipelinesRequest> & Required<Pick<PartialMessage<ListPipelinesRequest>, 'request'>>;

  const listPipelinesResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
  });

  const allRecords = listPipelinesResult?.data?.pages?.flatMap(({ response }) => response?.pipelines);

  const pipelines = allRecords?.filter(
    (pipeline) => !pipeline?.displayName.startsWith(REDPANDA_AI_AGENT_PIPELINE_PREFIX),
  );
  const agents = allRecords?.filter((pipeline) => pipeline?.displayName.startsWith(REDPANDA_AI_AGENT_PIPELINE_PREFIX));

  return {
    ...listPipelinesResult,
    data: {
      pipelines,
      agents,
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

export const useStopPipelineMutationWithToast = () => {
  return useMutation(stopPipeline, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });
      await queryClient.invalidateQueries({ queryKey: [getPipeline.service.typeName] });
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
