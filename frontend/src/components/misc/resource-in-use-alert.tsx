import { Alert, AlertDescription, AlertTitle, Box, Flex, Icon, ListItem, UnorderedList } from '@redpanda-data/ui';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { AiOutlineExclamationCircle } from 'react-icons/ai';

interface ResourceInUseAlertProps {
  resource: string;
  usedBy: string;
  pipelines?: Pipeline[];
}

export const ResourceInUseAlert = ({ resource, usedBy, pipelines }: ResourceInUseAlertProps) => {
  if (pipelines?.length === 0) {
    return null;
  }

  return (
    <Alert
      bg="white"
      borderColor="red.200"
      borderRadius="8px"
      borderWidth="1px"
      data-testid="resource-in-use-alert"
      mt={4}
      p={4}
      status="error"
      variant="subtle"
    >
      <Flex gap="12px">
        <Icon as={AiOutlineExclamationCircle} boxSize={4} color="red.600" />
        <Box>
          <AlertTitle color="red.600" fontSize="16px" fontWeight="500" lineHeight="1em" mb="4px">
            Resource is in use
          </AlertTitle>
          <AlertDescription color="red.600" fontSize="14px" fontWeight="400" lineHeight="1.71em">
            The {resource} that you are about to delete is still in use by the following {usedBy}:
            <UnorderedList>
              {pipelines?.map((pipeline) => (
                <ListItem color="red.600" key={pipeline.id} whiteSpace="pre-line">
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
