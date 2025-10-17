/**
 * Copyright 2022 Redpanda Data, Inc.
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
import { observer } from 'mobx-react';
import type { FC } from 'react';

import type { MessageSearch } from '../../../../../state/backend-api';
import { PreviewSettings } from '../preview-settings';

export const PreviewFieldsModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
  messageSearch: MessageSearch;
}> = observer(({ getShowDialog, setShowDialog, messageSearch }) => (
  <Modal
    isOpen={getShowDialog()}
    onClose={() => {
      setShowDialog(false);
    }}
  >
    <ModalOverlay />
    <ModalContent minW="4xl">
      <ModalHeader>Preview fields</ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        <PreviewSettings messageSearch={messageSearch} />
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
    </ModalContent>
  </Modal>
));
