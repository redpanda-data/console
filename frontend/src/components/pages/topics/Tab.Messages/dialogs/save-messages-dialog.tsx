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
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  RadioGroup,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';

import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import type { DataColumnKey } from '../../../../../state/ui';
import { toJson } from '../../../../../utils/json-utils';
import { base64FromUInt8Array } from '../../../../../utils/utils';

// Define the column order as a constant
const COLUMN_ORDER: DataColumnKey[] = ['timestamp', 'partitionID', 'offset', 'key', 'value', 'keySize', 'valueSize'];

@observer
export class SaveMessagesDialog extends Component<{
  messages: TopicMessage[] | null;
  onClose: () => void;
  onRequireRawPayload: () => Promise<TopicMessage[]>;
}> {
  @observable isOpen = false;
  @observable format = 'json' as 'json' | 'csv';
  @observable includeRawContent = false;

  radioStyle = { display: 'block', lineHeight: '30px' };

  constructor(p: {
    messages: TopicMessage[] | null;
    onClose: () => void;
    onRequireRawPayload: () => Promise<TopicMessage[]>;
  }) {
    super(p);
    makeObservable(this);
  }

  render() {
    const { messages, onClose } = this.props;
    const count = messages?.length ?? 0;
    const title = count > 1 ? 'Save Messages' : 'Save Message';

    // Keep dialog open after closing it, so it can play its closing animation
    if (count > 0 && !this.isOpen) {
      setTimeout(() => (this.isOpen = true));
    }
    if (this.isOpen && count === 0) {
      setTimeout(() => (this.isOpen = false));
    }

    return (
      <Modal isOpen={count > 0} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minW="2xl">
          <ModalHeader>{title}</ModalHeader>
          <ModalBody display="flex" flexDirection="column" gap="4">
            <div>Select the format in which you want to save {count === 1 ? 'the message' : 'all messages'}</div>
            <Box py={2}>
              <RadioGroup
                name="format"
                onChange={(value) => (this.format = value)}
                options={[
                  {
                    value: 'json',
                    label: 'JSON',
                  },
                  {
                    value: 'csv',
                    label: 'CSV',
                  },
                ]}
                value={this.format}
              />
            </Box>
            <Checkbox isChecked={this.includeRawContent} onChange={(e) => (this.includeRawContent = e.target.checked)}>
              Include raw data
            </Checkbox>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button colorScheme="red" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              isDisabled={!this.props.messages || this.props.messages.length === 0}
              onClick={() => this.saveMessages()}
              variant="solid"
            >
              Save Messages
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  saveMessages() {
    const messages = this.props.messages;
    if (!messages) {
      return;
    }

    const cleanMessages = this.cleanMessages(messages);

    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`saving cleaned messages; messages: ${messages.length}`);

    if (this.format === 'json') {
      const json = toJson(cleanMessages, 4);
      const link = document.createElement('a');
      const file = new Blob([json], { type: 'application/json' });
      link.href = URL.createObjectURL(file);
      link.download = 'messages.json';
      document.body.appendChild(link); // required in firefox
      link.click();
    } else if (this.format === 'csv') {
      const csvContent = this.convertToCSV(cleanMessages as TopicMessage[]);
      const link = document.createElement('a');
      const file = new Blob([csvContent], { type: 'text/csv' });
      link.href = URL.createObjectURL(file);
      link.download = 'messages.csv';
      document.body.appendChild(link); // required in firefox
      link.click();
    }

    this.props.onClose();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 40, refactor later
  convertToCSV(messages: TopicMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const headers: string[] = [...COLUMN_ORDER];

    // Add other common fields that might not be in COLUMN_ORDER
    if (messages[0].compression && !headers.includes('compression')) {
      headers.push('compression');
    }
    if (messages[0].isTransactional !== undefined && !headers.includes('isTransactional')) {
      headers.push('isTransactional');
    }

    const csvRows: string[] = [];

    // Add the headers
    csvRows.push(headers.join(','));

    // Add the data
    for (const message of messages) {
      const values: (string | number | boolean)[] = [];

      // Add fields in the same order as headers
      for (const header of headers) {
        if (header === 'key') {
          if (message.key) {
            const keyValue = message.key.payload || '';
            values.push(
              typeof keyValue === 'object'
                ? JSON.stringify(keyValue).replace(/,/g, ';')
                : String(keyValue).replace(/,/g, ';')
            );
          } else {
            values.push('');
          }
        } else if (header === 'value') {
          if (message.value) {
            const valuePayload = message.value.payload || '';
            values.push(
              typeof valuePayload === 'object'
                ? JSON.stringify(valuePayload).replace(/,/g, ';')
                : String(valuePayload).replace(/,/g, ';')
            );
          } else {
            values.push('');
          }
        } else if (header === 'keySize') {
          values.push(message.key?.size || '');
        } else if (header === 'valueSize') {
          values.push(message.value?.size || '');
        } else {
          // For other simple fields like partitionID, offset, timestamp, compression, isTransactional
          const messageValue = (message as Record<string, unknown>)[header];
          values.push(
            messageValue !== undefined && messageValue !== null ? (messageValue as string | number | boolean) : ''
          );
        }
      }

      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  cleanMessages(messages: TopicMessage[]): unknown[] {
    const ar: unknown[] = [];

    // create a copy of each message, omitting properties that don't make
    // sense for the user, like 'size' or caching properties like 'keyJson'.
    const includeRaw = this.includeRawContent;

    const cleanPayload = (p: Payload): Payload | undefined => {
      if (!p) {
        return undefined;
      }

      const cleanedPayload = {
        payload: p.payload,
        rawPayload: includeRaw && p.rawBytes ? base64FromUInt8Array(p.rawBytes) : undefined,
        encoding: p.encoding,
        isPayloadNull: p.isPayloadNull,
        schemaId: 0,
        size: p.size,
      } as Payload;

      if (p.schemaId && p.schemaId !== 0) {
        cleanedPayload.schemaId = p.schemaId;
      }

      return cleanedPayload;
    };

    for (const src of messages) {
      const msg = {} as Partial<typeof src>;

      msg.partitionID = src.partitionID;
      msg.offset = src.offset;
      msg.timestamp = src.timestamp;
      msg.compression = src.compression;
      msg.isTransactional = src.isTransactional;

      msg.headers = src.headers.map((h) => ({
        key: h.key,
        value: cleanPayload(h.value) as Payload,
      }));

      msg.key = cleanPayload(src.key);
      msg.value = cleanPayload(src.value);

      ar.push(msg);
    }

    return ar;
  }
}
