import { WarningIcon } from '@chakra-ui/icons';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  type ThemeTypings,
} from '@redpanda-data/ui';
import { type ReactNode, useState } from 'react';

import { openModal } from '../../../utils/modal-container';

const GenericModal = (p: {
  title: JSX.Element;
  body: JSX.Element;
  primaryButtonContent: JSX.Element;
  secondaryButtonContent: JSX.Element;

  onPrimaryButton: (closeModal: () => void) => void;
  onSecondaryButton: (closeModal: () => void) => void;

  primaryColorScheme?: ThemeTypings['colorSchemes'];

  closeModal: () => void;
}) => (
  <Modal isCentered isOpen onClose={p.closeModal} size="2xl">
    <ModalOverlay />
    <ModalContent>
      <ModalHeader mr="4">{p.title}</ModalHeader>
      <ModalCloseButton />
      <ModalBody>{p.body}</ModalBody>

      <ModalFooter>
        <Button colorScheme={p.primaryColorScheme} mr={3} onClick={() => p.onPrimaryButton(p.closeModal)}>
          {p.primaryButtonContent}
        </Button>
        <Button onClick={() => p.onSecondaryButton(p.closeModal)} variant="outline">
          {p.secondaryButtonContent}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

const ExplicitConfirmModal = (p: {
  title: JSX.Element;
  body: JSX.Element;
  primaryButtonContent: JSX.Element;
  secondaryButtonContent: JSX.Element;

  onPrimaryButton: (closeModal: () => void) => void;
  onSecondaryButton: (closeModal: () => void) => void;

  closeModal: () => void;
}) => {
  const [confirmBoxText, setConfirmBoxText] = useState('');
  const isConfirmEnabled = confirmBoxText === 'delete';

  return (
    <Modal isCentered isOpen onClose={p.closeModal} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader mr="4">{p.title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {p.body}

          <Box mt="4">
            To confirm, enter "delete":
            <Input autoFocus onChange={(e) => setConfirmBoxText(e.target.value)} />
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button
            colorScheme="red"
            isDisabled={!isConfirmEnabled}
            mr={3}
            onClick={() => p.onPrimaryButton(p.closeModal)}
          >
            {p.primaryButtonContent}
          </Button>
          <Button onClick={() => p.onSecondaryButton(p.closeModal)} variant="outline">
            {p.secondaryButtonContent}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// A type of modal that simply shows some stuff and only has an "ok" button
const InfoModal = (p: {
  title: JSX.Element;
  body: JSX.Element;
  primaryButtonContent: ReactNode;
  onClose?: () => void;
  closeModal: () => void;
}) => (
  <Modal isCentered isOpen onClose={p.closeModal} size="2xl">
    <ModalOverlay />
    <ModalContent>
      <ModalHeader mr="4">{p.title}</ModalHeader>
      <ModalBody>{p.body}</ModalBody>
      <ModalFooter>
        <Button
          mr={3}
          onClick={() => {
            if (p.onClose) {
              p.onClose();
            }
            p.closeModal();
          }}
        >
          {p.primaryButtonContent}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

export function openInfoModal(p: {
  title: JSX.Element;
  body: JSX.Element;
  btnContent?: ReactNode;
  onClose?: () => void;
}) {
  openModal(InfoModal, {
    title: p.title,
    body: p.body,
    primaryButtonContent: p.btnContent ?? 'Close',
    onClose: p.onClose,
  });
}

export function openValidationErrorsModal(
  result: {
    isValid: boolean;
    errorDetails?: string | undefined;
    isCompatible?: boolean | undefined;
    compatibilityError?: { errorType: string; description: string } | undefined;
  },
  onClose?: () => void
) {
  const { isValid, errorDetails, isCompatible, compatibilityError } = result;

  let compatBox: JSX.Element | null = null;
  if (isCompatible !== undefined && isValid !== false) {
    if (isCompatible) {
      compatBox = (
        <Alert status="success" variant="subtle">
          <AlertIcon />
          No compatibility issues
        </Alert>
      );
    } else {
      compatBox = (
        <Alert status="error" variant="subtle">
          <AlertIcon />
          Compatibility issues found
        </Alert>
      );
    }
  }

  const compatErrorBox =
    compatibilityError && (compatibilityError.errorType || compatibilityError.description) ? (
      <Box>
        <Text fontWeight="semibold" mb="2">
          Compatibility Error Details:
        </Text>
        <Box background="gray.100" maxHeight="400px" overflowY="auto" p="6">
          {Boolean(compatibilityError.errorType) && (
            <Text color="red.600" fontWeight="bold" mb="2">
              Error: {compatibilityError.errorType.replace(/_/g, ' ')}
            </Text>
          )}
          {Boolean(compatibilityError.description) && <Text lineHeight="1.6">{compatibilityError.description}</Text>}
        </Box>
      </Box>
    ) : null;

  const errDetailsBox = errorDetails ? (
    <Box>
      <Text fontWeight="semibold" mb="2">
        Parsing Error:
      </Text>
      <Box background="gray.100" fontFamily="monospace" letterSpacing="-0.5px" maxHeight="400px" overflowY="auto" p="6">
        {errorDetails?.trim()}
      </Box>
    </Box>
  ) : null;

  openInfoModal({
    title: (
      <>
        <Text alignItems="center" color="red.500" display="flex">
          <WarningIcon fontSize="1.18em" mr="3" />
          Schema validation error
        </Text>
      </>
    ),
    body: (
      <>
        <Text mb="3">Schema validation failed due to the following error.</Text>
        <Flex direction="column" gap="4">
          {compatBox}
          {compatErrorBox}
          {errDetailsBox}
        </Flex>
      </>
    ),
    onClose,
  });
}

export function openDeleteModal(schemaVersionName: string, onConfirm: () => void) {
  openModal(GenericModal, {
    title: <>Delete schema version {schemaVersionName}</>,
    body: (
      <>
        This is a soft-delete operation. This schema version will remain readable. It can also be permanently deleted or
        recovered. {/* <Link>Learn more</Link> */}
        <br />
        <br />
        Are you sure?
      </>
    ),
    primaryButtonContent: <>Delete</>,
    primaryColorScheme: 'red',

    secondaryButtonContent: <>Cancel</>,

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}

export function openPermanentDeleteModal(schemaVersionName: string, onConfirm: () => void) {
  openModal(ExplicitConfirmModal, {
    title: <>Permanently delete schema version {schemaVersionName}</>,
    body: <>After this schema is permanently deleted, all metadata is removed and it is unrecoverable.</>,
    primaryButtonContent: <>Delete</>,
    secondaryButtonContent: <>Cancel</>,

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}
export function openSwitchSchemaFormatModal(onConfirm: () => void) {
  openModal(GenericModal, {
    title: <>Switch schema format?</>,
    body: (
      <>
        Switching schema formats will reset the schema you've started with and you will lose your progress.
        <br />
        Are you sure?
      </>
    ),
    primaryButtonContent: <>Switch format</>,
    secondaryButtonContent: <>Cancel</>,

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}
