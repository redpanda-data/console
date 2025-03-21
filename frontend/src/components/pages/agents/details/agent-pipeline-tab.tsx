import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

interface AgentPipelineTabProps {
  agent?: Pipeline;
}

export const AgentPipelineTab = ({ agent }: AgentPipelineTabProps) => {
  return <div>Agent Pipeline {agent?.id}</div>;
};
