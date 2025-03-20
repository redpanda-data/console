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
import { useEffect } from 'react';
import { useCreateSecretMutationWithToast, useListSecretsQuery } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';
import { createSecretSchema } from './form/create-secret-schema';

interface CreateSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateSecretModal = ({ isOpen, onClose }: CreateSecretModalProps) => {
  const { data: secretList } = useListSecretsQuery();

  // Secret creation mutation
  const { mutateAsync: createSecret, isPending: isPendingCreateSecret } = useCreateSecretMutationWithToast();

  const formOpts = formOptions({
    defaultValues: {
      id: '',
      value: '',
      labels: [{ key: '', value: '' }],
    },
    onSubmit: async ({
      value,
    }: { value: { id: string; value: string; labels: Array<{ key: string; value: string }> } }) => {
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
      onClose();
    },
    validators: {
      // Use Zod schema for form-level validation
      onSubmit: ({
        value,
      }: { value: { id: string; value: string; labels: Array<{ key: string; value: string }> } }) => {
        const errors: Record<string, string> = {};
        const schema = createSecretSchema(secretList?.secrets);

        try {
          schema.parse(value);
        } catch (error) {
          if (error instanceof z.ZodError) {
            // Convert Zod errors to the format expected by TanStack Form
            for (const err of error.errors) {
              const path = err.path.join('.');
              errors[path] = err.message;
            }
          }
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
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
        <form.AppForm>
          <ModalHeader>Create new Secret</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={2}>
              <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

              <form.AppField
                name="id"
                validators={{
                  onChange: ({ value }: { value: string }) => {
                    const idSchema = z
                      .string()
                      .min(1, 'ID is required')
                      .regex(
                        /^[A-Z][A-Z0-9_]*$/,
                        'ID must use uppercase letters, numbers, and underscores only, starting with a letter',
                      )
                      .refine((id) => !secretList?.secrets?.some((secret) => secret?.id === id), {
                        message: 'ID is already in use',
                      });

                    try {
                      idSchema.parse(value);
                      return undefined;
                    } catch (error) {
                      if (error instanceof z.ZodError && error.errors.length > 0) {
                        return error.errors[0].message;
                      }
                      return undefined;
                    }
                  },
                }}
              >
                {(field) => (
                  <field.TextField
                    label="ID"
                    helperText="ID must use uppercase letters, numbers, and underscores only."
                    placeholder="SECRET_ID"
                    transform={(value: string) => value.toUpperCase()}
                  />
                )}
              </form.AppField>

              <form.AppField
                name="value"
                validators={{
                  onChange: ({ value }: { value: string }) => {
                    const valueSchema = z.string().min(1, 'Value is required');
                    try {
                      valueSchema.parse(value);
                      return undefined;
                    } catch (error) {
                      if (error instanceof z.ZodError && error.errors.length > 0) {
                        return error.errors[0].message;
                      }
                      return undefined;
                    }
                  },
                }}
              >
                {(field) => <field.PasswordField label="Value" />}
              </form.AppField>
              <form.AppField name="labels" mode="array">
                {(field) => (
                  <field.KeyValueField label="Labels" helperText="Labels can help you to organize your secrets." />
                )}
              </form.AppField>
            </Stack>
          </ModalBody>

          <ModalFooter>
            <ButtonGroup isDisabled={isPendingCreateSecret}>
              <form.SubscribeButton label="Create" variant="brand" />

              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </ButtonGroup>
          </ModalFooter>
        </form.AppForm>
      </ModalContent>
    </Modal>
  );
};
