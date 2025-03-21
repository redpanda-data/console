import { Button, HStack, Spinner, Text } from '@redpanda-data/ui';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useStartPipelineMutationWithToast, useStopPipelineMutationWithToast } from 'react-query/api/pipeline';

interface TogglePipelineStateButtonProps {
  agent?: Pipeline;
}

export const TogglePipelineStateButton = ({ agent }: TogglePipelineStateButtonProps) => {
  const { mutateAsync: stopAgent, isPending: isStopAgentPending } = useStopPipelineMutationWithToast();
  const { mutateAsync: startAgent, isPending: isStartAgentPending } = useStartPipelineMutationWithToast();

  const isPending = isStopAgentPending || isStartAgentPending;
  const isTransitioning = agent?.state === Pipeline_State.STOPPING || agent?.state === Pipeline_State.STARTING;

  const getButtonText = () => {
    if (isStopAgentPending) {
      return 'Stopping';
    }
    if (isStartAgentPending) {
      return 'Starting';
    }

    switch (agent?.state) {
      case Pipeline_State.STOPPING:
        return 'Stopping';
      case Pipeline_State.STARTING:
        return 'Starting';
      case Pipeline_State.RUNNING:
        return 'Stop';
      case Pipeline_State.STOPPED:
        return 'Start';
      case Pipeline_State.COMPLETED:
        return 'Completed';
      case Pipeline_State.ERROR:
        return 'Error';
      case Pipeline_State.UNSPECIFIED:
        return 'Unknown';
    }
  };

  return (
    <Button
      variant="outline"
      onClick={async () => {
        switch (agent?.state) {
          case Pipeline_State.RUNNING: {
            await stopAgent({ request: { id: agent?.id } });
            break;
          }

          case Pipeline_State.STOPPED: {
            await startAgent({ request: { id: agent?.id } });
            break;
          }
        }
      }}
      isDisabled={isPending || isTransitioning}
      data-testid="toggle-start-stop-agent-button"
    >
      <HStack spacing={1}>
        {(isPending || isTransitioning) && <Spinner size="sm" />}
        <Text>{getButtonText()}</Text>
      </HStack>
    </Button>
  );
};
