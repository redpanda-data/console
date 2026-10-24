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

import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { useState } from 'react';

import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import type { DataColumnKey } from '../../../../../state/ui';
import { toJson } from '../../../../../utils/json-utils';
import { base64FromUInt8Array } from '../../../../../utils/utils';

// Define the column order as a constant
const COLUMN_ORDER: DataColumnKey[] = ['timestamp', 'partitionID', 'offset', 'key', 'value', 'keySize', 'valueSize'];

function cleanPayload(p: Payload, includeRawContent: boolean): Payload | undefined {
  if (!p) {
    return;
  }

  const cleanedPayload = {
    payload: p.payload,
    rawPayload: includeRawContent && p.rawBytes ? base64FromUInt8Array(p.rawBytes) : undefined,
    encoding: p.encoding,
    isPayloadNull: p.isPayloadNull,
    schemaId: 0,
    size: p.size,
  } as Payload;

  if (p.schemaId && p.schemaId !== 0) {
    cleanedPayload.schemaId = p.schemaId;
  }

  return cleanedPayload;
}

function cleanMessage(src: TopicMessage, includeRawContent: boolean): Partial<TopicMessage> {
  return {
    partitionID: src.partitionID,
    offset: src.offset,
    timestamp: src.timestamp,
    compression: src.compression,
    isTransactional: src.isTransactional,
    headers: src.headers.map((h) => ({
      key: h.key,
      value: cleanPayload(h.value, includeRawContent) as Payload,
    })),
    key: cleanPayload(src.key, includeRawContent),
    value: cleanPayload(src.value, includeRawContent),
  };
}

function csvHeaders(firstMessage: TopicMessage): string[] {
  const headers: string[] = [...COLUMN_ORDER];

  // Add other common fields that might not be in COLUMN_ORDER
  if (firstMessage.compression && !headers.includes('compression')) {
    headers.push('compression');
  }
  if (firstMessage.isTransactional !== undefined && !headers.includes('isTransactional')) {
    headers.push('isTransactional');
  }

  return headers;
}

// Commas inside a payload would split the cell, so they become semicolons.
function csvPayloadCell(payload: Payload | undefined): string {
  if (!payload) {
    return '';
  }
  const content = payload.payload || '';
  return typeof content === 'object' ? JSON.stringify(content).replace(/,/g, ';') : String(content).replace(/,/g, ';');
}

function csvCell(message: TopicMessage, header: string): string | number | boolean {
  if (header === 'key') {
    return csvPayloadCell(message.key);
  }
  if (header === 'value') {
    return csvPayloadCell(message.value);
  }
  if (header === 'keySize') {
    return message.key?.size || '';
  }
  if (header === 'valueSize') {
    return message.value?.size || '';
  }
  // For other simple fields like partitionID, offset, timestamp, compression, isTransactional
  const messageValue = (message as Record<string, unknown>)[header];
  return messageValue !== undefined && messageValue !== null ? (messageValue as string | number | boolean) : '';
}

function convertToCSV(messagesToConvert: TopicMessage[]): string {
  if (messagesToConvert.length === 0) {
    return '';
  }

  const headers = csvHeaders(messagesToConvert[0]);

  // Add the headers
  const csvRows: string[] = [headers.join(',')];

  // Add the data, with fields in the same order as headers
  for (const message of messagesToConvert) {
    csvRows.push(headers.map((header) => csvCell(message, header)).join(','));
  }

  return csvRows.join('\n');
}

function downloadFile(content: string, type: string, fileName: string) {
  const link = document.createElement('a');
  const file = new Blob([content], { type });
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  document.body.appendChild(link); // required in firefox
  link.click();
}

export const SaveMessagesDialog = ({
  messages,
  onClose,
  onRequireRawPayload: _onRequireRawPayload,
}: {
  messages: TopicMessage[] | null;
  onClose: () => void;
  onRequireRawPayload: () => Promise<TopicMessage[]>;
}) => {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [includeRawContent, setIncludeRawContent] = useState(false);

  const count = messages?.length ?? 0;
  const title = count > 1 ? 'Save Messages' : 'Save Message';

  const saveMessages = () => {
    if (!messages) {
      return;
    }

    const cleaned = messages.map((src) => cleanMessage(src, includeRawContent));

    if (format === 'json') {
      downloadFile(toJson(cleaned, 4), 'application/json', 'messages.json');
    } else if (format === 'csv') {
      downloadFile(convertToCSV(cleaned as TopicMessage[]), 'text/csv', 'messages.csv');
    }

    onClose();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={count > 0}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div>Select the format in which you want to save {count === 1 ? 'the message' : 'all messages'}</div>
          <div className="py-2">
            <RadioGroup onValueChange={(val) => setFormat(val as 'json' | 'csv')} value={format}>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="format-json" value="json" />
                <label htmlFor="format-json">JSON</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="format-csv" testId="csv_field" value="csv" />
                <label htmlFor="format-csv">CSV</label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeRawContent}
              id="include-raw"
              onCheckedChange={(checked) => setIncludeRawContent(checked === true)}
            />
            <label htmlFor="include-raw">Include raw data</label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button disabled={!messages || messages.length === 0} onClick={() => saveMessages()} variant="primary">
            Save Messages
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
