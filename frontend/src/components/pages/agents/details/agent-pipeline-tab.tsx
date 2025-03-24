import { Box, ButtonGroup, Stack } from '@redpanda-data/ui';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { useHistory } from 'react-router-dom';
import { Button, QuickTable } from 'utils/tsxUtils';
import { AgentPipelineTabLogs } from './agent-pipeline-tab-logs';
import { AgentStateDisplayValue } from './agent-state-display-value';
import { TogglePipelineStateButton } from './toggle-pipeline-state-button';

interface AgentPipelineTabProps {
  pipeline?: Pipeline;
}

export const AgentPipelineTab = ({ pipeline }: AgentPipelineTabProps) => {
  const history = useHistory();

  return (
    <Stack spacing={8} mt={4}>
      <Box>
        {QuickTable(
          [
            pipeline?.id && { key: 'ID', value: pipeline?.id },
            pipeline?.state && { key: 'Status', value: <AgentStateDisplayValue state={pipeline?.state} /> },
            pipeline?.displayName && { key: 'Name', value: pipeline?.displayName },
            pipeline?.description && { key: 'Description', value: pipeline?.description ?? '' },
            pipeline?.url && { key: 'URL', value: pipeline?.url },
          ],
          { gapHeight: '.5rem', keyStyle: { fontWeight: 600 } },
        )}
      </Box>
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
