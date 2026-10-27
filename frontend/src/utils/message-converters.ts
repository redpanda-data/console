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

import jsonBigIntFactory from 'json-bigint';

import {
  PayloadEncoding,
  PayloadEncodingSchema,
  CompressionType as ProtoCompressionType,
} from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { ListMessagesResponse_DataMessage } from '../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { CompressionType, type Payload, type TopicMessage } from '../state/rest-interfaces';

const JSONBigInt = jsonBigIntFactory({ storeAsString: true });
const textDecoder = new TextDecoder();

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
  const keyJson = textDecoder.decode(data.key?.normalizedPayload);
  const valueJson = textDecoder.decode(data.value?.normalizedPayload);
  // Hex previews are populated by the message viewer, as in the legacy search adapter.
  return {
    partitionID: data.partitionId,
    compression: mapCompression(data.compression),
    offset: Number(data.offset),
    timestamp: Number(data.timestamp),
    isTransactional: data.isTransactional,
    headers: data.headers.map((header) => ({
      key: header.key,
      value: {
        payload: JSON.stringify(textDecoder.decode(header.value)),
        encoding: 'text',
        schemaId: 0,
        size: header.value.length,
        isPayloadNull: header.value === null,
      },
    })),
    key: convertPayload(data.key, keyJson, 'key'),
    value: convertPayload(data.value, valueJson, 'value'),
    keyJson,
    valueJson,
  } as TopicMessage;
}

function mapCompression(compression: ProtoCompressionType): TopicMessage['compression'] {
  switch (compression) {
    case ProtoCompressionType.UNCOMPRESSED:
      return CompressionType.Uncompressed;
    case ProtoCompressionType.GZIP:
      return CompressionType.GZip;
    case ProtoCompressionType.SNAPPY:
      return CompressionType.Snappy;
    case ProtoCompressionType.LZ4:
      return CompressionType.LZ4;
    case ProtoCompressionType.ZSTD:
      return CompressionType.ZStd;
    default:
      return CompressionType.Unknown;
  }
}

function parseNormalizedPayload(payload: string): unknown {
  try {
    return JSONBigInt.parse(payload);
  } catch {
    // Non-JSON payloads intentionally remain readable text.
    return payload;
  }
}

function convertPayload(
  source: ListMessagesResponse_DataMessage['key'],
  normalizedText: string,
  kind: 'key' | 'value'
): Payload {
  const encoding = mapPayloadEncoding(source?.encoding);
  if (!encoding && source?.encoding !== undefined && source?.encoding !== null) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`unhandled ${kind} encoding type`, {
      encoding: source.encoding,
      encodingName: PayloadEncodingSchema.values.find((value) => value.number === source.encoding)?.localName,
    });
  }
  // Preserve an absent encoding for unknown proto values rather than claiming a successful decode.
  return {
    payload: parseNormalizedPayload(normalizedText),
    normalizedPayload: source?.normalizedPayload,
    rawBytes: source?.originalPayload,
    ...(encoding ? { encoding } : {}),
    schemaId: source?.schemaId ?? 0,
    troubleshootReport: source?.troubleshootReport,
    isPayloadNull: source?.encoding === PayloadEncoding.NULL,
    isPayloadTooLarge: source?.isPayloadTooLarge,
    size: Number(source?.payloadSize),
  } as Payload;
}
