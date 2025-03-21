import { runInAction } from 'mobx';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect } from 'react';
import { REDPANDA_AI_AGENT_PIPELINE_PREFIX, useGetPipelineQuery } from 'react-query/api/pipeline';
import { useParams } from 'react-router-dom';
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
  const { agentId } = useParams<{ agentId: Pipeline['id'] }>();
  const { data: agentData } = useGetPipelineQuery({ id: agentId });

  useEffect(() => {
    updatePageTitle({ agent: agentData?.response?.pipeline });
  }, [agentData?.response?.pipeline]);

  return <div>AgentDetailsPage</div>;
};
