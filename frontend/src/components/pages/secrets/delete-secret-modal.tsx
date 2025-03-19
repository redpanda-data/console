import {
  Alert,
  AlertDescription,
  AlertTitle,
  Box,
  Button,
  ButtonGroup,
  Code,
  Flex,
  FormField,
  Icon,
  Input,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  UnorderedList,
} from '@redpanda-data/ui';
import { useCallback, useState } from 'react';
import { AiOutlineExclamationCircle } from 'react-icons/ai';
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useDeleteSecretMutationWithToast } from 'react-query/api/secret';

export const DeleteSecretModal = ({
  secretId,
  isOpen,
  onClose,
}: { secretId: string; isOpen: boolean; onClose: () => void }) => {
  const [valid, setValid] = useState('');

  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending } = useDeleteSecretMutationWithToast();

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];
  const isSecretInUse = matchingPipelines.length > 0;

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
            {isSecretInUse && (
              <Alert
                status="error"
                variant="subtle"
                borderRadius="8px"
                mt={4}
                borderWidth="1px"
                borderColor="red.200"
                bg="white"
                p={4}
              >
                <Flex gap="12px">
                  <Icon as={AiOutlineExclamationCircle} boxSize={4} color="red.600" />
                  <Box>
                    <AlertTitle fontSize="16px" fontWeight="500" color="red.600" lineHeight="1em" mb="4px">
                      Secret is in use
                    </AlertTitle>
                    <AlertDescription fontSize="14px" fontWeight="400" color="red.600" lineHeight="1.71em">
                      The secret that you are about to delete is still in use for the following Redpanda Connect
                      pipelines:
                      <UnorderedList>
                        {matchingPipelines.length > 0 && (
                          <ListItem mt={2} color="red.600" whiteSpace="pre-line">
                            {matchingPipelines.map((pipeline) => pipeline.displayName || pipeline.id).join('\n')}
                          </ListItem>
                        )}
                      </UnorderedList>
                    </AlertDescription>
                  </Box>
                </Flex>
              </Alert>
            )}
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
