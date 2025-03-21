import { HStack, Stack, Text } from '@redpanda-data/ui';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { AgentPipelineTabLogs } from './agent-pipeline-tab-logs';
import { AgentStateDisplayValue } from './agent-state-display-value';

interface AgentPipelineTabProps {
  agent?: Pipeline;
}

export const AgentPipelineTab = ({ agent }: AgentPipelineTabProps) => {
  return (
    <Stack spacing={8} mt={4}>
      <HStack spacing={8}>
        <HStack spacing={2}>
          <Text fontWeight="medium">Status:</Text>
          <AgentStateDisplayValue state={agent?.state} />
        </HStack>
        <HStack spacing={2}>
          <Text fontWeight="medium">ID:</Text>
          <Text>{agent?.id || '-'}</Text>
        </HStack>
      </HStack>
      <AgentPipelineTabLogs agent={agent} />
    </Stack>
  );
};
