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

import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { DataColumnKey } from '../../../../state/ui';

// Payload encoding options for deserializers
export const payloadEncodingPairs = [
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

export const PAYLOAD_ENCODING_LABELS = payloadEncodingPairs.reduce(
  (acc, pair) => {
    acc[pair.value] = pair.label;
    return acc;
  },
  {} as Record<PayloadEncoding, string>
);

// Define the column order as a constant
export const COLUMN_ORDER: DataColumnKey[] = [
  'timestamp',
  'partitionID',
  'offset',
  'key',
  'value',
  'keySize',
  'valueSize',
];

// Regex for checking printable ASCII characters
export const PRINTABLE_CHAR_REGEX = /[\x20-\x7E]/;

// Chakra UI select styles
export const defaultSelectChakraStyles = {
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: 'max-content',
  }),
  option: (provided: Record<string, unknown>) => ({
    ...provided,
    wordBreak: 'keep-all',
    whiteSpace: 'nowrap',
  }),
  menuList: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: 'min-content',
  }),
} as const;

export const inlineSelectChakraStyles = {
  ...defaultSelectChakraStyles,
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    _hover: {
      borderColor: 'transparent',
    },
  }),
  container: (provided: Record<string, unknown>) => ({
    ...provided,
    borderColor: 'transparent',
  }),
} as const;
