import {
  Box,
  Button,
  ButtonGroup,
  Code,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { useEffect } from 'react';
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useDeleteSecretMutationWithToast } from 'react-query/api/secret';
import { deleteSecretSchema } from './form/delete-secret-schema';
import { SecretInUseAlert } from './secret-in-use-alert';

export interface DeleteSecretModalProps {
  secretId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteSecretModal = ({ secretId, isOpen, onClose }: DeleteSecretModalProps) => {
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending } = useDeleteSecretMutationWithToast();

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const formOpts = formOptions({
    defaultValues: {
      confirmationText: '',
    },
    validators: {
      onChange: deleteSecretSchema(secretId),
    },
    onSubmit: async () => {
      await deleteSecret({
        request: { id: secretId },
      });
      form.reset();
      onClose();
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
    <Modal size="lg" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Secret</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                <Text>
                  This action will cause data loss. To confirm, type <Code>{secretId}</Code> into the confirmation box
                  below.
                </Text>
                <SecretInUseAlert pipelines={matchingPipelines} />

                <form.AppField name="confirmationText">
                  {(field) => (
                    <field.TextField
                      placeholder={`Type "${secretId}" to confirm`}
                      transform={(value) => value.toUpperCase()}
                      data-testid="txt-confirmation-delete"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Box alignSelf="end">
                <ButtonGroup isDisabled={isDeleteSecretPending}>
                  <form.SubscribeButton
                    label="Delete"
                    variant="delete"
                    data-testid="delete-secret-button"
                    id="delete-modal-btn"
                    loadingText="Deleting"
                  />
                  <Button variant="ghost" data-testid="cancel-button" onClick={onClose}>
                    Cancel
                  </Button>
                </ButtonGroup>
              </Box>
            </ModalFooter>
          </form.AppForm>
        </form>
      </ModalContent>
    </Modal>
  );
};
