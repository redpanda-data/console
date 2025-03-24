import { Box, Heading, Link, Text, VStack, useDisclosure } from '@redpanda-data/ui';
import { type PrefixObjectAccessor, withForm } from 'components/form/form';
import { CreateSecretModal } from 'components/pages/secrets/create-secret-modal';
import { useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { Link as ReactRouterLink } from 'react-router-dom';
import {
  CreateUserWithSecretPasswordModal,
  type CreatedUser,
} from '../../../../users/create-user-with-secret-password-modal';
import { createAgentHttpFormOpts } from './create-agent-http-schema';

export const SASL_MECHANISM_OPTIONS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

export const RedpandaUserAndPermissionsForm = withForm({
  ...createAgentHttpFormOpts,
  props: {
    title: 'Redpanda user and permissions',
  },
  render: ({ title, form }) => {
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

    const [fieldToUpdate, setFieldToUpdate] = useState<
      PrefixObjectAccessor<typeof createAgentHttpFormOpts.defaultValues, []> | undefined
    >(undefined);

    const { data: legacyUserList } = useLegacyListUsersQuery();
    const legacyUserListOptions =
      legacyUserList?.users?.map((user) => ({
        value: user?.name,
        label: user?.name,
      })) ?? [];

    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const handleCreateSecretModalClose = (createdSecretId?: string) => {
      if (createdSecretId && fieldToUpdate) {
        form.setFieldValue(fieldToUpdate, createdSecretId);
        setFieldToUpdate(undefined);
      }
      onCreateSecretModalClose();
    };

    const handleCreateUserWithSecretPasswordModalClose = (createdUser?: CreatedUser) => {
      if (createdUser) {
        form.setFieldValue('USERNAME', createdUser?.username);
        form.setFieldValue('KAFKA_PASSWORD', createdUser?.secretId);
        form.setFieldValue('SASL_MECHANISM', createdUser?.saslMechanism);
      }
      onCreateUserWithSecretPasswordModalClose();
    };

    return (
      <>
        <Box>
          <Heading size="md" mb={1}>
            {title}
          </Heading>
          <Text color="gray.600" fontSize="sm" mb={4}>
            User with permissions to .... View or create users
          </Text>

          <VStack spacing={4} align="stretch">
            <form.AppField name="USERNAME">
              {(field) => (
                <field.SingleSelectField
                  label="Username"
                  helperText={
                    <Text>
                      Username for the Redpanda user ... All users can be found under{' '}
                      <Link as={ReactRouterLink} to="/security/users" target="_blank" rel="noopener noreferrer">
                        Security tab
                      </Link>
                    </Text>
                  }
                  options={legacyUserListOptions}
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
                      Password for the Redpanda user ... All credentials are securely stored in{' '}
                      <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                        Secret Store
                      </Link>
                    </Text>
                  }
                  options={secretListOptions}
                  showCreateNewOption
                  onCreateNewOptionClick={() => {
                    setFieldToUpdate('KAFKA_PASSWORD');
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
          </VStack>
        </Box>
        <CreateSecretModal isOpen={isCreateSecretModalOpen} onClose={handleCreateSecretModalClose} />
        <CreateUserWithSecretPasswordModal
          isOpen={isCreateUserWithSecretPasswordModalOpen}
          onClose={handleCreateUserWithSecretPasswordModalClose}
        />
      </>
    );
  },
});
