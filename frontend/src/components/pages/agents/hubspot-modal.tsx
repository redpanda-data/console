import {
  Box,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';

import './hubspot-modal.scss';
import { AI_AGENTS_SUMMARY } from './agent-list-page';

interface HubspotModalProps {
  isOpen: boolean;
  isSubmitted: boolean;
  onClose: () => void;
}

const HubspotModal = ({ isOpen, isSubmitted, onClose }: HubspotModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent px={1} pt={0} pb={4}>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <ModalHeader paddingInlineStart={0} pb={0}>
              Try Redpanda AI Agents for free
            </ModalHeader>
            {!isSubmitted && <Text>{AI_AGENTS_SUMMARY}</Text>}
            <Box id="hubspot-modal" />
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default HubspotModal;
