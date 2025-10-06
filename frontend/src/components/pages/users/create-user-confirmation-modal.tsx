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

type CreateUserConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  password: string;
  saslMechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
};

export const CreateUserConfirmationModal = ({
  isOpen,
  onClose,
  username,
  password,
  saslMechanism,
}: CreateUserConfirmationModalProps) => (
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
          <Grid alignItems="center" gridColumnGap={6} gridRowGap={2} maxWidth="460px" templateColumns="max-content 1fr">
            <Box data-testid="username" fontWeight="bold">
              Username
            </Box>
            <Box>
              <Flex alignItems="center" gap={2}>
                <Text overflow="hidden" wordBreak="break-all">
                  {username}
                </Text>

                <Tooltip hasArrow label={'Copy username'} placement="top">
                  <CopyButton content={username} variant="ghost" />
                </Tooltip>
              </Flex>
            </Box>

            <Box data-testid="password" fontWeight="bold">
              Password
            </Box>
            <Box>
              <Flex alignItems="center" gap={2}>
                <PasswordInput isDisabled={true} isReadOnly={true} name="test" value={password} />

                <Tooltip hasArrow label={'Copy password'} placement="top">
                  <CopyButton content={password} variant="ghost" />
                </Tooltip>
              </Flex>
            </Box>

            <Box data-testid="mechanism" fontWeight="bold">
              Mechanism
            </Box>
            <Box>
              <Text isTruncated={true} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {saslMechanism}
              </Text>
            </Box>
          </Grid>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button variant="link">
            <Link as={ReactRouterLink} rel="noopener noreferrer" target="_blank" to="/security/acls">
              Create ACLs
            </Link>
          </Button>

          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
