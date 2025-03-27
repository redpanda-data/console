import type { PartialMessage } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { useMutation } from '@connectrpc/connect-query';
import { type QueryClient, type UseMutationResult, useQueryClient, type Query } from '@tanstack/react-query';
import {
  createPipeline,
  deletePipeline,
  listPipelines,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  CreatePipelineRequest,
  type CreatePipelineResponse,
  DeletePipelineRequest,
  type DeletePipelineResponse,
  ListPipelinesRequest,
  type ListPipelinesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequest as CreatePipelineRequestDataPlane,
  DeletePipelineRequest as DeletePipelineRequestDataPlane,
  ListPipelinesRequest as ListPipelinesRequestDataPlane,
  type Pipeline,
  PipelineCreate,
  Pipeline_State,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * @description This is a custom type piggybacking on top of the Pipeline. It is used to represent a wrapper around an AI agent and its pipelines.
 */
export interface Agent {
  id: string;
  displayName: string;
  description: string;
  pipelines: (Pipeline | undefined)[];
  state: Pipeline_State;
}

interface CreateAgentPipelineParams {
  pipelines: PartialMessage<PipelineCreate>[];
}

/**
 * Custom hook that creates multiple pipelines in parallel from YAML templates
 * Each key in the pipelines object becomes the display name for that pipeline
 */
export const useCreateAgentPipelinesMutation = () => {
  const queryClient = useQueryClient();
  const createPipelineMutation = useMutation(createPipeline);

  return {
    ...createPipelineMutation,
    mutate: async ({ pipelines }: CreateAgentPipelineParams) => {
      return createAgentPipelinesPromises({ queryClient, createPipelineMutation, pipelines });
    },
    mutateAsync: async ({ pipelines }: CreateAgentPipelineParams) => {
      return createAgentPipelinesPromises({ queryClient, createPipelineMutation, pipelines });
    },
  };
};

interface CreateAgentPipelinesPromisesProps {
  queryClient: QueryClient;
  createPipelineMutation: UseMutationResult<
    CreatePipelineResponse,
    ConnectError,
    PartialMessage<CreatePipelineRequest>,
    unknown
  >;
  pipelines: PartialMessage<PipelineCreate>[];
}

const createAgentPipelinesPromises = async ({
  queryClient,
  createPipelineMutation,
  pipelines,
}: CreateAgentPipelinesPromisesProps) => {
  const agentId = uuidv4();

  try {
    const createPipelinePromises = [];

    // Use for loop instead of .map() to ensure the Promises are registered properly
    for (const pipeline of pipelines) {
      const createPipelinePromise = createPipelineMutation.mutateAsync(
        new CreatePipelineRequest({
          request: new CreatePipelineRequestDataPlane({
            pipeline: new PipelineCreate({
              ...pipeline,
              tags: {
                ...pipeline.tags,
                __redpanda_cloud_pipeline_type: 'agent',
                __redpanda_cloud_agent_id: agentId,
              },
            }),
          }),
        }),
      );

      createPipelinePromises.push(createPipelinePromise);
    }

    const results = await Promise.all(createPipelinePromises);

    await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });

    // Show success toast
    showToast({
      id: TOASTS.AGENT.CREATE_PIPELINES.SUCCESS,
      title: 'Agent pipelines created successfully',
      status: 'success',
    });

    return results;
  } catch (error) {
    const connectError = ConnectError.from(error);
    showToast({
      id: TOASTS.AGENT.CREATE_PIPELINES.ERROR,
      title: formatToastErrorMessageGRPC({ error: connectError, action: 'create', entity: 'agent pipelines' }),
      status: 'error',
    });
  }
};

/**
 * @description WORKAROUND: There is no "Agent" service, so we need to list all pipelines, filter them by a correct tag, and finally construct our own "Agent" object
 * Consider creating a dedicated "Agent" service in the future
 */
export const useGetAgentQuery = ({ id }: { id: string }) => {
  const listAgentsResult = useListAgentsQuery();

  const agent = listAgentsResult?.data?.agents?.find((agent) => agent?.id === id);

  return {
    ...listAgentsResult,
    data: {
      agent,
    },
    queryKey: [listPipelines.service.typeName], // Return queryKey for manual invalidation
  };
};

/**
 * @description WORKAROUND: There is no "Agent" service, so we need to list all pipelines, filter them by a correct tag, and finally construct our own "Agent" object
 * Consider creating a dedicated "Agent" service in the future
 */
export const useListAgentsQuery = (
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
    //     __redpanda_cloud_pipeline_type: 'agent',
    //   },
    // }),
    ...input,
  });

  const listPipelinesRequest = new ListPipelinesRequest({
    request: listPipelinesRequestDataPlane,
  }) as PartialMessage<ListPipelinesRequest> & Required<Pick<PartialMessage<ListPipelinesRequest>, 'request'>>;

  const listAgentsResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
  });

  const allRetrievedPipelines = listAgentsResult?.data?.pages?.flatMap(({ response }) => response?.pipelines);

  // // TODO: Remove once nameContains is not required anymore
  const filteredAgentPipelines = allRetrievedPipelines?.filter(
    (agent) => agent?.tags?.__redpanda_cloud_pipeline_type === 'agent',
  );

  const uniqueAgentIds = [
    ...new Set(filteredAgentPipelines?.map((pipeline) => pipeline?.tags?.__redpanda_cloud_agent_id)),
  ];

  const agents: Agent[] = uniqueAgentIds?.map((agentId) => {
    const pipelines =
      filteredAgentPipelines?.filter((pipeline) => pipeline?.tags?.__redpanda_cloud_agent_id === agentId) ?? [];

    return {
      id: agentId ?? '',
      displayName: pipelines?.[0]?.tags?.__redpanda_cloud_agent_name ?? '',
      description: pipelines?.[0]?.tags?.__redpanda_cloud_agent_description ?? '',
      pipelines,
      state: getAgentState(pipelines.map((pipeline) => pipeline?.state ?? Pipeline_State.UNSPECIFIED)),
    };
  });

  return {
    ...listAgentsResult,
    data: {
      agents,
    },
  };
};

const getAgentState = (pipelineStates: Pipeline_State[]) => {
  if (pipelineStates.every((pipelineState) => pipelineState === Pipeline_State.RUNNING)) {
    return Pipeline_State.RUNNING;
  }
  if (pipelineStates.every((pipelineState) => pipelineState === Pipeline_State.STOPPED)) {
    return Pipeline_State.STOPPED;
  }

  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.ERROR)) {
    return Pipeline_State.ERROR;
  }

  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.STARTING)) {
    return Pipeline_State.STARTING;
  }

  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.STOPPING)) {
    return Pipeline_State.STOPPING;
  }

  return Pipeline_State.UNSPECIFIED;
};

interface DeleteAgentPipelinesPromisesProps {
  queryClient: QueryClient;
  deletePipelineMutation: UseMutationResult<
    DeletePipelineResponse,
    ConnectError,
    PartialMessage<DeletePipelineRequest>,
    unknown
  >;
  pipelines: PartialMessage<Pipeline>[];
}

const deleteAgentPipelinesPromises = async ({
  queryClient,
  deletePipelineMutation,
  pipelines,
}: DeleteAgentPipelinesPromisesProps) => {
  try {
    const deletePipelinePromises = [];

    // Use for loop instead of .map() to ensure the Promises are registered properly
    for (const pipeline of pipelines) {
      const deletePipelinePromise = deletePipelineMutation.mutateAsync(
        new DeletePipelineRequest({
          request: new DeletePipelineRequestDataPlane({
            id: pipeline.id,
          }),
        }),
      );

      deletePipelinePromises.push(deletePipelinePromise);
    }

    const results = await Promise.all(deletePipelinePromises);

    await queryClient.invalidateQueries({ queryKey: [listPipelines.service.typeName] });

    // Show success toast
    showToast({
      id: TOASTS.AGENT.DELETE_PIPELINES.SUCCESS,
      title: 'Agent pipelines deleted successfully',
      status: 'success',
    });

    return results;
  } catch (error) {
    const connectError = ConnectError.from(error);
    showToast({
      id: TOASTS.AGENT.DELETE_PIPELINES.ERROR,
      title: formatToastErrorMessageGRPC({ error: connectError, action: 'delete', entity: 'agent pipelines' }),
      status: 'error',
    });
  }
};

interface DeleteAgentPipelineParams {
  pipelines: PartialMessage<Pipeline>[];
}

/**
 * Custom hook that deletes multiple pipelines in parallel belonging to an agent.
 */
export const useDeleteAgentPipelinesMutation = () => {
  const queryClient = useQueryClient();
  const deletePipelineMutation = useMutation(deletePipeline);

  return {
    ...deletePipelineMutation,
    mutate: async ({ pipelines }: DeleteAgentPipelineParams) => {
      await deleteAgentPipelinesPromises({ queryClient, deletePipelineMutation, pipelines });
    },
    // For compatibility with both mutate and mutateAsync
    mutateAsync: async ({ pipelines }: DeleteAgentPipelineParams) => {
      await deleteAgentPipelinesPromises({ queryClient, deletePipelineMutation, pipelines });
    },
  };
};
