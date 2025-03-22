import { createRouterTransport } from '@connectrpc/connect';
import {
  createPipeline,
  listPipelines,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { CreatePipelineRequest } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequest as CreatePipelineRequestDataPlane,
  CreatePipelineResponse,
  ListPipelinesResponse,
  PipelineCreate,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { connectQueryWrapper, renderHook, waitFor } from 'test-utils';
import { useCreateAgentPipelinesMutation } from './agent';

describe('Agent API wrapper', () => {
  test('useCreateAgentPipelinesMutation should trigger mutations for multiple pipelines for the agent', async () => {
    const firstPipeline = new PipelineCreate({
      displayName: 'firstPipeline',
      description: 'firstPipeline',
      configYaml: 'firstPipeline',
    });
    const secondPipeline = new PipelineCreate({
      displayName: 'secondPipeline',
      description: 'secondPipeline',
      configYaml: 'secondPipeline',
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
            pipeline: pipelines[0],
          }),
        }),
        expect.anything(),
      );
      expect(createPipelineMock).toHaveBeenNthCalledWith(
        2,
        new CreatePipelineRequest({
          request: new CreatePipelineRequestDataPlane({
            pipeline: pipelines[1],
          }),
        }),
        expect.anything(),
      );
    });
  });
});
