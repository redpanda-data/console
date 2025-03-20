import {
  Box,
  Button,
  ButtonGroup,
  Code,
  FormField,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { useCallback, useState } from 'react';
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useDeleteSecretMutationWithToast } from 'react-query/api/secret';
import { SecretInUseAlert } from './secret-in-use-alert';

export const DeleteSecretModal = ({
  secretId,
  isOpen,
  onClose,
}: { secretId: string; isOpen: boolean; onClose: () => void }) => {
  const [valid, setValid] = useState('');

  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending } = useDeleteSecretMutationWithToast();

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];

  const inputMatchText = secretId;

  const inputTextDoesNotMatch = useCallback(
    (text: string) => {
      return text.toUpperCase() !== inputMatchText.toUpperCase();
    },
    [inputMatchText],
  );

  return (
    <Modal size="lg" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Delete Secret</ModalHeader>
        <ModalBody mb={4}>
          <Stack spacing={4}>
            <Text>
              This action will cause data loss. To confirm, type <Code>{inputMatchText}</Code> into the confirmation box
              below.
            </Text>
            <SecretInUseAlert pipelines={matchingPipelines} />
            <FormField
              label="" // Note: doesn't currently support react element
              isInvalid={valid !== '' && inputTextDoesNotMatch(valid)}
              errorText={`Text must match "${inputMatchText}"`}
            >
              <Input
                value={valid}
                type="text"
                name="name"
                data-testid="txt-confirmation-delete"
                placeholder={`Type "${inputMatchText}" to confirm`}
                onChange={(v) => setValid(v.target.value.toUpperCase())}
              />
            </FormField>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Box alignSelf="end">
            <ButtonGroup isDisabled={isDeleteSecretPending}>
              <Button
                variant="delete"
                data-testid="delete-button"
                id="delete-modal-btn"
                onClick={async () => {
                  await deleteSecret({
                    request: { id: secretId },
                  });
                  setValid('');
                  onClose();
                }}
                loadingText="Deleting"
                isLoading={isDeleteSecretPending}
                isDisabled={isDeleteSecretPending || valid === '' || inputTextDoesNotMatch(valid)}
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                data-testid="cancel-button"
                onClick={() => {
                  setValid('');
                  onClose();
                }}
              >
                Cancel
              </Button>
            </ButtonGroup>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
