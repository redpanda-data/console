import { Button, ButtonGroup, Grid, GridItem, Stack, Text } from '@redpanda-data/ui';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Fragment, type ReactNode } from 'react';
import { useGetPipelineQuery } from 'react-query/api/pipeline';
import { useHistory } from 'react-router-dom';
import { AGENT_POLLING_INTERVAL } from './agent-details-page';
import { AgentPipelineTabLogs } from './agent-pipeline-tab-logs';
import { AgentStateDisplayValue } from './agent-state-display-value';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';

interface AgentPipelineTabProps {
  pipeline?: Pipeline;
}

export const AgentPipelineTab = ({ pipeline }: AgentPipelineTabProps) => {
  const history = useHistory();

  const { data: pipelineData } = useGetPipelineQuery(
    {
      id: pipeline?.id ?? '',
    },
    {
      refetchInterval: pipeline?.state === Pipeline_State.RUNNING ? false : AGENT_POLLING_INTERVAL,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: 'always',
    },
  );

  const polledPipeline = pipelineData?.response?.pipeline;

  const items = [
    {
      title: 'ID',
      value: polledPipeline?.id,
    },
    {
      title: 'State',
      value: <AgentStateDisplayValue state={polledPipeline?.state} />,
    },
    {
      title: 'Name',
      value: polledPipeline?.displayName,
    },
    {
      title: 'Description',
      value: polledPipeline?.description,
    },
    polledPipeline?.url && {
      title: 'URL',
      value: polledPipeline?.url,
    },
  ].filter(Boolean) as { title: string; value: ReactNode }[];

  return (
    <Stack spacing={8}>
      <Grid templateColumns="100px 2fr" gap={1}>
        {items.map((item) => (
          <Fragment key={item?.title}>
            <GridItem>
              <Text fontWeight="bold">{item?.title}</Text>
            </GridItem>
            <GridItem>
              <Text wordBreak="break-word" whiteSpace="pre-wrap">
                {item?.value}
              </Text>
            </GridItem>
          </Fragment>
        ))}
      </Grid>

      <ButtonGroup>
        <Button
          variant="outline"
          onClick={() => {
            history.push(`/rp-connect/${pipeline?.id}/edit`);
          }}
          data-testid="edit-pipeline-button"
        >
          Edit
        </Button>
        <TogglePipelineStateButton pipeline={pipeline} />
      </ButtonGroup>
      <AgentPipelineTabLogs pipeline={pipeline} />
    </Stack>
  );
};
