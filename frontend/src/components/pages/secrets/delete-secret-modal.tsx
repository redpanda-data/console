import {
  Alert,
  AlertDescription,
  AlertTitle,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Icon,
  Input,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  UnorderedList,
} from '@redpanda-data/ui';
import { AiOutlineExclamationCircle } from 'react-icons/ai';
import { useGetPipelinesForSecretQuery } from 'react-query/api/pipeline';
import { useDeleteSecretMutationWithToast } from 'react-query/api/secret';

export const DeleteSecretModal = ({
  secretId,
  isOpen,
  onClose,
}: { secretId: string; isOpen: boolean; onClose: () => void }) => {
  const { data: pipelinesForSecret } = useGetPipelinesForSecretQuery({ secretId });
  const { mutateAsync: deleteSecret, isPending: isDeleteSecretPending } = useDeleteSecretMutationWithToast();

  const matchingPipelines = pipelinesForSecret?.response?.pipelinesForSecret?.pipelines ?? [];
  const isSecretInUse = matchingPipelines.length > 0;

  return (
    <>
      <Modal size="2xl" isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Secret</ModalHeader>

          <ModalBody pb={6}>
            <FormControl>
              <FormLabel>Identifier</FormLabel>
              <Input value={secretId} isDisabled />
            </FormControl>

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
          </ModalBody>

          <ModalFooter>
            <Button
              variant="outline-delete"
              isDisabled={isDeleteSecretPending}
              isLoading={isDeleteSecretPending}
              onClick={async () => {
                await deleteSecret({
                  request: { id: secretId },
                });
                onClose();
              }}
            >
              Delete Secret
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
