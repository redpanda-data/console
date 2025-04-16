import { createRouterTransport } from '@connectrpc/connect';
import { deletePipeline } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { DeletePipelineRequest } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  DeletePipelineRequest as DeletePipelineRequestDataPlane,
  Pipeline,
  Pipeline_State,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { Agent } from 'react-query/api/agent';
import { fireEvent, renderWithRouter, screen, waitFor } from 'test-utils';
import { DeleteAgentModal } from './delete-agent-modal';

describe('DeleteAgentModal', () => {
  test('should let the user delete an agent after entering confirmation text', async () => {
    const agent: Agent = {
      id: 'agent-id',
      displayName: 'agent-name',
      description: 'agent-description',
      pipelines: [new Pipeline({ id: 'pipeline-id', state: Pipeline_State.RUNNING })],
      state: Pipeline_State.RUNNING,
    };

    const deletePipelineMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(deletePipeline, deletePipelineMock);
    });

    renderWithRouter(<DeleteAgentModal agent={agent} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
    });

    fireEvent.click(screen.getByTestId('delete-agent-button'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
      expect(screen.getByTestId('delete-agent-button')).toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('txt-confirmation-delete'), { target: { value: agent.displayName } });

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
      expect(screen.getByTestId('delete-agent-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('delete-agent-button'));

    await waitFor(() => {
      expect(deletePipelineMock).toHaveBeenCalledTimes(1);
      expect(deletePipelineMock).toHaveBeenCalledWith(
        new DeletePipelineRequest({
          request: new DeletePipelineRequestDataPlane({
            id: agent.pipelines[0]?.id,
          }),
        }),
        expect.anything(),
      );
    });
  });
});
