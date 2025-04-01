import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  Flex,
  Grid,
  GridItem,
  Image,
  Spinner,
  VStack,
  useDisclosure,
} from '@redpanda-data/ui';
import { useAppForm } from 'components/form/form';
import { PipelineCreate } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';
import { useCreateAgentPipelinesMutation } from 'react-query/api/agent';
import type { LintConfigWithPipelineInfo } from 'react-query/api/redpanda-connect';
import { useLintConfigsMutation } from 'react-query/api/redpanda-connect';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useHistory } from 'react-router-dom';
import agentIllustration from '../../../../../../assets/agent-illustration-http.png';
import { AgentDetailsForm } from './agent-details-form';
import { createAgentHttpFormOpts, createAgentHttpSchema } from './create-agent-http-schema';
import { GitDetailsForm } from './git-details-form';
import { LintFailureModal } from './lint-failure-modal';
import { parseYamlTemplateSecrets } from './parse-yaml-template-secrets';
import ragChatPipeline from './rag-chat.yaml';
import gitPrivatePipeline from './rag-git-private.yaml';
import gitPipeline from './rag-git.yaml';
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
  const history = useHistory();
  const { mutateAsync: createAgentPipelinesMutation, isPending: isCreateAgentPending } =
    useCreateAgentPipelinesMutation();
  const { mutateAsync: lintConfigsMutation, isPending: isLintConfigsPending } = useLintConfigsMutation();
  const {
    isOpen: isLintFailureModalOpen,
    onOpen: onLintFailureModalOpen,
    onClose: onLintFailureModalClose,
  } = useDisclosure();
  const [invalidLintConfigList, setInvalidLintConfigList] = useState<LintConfigWithPipelineInfo[] | undefined>(
    undefined,
  );

  const { data: secretList, isLoading: isSecretListLoading } = useListSecretsQuery();

  const form = useAppForm({
    ...createAgentHttpFormOpts(secretList?.secrets),
    validators: {
      onChange: createAgentHttpSchema,
    },
    onSubmit: async ({ value }) => {
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
          GLOB_PATTERN: value.GLOB_PATTERN,
        },
        secretMappings: {
          KAFKA_PASSWORD: value.KAFKA_PASSWORD,
          OPENAI_KEY: value.OPENAI_KEY,
          POSTGRES_DSN: value.POSTGRES_DSN,
          PERSONAL_ACCESS_TOKEN: value.PERSONAL_ACCESS_TOKEN,
        },
      });
      const pipelines = Object.entries(parsedPipelines).map(
        ([key, pipeline]) =>
          new PipelineCreate({
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

      // const lintConfigsListResponse = await lintConfigsMutation({ pipelines });
      // if (lintConfigsListResponse?.every((lintConfig) => lintConfig.valid)) {
      //   const agentPipelines = await createAgentPipelinesMutation({ pipelines });
      //   const agentId = agentPipelines?.[0]?.response?.pipeline?.tags?.__redpanda_cloud_agent_id;
      //   // Worst case scenario, if the tags are not set properly or something else goes wrong, redirect to the agents list page
      //   history.push(agentId ? `/agents/${agentId}` : '/agents');
      // } else {
      //   const invalidLintConfigs = lintConfigsListResponse?.filter((lintConfig) => !lintConfig.valid) || [];
      //   setInvalidLintConfigList(invalidLintConfigs);
      //   onLintFailureModalOpen();
      // }

      await lintConfigsMutation({ pipelines });
      const agentPipelines = await createAgentPipelinesMutation({ pipelines });
      const agentId = agentPipelines?.[0]?.response?.pipeline?.tags?.__redpanda_cloud_agent_id;
      history.push(agentId ? `/agents/${agentId}` : '/agents');
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
    <>
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
                  description="Enter the Kafka user credentials"
                />
                <Divider my={1} />
                <GitDetailsForm
                  form={form}
                  title="Git information"
                  description="Enter the Git repository URL and branch to use for the agent"
                />
                <Flex justifyContent="flex-start" pt={6}>
                  <ButtonGroup isDisabled={isCreateAgentPending || isLintConfigsPending}>
                    <form.SubscribeButton label="Create" variant="solid" loadingText="Creating" />
                    <Button variant="link" onClick={() => history.goBack()}>
                      Cancel
                    </Button>
                  </ButtonGroup>
                </Flex>
              </VStack>
            </GridItem>
          </Grid>
        </form.AppForm>
      </form>
      <LintFailureModal
        size="2xl"
        show={isLintFailureModalOpen}
        onHide={() => {
          setInvalidLintConfigList(undefined);
          onLintFailureModalClose();
        }}
        invalidLintConfigList={invalidLintConfigList}
      />
    </>
  );
};
