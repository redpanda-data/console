import { Box, Button, ButtonGroup, Grid, Stack, Text, useDisclosure } from '@redpanda-data/ui';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Fragment, type ReactNode } from 'react';
import { useGetPipelineQuery } from 'react-query/api/pipeline';
import { AGENT_POLLING_INTERVAL } from './agent-details-page';
import { AgentPipelineTabLogs } from './agent-pipeline-tab-logs';
import { AgentStateDisplayValue } from './agent-state-display-value';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';
import { ViewPipelineModal } from './view-pipeline-modal';

interface AgentPipelineTabProps {
  pipeline?: Pipeline;
}

export const AgentPipelineTab = ({ pipeline }: AgentPipelineTabProps) => {
  const {
    isOpen: isViewPipelineModalOpen,
    onOpen: onViewPipelineModalOpen,
    onClose: onViewPipelineModalClose,
  } = useDisclosure();

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
      label: 'ID',
      value: polledPipeline?.id,
    },
    {
      label: 'State',
      value: <AgentStateDisplayValue state={polledPipeline?.state} />,
    },
    {
      label: 'Name',
      value: polledPipeline?.displayName,
    },
    {
      label: 'Description',
      value: polledPipeline?.description,
    },
    polledPipeline?.url && {
      label: 'URL',
      value: polledPipeline?.url,
    },
  ].filter(Boolean) as { label: string; value: ReactNode }[];

  return (
    <>
      <Stack spacing={8}>
        <Box maxWidth="400px">
          <Grid gridTemplateColumns="1fr 3fr" gap={2}>
            {items.map((item) => (
              <Fragment key={item.label}>
                <Text as="b">{item.label}</Text>
                <Box>{item.value}</Box>
              </Fragment>
            ))}
          </Grid>
        </Box>

        <ButtonGroup>
          <Button
            variant="outline"
            onClick={() => {
              onViewPipelineModalOpen();
            }}
            data-testid="view-pipeline-button"
          >
            View
          </Button>
          <TogglePipelineStateButton pipeline={pipeline} />
        </ButtonGroup>
        <AgentPipelineTabLogs pipeline={pipeline} />
      </Stack>
      {pipeline?.id && (
        <ViewPipelineModal
          isOpen={isViewPipelineModalOpen}
          onClose={onViewPipelineModalClose}
          pipelineId={pipeline?.id}
        />
      )}
    </>
  );
};
