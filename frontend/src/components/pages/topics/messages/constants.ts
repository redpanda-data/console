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

export const COLUMN_LABELS: Record<DataColumnKey, string> = {
  offset: 'Offset',
  partitionID: 'Partition',
  timestamp: 'Timestamp',
  key: 'Key',
  value: 'Value',
  keySize: 'Key size',
  valueSize: 'Value size',
};

/** Segmented max-results / page-size options in the read-scope popover. */
export const LIMIT_OPTIONS = [10, 20, 50, 100];

/** Max rows kept in the table during live tail / continuous mode; older rows are trimmed. */
export const DISPLAY_WINDOW_CAP = 150;

export const PAYLOAD_ENCODING_PAIRS = [
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

export const PAYLOAD_ENCODING_LABELS = PAYLOAD_ENCODING_PAIRS.reduce(
  (acc, pair) => {
    acc[pair.value] = pair.label;
    return acc;
  },
  {} as Record<PayloadEncoding, string>
);
