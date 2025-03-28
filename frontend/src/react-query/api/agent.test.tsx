import { createRouterTransport } from '@connectrpc/connect';
import {
  createPipeline,
  deletePipeline,
  listPipelines,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { CreatePipelineRequest, DeletePipelineRequest } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequest as CreatePipelineRequestDataPlane,
  CreatePipelineResponse,
  DeletePipelineRequest as DeletePipelineRequestDataPlane,
  DeletePipelineResponse,
  ListPipelinesResponse,
  Pipeline,
  PipelineCreate,
  Pipeline_State,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { connectQueryWrapper, renderHook, waitFor } from 'test-utils';
import { useCreateAgentPipelinesMutation, useDeleteAgentPipelinesMutation } from './agent';

describe('Agent API wrapper', () => {
  test('useCreateAgentPipelinesMutation should create multiple pipelines for the agent and add internal tags', async () => {
    const firstPipeline = new PipelineCreate({
      displayName: 'firstPipeline',
      description: 'firstPipelineDescription',
      configYaml: 'firstPipeline',
      tags: {
        __redpanda_cloud_agent_name: 'agent',
        __redpanda_cloud_agent_description: 'description',
      },
    });
    const secondPipeline = new PipelineCreate({
      displayName: 'secondPipeline',
      description: 'secondPipelineDescription',
      configYaml: 'secondPipeline',
      tags: {
        __redpanda_cloud_agent_name: 'agent',
        __redpanda_cloud_agent_description: 'description',
      },
    });

    const pipelines = [firstPipeline, secondPipeline];

    const createPipelineMock = vi.fn().mockReturnValue(new CreatePipelineResponse({}));

    const listPipelinesMock = vi.fn().mockReturnValue(
      new ListPipelinesResponse({
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

    result.current.mutateAsync({ pipelines });

    await waitFor(() => {
      expect(createPipelineMock).toHaveBeenCalledTimes(pipelines.length);
      expect(createPipelineMock).toHaveBeenNthCalledWith(
        1,
        new CreatePipelineRequest({
          request: new CreatePipelineRequestDataPlane({
            pipeline: {
              ...firstPipeline,
              tags: {
                ...firstPipeline.tags,
                __redpanda_cloud_agent_id: expect.any(String),
                __redpanda_cloud_pipeline_type: 'agent',
              },
            },
          }),
        }),
        expect.anything(),
      );
      expect(createPipelineMock).toHaveBeenNthCalledWith(
        2,
        new CreatePipelineRequest({
          request: new CreatePipelineRequestDataPlane({
            pipeline: {
              ...secondPipeline,
              tags: {
                ...secondPipeline.tags,
                __redpanda_cloud_agent_id: expect.any(String),
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
    const firstPipeline = new Pipeline({
      id: 'id-1',
      displayName: 'firstPipeline',
      state: Pipeline_State.RUNNING,
      configYaml: 'firstPipeline',
      tags: {
        __redpanda_cloud_agent_id: 'agent-id',
      },
    });
    const secondPipeline = new Pipeline({
      id: 'id-2',
      displayName: 'secondPipeline',
      state: Pipeline_State.RUNNING,
      configYaml: 'secondPipeline',
      tags: {
        __redpanda_cloud_agent_id: 'agent-id',
      },
    });

    const pipelines = [firstPipeline, secondPipeline];

    const deletePipelineMock = vi.fn().mockReturnValue(new DeletePipelineResponse({}));

    const listPipelinesMock = vi.fn().mockReturnValue(
      new ListPipelinesResponse({
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
        new DeletePipelineRequest({
          request: new DeletePipelineRequestDataPlane({ id: firstPipeline.id }),
        }),
        expect.anything(),
      );
      expect(deletePipelineMock).toHaveBeenNthCalledWith(
        2,
        new DeletePipelineRequest({
          request: new DeletePipelineRequestDataPlane({ id: secondPipeline.id }),
        }),
        expect.anything(),
      );
    });
  });
});
