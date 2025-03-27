import { Box, Heading, Link, Text, VStack, useDisclosure } from '@redpanda-data/ui';
import { type PrefixObjectAccessor, withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { CreateTopicModal } from 'components/pages/topics/create-topic-modal';
import { useState } from 'react';
import { useListAgentsQuery } from 'react-query/api/agent';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { Link as ReactRouterLink } from 'react-router-dom';
import { createAgentHttpFormOpts } from './create-agent-http-schema';

export const AgentDetailsForm = withForm({
  ...createAgentHttpFormOpts,
  props: {
    title: 'New Support',
    description: 'Description of agent ...',
  },
  render: ({ title, description, form }) => {
    const { data: agentList } = useListAgentsQuery();

    const {
      isOpen: isCreateSecretModalOpen,
      onOpen: onCreateSecretModalOpen,
      onClose: onCreateSecretModalClose,
    } = useDisclosure();

    const {
      isOpen: isCreateTopicModalOpen,
      onOpen: onCreateTopicModalOpen,
      onClose: onCreateTopicModalClose,
    } = useDisclosure();

    const [fieldToUpdate, setFieldToUpdate] = useState<
      PrefixObjectAccessor<typeof createAgentHttpFormOpts.defaultValues, []> | undefined
    >(undefined);

    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const { data: legacyTopicList } = useLegacyListTopicsQuery();
    const legacyTopicListOptions =
      legacyTopicList?.topics?.map((topic) => ({
        value: topic?.name,
        label: topic?.name,
      })) ?? [];

    const handleCreateTopicModalClose = (createdTopicId?: string) => {
      if (createdTopicId && fieldToUpdate) {
        form.setFieldValue(fieldToUpdate, createdTopicId);
        setFieldToUpdate(undefined);
      }
      onCreateTopicModalClose();
    };

    const handleCreateSecretModalClose = (updatedValue?: string) => {
      if (updatedValue && fieldToUpdate) {
        form.setFieldValue(fieldToUpdate, updatedValue);
        setFieldToUpdate(undefined);
      }
      onCreateSecretModalClose();
    };

    return (
      <>
        <Box>
          <Heading size="lg" mb={2}>
            {title}
          </Heading>
          <Text color="gray.600">{description}</Text>
        </Box>
        <VStack spacing={4} align="stretch">
          <form.AppField
            name="name"
            validators={{
              onChange: ({ value }: { value: string }) =>
                agentList?.agents?.some((agent) => agent?.displayName === value)
                  ? { message: 'Agent name is already in use', path: 'name' }
                  : undefined,
            }}
          >
            {(field) => <field.TextField label="Name" placeholder="Enter agent name" />}
          </form.AppField>
          <form.AppField name="description">
            {(field) => <field.TextField label="Description" placeholder="Enter agent description" />}
          </form.AppField>
          <form.AppField name="TOPIC">
            {(field) => (
              <field.SingleSelectField
                label="Redpanda topic"
                helperText={
                  <Text>
                    Topic that ... All topics can be found under{' '}
                    <Link as={ReactRouterLink} to="/topics" target="_blank" rel="noopener noreferrer">
                      Topics tab
                    </Link>
                  </Text>
                }
                options={legacyTopicListOptions}
                showCreateNewOption
                onCreateNewOptionClick={() => {
                  setFieldToUpdate('TOPIC');
                  onCreateTopicModalOpen();
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="OPENAI_KEY">
            {(field) => (
              <field.SingleSelectField
                label="OpenAI API Token"
                helperText={
                  <Text>
                    Credentials for OpenAI to ... All credentials are securely stored in your{' '}
                    <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                      Secret Store
                    </Link>
                  </Text>
                }
                options={secretListOptions}
                showCreateNewOption
                onCreateNewOptionClick={() => {
                  setFieldToUpdate('OPENAI_KEY');
                  onCreateSecretModalOpen();
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="POSTGRES_DSN">
            {(field) => (
              <field.SingleSelectField
                label="Postgres Connection URI"
                helperText={
                  <Text>
                    Credentials for the Postgres database that ... All credentials are securely stored in{' '}
                    <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                      Secret Store
                    </Link>
                  </Text>
                }
                options={secretListOptions}
                showCreateNewOption
                onCreateNewOptionClick={() => {
                  setFieldToUpdate('POSTGRES_DSN');
                  onCreateSecretModalOpen();
                }}
              />
            )}
          </form.AppField>
        </VStack>
        <CreateSecretModal isOpen={isCreateSecretModalOpen} onClose={handleCreateSecretModalClose} />
        <CreateTopicModal isOpen={isCreateTopicModalOpen} onClose={handleCreateTopicModalClose} />
      </>
    );
  },
});
