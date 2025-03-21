import { createRouterTransport } from '@connectrpc/connect';
import { deletePipeline } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { DeletePipelineRequest } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { DeletePipelineRequest as DeletePipelineRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { DeleteAgentModal } from './delete-agent-modal';

describe('DeleteAgentModal', () => {
  test('should let the user delete an agent after entering confirmation text', async () => {
    const agentId = 'AGENT_ID';
    const agentName = 'agent name';

    const deletePipelineMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(deletePipeline, deletePipelineMock);
    });

    render(<DeleteAgentModal agentId={agentId} agentName={agentName} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
    });

    fireEvent.click(screen.getByTestId('delete-agent-button'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
      expect(screen.getByTestId('delete-agent-button')).toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('txt-confirmation-delete'), { target: { value: agentName } });

    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-button')).toBeVisible();
      expect(screen.getByTestId('delete-agent-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('delete-agent-button'));

    // Verify that the delete mutation was called with the correct parameters
    await waitFor(() => {
      expect(deletePipelineMock).toHaveBeenCalledTimes(1);
      expect(deletePipelineMock).toHaveBeenCalledWith(
        new DeletePipelineRequest({
          request: new DeletePipelineRequestDataPlane({
            id: agentId,
          }),
        }),
        expect.anything(),
      );
    });
  });
});
