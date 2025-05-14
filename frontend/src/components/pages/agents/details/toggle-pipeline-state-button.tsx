import { Button, HStack, Spinner, Text } from '@redpanda-data/ui';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';

interface TogglePipelineStateButtonProps {
  pipeline?: Pipeline;
}

export const TogglePipelineStateButton = ({ pipeline }: TogglePipelineStateButtonProps) => {
  const { mutateAsync: stopPipeline, isPending: isStopPipelinePending } = useStopPipelineMutation();
  const { mutateAsync: startPipeline, isPending: isStartPipelinePending } = useStartPipelineMutation();

  const isPending = isStopPipelinePending || isStartPipelinePending;
  const isTransitioning = pipeline?.state === Pipeline_State.STOPPING || pipeline?.state === Pipeline_State.STARTING;

  const getButtonText = () => {
    if (isStopPipelinePending) {
      return 'Stopping';
    }
    if (isStartPipelinePending) {
      return 'Starting';
    }

    switch (pipeline?.state) {
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

  if (pipeline?.state === Pipeline_State.UNSPECIFIED) {
    return null;
  }

  return (
    <Button
      variant="outline"
      onClick={async () => {
        switch (pipeline?.state) {
          case Pipeline_State.RUNNING: {
            await stopPipeline({ request: { id: pipeline?.id } });
            break;
          }

          case Pipeline_State.STOPPED: {
            await startPipeline({ request: { id: pipeline?.id } });
            break;
          }
        }
      }}
      isDisabled={isPending || isTransitioning}
      data-testid="toggle-start-stop-pipeline-button"
    >
      <HStack spacing={1}>
        {(isPending || isTransitioning) && <Spinner size="sm" />}
        <Text>{getButtonText()}</Text>
      </HStack>
    </Button>
  );
};
