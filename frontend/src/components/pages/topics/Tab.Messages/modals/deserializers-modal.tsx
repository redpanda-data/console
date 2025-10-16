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
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { FC } from 'react';

import { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { uiState } from '../../../../../state/ui-state';
import { Label } from '../../../../../utils/tsx-utils';
import { SingleSelect } from '../../../../misc/select';

const payloadEncodingPairs = [
  { value: PayloadEncoding.UNSPECIFIED, label: 'Automatic' },
  { value: PayloadEncoding.NULL, label: 'None (Null)' },
  { value: PayloadEncoding.AVRO, label: 'AVRO' },
  { value: PayloadEncoding.PROTOBUF, label: 'Protobuf' },
  { value: PayloadEncoding.PROTOBUF_SCHEMA, label: 'Protobuf Schema' },
  { value: PayloadEncoding.JSON, label: 'JSON' },
  { value: PayloadEncoding.JSON_SCHEMA, label: 'JSON Schema' },
  { value: PayloadEncoding.XML, label: 'XML' },
  { value: PayloadEncoding.TEXT, label: 'Plain Text' },
  { value: PayloadEncoding.UTF8, label: 'UTF-8' },
  { value: PayloadEncoding.MESSAGE_PACK, label: 'Message Pack' },
  { value: PayloadEncoding.SMILE, label: 'Smile' },
  { value: PayloadEncoding.BINARY, label: 'Binary' },
  { value: PayloadEncoding.UINT, label: 'Unsigned Int' },
  { value: PayloadEncoding.CONSUMER_OFFSETS, label: 'Consumer Offsets' },
  { value: PayloadEncoding.CBOR, label: 'CBOR' },
];

export const DeserializersModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
}> = observer(({ getShowDialog, setShowDialog }) => {
  const searchParams = uiState.topicSettings.searchParams;

  return (
    <Modal
      isOpen={getShowDialog()}
      onClose={() => {
        setShowDialog(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="xl">
        <ModalHeader>Deserialize</ModalHeader>
        <ModalCloseButton />
        <ModalBody display="flex" flexDirection="column" gap={4}>
          <Text>
            Redpanda attempts to automatically detect a deserialization strategy. You can choose one manually here.
          </Text>
          <Box>
            <Label text="Key Deserializer">
              <SingleSelect<PayloadEncoding>
                onChange={(e) => (searchParams.keyDeserializer = e)}
                options={payloadEncodingPairs}
                value={searchParams.keyDeserializer}
              />
            </Label>
          </Box>
          <Label text="Value Deserializer">
            <SingleSelect<PayloadEncoding>
              onChange={(e) => (searchParams.valueDeserializer = e)}
              options={payloadEncodingPairs}
              value={searchParams.valueDeserializer}
            />
          </Label>
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
  );
});
