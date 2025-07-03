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
import { Scope, UpdateSecretRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';
import { secretSchema } from './form/secret-schema';

interface UpdateSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  secretId: string;
}

export const UpdateSecretModal = ({ isOpen, onClose, secretId }: UpdateSecretModalProps) => {
  // Secret update mutation
  const { mutateAsync: updateSecret, isPending: isUpdateSecretPending } = useUpdateSecretMutation();

  // Get existing secret details (for labels)
  const { data: secretList } = useListSecretsQuery();

  const matchingSecret = secretList?.secrets?.find((secret) => secret?.id === secretId);

  // Get pipelines using this secret
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const handleClose = () => {
    form.reset();
    onClose();
  };

  // Get existing labels from the secret
  const existingLabels = matchingSecret?.labels
    ? Object.entries(matchingSecret.labels)
        .filter(([key, value]) => !(key === 'owner' && value === 'console'))
        .map(([key, value]) => ({ key, value }))
    : [{ key: '', value: '' }];

  const formOpts = formOptions({
    defaultValues: {
      id: secretId,
      value: '',
      scopes: matchingSecret?.scopes ?? [],
      labels: existingLabels.length > 0 ? existingLabels : [],
    },
    validators: {
      onChange: secretSchema(),
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
        // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
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
                <ResourceInUseAlert resource="secret" usedBy="pipelines" pipelines={matchingPipelines} />

                <form.AppField name="id">
                  {(field) => <field.TextField label="ID" isDisabled data-testid="secret-id-field" />}
                </form.AppField>

                <form.AppField name="value">
                  {(field) => <field.PasswordField label="Value" data-testid="secret-value-field" />}
                </form.AppField>

                <form.AppField name="scopes">
                  {({ state, handleChange, handleBlur }) => (
                    <FormField label="Scopes" errorText=" " isInvalid={state.meta.errors?.length > 0}>
                      <Select
                        placeholder="Select scopes"
                        onChange={(nextValue) => {
                          if (isMultiValue(nextValue) && nextValue) {
                            handleChange(nextValue.map(({ value }) => value));
                          }
                        }}
                        options={scopeOptions}
                        defaultValue={scopeOptions.filter((so) => matchingSecret?.scopes?.some((s) => so.value === s))}
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
              <ButtonGroup isDisabled={isUpdateSecretPending}>
                <form.SubscribeButton
                  label="Update"
                  variant="brand"
                  data-testid="update-secret-button"
                  loadingText="Updating"
                />
                <Button variant="ghost" data-testid="cancel-button" onClick={onClose}>
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
