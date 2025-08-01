import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertIcon,
  Button,
  ButtonGroup,
  FormErrorMessage,
  FormField,
  isMultiValue,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Text,
  UnorderedList,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { ReactNode } from 'react';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import type { z } from 'zod';
import { secretSchema } from './form/secret-schema';

interface CreateSecretModalProps {
  isOpen: boolean;
  onClose: (createdSecretId?: string) => void;
  customSecretSchema?: z.ZodTypeAny;
  helperText?: ReactNode;
}

export const CreateSecretModal = ({ isOpen, onClose, customSecretSchema, helperText }: CreateSecretModalProps) => {
  const { data: secretList } = useListSecretsQuery();

  // Secret creation mutation
  const { mutateAsync: createSecret, isPending: isCreateSecretPending, error: createSecretError } = useCreateSecretMutation();

  const finalSchema = secretSchema(customSecretSchema);

  const handleClose = () => {
    onClose(undefined);
    form.reset();
  };

  // Form type
  interface Secret {
    id: string;
    value: string;
    labels: string[];
    scopes: Scope[];
  }

  const defaultValues: Secret = {
    id: '',
    value: '',
    labels: [],
    scopes: [],
  };

  const formOpts = formOptions({
    defaultValues: defaultValues,
    validators: {
      onChange: finalSchema,
    },
    onSubmit: async ({ value }) => {
      const labelsMap: { [key: string]: string } = {};
      for (const label of value.labels) {
        if (label.key && label.value) {
          labelsMap[label.key] = label.value;
        }
      }

      const request = create(CreateSecretRequestSchema, {
        id: value.id,
        // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
        secretData: base64ToUInt8Array(encodeBase64(value.value)),
        scopes: value.scopes || [],
        labels: labelsMap,
      });

      await createSecret({ request });
      handleClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Create new Secret</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={2}>
                {createSecretError && (
                  <Alert status="error" variant="subtle" data-testid="create-secret-error">
                    <AlertIcon />
                    {createSecretError.message}
                  </Alert>
                )}
                <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

                <form.AppField
                  name="id"
                  validators={{
                    onChange: ({ value }) =>
                      secretList?.secrets?.some((secret) => secret?.id === value)
                        ? { message: 'ID is already in use', path: 'id' }
                        : undefined,
                  }}
                >
                  {(field) => (
                    <field.TextField
                      label="ID"
                      helperText="ID must use uppercase letters, numbers, and underscores only."
                      placeholder="SECRET_ID"
                      transform={(value: string) => value.toUpperCase()}
                      data-testid="secret-id-field"
                    />
                  )}
                </form.AppField>
                <form.AppField name="value">
                  {(field) => (
                    <field.PasswordField label="Value" data-testid="secret-value-field" helperText={helperText} />
                  )}
                </form.AppField>
                <form.AppField name="scopes">
                  {({ state, handleChange, handleBlur }) => (
                    <FormField label="Scopes" errorText=" " isInvalid={state.meta.errors?.length > 0}>
                      <Select
                        placeholder="Select scopes"
                        data-testid="secret-scopes-field"
                        onChange={(nextValue) => {
                          if (isMultiValue(nextValue) && nextValue) {
                            handleChange(nextValue.map(({ value }) => value));
                          }
                        }}
                        options={[
                          { label: 'Redpanda Connect', value: Scope.REDPANDA_CONNECT },
                          { label: 'Redpanda Cluster', value: Scope.REDPANDA_CLUSTER },
                        ]}
                        isMulti
                        onBlur={handleBlur}
                      />
                      {
                        // Display error messages like tanstack/react-form fields.
                        state?.meta.errors?.length > 0 && (
                          <FormErrorMessage>
                            <UnorderedList>
                              {state.meta.errors?.map((error) => (
                                <li key={error.path}>
                                  <Text color="red.500">{error.message}</Text>
                                </li>
                              ))}
                            </UnorderedList>
                          </FormErrorMessage>
                        )
                      }
                    </FormField>
                  )}
                </form.AppField>
                {/* @ts-ignore - labels is a valid field name, @tanstack/form needs updating to infer deeply nested form field types */}
                <form.AppField name="labels" mode="array">
                  {(field) => (
                    <field.KeyValueField
                      label="Labels"
                      helperText="Labels can help you to organize your secrets."
                      data-testid="secret-labels-field"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <ButtonGroup isDisabled={isCreateSecretPending}>
                <form.SubscribeButton
                  label="Create"
                  variant="brand"
                  data-testid="create-secret-button"
                  loadingText="Creating"
                />

                <Button
                  variant="ghost"
                  data-testid="cancel-button"
                  onClick={() => {
                    handleClose();
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
