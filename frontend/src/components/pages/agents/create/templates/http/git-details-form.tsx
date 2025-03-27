import { Box, Heading, Text, VStack, useDisclosure } from '@redpanda-data/ui';
import { useStore } from '@tanstack/react-form';
import { type PrefixObjectAccessor, withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import type { z } from 'zod';
import {
  type CreateAgentHttpFormValues,
  createAgentHttpFormOpts,
  personalAccessTokenSchema,
} from './create-agent-http-schema';

export const GitDetailsForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: 'Git information',
    description: 'Enter the Git repository URL and branch to use for the agent',
  },
  render: ({ title, description, form }) => {
    const { data: secretList } = useListSecretsQuery();
    const [customSecretSchema, setCustomSecretSchema] = useState<z.ZodTypeAny | undefined>(undefined);
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

    const [fieldToUpdate, setFieldToUpdate] = useState<PrefixObjectAccessor<CreateAgentHttpFormValues, []> | undefined>(
      undefined,
    );

    const handleCreateSecretModalClose = (updatedValue?: string) => {
      if (updatedValue && fieldToUpdate) {
        form.resetField(fieldToUpdate);
        form.setFieldValue(fieldToUpdate, updatedValue);
        setFieldToUpdate(undefined);
        setCustomSecretSchema(undefined);
      }
      onCreateSecretModalClose();
    };

    const isPrivateRepository = useStore(form.store, (state) => state.values.isPrivateRepository);

    return (
      <>
        <Box>
          <Heading size="md" mb={1}>
            {title}
          </Heading>
          <Text color="gray.500" fontSize="sm">
            {description}
          </Text>
        </Box>
        <VStack spacing={4} align="stretch">
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
                  form.setFieldValue('PERSONAL_ACCESS_TOKEN', '');
                }
              },
            }}
          >
            {(field) => <field.CheckboxField label="Private repository" />}
          </form.AppField>
          <form.AppField name="GLOB_PATTERN">
            {(field) => <field.TextField label="Glob pattern" placeholder="Enter glob pattern" />}
          </form.AppField>
          {isPrivateRepository && (
            <form.AppField name="PERSONAL_ACCESS_TOKEN">
              {(field) => (
                <field.SingleSelectField
                  label="Personal access token"
                  placeholder="Enter personal access token"
                  options={secretListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('PERSONAL_ACCESS_TOKEN');
                    setCustomSecretSchema(personalAccessTokenSchema);
                    onCreateSecretModalOpen();
                  }}
                />
              )}
            </form.AppField>
          )}
        </VStack>
        <CreateSecretModal
          isOpen={isCreateSecretModalOpen}
          onClose={handleCreateSecretModalClose}
          customSecretSchema={customSecretSchema}
        />
      </>
    );
  },
});
