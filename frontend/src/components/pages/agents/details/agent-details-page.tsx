import { Button, ButtonGroup, Flex, Spinner, Stack, Tabs, Text, useDisclosure } from '@redpanda-data/ui';
import type { TabsItemProps } from '@redpanda-data/ui/dist/components/Tabs/Tabs';
import { runInAction } from 'mobx';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect } from 'react';
import { REDPANDA_AI_AGENT_PIPELINE_PREFIX, useGetPipelineQuery } from 'react-query/api/pipeline';
import { useHistory, useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { DeleteAgentModal } from '../delete-agent-modal';
import { AgentChatTab } from './agent-chat-tab';
import { AgentPipelineTab } from './agent-pipeline-tab';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = ({ agent }: { agent: Pipeline | undefined }) => {
  const nameWithoutPrefix = agent?.displayName.replace(REDPANDA_AI_AGENT_PIPELINE_PREFIX, '') ?? '';
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
  const { agentId } = useParams<{ agentId: Pipeline['id'] }>();
  const { data: agentData, isLoading: isAgentDataLoading } = useGetPipelineQuery({ id: agentId });

  const agent = agentData?.response?.pipeline;

  const {
    isOpen: isDeleteAgentModalOpen,
    onOpen: onDeleteAgentModalOpen,
    onClose: onDeleteAgentModalClose,
  } = useDisclosure();

  useEffect(() => {
    updatePageTitle({ agent });
  }, [agent]);

  const history = useHistory();

  if (isAgentDataLoading) {
    <Flex justifyContent="center" padding={8}>
      <Spinner size="lg" />
    </Flex>;
  }

  const tabs: TabsItemProps[] = [
    {
      key: 'chat',
      name: 'Chat',
      component: <AgentChatTab />,
    },
    // TODO: Update once pipelines are grouped together by tag
    {
      key: 'agent',
      name: 'Agent',
      component: <AgentPipelineTab agent={agent} />,
    },
  ];

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>{agent?.description}</Text>
          <ButtonGroup>
            <Button
              variant="solid"
              onClick={() => {
                history.push(`/rp-connect/${agentId}/edit`);
              }}
              data-testid="edit-agent-button"
            >
              Edit
            </Button>
            <TogglePipelineStateButton agent={agent} />
            <Button
              variant="outline-delete"
              onClick={() => {
                onDeleteAgentModalOpen();
              }}
              data-testid="delete-agent-button"
            >
              Delete
            </Button>
          </ButtonGroup>
        </Stack>
        <Tabs items={tabs} />
      </Stack>
      <DeleteAgentModal
        isOpen={isDeleteAgentModalOpen}
        onClose={onDeleteAgentModalClose}
        agentId={agentId}
        agentName={agent?.displayName ?? ''}
      />
    </>
  );
};
