/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: part of the create agent HTTP implementation */
import { create } from '@bufbuild/protobuf';
import { Box, Button, ButtonGroup, Divider, Flex, Grid, GridItem, Image, Spinner, VStack } from '@redpanda-data/ui';
import { useAppForm } from 'components/form/form';
import { PipelineCreateSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCreateAgentPipelinesMutation } from 'react-query/api/agent';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import agentIllustration from '../../../../../../assets/agent-illustration-http.png';
import { AgentDetailsForm } from './agent-details-form';
import { createAgentHttpFormOpts, createAgentHttpSchema } from './create-agent-http-schema';
import { ExternalDependenciesForm } from './external-dependencies-form';
import { GitDetailsForm } from './git-details-form';
import { parseYamlTemplateSecrets } from './parse-yaml-template-secrets';
import ragChatPipeline from './rag-chat.yaml';
import gitPipeline from './rag-git.yaml';
import gitPrivatePipeline from './rag-git-private.yaml';
import ragIndexingPipeline from './rag-indexing.yaml';
import { RedpandaUserAndPermissionsForm } from './redpanda-user-and-permissions-form';

export const getPipelineName = (pipelineKey: string) => {
  switch (pipelineKey) {
    case 'agent':
      return 'Agent';
    case 'RAG':
      return 'RAG Indexing';
    case 'GIT':
      return 'Git';
    default:
      return 'Unknown';
  }
};

export const getPipelineDescription = (pipelineKey: string) => {
  switch (pipelineKey) {
    case 'agent':
      return 'Provide an authentication protected HTTP API for a chat application.';
    case 'RAG':
      return 'Ingest all data from a Redpanda topic into a Postgres vector database.';
    case 'GIT':
      return 'Git Input';
    default:
      return 'Unknown';
  }
};

export const getPipelinePurpose = (pipelineKey: string) => {
  switch (pipelineKey) {
    case 'agent':
      return 'gateway-chat-api';
    case 'RAG':
      return 'rag-indexing-from-kafka';
    case 'GIT':
      return 'git-input';
    default:
      return 'unknown';
  }
};

export const CreateAgentHTTP = () => {
  const navigate = useNavigate();
  const { mutateAsync: createAgentPipelinesMutation, isPending: isCreateAgentPending } =
    useCreateAgentPipelinesMutation();

  const { data: secretList, isLoading: isSecretListLoading } = useListSecretsQuery();

  const form = useAppForm({
    ...createAgentHttpFormOpts(secretList?.secrets),
    validators: {
      onChange: createAgentHttpSchema,
    },
    onSubmit: async ({ value }) => {
      const agentId = uuidv4();

      const inlinePrompt = value.SYSTEM_PROMPT?.replace(/\s+/g, ' ').trim();

      const parsedPipelines = parseYamlTemplateSecrets({
        yamlTemplates: {
          agent: ragChatPipeline,
          RAG: ragIndexingPipeline,
          GIT: value.isPrivateRepository ? gitPrivatePipeline : gitPipeline,
        },
        envVars: {
          TOPIC: value.TOPIC,
          SASL_MECHANISM: value.SASL_MECHANISM,
          USERNAME: value.USERNAME,
          POSTGRES_COMPATIBLE_TOPIC_NAME: value.TOPIC,
          REDPANDA_BROKERS: '${REDPANDA_BROKERS}', // To ensure REDPANDA_BROKERS are set for now
          REPOSITORY_URL: value.REPOSITORY_URL,
          REPOSITORY_BRANCH: value.REPOSITORY_BRANCH,
          INCLUDE_GLOB_PATTERN: value.INCLUDE_GLOB_PATTERN,
          EXCLUDE_GLOB_PATTERN: value.EXCLUDE_GLOB_PATTERN,
          AGENT_ID: agentId,
          SYSTEM_PROMPT: inlinePrompt,
        },
        secretMappings: {
          KAFKA_PASSWORD: value.KAFKA_PASSWORD,
          OPENAI_KEY: value.OPENAI_KEY,
          POSTGRES_DSN: value.POSTGRES_DSN,
          PERSONAL_ACCESS_TOKEN: value.PERSONAL_ACCESS_TOKEN,
        },
      });
      const pipelines = Object.entries(parsedPipelines).map(([key, pipeline]) =>
        create(PipelineCreateSchema, {
          displayName: getPipelineName(key),
          description: getPipelineDescription(key),
          configYaml: pipeline,
          tags: {
            __redpanda_cloud_agent_name: value.name,
            __redpanda_cloud_agent_description: value.description,
            __redpanda_cloud_pipeline_purpose: getPipelinePurpose(key),
          },
        }),
      );
      await createAgentPipelinesMutation({ pipelines, agentId }).then(() => {
        navigate(`/agents/${agentId}`);
      });
    },
  });

  if (isSecretListLoading) {
    return (
      <Flex justifyContent="center" padding={8}>
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <Grid gap={8}>
          <GridItem display="flex" alignItems="center" justifyContent="center" width="100%">
            <Box borderRadius="md" overflow="hidden" boxShadow="md" width="100%" maxWidth="1000px" mx="auto">
              <Image
                src={agentIllustration}
                alt="AI Agent Illustration"
                width="100%"
                height="auto"
                objectFit="contain"
                fallbackSrc="https://via.placeholder.com/800x450?text=AI+Agent"
              />
            </Box>
          </GridItem>
          <GridItem maxWidth={{ base: '100%', lg: '800px' }} mx="auto" width="100%">
            <VStack spacing={6} align="stretch">
              <AgentDetailsForm
                form={form}
                title="New Support Agent"
                description="This agent connects to a GitHub repository and ingests all text-based content (e.g., Markdown, plaintext, code) into a vector database you provide. The content becomes part of a Retrieval-Augmented Generation (RAG) pipeline that enhances the agent's ability to respond accurately and contextually via a chat API."
              />
              <Divider my={1} />
              <RedpandaUserAndPermissionsForm
                form={form}
                title="Redpanda user and permissions"
                description="The agent needs to connect to Redpanda in order to stream GitHub documents as records into a Kafka topic. These credentials allow it to authenticate and produce messages securely. The user must posses ACLs for writing and reading the configured topic."
              />
              <Divider my={1} />
              <GitDetailsForm
                form={form}
                title="Git repository with your knowledge"
                description="Tell the agent where to find your knowledge base. It will clone the specified GitHub repository, extract relevant files, and ingest them into your vector database for AI-powered querying."
              />
              <Divider my={1} />
              <ExternalDependenciesForm form={form} title="External Dependencies" />
              <Flex justifyContent="flex-start" pt={6}>
                <ButtonGroup isDisabled={isCreateAgentPending}>
                  <form.SubscribeButton label="Create" variant="solid" loadingText="Creating" />
                  <Button variant="link" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                </ButtonGroup>
              </Flex>
            </VStack>
          </GridItem>
        </Grid>
      </form.AppForm>
    </form>
  );
};
