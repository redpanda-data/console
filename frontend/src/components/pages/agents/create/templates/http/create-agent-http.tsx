import { Button, ButtonGroup, Divider, Flex, VStack } from '@redpanda-data/ui';
import { useAppForm } from 'components/form/form';
import { PipelineCreate } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCreateAgentPipelinesMutation } from 'react-query/api/agent';
import { useHistory } from 'react-router-dom';
import { AgentDetailsForm } from './agent-details-form';
import { createAgentHttpFormOpts, createAgentHttpSchema } from './create-agent-http-schema';
import { parseYamlTemplateSecrets } from './parse-yaml-template-secrets';
import ragChatPipeline from './rag-chat.yaml';
import ragIndexingPipeline from './rag-indexing.yaml';
import { RedpandaUserAndPermissionsForm } from './redpanda-user-and-permissions-form';

export const CreateAgentHTTP = () => {
  const history = useHistory();
  const { mutateAsync: createAgentPipelinesMutation, isPending: isCreateAgentPending } =
    useCreateAgentPipelinesMutation();

  const form = useAppForm({
    ...createAgentHttpFormOpts,
    validators: {
      onChange: createAgentHttpSchema,
    },
    onSubmit: async ({ value }) => {
      const parsedPipelines = parseYamlTemplateSecrets({
        yamlTemplates: {
          agent: ragChatPipeline,
          RAG: ragIndexingPipeline,
        },
        envVars: {
          TOPIC: value.TOPIC,
          SASL_MECHANISM: value.SASL_MECHANISM,
          USERNAME: value.USERNAME,
          POSTGRES_COMPATIBLE_TOPIC_NAME: value.TOPIC,
        },
        secretMappings: {
          KAFKA_PASSWORD: value.KAFKA_PASSWORD,
          OPENAI_KEY: value.OPENAI_KEY,
          POSTGRES_DSN: value.POSTGRES_DSN,
        },
      });
      const pipelines = Object.entries(parsedPipelines).map(
        ([key, pipeline]) =>
          new PipelineCreate({
            displayName: key,
            description: key === 'agent' ? 'Chat' : 'Chat API', // TODO: Consider providing description for each pipeline
            configYaml: pipeline,
            tags: {
              __redpanda_cloud_agent_name: value.name,
              __redpanda_cloud_agent_description: value.description,
              __redpanda_cloud_pipeline_purpose: key === 'agent' ? 'chat' : 'indexing', // TODO: Discuss if accurate
            },
          }),
      );

      const agentPipelines = await createAgentPipelinesMutation({ pipelines });

      const agentId = agentPipelines?.[0]?.response?.pipeline?.tags?.__redpanda_cloud_agent_id;

      // Worst case scenario, if the tags are not set properly, redirect to the agents list page
      history.push(agentId ? `/agents/${agentId}` : '/agents');
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <VStack spacing={6} align="stretch">
          <AgentDetailsForm form={form} title="Create AI agent" description="Description of agent ..." />
          <Divider my={4} />
          <RedpandaUserAndPermissionsForm form={form} title="Redpanda user and permissions" />
          <Flex justifyContent="flex-start" pt={6}>
            <ButtonGroup isDisabled={isCreateAgentPending}>
              <form.SubscribeButton label="Create" variant="solid" loadingText="Creating" />
              <Button variant="link" onClick={() => history.goBack()}>
                Cancel
              </Button>
            </ButtonGroup>
          </Flex>
        </VStack>
      </form.AppForm>
    </form>
  );
};
