import { Box, Button, ButtonGroup, Divider, Flex, Heading, Text, VStack } from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { PipelineCreate } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCreateAgentPipelinesMutation } from 'react-query/api/agent';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useHistory } from 'react-router-dom';
import { parseYamlTemplateSecrets } from './parse-yaml-template-secrets';
import ragChatPipeline from './rag-chat.yaml';
import ragIndexingPipeline from './rag-indexing.yaml';

const SASL_MECHANISM_OPTIONS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

export const CreateAgentHTTP = () => {
  const history = useHistory();
  const { mutateAsync: createAgentPipelinesMutation } = useCreateAgentPipelinesMutation();

  const { data: legacyTopicList } = useLegacyListTopicsQuery();
  const legacyTopicListOptions =
    legacyTopicList?.topics?.map((topic) => ({
      value: topic?.name,
      label: topic?.name,
    })) ?? [];

  const { data: secretList } = useListSecretsQuery();
  const secretListOptions =
    secretList?.secrets?.map((secret) => ({
      value: secret?.id,
      label: secret?.id,
    })) ?? [];

  const { data: legacyUserList } = useLegacyListUsersQuery();
  const legacyUserListOptions =
    legacyUserList?.users?.map((user) => ({
      value: user?.name,
      label: user?.name,
    })) ?? [];

  const formOpts = formOptions({
    defaultValues: {
      name: '',
      description: '',
      TOPIC: '',
      OPENAI_KEY: '',
      POSTGRES_DSN: '',
      USERNAME: '',
      KAFKA_PASSWORD: '',
      SASL_MECHANISM: 'SCRAM-SHA-256',
    },
    // validators: {
    //   onChange: createAgentHttpSchema,
    // },
    onSubmit: async ({ value }) => {
      const parsedPipelines = parseYamlTemplateSecrets({
        yamlTemplates: {
          agent: JSON.stringify(ragChatPipeline, null, 4),
          RAG: JSON.stringify(ragIndexingPipeline, null, 4),
        },
        envVars: {
          TOPIC: value.TOPIC,
          SASL_MECHANISM: value.SASL_MECHANISM,
          USERNAME: value.USERNAME,
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

  const form = useAppForm({ ...formOpts });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <VStack spacing={6} align="stretch">
          {/* Title Section */}
          <Box>
            <Heading size="lg" mb={2}>
              Create AI Agent
            </Heading>
            <Text color="gray.600">Description of agent ...</Text>
          </Box>
          <VStack spacing={4} align="stretch">
            <form.AppField name="name">
              {(field) => <field.TextField label="Name" placeholder="Enter agent name" />}
            </form.AppField>
            <form.AppField name="description">
              {(field) => <field.TextField label="Description" placeholder="Enter agent description" />}
            </form.AppField>
            <form.AppField name="TOPIC">
              {(field) => (
                <field.SingleSelectField
                  label="Source topic"
                  helperText="Topic that ... description"
                  options={legacyTopicListOptions}
                />
              )}
            </form.AppField>
            <form.AppField name="OPENAI_KEY">
              {(field) => (
                <field.SingleSelectField
                  label="OpenAI API credential"
                  helperText="API credential from OpenAI to ... All credentials are securely stored in Secret Store"
                  options={secretListOptions}
                />
              )}
            </form.AppField>

            <form.AppField name="POSTGRES_DSN">
              {(field) => (
                <field.SingleSelectField
                  label="Postgres Connection URI"
                  helperText="Credentials for the Postgres database that ... All credentials are securely stored in Secret Store"
                  options={secretListOptions}
                />
              )}
            </form.AppField>
          </VStack>

          <Divider my={4} />

          {/* Redpanda User and Permissions Section */}
          <Box>
            <Heading size="md" mb={1}>
              Redpanda user and permissions
            </Heading>
            <Text color="gray.600" fontSize="sm" mb={4}>
              User with permissions to .... View or create users
            </Text>

            <VStack spacing={4} align="stretch">
              <form.AppField name="USERNAME">
                {(field) => (
                  <field.SingleSelectField
                    label="Username"
                    helperText="Username for the Redpanda user ... All credentials are securely stored in Secret Store"
                    placeholder="select or create user"
                    options={legacyUserListOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="KAFKA_PASSWORD">
                {(field) => (
                  <field.SingleSelectField
                    label="Password"
                    helperText="Password for the Redpanda user ... All credentials are securely stored in Secret Store"
                    placeholder="select or create secret"
                    options={secretListOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="SASL_MECHANISM">
                {(field) => (
                  <field.RadioGroupField
                    label="SASL mechanism"
                    options={SASL_MECHANISM_OPTIONS.map((option) => ({
                      value: option,
                      label: option,
                    }))}
                  />
                )}
              </form.AppField>
            </VStack>
          </Box>

          {/* Form Footer with Create and Cancel Buttons */}
          <Flex justifyContent="flex-start" pt={6}>
            <ButtonGroup
            // isDisabled={isCreateAgentPending}
            >
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
