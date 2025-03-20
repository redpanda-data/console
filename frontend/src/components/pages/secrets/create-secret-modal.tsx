import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useBoolean,
} from '@redpanda-data/ui';
import { useForm } from '@tanstack/react-form';
import { CreateSecretRequest, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect } from 'react';
import { useCreateSecretMutationWithToast, useListSecretsQuery } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

interface CreateSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateSecretModal = ({ isOpen, onClose }: CreateSecretModalProps) => {
  const [showValue, setShowValue] = useBoolean(false);
  const { data: secretList } = useListSecretsQuery();

  // Secret creation mutation
  const { mutateAsync: createSecret, isPending: isPendingCreateSecret } = useCreateSecretMutationWithToast();

  // Define validation schema using Zod
  const secretSchema = z.object({
    id: z
      .string()
      .min(1, 'ID is required')
      .regex(
        /^[A-Z][A-Z0-9_]*$/,
        'ID must use uppercase letters, numbers, and underscores only, starting with a letter',
      )
      .refine((id) => !secretList?.secrets?.some((secret) => secret?.id === id), { message: 'ID is already in use' }),
    value: z.string().min(1, 'Value is required'),
    labels: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .optional()
      .default([])
      .refine(
        (labels) => {
          // Only validate non-empty labels - if both key and value are empty, that's fine
          return labels.every((label) => {
            return (label.key === '' && label.value === '') || (label.key !== '' && label.value !== '');
          });
        },
        {
          message: 'Both key and value must be provided for a label',
        },
      ),
  });

  // Form definition with Zod validation
  const form = useForm({
    defaultValues: {
      id: '',
      value: '',
      labels: [{ key: '', value: '' }],
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
      onClose();
    },
    validators: {
      // Use Zod schema for form-level validation
      onSubmit: ({ value }) => {
        const errors: Record<string, string> = {};

        try {
          secretSchema.parse(value);
        } catch (error) {
          if (error instanceof z.ZodError) {
            // Convert Zod errors to the format expected by TanStack Form
            for (const err of error.errors) {
              const path = err.path.join('.');
              errors[path] = err.message;
            }

            // Special handling for array field errors that might not be caught by Zod
            // Only validate labels that aren't completely empty
            if (value.labels) {
              for (const [index, label] of value.labels.entries()) {
                // Skip validation for empty labels (both key and value are empty)
                if (label.key === '' && label.value === '') continue;

                if (label.key && !label.value) {
                  errors[`labels[${index}].value`] = 'Label value is required';
                }
                if (!label.key && label.value) {
                  errors[`labels[${index}].key`] = 'Label key is required';
                }
              }
            }
          }
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
  });

  // Reset form on modal open/close
  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  // Add a new label
  const addLabel = () => {
    const currentLabels = form.state.values.labels || [];
    form.setFieldValue('labels', [...currentLabels, { key: '', value: '' }]);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create new Secret</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={2}>
            <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

            <form.Field
              name="id"
              validators={{
                onChange: ({ value }) => {
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
                <FormControl isInvalid={!!field.state.meta.errors?.length}>
                  <FormLabel fontWeight="medium">ID</FormLabel>
                  <FormHelperText mb={2}>ID must use uppercase letters, numbers, and underscores only.</FormHelperText>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                    onBlur={field.handleBlur}
                    placeholder="SECRET_ID"
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>
                  )}
                </FormControl>
              )}
            </form.Field>

            <form.Field
              name="value"
              validators={{
                onChange: ({ value }) => {
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
              {(field) => (
                <FormControl isInvalid={!!field.state.meta.errors?.length}>
                  <FormLabel fontWeight="medium">Value</FormLabel>
                  <InputGroup>
                    <Input
                      type={showValue ? 'text' : 'password'}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <InputRightElement>
                      <Button variant="ghost" onClick={setShowValue.toggle}>
                        {showValue ? <ViewOffIcon /> : <ViewIcon />}
                      </Button>
                    </InputRightElement>
                  </InputGroup>
                  {field.state.meta.errors?.length > 0 && (
                    <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>
                  )}
                </FormControl>
              )}
            </form.Field>

            {/* Labels Section */}
            <FormControl mb={4}>
              <FormLabel fontWeight="medium">Labels</FormLabel>
              <FormHelperText mb={2}>Labels can help you to organize your secrets.</FormHelperText>

              <form.Field name="labels" mode="array">
                {(labelsField) => (
                  <>
                    {labelsField.state.value.map((_, index) => (
                      <Flex key={index} gap={2} mb={2}>
                        <form.Field
                          name={`labels[${index}].key`}
                          validators={{
                            onChange: ({ value }) => {
                              const labels = form.state.values.labels;
                              if (!value && labels?.[index]?.value) {
                                return 'Label key is required';
                              }
                              return undefined;
                            },
                          }}
                        >
                          {(field) => (
                            <FormControl isInvalid={!!field.state.meta.errors?.length}>
                              <Input
                                placeholder="Key"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                              {field.state.meta.errors?.length > 0 && (
                                <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>
                              )}
                            </FormControl>
                          )}
                        </form.Field>

                        <form.Field
                          name={`labels[${index}].value`}
                          validators={{
                            onChange: ({ value }) => {
                              const labels = form.state.values.labels;
                              if (!value && labels?.[index]?.key) {
                                return 'Label value is required';
                              }
                              return undefined;
                            },
                          }}
                        >
                          {(field) => (
                            <FormControl isInvalid={!!field.state.meta.errors?.length}>
                              <Input
                                placeholder="Value"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                              />
                              {field.state.meta.errors?.length > 0 && (
                                <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>
                              )}
                            </FormControl>
                          )}
                        </form.Field>
                      </Flex>
                    ))}
                  </>
                )}
              </form.Field>

              <Button mt={2} size="sm" variant="outline" onClick={addLabel} leftIcon={<span>+</span>}>
                Add label
              </Button>
            </FormControl>
          </Stack>
        </ModalBody>

        <ModalFooter>
          <ButtonGroup isDisabled={isPendingCreateSecret}>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.isValid]}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  variant="brand"
                  onClick={() => form.handleSubmit()}
                  isDisabled={!canSubmit || isPendingCreateSecret}
                  isLoading={isPendingCreateSecret || isSubmitting}
                  loadingText="Creating"
                >
                  Create
                </Button>
              )}
            </form.Subscribe>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
