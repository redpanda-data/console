import {
  Box,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { openModal } from '../../../utils/ModalContainer';

const ExplicitConfirmModal = observer(
  (p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    secondaryButtonContent: JSX.Element;

    onPrimaryButton: (closeModal: () => void) => void;
    onSecondaryButton: (closeModal: () => void) => void;

    closeModal: () => void;

    requiredText?: string;
  }) => {
    const [confirmBoxText, setConfirmBoxText] = useState('');

    const requiredText = p.requiredText ?? 'delete';
    const isConfirmEnabled = confirmBoxText === requiredText;

    return (
      <Modal isOpen onClose={p.closeModal} isCentered size="2xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader mr="4">{p.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {p.body}

            <Box mt="4">
              To confirm, enter "{requiredText}":
              <Input onChange={(e) => setConfirmBoxText(e.target.value)} autoFocus />
            </Box>
          </ModalBody>

          <ModalFooter>
            <Button
              mr={3}
              isDisabled={!isConfirmEnabled}
              onClick={() => p.onPrimaryButton(p.closeModal)}
              colorScheme="red"
            >
              {p.primaryButtonContent}
            </Button>
            <Button variant="outline" onClick={() => p.onSecondaryButton(p.closeModal)}>
              {p.secondaryButtonContent}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  },
);

export function openDeleteModal(transformName: string, onConfirm: () => void) {
  openModal(ExplicitConfirmModal, {
    title: <>Permanently delete transform {transformName}</>,
    body: <>Deleting a transform cannot be undone.</>,
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
