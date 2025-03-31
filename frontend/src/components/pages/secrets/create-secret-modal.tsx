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
import { CreateSecretRequest, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { type ReactNode, useEffect } from 'react';
import { useCreateSecretMutationWithToast, useListSecretsQuery } from 'react-query/api/secret';
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
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutationWithToast();

  const finalSchema = secretSchema(customSecretSchema);

  const formOpts = formOptions({
    defaultValues: {
      id: '',
      value: '',
      labels: [],
    },
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

      const request = new CreateSecretRequest({
        id: value.id,
        // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
        secretData: base64ToUInt8Array(encodeBase64(value.value)),
        scopes: [Scope.REDPANDA_CONNECT],
        labels: labelsMap,
      });

      await createSecret({ request });
      onClose(value.id);
    },
  });

  const form = useAppForm({ ...formOpts });

  // Reset form on modal open/close
  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Create new Secret</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={2}>
                <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

                <form.AppField
                  name="id"
                  validators={{
                    onChange: ({ value }: { value: string }) =>
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
