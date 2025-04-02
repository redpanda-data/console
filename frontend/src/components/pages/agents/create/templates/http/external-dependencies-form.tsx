import { Heading, Link, Stack, Text, useDisclosure } from '@redpanda-data/ui';
import { type PrefixObjectAccessor, withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { type ReactNode, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { Link as ReactRouterLink } from 'react-router-dom';
import type { z } from 'zod';
import {
  type CreateAgentHttpFormValues,
  OPEN_AI_API_TOKEN_DESCRIPTION,
  POSTGRES_CONNECTION_URI_DESCRIPTION,
  createAgentHttpFormOpts,
  openAiApiTokenSchema,
  postgresConnectionUriSchema,
} from './create-agent-http-schema';

export const ExternalDependenciesForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: 'External Dependencies',
  },
  render: ({ title, form }) => {
    const {
      isOpen: isCreateSecretModalOpen,
      onOpen: onCreateSecretModalOpen,
      onClose: onCreateSecretModalClose,
    } = useDisclosure();

    const [customSecretSchema, setCustomSecretSchema] = useState<z.ZodTypeAny | undefined>(undefined);

    const [fieldToUpdate, setFieldToUpdate] = useState<PrefixObjectAccessor<CreateAgentHttpFormValues, []> | undefined>(
      undefined,
    );
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
                  label="Vector DB"
                  helperText={
                    <Text>
                      All credentials are securely stored in{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secret Store
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
                  label="OpenAI Key"
                  helperText={
                    <Text>
                      All credentials are securely stored in your{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secret Store
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
