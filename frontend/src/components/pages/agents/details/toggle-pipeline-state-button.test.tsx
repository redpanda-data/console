import { createRouterTransport } from '@connectrpc/connect';
import {
  startPipeline,
  stopPipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { StartPipelineRequest, StopPipelineRequest } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  StartPipelineRequest as StartPipelineRequestDataPlane,
  StopPipelineRequest as StopPipelineRequestDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';

describe('TogglePipelineStateButton', () => {
  test('should start the pipeline', async () => {
    const agent = new Pipeline({
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

    render(<TogglePipelineStateButton agent={agent} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toBeVisible();
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toBeEnabled();
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toHaveTextContent('Start');
    });

    fireEvent.click(screen.getByTestId('toggle-start-stop-agent-button'));

    await waitFor(() => {
      expect(startPipelineMock).toHaveBeenCalled();
      expect(startPipelineMock).toHaveBeenCalledWith(
        new StartPipelineRequest({
          request: new StartPipelineRequestDataPlane({
            id: agent.id,
          }),
        }),
        expect.anything(),
      );
    });
  });

  test('should stop the pipeline', async () => {
    const agent = new Pipeline({
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

    render(<TogglePipelineStateButton agent={agent} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toBeVisible();
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toBeEnabled();
      expect(screen.getByTestId('toggle-start-stop-agent-button')).toHaveTextContent('Stop');
    });

    fireEvent.click(screen.getByTestId('toggle-start-stop-agent-button'));

    await waitFor(() => {
      expect(stopPipelineMock).toHaveBeenCalled();
      expect(stopPipelineMock).toHaveBeenCalledWith(
        new StopPipelineRequest({
          request: new StopPipelineRequestDataPlane({
            id: agent.id,
          }),
        }),
        expect.anything(),
      );
    });
  });
});
