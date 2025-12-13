import { create } from '@bufbuild/protobuf';
import {
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
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useListSecretsQuery, useUpdateSecretMutation } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

import { secretSchema } from './form/secret-schema';
import { Scope, UpdateSecretRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';

type UpdateSecretModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  secretId: string;
};

export const UpdateSecretModal = ({ isOpen, onClose, secretId }: UpdateSecretModalProps) => {
  // Secret update mutation
  const { mutateAsync: updateSecret, isPending: isUpdateSecretPending } = useUpdateSecretMutation();

  // Get existing secret details (for labels)
  const { data: secretList } = useListSecretsQuery();

  const matchingSecret = secretList?.secrets?.find((secret) => secret?.id === secretId);

  // Get pipelines using this secret
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({
    secretId,
  });
  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const handleClose = () => {
    form.reset();
    onClose?.();
  };

  // Get existing labels from the secret
  const existingLabels = matchingSecret?.labels
    ? Object.entries(matchingSecret.labels)
        .filter(([key, value]) => !(key === 'owner' && value === 'console'))
        .map(([key, value]) => ({ key, value }))
    : [{ key: '', value: '' }];

  const updateSchema = secretSchema(z.string().optional());

  const formOpts = formOptions({
    defaultValues: {
      id: secretId,
      value: '',
      scopes: matchingSecret?.scopes ?? [],
      labels: existingLabels.length > 0 ? existingLabels : [],
    },
    validators: {
      // @ts-expect-error - Zod schema type incompatibility with @tanstack/react-form validators
      onChange: updateSchema,
    },
    onSubmit: async ({ value }) => {
      const labelsMap: { [key: string]: string } = {};
      for (const label of value.labels) {
        if (label.key && label.value) {
          labelsMap[label.key] = label.value;
        }
      }

      const request = create(UpdateSecretRequestSchema, {
        id: value.id,
        secretData: base64ToUInt8Array(encodeBase64(value.value)),
        scopes: value.scopes || [],
        labels: labelsMap,
      });

      await updateSecret({ request });
      handleClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  const scopeOptions = [
    { label: 'Redpanda Connect', value: Scope.REDPANDA_CONNECT },
    { label: 'Redpanda Cluster', value: Scope.REDPANDA_CLUSTER },
    { label: 'MCP Server', value: Scope.MCP_SERVER },
    { label: 'AI Agent', value: Scope.AI_AGENT },
    { label: 'AI Gateway', value: Scope.AI_GATEWAY },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Update Secret</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={4}>
                <ResourceInUseAlert pipelines={matchingPipelines} resource="secret" usedBy="pipelines" />

                <form.AppField name="id">
                  {(field) => <field.TextField data-testid="secret-id-field" isDisabled label="ID" />}
                </form.AppField>

                <form.AppField name="value">
                  {(field) => <field.PasswordField data-testid="secret-value-field" label="Value" />}
                </form.AppField>

                <form.AppField name="scopes">
                  {({ state, handleChange, handleBlur }) => (
                    <FormField errorText=" " isInvalid={state.meta.errors?.length > 0} label="Scopes">
                      <Select
                        defaultValue={scopeOptions.filter((so) => matchingSecret?.scopes?.some((s) => so.value === s))}
                        isMulti
                        onBlur={handleBlur}
                        onChange={(nextValue) => {
                          if (isMultiValue(nextValue) && nextValue) {
                            handleChange(nextValue.map(({ value }) => value));
                          }
                        }}
                        options={scopeOptions}
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
              <ButtonGroup isDisabled={isUpdateSecretPending}>
                <form.SubscribeButton
                  data-testid="update-secret-button"
                  label="Update"
                  loadingText="Updating"
                  variant="brand"
                />
                <Button data-testid="cancel-button" onClick={onClose} variant="ghost">
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
