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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import type { FC } from 'react';

import { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';

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
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
  setKeyDeserializer: (val: PayloadEncoding) => void;
  setValueDeserializer: (val: PayloadEncoding) => void;
}> = ({
  getShowDialog,
  setShowDialog,
  keyDeserializer,
  valueDeserializer,
  setKeyDeserializer,
  setValueDeserializer,
}) => (
  <Dialog onOpenChange={setShowDialog} open={getShowDialog()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Deserialize</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p>Redpanda attempts to automatically detect a deserialization strategy. You can choose one manually here.</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key-deserializer">Key Deserializer</Label>
          <Select
            onValueChange={(val) => setKeyDeserializer(Number(val) as PayloadEncoding)}
            value={
              payloadEncodingPairs.some((p) => p.value === keyDeserializer)
                ? String(keyDeserializer)
                : String(payloadEncodingPairs[0].value)
            }
          >
            <SelectTrigger id="key-deserializer">
              <SelectValue>
                {(value: unknown) => payloadEncodingPairs.find((p) => String(p.value) === String(value))?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {payloadEncodingPairs.map((pair) => (
                <SelectItem key={pair.value} value={String(pair.value)}>
                  {pair.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value-deserializer">Value Deserializer</Label>
          <Select
            onValueChange={(val) => setValueDeserializer(Number(val) as PayloadEncoding)}
            value={
              payloadEncodingPairs.some((p) => p.value === valueDeserializer)
                ? String(valueDeserializer)
                : String(payloadEncodingPairs[0].value)
            }
          >
            <SelectTrigger id="value-deserializer">
              <SelectValue>
                {(value: unknown) => payloadEncodingPairs.find((p) => String(p.value) === String(value))?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {payloadEncodingPairs.map((pair) => (
                <SelectItem key={pair.value} value={String(pair.value)}>
                  {pair.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={() => setShowDialog(false)} variant="secondary">
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
