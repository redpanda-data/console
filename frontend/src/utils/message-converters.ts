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

import JSONBigIntFactory from 'json-bigint';

import {
  PayloadEncoding,
  PayloadEncodingSchema,
  CompressionType as ProtoCompressionType,
} from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { ListMessagesResponse_DataMessage } from '../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { CompressionType, type Payload, type TopicMessage } from '../state/rest-interfaces';

const JSONBigInt = JSONBigIntFactory({ storeAsString: true });

function mapPayloadEncoding(encoding: PayloadEncoding | undefined): Payload['encoding'] | undefined {
  switch (encoding) {
    case PayloadEncoding.NULL:
      return 'null';
    case PayloadEncoding.BINARY:
      return 'binary';
    case PayloadEncoding.XML:
      return 'xml';
    case PayloadEncoding.AVRO:
      return 'avro';
    case PayloadEncoding.JSON:
      return 'json';
    case PayloadEncoding.JSON_SCHEMA:
      return 'jsonSchema';
    case PayloadEncoding.PROTOBUF:
      return 'protobuf';
    case PayloadEncoding.PROTOBUF_SCHEMA:
      return 'protobufSchema';
    case PayloadEncoding.PROTOBUF_BSR:
      return 'protobufBSR';
    case PayloadEncoding.MESSAGE_PACK:
      return 'msgpack';
    case PayloadEncoding.TEXT:
      return 'text';
    case PayloadEncoding.UTF8:
      return 'utf8WithControlChars';
    case PayloadEncoding.UINT:
      return 'uint';
    case PayloadEncoding.SMILE:
      return 'smile';
    case PayloadEncoding.CONSUMER_OFFSETS:
      return 'consumerOffsets';
    case PayloadEncoding.CBOR:
      return 'cbor';
    default:
      return;
  }
}

/**
 * Converts a proto `ListMessagesResponse.DataMessage` to a legacy `TopicMessage`.
 * Pure function — shared by `createMessageSearch` (MobX) and `useLogSearch` (React).
 */
export function convertListMessageData(data: ListMessagesResponse_DataMessage): TopicMessage {
  const m = {} as TopicMessage;
  m.partitionID = data.partitionId;

  // Compression
  switch (data.compression) {
    case ProtoCompressionType.UNCOMPRESSED:
      m.compression = CompressionType.Uncompressed;
      break;
    case ProtoCompressionType.GZIP:
      m.compression = CompressionType.GZip;
      break;
    case ProtoCompressionType.SNAPPY:
      m.compression = CompressionType.Snappy;
      break;
    case ProtoCompressionType.LZ4:
      m.compression = CompressionType.LZ4;
      break;
    case ProtoCompressionType.ZSTD:
      m.compression = CompressionType.ZStd;
      break;
    default:
      m.compression = CompressionType.Unknown;
      break;
  }

  m.offset = Number(data.offset);
  m.timestamp = Number(data.timestamp);
  m.isTransactional = data.isTransactional;

  // Headers
  m.headers = [];
  for (const header of data.headers) {
    m.headers.push({
      key: header.key,
      value: {
        payload: JSON.stringify(new TextDecoder().decode(header.value)),
        encoding: 'text',
        schemaId: 0,
        size: header.value.length,
        isPayloadNull: header.value === null,
      },
    });
  }

  // Key
  const key = data.key;
  const keyPayload = new TextDecoder().decode(key?.normalizedPayload);

  m.key = {} as Payload;
  m.key.rawBytes = key?.originalPayload;

  const keyEncoding = mapPayloadEncoding(key?.encoding);
  if (keyEncoding) {
    m.key.encoding = keyEncoding;
  } else if (key?.encoding !== undefined && key?.encoding !== null) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log('unhandled key encoding type', {
      encoding: key?.encoding,
      encodingName: PayloadEncodingSchema.values.find((value) => value.number === key?.encoding)?.localName,
    });
  }

  m.key.isPayloadNull = key?.encoding === PayloadEncoding.NULL;
  m.key.payload = keyPayload;
  m.key.normalizedPayload = key?.normalizedPayload;

  try {
    m.key.payload = JSONBigInt.parse(keyPayload);
  } catch {
    // no op - payload may not be valid JSON
  }

  m.key.troubleshootReport = key?.troubleshootReport;
  m.key.schemaId = key?.schemaId ?? 0;
  m.keyJson = keyPayload;
  m.key.size = Number(key?.payloadSize);
  m.key.isPayloadTooLarge = key?.isPayloadTooLarge;

  // Value
  const val = data.value;
  const valuePayload = new TextDecoder().decode(val?.normalizedPayload);

  m.value = {} as Payload;
  m.value.payload = valuePayload;
  m.value.normalizedPayload = val?.normalizedPayload;
  m.value.rawBytes = val?.originalPayload;

  const valEncoding = mapPayloadEncoding(val?.encoding);
  if (valEncoding) {
    m.value.encoding = valEncoding;
  } else if (val?.encoding !== undefined && val?.encoding !== null) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log('unhandled value encoding type', {
      encoding: val?.encoding,
      encodingName: PayloadEncodingSchema.values.find((value) => value.number === val?.encoding)?.localName,
    });
  }

  m.value.schemaId = val?.schemaId ?? 0;
  m.value.troubleshootReport = val?.troubleshootReport;
  m.value.isPayloadNull = val?.encoding === PayloadEncoding.NULL;
  m.valueJson = valuePayload;
  m.value.isPayloadTooLarge = val?.isPayloadTooLarge;

  try {
    m.value.payload = JSONBigInt.parse(valuePayload);
  } catch {
    // no op - payload may not be valid JSON
  }

  m.valueJson = valuePayload;
  m.value.size = Number(val?.payloadSize);

  return m;
}
