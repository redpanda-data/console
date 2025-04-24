import {
  Alert,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  CopyButton,
  Flex,
  Grid,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  PasswordInput,
  Stack,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';

interface CreateUserConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  password: string;
  saslMechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
}

export const CreateUserConfirmationModal = ({
  isOpen,
  onClose,
  username,
  password,
  saslMechanism,
}: CreateUserConfirmationModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} onEsc={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create new User</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Alert status="info">
              <AlertIcon />
              <Text>You will not be able to view this password again. Make sure that it is copied and saved.</Text>
            </Alert>
            <Grid
              templateColumns="max-content 1fr"
              gridRowGap={2}
              gridColumnGap={6}
              alignItems="center"
              maxWidth="460px"
            >
              <Box fontWeight="bold" data-testid="username">
                Username
              </Box>
              <Box>
                <Flex alignItems="center" gap={2}>
                  <Text wordBreak="break-all" overflow="hidden">
                    {username}
                  </Text>

                  <Tooltip label={'Copy username'} placement="top" hasArrow>
                    <CopyButton content={username} variant="ghost" />
                  </Tooltip>
                </Flex>
              </Box>

              <Box fontWeight="bold" data-testid="password">
                Password
              </Box>
              <Box>
                <Flex alignItems="center" gap={2}>
                  <PasswordInput name="test" value={password} isDisabled={true} isReadOnly={true} />

                  <Tooltip label={'Copy password'} placement="top" hasArrow>
                    <CopyButton content={password} variant="ghost" />
                  </Tooltip>
                </Flex>
              </Box>

              <Box fontWeight="bold" data-testid="mechanism">
                Mechanism
              </Box>
              <Box>
                <Text textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden" isTruncated={true}>
                  {saslMechanism}
                </Text>
              </Box>
            </Grid>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <ButtonGroup>
            <Button variant="link">
              <Link as={ReactRouterLink} to="/security/acls" target="_blank" rel="noopener noreferrer">
                Create ACLs
              </Link>
            </Button>

            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
