/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from '@redpanda-data/ui';
import { PortalContainerProvider } from 'components/redpanda-ui/lib/use-portal-container';
import { type FC, useState } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { PreviewSettings } from '../preview-settings';

export const PreviewFieldsModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
  messages: TopicMessage[];
  topicName: string;
}> = ({ getShowDialog, setShowDialog, messages, topicName }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <Modal
      isOpen={getShowDialog()}
      onClose={() => {
        setShowDialog(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="4xl" ref={setContainer}>
        {/* Registry popups portal into the modal, inside its focus and scroll lock */}
        <PortalContainerProvider value={container ?? undefined}>
          <ModalHeader>Preview fields</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <PreviewSettings messages={messages} topicName={topicName} />
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              colorScheme="red"
              onClick={() => {
                setShowDialog(false);
              }}
            >
              Close
            </Button>
          </ModalFooter>
        </PortalContainerProvider>
      </ModalContent>
    </Modal>
  );
};
