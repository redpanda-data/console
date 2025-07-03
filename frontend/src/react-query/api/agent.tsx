import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { type QueryClient, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import {
  type CreatePipelineRequest,
  CreatePipelineRequestSchema,
  type CreatePipelineResponse,
  type DeletePipelineRequest,
  DeletePipelineRequestSchema,
  type DeletePipelineResponse,
  type ListPipelinesRequest,
  ListPipelinesRequestSchema,
  type ListPipelinesResponse,
  PipelineService,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  createPipeline,
  deletePipeline,
  listPipelines,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  DeletePipelineRequestSchema as DeletePipelineRequestSchemaDataPlane,
  ListPipelinesRequest_FilterSchema,
  type ListPipelinesRequest as ListPipelinesRequestDataPlane,
  ListPipelinesRequestSchema as ListPipelinesRequestSchemaDataPlane,
  type Pipeline,
  Pipeline_State,
  type PipelineCreate,
  PipelineCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { isUuid } from 'utils/uuid.utils';

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
  pipelines: MessageInit<PipelineCreate>[];
  agentId: string;
}

/**
 * @description Custom hook that creates multiple pipelines in parallel from YAML templates
 */
export const useCreateAgentPipelinesMutation = () => {
  const queryClient = useQueryClient();
  const createPipelineMutation = useMutation(createPipeline);

  return {
    ...createPipelineMutation,
    mutate: async ({ pipelines, agentId }: CreateAgentPipelineParams) => {
      return createAgentPipelinesPromises({ queryClient, createPipelineMutation, pipelines, agentId });
    },
    mutateAsync: async ({ pipelines, agentId }: CreateAgentPipelineParams) => {
      return createAgentPipelinesPromises({ queryClient, createPipelineMutation, pipelines, agentId });
    },
  };
};

interface CreateAgentPipelinesPromisesProps {
  queryClient: QueryClient;
  createPipelineMutation: UseMutationResult<
    CreatePipelineResponse,
    ConnectError,
    MessageInit<CreatePipelineRequest>,
    unknown
  >;
  pipelines: MessageInit<PipelineCreate>[];
  agentId: string;
}

const createAgentPipelinesPromises = async ({
  queryClient,
  createPipelineMutation,
  pipelines,
  agentId,
}: CreateAgentPipelinesPromisesProps) => {
  try {
    const createPipelinePromises = [];

    // Use for loop instead of .map() to ensure the Promises are registered properly
    for (const pipeline of pipelines) {
      const createPipelinePromise = createPipelineMutation.mutateAsync(
        create(CreatePipelineRequestSchema, {
          request: create(CreatePipelineRequestSchemaDataPlane, {
            pipeline: create(PipelineCreateSchema, {
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

    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: PipelineService.method.listPipelines,
        cardinality: 'infinite',
      }),
    });

    return results;
  } catch (error) {
    const connectError = ConnectError.from(error);
    return formatToastErrorMessageGRPC({
      error: connectError,
      action: 'create',
      entity: 'agent pipelines',
    });
  }
};

export const useGetAgentQuery = (
  {
    id,
  }: {
    id: string;
  },
  options: QueryOptions<GenMessage<ListPipelinesRequest>, ListPipelinesResponse> & {
    refetchInterval?: number | false; // TODO: Fix, current workaround for refetching infinite query options for list endpoints
    refetchIntervalInBackground?: boolean;
    refetchOnWindowFocus?: 'always' | boolean;
  },
) => {
  const listAgentsResult = useListAgentsQuery(undefined, {
    refetchInterval: options.refetchInterval,
    enabled: options.enabled || (id !== '' && isUuid(id)),
  });

  const agent = listAgentsResult?.data?.agents?.find((agent) => agent?.id === id);

  return {
    ...listAgentsResult,
    data: {
      agent,
    },
  };
};

/**
 * @description WORKAROUND: There is no "Agent" service, so we need to list all pipelines, filter them by a correct tag, and finally construct our own "Agent" object
 * Consider creating a dedicated "Agent" service in the future
 */
export const useListAgentsQuery = (
  input?: MessageInit<ListPipelinesRequestDataPlane>,
  // TODO: Use QueryObserverOptions?
  options?: QueryOptions<GenMessage<ListPipelinesRequest>, ListPipelinesResponse> & {
    refetchInterval?: number | false;
  },
) => {
  // Ensure name contains is only used if a string is provided. It has to match the agent name exactly.
  // We cannot use nameContains for filtering pipeline name because the name of the agent is stored as a tag, not pipeline name.
  // TODO: Once dedicated "agent service" exists, we can use agentName for that endpoint to filter by agent name.
  const agentName = input?.filter?.nameContains;

  const listPipelinesRequestFilter = create(ListPipelinesRequest_FilterSchema, {
    tags: agentName
      ? {
          __redpanda_cloud_pipeline_type: 'agent',
          __redpanda_cloud_agent_name: agentName,
        }
      : {
          __redpanda_cloud_pipeline_type: 'agent',
        },
  });

  const listPipelinesRequestDataPlane = create(ListPipelinesRequestSchemaDataPlane, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    filter: listPipelinesRequestFilter,
  });

  const listPipelinesRequest = create(ListPipelinesRequestSchema, {
    request: listPipelinesRequestDataPlane,
  }) as MessageInit<ListPipelinesRequest> & Required<Pick<MessageInit<ListPipelinesRequest>, 'request'>>;

  const listAgentsResult = useInfiniteQueryWithAllPages(listPipelines, listPipelinesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    // Required because of protobuf v2 reflection - it does not accept foreign fields when nested under "request", so the format needs to be a dataplane schema
    getNextPageParam: (lastPage) =>
      lastPage?.response?.nextPageToken
        ? {
            ...listPipelinesRequestDataPlane,
            pageToken: lastPage.response?.nextPageToken,
          }
        : undefined,
  });

  const allRetrievedPipelines = listAgentsResult?.data?.pages?.flatMap(({ response }) => response?.pipelines);

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
  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.STARTING)) {
    return Pipeline_State.STARTING;
  }
  if (pipelineStates.every((pipelineState) => pipelineState === Pipeline_State.RUNNING)) {
    return Pipeline_State.RUNNING;
  }
  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.STOPPING)) {
    return Pipeline_State.STOPPING;
  }
  if (pipelineStates.every((pipelineState) => pipelineState === Pipeline_State.STOPPED)) {
    return Pipeline_State.STOPPED;
  }
  if (pipelineStates.some((pipelineState) => pipelineState === Pipeline_State.ERROR)) {
    return Pipeline_State.ERROR;
  }
  if (pipelineStates.every((pipelineState) => pipelineState === Pipeline_State.COMPLETED)) {
    return Pipeline_State.COMPLETED;
  }

  return Pipeline_State.UNSPECIFIED;
};

interface DeleteAgentPipelinesPromisesProps {
  queryClient: QueryClient;
  deletePipelineMutation: UseMutationResult<
    DeletePipelineResponse,
    ConnectError,
    MessageInit<DeletePipelineRequest>,
    unknown
  >;
  pipelines: MessageInit<Pipeline>[];
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
        create(DeletePipelineRequestSchema, {
          request: create(DeletePipelineRequestSchemaDataPlane, {
            id: pipeline.id,
          }),
        }),
      );

      deletePipelinePromises.push(deletePipelinePromise);
    }

    const results = await Promise.all(deletePipelinePromises);

    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: PipelineService.method.listPipelines,
        cardinality: 'infinite',
      }),
    });

    return results;
  } catch (error) {
    const connectError = ConnectError.from(error);
    return formatToastErrorMessageGRPC({
      error: connectError,
      action: 'delete',
      entity: 'agent pipelines',
    });
  }
};

interface DeleteAgentPipelineParams {
  pipelines: MessageInit<Pipeline>[];
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
