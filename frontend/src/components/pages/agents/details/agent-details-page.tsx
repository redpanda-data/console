import { Button, ButtonGroup, Flex, Spinner, Stack, Tabs, Text, useDisclosure } from '@redpanda-data/ui';
import type { TabsItemProps } from '@redpanda-data/ui/dist/components/Tabs/Tabs';
import { NotFoundPage } from 'components/misc/not-found-page';
import { runInAction } from 'mobx';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useState } from 'react';
import { type Agent, useGetAgentQuery } from 'react-query/api/agent';
import { useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { capitalizeFirst } from 'utils/utils';
import { isUuid } from 'utils/uuid.utils';
import { DeleteAgentModal } from '../delete-agent-modal';
import { AgentPipelineTab } from './agent-pipeline-tab';
import { AgentChatTab } from './chat/agent-chat-tab';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = ({ agent }: { agent: Agent }) => {
  runInAction(() => {
    uiState.pageTitle = `Agent ${agent?.displayName}`;
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({
      title: `Agent ${agent?.displayName}`,
      linkTo: `/agents/${agent?.id}`,
      heading: 'Agent Details',
    });
  });
};

export const AGENT_POLLING_INTERVAL = 5_000; // 5 seconds

export const AgentDetailsPage = () => {
  const { agentId } = useParams<{ agentId: Pipeline['id'] }>();
  const [agentIsRunning, setAgentIsRunning] = useState(false);

  const { data: agentData, isLoading: isAgentDataLoading } = useGetAgentQuery(
    {
      id: agentId,
    },
    {
      refetchInterval: agentIsRunning ? false : AGENT_POLLING_INTERVAL,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: 'always',
    },
  );


  useEffect(() => {
    if (!agentIsRunning && agentData?.agent?.state === Pipeline_State.RUNNING) {
      setAgentIsRunning(true);
    }
  }, [agentData?.agent?.state, agentIsRunning]);

  const {
    isOpen: isDeleteAgentModalOpen,
    onOpen: onDeleteAgentModalOpen,
    onClose: onDeleteAgentModalClose,
  } = useDisclosure();

  useEffect(() => {
    if (agentData?.agent) {
      updatePageTitle({ agent: agentData?.agent });
    }
  }, [agentData?.agent]);

  if (isAgentDataLoading) {
    return (
      <Flex justifyContent="center" padding={8}>
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!agentData?.agent || !isUuid(agentId)) {
    return <NotFoundPage />;
  }

  const matchingPipeline = agentData?.agent?.pipelines?.find(
    (pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_purpose === 'gateway-chat-api' || pipeline?.url !== '',
  );

  const chatTab = {
    key: 'chat',
    name: 'Chat',
    component: <AgentChatTab agent={matchingPipeline} />,
  };

  const pipelineTabs = (agentData?.agent?.pipelines ?? []).map((pipeline) => ({
    key: pipeline?.id ?? '',
    name: capitalizeFirst(pipeline?.displayName ?? ''),
    component: <AgentPipelineTab pipeline={pipeline} />,
  }));

  const tabs: TabsItemProps[] = matchingPipeline ? [chatTab, ...pipelineTabs] : pipelineTabs;

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>{agentData?.agent?.description}</Text>
          <ButtonGroup>
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
      <DeleteAgentModal isOpen={isDeleteAgentModalOpen} onClose={onDeleteAgentModalClose} agent={agentData?.agent} />
    </>
  );
};
