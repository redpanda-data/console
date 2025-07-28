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
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';
import { deleteSecretSchema } from './form/delete-secret-schema';

export interface DeleteSecretModalProps {
  secretId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteSecretModal = ({ secretId, isOpen, onClose }: DeleteSecretModalProps) => {
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending, error: deleteSecretError } = useDeleteSecretMutation();

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
    <Modal size="lg" isOpen={isOpen} onClose={handleClose} onEsc={handleClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Secret</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                {deleteSecretError && (
                  <Alert status="error" variant="subtle" data-testid="delete-secret-error">
                    <AlertIcon />
                    {deleteSecretError.message}
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
