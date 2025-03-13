import { Button, ButtonGroup, Flex, HStack, Stack, Text } from '@redpanda-data/ui';
import PipelinesYamlEditor from 'components/misc/PipelinesYamlEditor';
import { runInAction } from 'mobx';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  REDPANDA_AI_AGENT_PIPELINE_PREFIX,
  useDeletePipelineMutationWithToast,
  useGetPipelineQuery,
  useStopPipelineMutationWithToast,
} from 'react-query/api/pipeline';
import { useHistory, useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = ({ agent }: { agent: Pipeline | undefined }) => {
  const nameWithoutPrefix = agent?.displayName.replace(REDPANDA_AI_AGENT_PIPELINE_PREFIX, '');
  runInAction(() => {
    uiState.pageTitle = `Agent ${nameWithoutPrefix}`;
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({
      title: `Agent ${nameWithoutPrefix}`,
      linkTo: `/agents/${agent?.id}`,
      heading: 'Agent Details',
    });
  });
};

export const AgentDetailsPage = () => {
  console.log('AgentDetailsPage');
  const { agentId } = useParams<{ agentId: string }>();
  const { mutateAsync: stopPipeline, isPending: isStopPipelinePending } = useStopPipelineMutationWithToast();
  const { mutateAsync: deletePipeline, isPending: isDeletePipelinePending } = useDeletePipelineMutationWithToast();

  const { data: agentData } = useGetPipelineQuery({ id: agentId });

  updatePageTitle({ agent: agentData?.response?.pipeline });

  const isAgentRunning = agentData?.response?.pipeline?.state === Pipeline_State.RUNNING;

  // Use react-router-dom v5 history object because we don't want to touch MobX state
  const history = useHistory();

  return (
    <Stack spacing={4}>
      <HStack justifyContent="space-between" alignItems="center">
        <Text>{agentData?.response?.pipeline?.description}</Text>
      </HStack>
      <ButtonGroup>
        {isAgentRunning && (
          <Button
            colorScheme="red"
            onClick={async () => {
              if (agentId) {
                await stopPipeline({
                  request: { id: agentId },
                });
              }
            }}
            isLoading={isStopPipelinePending}
            loadingText="Stopping"
            aria-label="Stop Agent"
          >
            Stop Agent
          </Button>
        )}
        <Button
          colorScheme="red"
          onClick={async () => {
            if (agentId) {
              await deletePipeline({
                request: { id: agentId },
              });

              history.push('/agents');
            }
          }}
          isLoading={isDeletePipelinePending}
          loadingText="Deleting"
          aria-label="Delete Agent"
        >
          Delete Agent
        </Button>
      </ButtonGroup>
      <Flex height="500px">
        <PipelinesYamlEditor
          defaultPath="config.yaml"
          path="config.yaml"
          value={agentData?.response?.pipeline?.configYaml}
          options={{
            readOnly: true,
          }}
          language="yaml"
        />
      </Flex>
    </Stack>
  );
};
