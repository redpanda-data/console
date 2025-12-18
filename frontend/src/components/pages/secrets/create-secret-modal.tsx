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

type CreateSecretModalProps = {
  isOpen: boolean;
  onClose: (createdSecretId?: string) => void;
  customSecretSchema?: z.ZodTypeAny;
  helperText?: ReactNode;
};

export const CreateSecretModal = ({ isOpen, onClose, customSecretSchema, helperText }: CreateSecretModalProps) => {
  const { data: secretList } = useListSecretsQuery();

  // Secret creation mutation
  const {
    mutateAsync: createSecret,
    isPending: isCreateSecretPending,
    error: createSecretError,
  } = useCreateSecretMutation();

  const finalSchema = secretSchema(customSecretSchema);

  const handleClose = () => {
    onClose(undefined);
    form.reset();
  };

  // Form type
  type Secret = z.infer<typeof finalSchema>;

  const defaultValues: Secret = {
    id: '',
    value: '',
    labels: [],
    scopes: [],
  };

  const formOpts = formOptions({
    defaultValues,
    validators: {
      // @ts-expect-error - Zod schema type incompatibility with @tanstack/react-form validators
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
                {createSecretError ? (
                  <Alert data-testid="create-secret-error" status="error" variant="subtle">
                    <AlertIcon />
                    {createSecretError.message}
                  </Alert>
                ) : null}
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
                      data-testid="secret-id-field"
                      helperText="ID must use uppercase letters, numbers, and underscores only."
                      label="ID"
                      placeholder="SECRET_ID"
                      transform={(value: string) => value.toUpperCase()}
                    />
                  )}
                </form.AppField>
                <form.AppField name="value">
                  {(field) => (
                    <field.PasswordField data-testid="secret-value-field" helperText={helperText} label="Value" />
                  )}
                </form.AppField>
                <form.AppField name="scopes">
                  {({ state, handleChange, handleBlur }) => (
                    <FormField errorText=" " isInvalid={state.meta.errors?.length > 0} label="Scopes">
                      <Select
                        data-testid="secret-scopes-field"
                        isMulti
                        onBlur={handleBlur}
                        onChange={(nextValue) => {
                          if (isMultiValue(nextValue) && nextValue) {
                            handleChange(nextValue.map(({ value }) => value));
                          }
                        }}
                        options={[
                          {
                            label: 'Redpanda Connect',
                            value: Scope.REDPANDA_CONNECT,
                          },
                          {
                            label: 'Redpanda Cluster',
                            value: Scope.REDPANDA_CLUSTER,
                          },
                          { label: 'MCP Server', value: Scope.MCP_SERVER },
                          { label: 'AI Agent', value: Scope.AI_AGENT },
                          { label: 'AI Gateway', value: Scope.AI_GATEWAY },
                        ]}
                        placeholder="Select scopes"
                      />
                      {
                        // Display error messages like tanstack/react-form fields.
                        state?.meta.errors?.length > 0 && (
                          <FormErrorMessage>
                            <UnorderedList>
                              {state.meta.errors?.map((error) => (
                                // biome-ignore lint/suspicious/noExplicitAny: error type from @tanstack/react-form is not properly typed
                                <li key={(error as any)?.path ?? ''}>
                                  {/* biome-ignore lint/suspicious/noExplicitAny: error type from @tanstack/react-form is not properly typed */}
                                  <Text color="red.500">{(error as any)?.message ?? 'Validation error'}</Text>
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
                <form.AppField mode="array" name="labels">
                  {(field) => (
                    <field.KeyValueField
                      data-testid="secret-labels-field"
                      helperText="Labels can help you to organize your secrets."
                      label="Labels"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <ButtonGroup isDisabled={isCreateSecretPending}>
                <form.SubscribeButton
                  data-testid="create-secret-button"
                  label="Create"
                  loadingText="Creating"
                  variant="brand"
                />

                <Button
                  data-testid="cancel-button"
                  onClick={() => {
                    handleClose();
                  }}
                  variant="ghost"
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
