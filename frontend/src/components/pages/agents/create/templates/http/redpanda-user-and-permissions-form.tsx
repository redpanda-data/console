import { create } from '@bufbuild/protobuf';
import { Heading, Link, Stack, Text, useDisclosure } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { CreateTopicModal } from 'components/pages/topics/create-topic-modal';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { type ReactNode, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { Link as ReactRouterLink } from 'react-router-dom';
import type { z } from 'zod';
import {
  type CreatedUser,
  CreateUserWithSecretPasswordModal,
} from '../../../../users/create-user-with-secret-password-modal';
import {
  type CreateAgentHttpFormValues,
  createAgentHttpFormOpts,
  KAFKA_PASSWORD_DESCRIPTION,
  passwordSchema,
} from './create-agent-http-schema';

export const SASL_MECHANISM_OPTIONS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

export const RedpandaUserAndPermissionsForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: '',
    description: '',
  },
  render: ({ title, description, form }) => {
    const {
      isOpen: isCreateSecretModalOpen,
      onOpen: onCreateSecretModalOpen,
      onClose: onCreateSecretModalClose,
    } = useDisclosure();
    const {
      isOpen: isCreateUserWithSecretPasswordModalOpen,
      onOpen: onCreateUserWithSecretPasswordModalOpen,
      onClose: onCreateUserWithSecretPasswordModalClose,
    } = useDisclosure();
    const {
      isOpen: isCreateTopicModalOpen,
      onOpen: onCreateTopicModalOpen,
      onClose: onCreateTopicModalClose,
    } = useDisclosure();

    const [fieldToUpdate, setFieldToUpdate] = useState<keyof CreateAgentHttpFormValues | undefined>(undefined);

    const [customSecretSchema, setCustomSecretSchema] = useState<z.ZodTypeAny | undefined>(undefined);
    const [helperText, setHelperText] = useState<ReactNode | undefined>(undefined);
    const { data: userList } = useLegacyListUsersQuery();
    const userListOptions =
      userList?.users?.map((user) => ({
        value: user?.name,
        label: user?.name,
      })) ?? [];

    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
      hideInternalTopics: true,
    });
    const topicListOptions =
      topicList?.topics?.map((topic) => ({
        value: topic?.topicName,
        label: topic?.topicName,
      })) ?? [];

    const handleCreateSecretModalClose = (createdSecretId?: string) => {
      if (createdSecretId && fieldToUpdate) {
        form.resetField(fieldToUpdate);
        form.setFieldValue(fieldToUpdate, createdSecretId);
        setFieldToUpdate(undefined);
        setCustomSecretSchema(undefined);
        setHelperText(undefined);
      }
      onCreateSecretModalClose();
    };

    const handleCreateUserWithSecretPasswordModalClose = (createdUser?: CreatedUser) => {
      if (createdUser) {
        form.resetField('USERNAME');
        form.resetField('KAFKA_PASSWORD');
        form.resetField('SASL_MECHANISM');
        form.setFieldValue('USERNAME', createdUser?.username);
        form.setFieldValue('KAFKA_PASSWORD', createdUser?.secretId);
        form.setFieldValue('SASL_MECHANISM', createdUser?.saslMechanism);
      }
      onCreateUserWithSecretPasswordModalClose();
    };

    const handleCreateTopicModalClose = (createdTopicId?: string) => {
      if (createdTopicId && fieldToUpdate) {
        form.resetField(fieldToUpdate);
        form.setFieldValue(fieldToUpdate, createdTopicId);
        setFieldToUpdate(undefined);
      }
      onCreateTopicModalClose();
    };

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
            <form.AppField name="TOPIC">
              {(field) => (
                <field.SingleSelectField
                  label="Redpanda topic"
                  helperText={
                    <Text>
                      All topics can be found in{' '}
                      <Link as={ReactRouterLink} to="/topics" target="_blank" rel="noopener noreferrer">
                        Topics
                      </Link>
                    </Text>
                  }
                  options={topicListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('TOPIC');
                    onCreateTopicModalOpen();
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="USERNAME">
              {(field) => (
                <field.SingleSelectField
                  label="Username"
                  helperText={
                    <Text>
                      All users can be found in{' '}
                      <Link as={ReactRouterLink} to="/security/users" target="_blank" rel="noopener noreferrer">
                        Security
                      </Link>
                    </Text>
                  }
                  options={userListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={onCreateUserWithSecretPasswordModalOpen}
                />
              )}
            </form.AppField>
            <form.AppField name="KAFKA_PASSWORD">
              {(field) => (
                <field.SingleSelectField
                  label="Password"
                  helperText={
                    <Text>
                      All credentials are securely stored in your{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secrets Store
                      </Link>
                    </Text>
                  }
                  options={secretListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('KAFKA_PASSWORD');
                    setCustomSecretSchema(passwordSchema);
                    setHelperText(KAFKA_PASSWORD_DESCRIPTION);
                    onCreateSecretModalOpen();
                  }}
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
          </Stack>
        </Stack>
        <CreateSecretModal
          isOpen={isCreateSecretModalOpen}
          onClose={handleCreateSecretModalClose}
          customSecretSchema={customSecretSchema}
          helperText={helperText}
        />
        <CreateUserWithSecretPasswordModal
          isOpen={isCreateUserWithSecretPasswordModalOpen}
          onClose={handleCreateUserWithSecretPasswordModalClose}
        />
        <CreateTopicModal isOpen={isCreateTopicModalOpen} onClose={handleCreateTopicModalClose} />
      </>
    );
  },
});
