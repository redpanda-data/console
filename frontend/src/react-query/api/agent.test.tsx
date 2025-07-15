import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import {
  CreatePipelineRequestSchema,
  CreatePipelineResponseSchema,
  DeletePipelineRequestSchema,
  DeletePipelineResponseSchema,
  ListPipelinesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  createPipeline,
  deletePipeline,
  listPipelines,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  DeletePipelineRequestSchema as DeletePipelineRequestSchemaDataPlane,
  Pipeline_State,
  PipelineCreateSchema,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { connectQueryWrapper, renderHook, waitFor } from 'test-utils';
import { useCreateAgentPipelinesMutation, useDeleteAgentPipelinesMutation } from './agent';

describe('Agent API wrapper', () => {
  test('useCreateAgentPipelinesMutation should create multiple pipelines for the agent and add internal tags', async () => {
    const firstPipeline = create(PipelineCreateSchema, {
      displayName: 'firstPipeline',
      description: 'firstPipelineDescription',
      configYaml: 'firstPipeline',
      tags: {
        __redpanda_cloud_agent_name: 'agent',
        __redpanda_cloud_agent_description: 'description',
      },
    });
    const secondPipeline = create(PipelineCreateSchema, {
      displayName: 'secondPipeline',
      description: 'secondPipelineDescription',
      configYaml: 'secondPipeline',
      tags: {
        __redpanda_cloud_agent_name: 'agent',
        __redpanda_cloud_agent_description: 'description',
      },
    });

    const pipelines = [firstPipeline, secondPipeline];

    const createPipelineMock = vi.fn().mockReturnValue(create(CreatePipelineResponseSchema));

    const listPipelinesMock = vi.fn().mockReturnValue(
      create(ListPipelinesResponseSchema, {
        pipelines,
      }),
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, listPipelinesMock);
      rpc(createPipeline, createPipelineMock);
    });

    const { result } = renderHook(
      () => {
        return useCreateAgentPipelinesMutation();
      },
      connectQueryWrapper({}, transport),
    );

    const agentId = 'agent-id';

    result.current.mutateAsync({ pipelines, agentId });

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalledTimes(pipelines.length);
      expect(createPipelineMock).toHaveBeenNthCalledWith(
        1,
        create(CreatePipelineRequestSchema, {
          request: create(CreatePipelineRequestSchemaDataPlane, {
            pipeline: {
              ...firstPipeline,
              tags: {
                ...firstPipeline.tags,
                __redpanda_cloud_agent_id: agentId,
                __redpanda_cloud_pipeline_type: 'agent',
              },
            },
          }),
        }),
        expect.anything(),
      );
      expect(createPipelineMock).toHaveBeenNthCalledWith(
        2,
        create(CreatePipelineRequestSchema, {
          request: create(CreatePipelineRequestSchemaDataPlane, {
            pipeline: {
              ...secondPipeline,
              tags: {
                ...secondPipeline.tags,
                __redpanda_cloud_agent_id: agentId,
                __redpanda_cloud_pipeline_type: 'agent',
              },
            },
          }),
        }),
        expect.anything(),
      );
    });
  });

  test('useDeleteAgentPipelinesMutation should delete multiple pipelines for the agent', async () => {
    const agentId = 'agent-id';

    const firstPipeline = create(PipelineSchema, {
      id: 'id-1',
      displayName: 'firstPipeline',
      state: Pipeline_State.RUNNING,
      configYaml: 'firstPipeline',
      tags: {
        __redpanda_cloud_agent_id: agentId,
        __redpanda_cloud_pipeline_type: 'agent',
      },
    });
    const secondPipeline = create(PipelineSchema, {
      id: 'id-2',
      displayName: 'secondPipeline',
      state: Pipeline_State.RUNNING,
      configYaml: 'secondPipeline',
      tags: {
        __redpanda_cloud_agent_id: agentId,
        __redpanda_cloud_pipeline_type: 'agent',
      },
    });

    const pipelines = [firstPipeline, secondPipeline];

    const deletePipelineMock = vi.fn().mockReturnValue(create(DeletePipelineResponseSchema));

    const listPipelinesMock = vi.fn().mockReturnValue(
      create(ListPipelinesResponseSchema, {
        pipelines,
      }),
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, listPipelinesMock);
      rpc(deletePipeline, deletePipelineMock);
    });

    const { result } = renderHook(
      () => {
        return useDeleteAgentPipelinesMutation();
      },
      connectQueryWrapper({}, transport),
    );

    result.current.mutateAsync({ pipelines });

    await waitFor(() => {
      expect(deletePipelineMock).toHaveBeenCalledTimes(pipelines.length);
      expect(deletePipelineMock).toHaveBeenNthCalledWith(
        1,
        create(DeletePipelineRequestSchema, {
          request: create(DeletePipelineRequestSchemaDataPlane, { id: firstPipeline.id }),
        }),
        expect.anything(),
      );
      expect(deletePipelineMock).toHaveBeenNthCalledWith(
        2,
        create(DeletePipelineRequestSchema, {
          request: create(DeletePipelineRequestSchemaDataPlane, { id: secondPipeline.id }),
        }),
        expect.anything(),
      );
    });
  });
});
