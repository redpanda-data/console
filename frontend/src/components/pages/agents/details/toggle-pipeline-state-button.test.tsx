import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import {
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  startPipeline,
  stopPipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  Pipeline_State,
  PipelineSchema,
  StartPipelineRequestSchema as StartPipelineRequestSchemaDataPlane,
  StopPipelineRequestSchema as StopPipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';

describe('TogglePipelineStateButton', () => {
  test('should start the pipeline', async () => {
    const pipeline = create(PipelineSchema, {
      id: 'pipeline-id',
      displayName: 'pipeline-name',
      state: Pipeline_State.STOPPED,
    });

    const startPipelineMock = vi.fn().mockReturnValue({});
    const stopPipelineMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(startPipeline, startPipelineMock);
      rpc(stopPipeline, stopPipelineMock);
    });

    render(<TogglePipelineStateButton pipeline={pipeline} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toBeVisible();
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toBeEnabled();
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toHaveTextContent('Start');
    });

    fireEvent.click(screen.getByTestId('toggle-start-stop-pipeline-button'));

    await waitFor(() => {
      expect(startPipelineMock).toHaveBeenCalled();
      expect(startPipelineMock).toHaveBeenCalledWith(
        create(StartPipelineRequestSchema, {
          request: create(StartPipelineRequestSchemaDataPlane, {
            id: pipeline.id,
          }),
        }),
        expect.anything(),
      );
    });
  });

  test('should stop the pipeline', async () => {
    const pipeline = create(PipelineSchema, {
      id: 'pipeline-id',
      displayName: 'pipeline-name',
      state: Pipeline_State.RUNNING,
    });

    const startPipelineMock = vi.fn().mockReturnValue({});
    const stopPipelineMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(startPipeline, startPipelineMock);
      rpc(stopPipeline, stopPipelineMock);
    });

    render(<TogglePipelineStateButton pipeline={pipeline} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toBeVisible();
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toBeEnabled();
      expect(screen.getByTestId('toggle-start-stop-pipeline-button')).toHaveTextContent('Stop');
    });

    fireEvent.click(screen.getByTestId('toggle-start-stop-pipeline-button'));

    await waitFor(() => {
      expect(stopPipelineMock).toHaveBeenCalled();
      expect(stopPipelineMock).toHaveBeenCalledWith(
        create(StopPipelineRequestSchema, {
          request: create(StopPipelineRequestSchemaDataPlane, {
            id: pipeline.id,
          }),
        }),
        expect.anything(),
      );
    });
  });
});
