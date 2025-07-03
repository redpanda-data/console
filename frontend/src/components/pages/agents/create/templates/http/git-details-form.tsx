import { Heading, Stack, Text, useDisclosure } from '@redpanda-data/ui';
import { useStore } from '@tanstack/react-form';
import { withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { type ReactNode, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import type { z } from 'zod';
import {
  type CreateAgentHttpFormValues,
  createAgentHttpFormOpts,
  EXCLUDE_GLOB_PATTERN_DESCRIPTION,
  INCLUDE_GLOB_PATTERN_DESCRIPTION,
  PERSONAL_ACCESS_TOKEN_DESCRIPTION,
  personalAccessTokenSchema,
} from './create-agent-http-schema';

export const GitDetailsForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: '',
    description: '',
  },
  render: ({ title, description, form }) => {
    const { data: secretList } = useListSecretsQuery();
    const [customSecretSchema, setCustomSecretSchema] = useState<z.ZodTypeAny | undefined>(undefined);
    const [helperText, setHelperText] = useState<ReactNode | undefined>(undefined);
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const {
      isOpen: isCreateSecretModalOpen,
      onOpen: onCreateSecretModalOpen,
      onClose: onCreateSecretModalClose,
    } = useDisclosure();

    const [fieldToUpdate, setFieldToUpdate] = useState<keyof CreateAgentHttpFormValues | undefined>(undefined);

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

    const isPrivateRepository = useStore(form.store, (state) => state.values.isPrivateRepository);

    return (
      <>
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Heading size="md">{title}</Heading>
            <Text color="gray.500" fontSize="sm">
              {description}
            </Text>
          </Stack>
          <Stack spacing={4} align="stretch">
            <form.AppField name="REPOSITORY_URL">
              {(field) => <field.TextField label="Repository URL" placeholder="Enter repository URL" />}
            </form.AppField>
            <form.AppField name="REPOSITORY_BRANCH">
              {(field) => <field.TextField label="Repository branch" placeholder="Enter repository branch" />}
            </form.AppField>
            <form.AppField
              name="isPrivateRepository"
              validators={{
                onChangeListenTo: ['PERSONAL_ACCESS_TOKEN'],
                onChange: ({ value }) => {
                  if (!value) {
                    form.resetField('PERSONAL_ACCESS_TOKEN');
                  }
                },
              }}
            >
              {(field) => <field.CheckboxField label="Private repository" />}
            </form.AppField>
            {isPrivateRepository && (
              <form.AppField name="PERSONAL_ACCESS_TOKEN">
                {(field) => (
                  <field.SingleSelectField
                    label="Personal access token"
                    helperText={PERSONAL_ACCESS_TOKEN_DESCRIPTION}
                    placeholder="Enter personal access token"
                    options={secretListOptions}
                    showCreateNewOption
                    onCreateNewOptionClick={() => {
                      setFieldToUpdate('PERSONAL_ACCESS_TOKEN');
                      setCustomSecretSchema(personalAccessTokenSchema);
                      setHelperText(PERSONAL_ACCESS_TOKEN_DESCRIPTION);
                      onCreateSecretModalOpen();
                    }}
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name="INCLUDE_GLOB_PATTERN">
              {(field) => (
                <field.TextField
                  label="Include glob pattern"
                  placeholder="Enter glob pattern"
                  helperText={INCLUDE_GLOB_PATTERN_DESCRIPTION}
                />
              )}
            </form.AppField>
            <form.AppField name="EXCLUDE_GLOB_PATTERN">
              {(field) => (
                <field.TextField
                  label="Exclude glob pattern (optional)"
                  placeholder="Enter glob pattern"
                  helperText={EXCLUDE_GLOB_PATTERN_DESCRIPTION}
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
