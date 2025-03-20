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
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useListSecretsQuery, useUpdateSecretMutationWithToast } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { Scope, UpdateSecretRequest } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { secretSchema } from './form/secret-schema';
import { SecretInUseAlert } from './secret-in-use-alert';

interface UpdateSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  secretId: string;
}

export const UpdateSecretModal = ({ isOpen, onClose, secretId }: UpdateSecretModalProps) => {
  // Secret update mutation
  const { mutateAsync: updateSecret, isPending: isUpdateSecretPending } = useUpdateSecretMutationWithToast();

  // Get existing secret details (for labels)
  const { data: secretList } = useListSecretsQuery();

  const matchingSecret = secretList?.secrets?.find((secret) => secret?.id === secretId);

  // Get pipelines using this secret
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

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
      labels: existingLabels.length > 0 ? existingLabels : [{ key: '', value: '' }],
    },
    validators: {
      onChange: secretSchema,
    },
    onSubmit: async ({ value }) => {
      const labelsMap: { [key: string]: string } = {};
      for (const label of value.labels) {
        if (label.key && label.value) {
          labelsMap[label.key] = label.value;
        }
      }

      const request = new UpdateSecretRequest({
        id: value.id,
        // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
        secretData: base64ToUInt8Array(encodeBase64(value.value)),
        scopes: [Scope.REDPANDA_CONNECT],
        labels: labelsMap,
      });

      await updateSecret({ request });
      onClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Update Secret</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={4}>
                <SecretInUseAlert pipelines={matchingPipelines} />

                <form.AppField name="id">
                  {(field) => <field.TextField label="ID" isDisabled data-testid="secret-id-field" />}
                </form.AppField>

                <form.AppField name="value">
                  {(field) => <field.PasswordField label="Value" data-testid="secret-value-field" />}
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
                <form.SubscribeButton label="Update" variant="brand" data-testid="update-secret-button" />
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
