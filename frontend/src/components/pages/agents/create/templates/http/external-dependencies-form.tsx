import { Heading, Link, Stack, Text, useDisclosure } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { type ReactNode, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { Link as ReactRouterLink } from 'react-router-dom';
import type { z } from 'zod';
import {
  type CreateAgentHttpFormValues,
  createAgentHttpFormOpts,
  OPEN_AI_API_TOKEN_DESCRIPTION,
  openAiApiTokenSchema,
  POSTGRES_CONNECTION_URI_DESCRIPTION,
  postgresConnectionUriSchema,
} from './create-agent-http-schema';

export const ExternalDependenciesForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: '',
  },
  render: ({ title, form }) => {
    const {
      isOpen: isCreateSecretModalOpen,
      onOpen: onCreateSecretModalOpen,
      onClose: onCreateSecretModalClose,
    } = useDisclosure();

    const [customSecretSchema, setCustomSecretSchema] = useState<z.ZodTypeAny | undefined>(undefined);

    const [fieldToUpdate, setFieldToUpdate] = useState<keyof CreateAgentHttpFormValues | undefined>(undefined);
    const [helperText, setHelperText] = useState<ReactNode | undefined>(undefined);

    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const handleCreateSecretModalClose = (updatedValue?: string) => {
      if (updatedValue && fieldToUpdate) {
        form.resetField(fieldToUpdate);
        form.setFieldValue(fieldToUpdate, updatedValue);
        setFieldToUpdate(undefined);
        setCustomSecretSchema(undefined);
        setHelperText(undefined);
      }
      onCreateSecretModalClose();
    };

    return (
      <>
        <Stack spacing={4}>
          <Heading size="md">{title}</Heading>
          <Stack spacing={4} align="stretch">
            <form.AppField name="POSTGRES_DSN">
              {(field) => (
                <field.SingleSelectField
                  label="PostgreSQL vector database"
                  helperText={
                    <Text>
                      A PostgreSQL connection string (DSN) for a database with the pgvector extension preinstalled. This
                      is where document embeddings will be stored and queried. All credentials are securely stored in
                      your{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secrets Store
                      </Link>
                    </Text>
                  }
                  options={secretListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('POSTGRES_DSN');
                    setCustomSecretSchema(postgresConnectionUriSchema);
                    setHelperText(POSTGRES_CONNECTION_URI_DESCRIPTION);
                    onCreateSecretModalOpen();
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="OPENAI_KEY">
              {(field) => (
                <field.SingleSelectField
                  label="OpenAI API key"
                  helperText={
                    <Text>
                      Your OpenAI API key used to generate embeddings and chat responses. Ensure the key has access to
                      the required models. All credentials are securely stored in your{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secrets Store
                      </Link>
                    </Text>
                  }
                  options={secretListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('OPENAI_KEY');
                    setCustomSecretSchema(openAiApiTokenSchema);
                    setHelperText(OPEN_AI_API_TOKEN_DESCRIPTION);
                    onCreateSecretModalOpen();
                  }}
                />
              )}
            </form.AppField>
          </Stack>
        </Stack>
        <CreateSecretModal
          isOpen={isCreateSecretModalOpen}
          onClose={handleCreateSecretModalClose}
          customSecretSchema={customSecretSchema}
          helperText={helperText}
        />
      </>
    );
  },
});
