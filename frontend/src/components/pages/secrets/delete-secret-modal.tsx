import {
  Alert,
  AlertIcon,
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
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useDeleteSecretMutation } from 'react-query/api/secret';
import { useState } from 'react';
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';
import { deleteSecretSchema } from './form/delete-secret-schema';

export interface DeleteSecretModalProps {
  secretId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteSecretModal = ({ secretId, isOpen, onClose }: DeleteSecretModalProps) => {
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending } = useDeleteSecretMutation();

  const [error, setError] = useState<string | null>(null);

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const handleClose = () => {
    form.reset();
    setError(null);
    onClose();
  };

  const formOpts = formOptions({
    defaultValues: {
      confirmationText: '',
    },
    validators: {
      onChange: deleteSecretSchema(secretId),
    },
    onSubmit: async () => {
      setError(null);
      try {
        await deleteSecret({
          request: { id: secretId },
        });
        handleClose();
      } catch (err: any) {
        // Try to extract a user-friendly error message
        let message = 'Failed to delete secret.';
        if (err?.message) {
          message = err.message;
        }
        setError(message);
      }
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal size="lg" isOpen={isOpen} onClose={handleClose} onEsc={handleClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Secret</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                {error && (
                  <Alert status="error" variant="subtle" data-testid="delete-secret-error">
                    <AlertIcon />
                    {error}
                  </Alert>
                )}
                <Text>
                  This action will cause data loss. To confirm, type <Code>{secretId}</Code> into the confirmation box
                  below.
                </Text>
                <ResourceInUseAlert resource="secret" usedBy="pipelines" pipelines={matchingPipelines} />

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
                  <Button variant="ghost" data-testid="cancel-button" onClick={handleClose}>
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
