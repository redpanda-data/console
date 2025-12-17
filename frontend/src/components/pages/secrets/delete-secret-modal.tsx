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

import { deleteSecretSchema } from './form/delete-secret-schema';
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';

export type DeleteSecretModalProps = {
  secretId: string;
  isOpen: boolean;
  onClose: () => void;
};

export const DeleteSecretModal = ({ secretId, isOpen, onClose }: DeleteSecretModalProps) => {
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const {
    mutateAsync: deleteSecret,
    isPending: isDeleteSecretPending,
    error: deleteSecretError,
  } = useDeleteSecretMutation();

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const handleClose = () => {
    form.reset();
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
      await deleteSecret({
        request: { id: secretId },
      });
      handleClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal isCentered isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Secret</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                {Boolean(deleteSecretError) && (
                  <Alert data-testid="delete-secret-error" status="error" variant="subtle">
                    <AlertIcon />
                    {deleteSecretError.message}
                  </Alert>
                )}
                <Text>
                  This action will cause data loss. To confirm, type <Code>{secretId}</Code> into the confirmation box
                  below.
                </Text>
                <ResourceInUseAlert pipelines={matchingPipelines} resource="secret" usedBy="pipelines" />

                <form.AppField name="confirmationText">
                  {(field) => (
                    <field.TextField
                      data-testid="txt-confirmation-delete"
                      placeholder={`Type "${secretId}" to confirm`}
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Box alignSelf="end">
                <ButtonGroup isDisabled={isDeleteSecretPending}>
                  <form.SubscribeButton
                    data-testid="delete-secret-button"
                    id="delete-modal-btn"
                    label="Delete"
                    loadingText="Deleting"
                    variant="delete"
                  />
                  <Button data-testid="cancel-button" onClick={handleClose} variant="ghost">
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
