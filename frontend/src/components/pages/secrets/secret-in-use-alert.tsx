import { Alert, AlertDescription, AlertTitle, Box, Flex, Icon, ListItem, UnorderedList } from '@redpanda-data/ui';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { AiOutlineExclamationCircle } from 'react-icons/ai';

export const SecretInUseAlert = ({ pipelines }: { pipelines: Pipeline[] }) => {
  if (pipelines.length === 0) {
    return null;
  }

  return (
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
            The secret that you are about to delete is still in use for the following Redpanda Connect pipelines:
            <UnorderedList>
              {pipelines.map((pipeline) => (
                <ListItem key={pipeline.id} mt={2} color="red.600" whiteSpace="pre-line">
                  {pipeline.displayName || pipeline.id}
                </ListItem>
              ))}
            </UnorderedList>
          </AlertDescription>
        </Box>
      </Flex>
    </Alert>
  );
};
