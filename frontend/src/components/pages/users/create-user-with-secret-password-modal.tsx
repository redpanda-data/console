import { create } from '@bufbuild/protobuf';
import {
  Button,
  ButtonGroup,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { generatePassword } from 'components/pages/acls/UserCreate';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { CreateUserRequestSchema, CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';
import { useCreateSecretMutationWithToast, useListSecretsQuery } from 'react-query/api/secret';
import { getSASLMechanism, useLegacyCreateUserMutationWithToast, useLegacyListUsersQuery } from 'react-query/api/user';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';
import { passwordSchema, usernameSchema } from '../agents/create/templates/http/create-agent-http-schema';
import { SASL_MECHANISM_OPTIONS } from '../agents/create/templates/http/redpanda-user-and-permissions-form';
import { CreateUserConfirmationModal } from './create-user-confirmation-modal';

export const createUserWithSecretPasswordSchema = z.object({
  USERNAME: usernameSchema,
  PASSWORD: passwordSchema,
  GENERATE_WITH_SPECIAL_CHARACTERS: z.boolean().optional(),
  SECRET_ID: z
    .string()
    .min(1, 'ID is required')
    .regex(/^[A-Z][A-Z0-9_]*$/, 'ID must use uppercase letters, numbers, and underscores only, starting with a letter'),
  SASL_MECHANISM: z.enum(['SCRAM-SHA-256', 'SCRAM-SHA-512']),
});

export interface CreatedUser {
  username: string;
  secretId: string;
  saslMechanism: (typeof SASL_MECHANISM_OPTIONS)[number];
}

export interface CreatedUserWithPassword extends CreatedUser {
  password: string;
}

interface CreateUserWithSecretPasswordModalProps {
  isOpen: boolean;
  onClose: (createdUser?: CreatedUser) => void;
}

export const CreateUserWithSecretPasswordModal = ({ isOpen, onClose }: CreateUserWithSecretPasswordModalProps) => {
  const { data: secretList } = useListSecretsQuery();
  const { data: legacyUserList } = useLegacyListUsersQuery();

  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutationWithToast();
  const { mutateAsync: createUser, isPending: isCreateUserPending } = useLegacyCreateUserMutationWithToast();
  const [finalFormValues, setFinalFormValues] = useState<CreatedUserWithPassword | undefined>(undefined);

  const formOpts = formOptions({
    defaultValues: {
      USERNAME: '',
      PASSWORD: generatePassword(30, false),
      GENERATE_WITH_SPECIAL_CHARACTERS: false,
      SECRET_ID: '',
      SASL_MECHANISM: 'SCRAM-SHA-256',
    },
    validators: {
      onChange: createUserWithSecretPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      const createSecretRequest = create(CreateSecretRequestSchema, {
        id: value.SECRET_ID,
        // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
        secretData: base64ToUInt8Array(encodeBase64(value.PASSWORD)),
        scopes: [Scope.REDPANDA_CONNECT],
      });

      const createUserRequest = create(CreateUserRequestSchema, {
        user: create(CreateUserRequest_UserSchema, {
          name: value.USERNAME,
          password: value.PASSWORD,
          mechanism: getSASLMechanism(value.SASL_MECHANISM),
        }),
      });

      await Promise.all([createSecret({ request: createSecretRequest }), createUser(createUserRequest)]).then(() => {
        setFinalFormValues({
          username: value.USERNAME,
          secretId: value.SECRET_ID,
          password: value.PASSWORD,
          saslMechanism: value.SASL_MECHANISM,
        });
      });
    },
  });

  const form = useAppForm({ ...formOpts });

  const isPending = isCreateSecretPending || isCreateUserPending;

  const handleClose = () => {
    form.reset();
    onClose(undefined);
  };

  if (finalFormValues) {
    const { username, secretId, saslMechanism, password } = finalFormValues;

    return (
      <CreateUserConfirmationModal
        isOpen={!!finalFormValues}
        onClose={() => {
          setFinalFormValues(undefined);
          onClose({
            username,
            secretId,
            saslMechanism: saslMechanism as 'SCRAM-SHA-256' | 'SCRAM-SHA-512',
          });
          form.reset();
        }}
        username={username}
        password={password}
        saslMechanism={saslMechanism}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Create new User</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={2}>
                <Text>This user will be created with an autogenerated password that will be stored in a secret.</Text>
                <form.AppField
                  name="USERNAME"
                  validators={{
                    onChange: ({ value }: { value: string }) =>
                      legacyUserList?.users?.some((user) => user?.name === value)
                        ? { message: 'Username is already in use', path: 'USERNAME' }
                        : undefined,
                  }}
                >
                  {(field) => (
                    <field.TextField
                      label="Username"
                      helperText="Must not contain any whitespace. Dots, hyphens and underscores may be used."
                      placeholder="Username"
                      data-testid="username-field"
                    />
                  )}
                </form.AppField>
                <form.AppField name="PASSWORD">
                  {(field) => (
                    <field.PasswordField
                      label="Password"
                      helperText="Must be at least 4 characters and should not exceed 64 characters."
                      placeholder="Password"
                      data-testid="password-field"
                    />
                  )}
                </form.AppField>
                <form.AppField
                  name="GENERATE_WITH_SPECIAL_CHARACTERS"
                  listeners={{
                    onChange: ({ value }) => {
                      form.setFieldValue('PASSWORD', generatePassword(30, value));
                    },
                  }}
                >
                  {(field) => (
                    <field.CheckboxField
                      label="Generate with special characters"
                      data-testid="generate-with-special-characters-checkbox"
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
                <form.AppField
                  name="SECRET_ID"
                  validators={{
                    onChange: ({ value }: { value: string }) =>
                      secretList?.secrets?.some((secret) => secret?.id === value)
                        ? { message: 'Secret ID is already in use', path: 'id' }
                        : undefined,
                  }}
                >
                  {(field) => (
                    <field.TextField
                      label="Secret ID"
                      helperText="Secret ID must use uppercase letters, numbers, and underscores only."
                      placeholder="SECRET_ID"
                      transform={(value: string) => value.toUpperCase()}
                      data-testid="secret-id-field"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <ButtonGroup isDisabled={isPending}>
                <form.SubscribeButton
                  label="Create"
                  variant="brand"
                  data-testid="create-user-with-secret-password-button"
                  loadingText="Creating"
                />

                <Button
                  variant="ghost"
                  data-testid="cancel-button"
                  onClick={() => {
                    onClose(undefined);
                  }}
                >
                  Cancel
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </form.AppForm>
        </form>
      </ModalContent>
    </Modal>
  );
};
