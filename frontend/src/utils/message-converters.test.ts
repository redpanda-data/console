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

import { describe, expect, test } from 'vitest';

import { convertListMessageData } from './message-converters';
import {
  PayloadEncoding,
  CompressionType as ProtoCompressionType,
} from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { ListMessagesResponse_DataMessage } from '../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { CompressionType } from '../state/rest-interfaces';

const encoder = new TextEncoder();

function makePayload(text: string, encoding: PayloadEncoding, overrides: Record<string, unknown> = {}) {
  return {
    originalPayload: encoder.encode(text),
    normalizedPayload: encoder.encode(text),
    encoding,
    schemaId: 0,
    payloadSize: text.length,
    isPayloadTooLarge: false,
    troubleshootReport: [],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Record<string, unknown>> = {}): ListMessagesResponse_DataMessage {
  return {
    partitionId: 0,
    offset: 0n,
    timestamp: 0n,
    compression: ProtoCompressionType.UNCOMPRESSED,
    isTransactional: false,
    headers: [],
    key: makePayload('', PayloadEncoding.TEXT),
    value: makePayload('', PayloadEncoding.TEXT),
    ...overrides,
  } as unknown as ListMessagesResponse_DataMessage;
}

describe('convertListMessageData', () => {
  test('converts basic message fields', () => {
    const msg = makeMessage({
      partitionId: 3,
      offset: 42n,
      timestamp: 1700000000000n,
      isTransactional: true,
    });

    const result = convertListMessageData(msg);

    expect(result.partitionID).toBe(3);
    expect(result.offset).toBe(42);
    expect(result.timestamp).toBe(1_700_000_000_000);
    expect(result.isTransactional).toBe(true);
  });

  describe('compression type mapping', () => {
    const cases: [ProtoCompressionType, string][] = [
      [ProtoCompressionType.UNCOMPRESSED, CompressionType.Uncompressed],
      [ProtoCompressionType.GZIP, CompressionType.GZip],
      [ProtoCompressionType.SNAPPY, CompressionType.Snappy],
      [ProtoCompressionType.LZ4, CompressionType.LZ4],
      [ProtoCompressionType.ZSTD, CompressionType.ZStd],
      [ProtoCompressionType.UNSPECIFIED, CompressionType.Unknown],
    ];

    for (const [proto, expected] of cases) {
      test(`maps ${ProtoCompressionType[proto]} to '${expected}'`, () => {
        const result = convertListMessageData(makeMessage({ compression: proto }));
        expect(result.compression).toBe(expected);
      });
    }
  });

  describe('key encoding mapping', () => {
    const cases: [PayloadEncoding, string][] = [
      [PayloadEncoding.NULL, 'null'],
      [PayloadEncoding.JSON, 'json'],
      [PayloadEncoding.TEXT, 'text'],
      [PayloadEncoding.PROTOBUF, 'protobuf'],
      [PayloadEncoding.AVRO, 'avro'],
      [PayloadEncoding.BINARY, 'binary'],
      [PayloadEncoding.XML, 'xml'],
      [PayloadEncoding.JSON_SCHEMA, 'jsonSchema'],
      [PayloadEncoding.PROTOBUF_SCHEMA, 'protobufSchema'],
      [PayloadEncoding.PROTOBUF_BSR, 'protobufBSR'],
      [PayloadEncoding.MESSAGE_PACK, 'msgpack'],
      [PayloadEncoding.UTF8, 'utf8WithControlChars'],
      [PayloadEncoding.UINT, 'uint'],
      [PayloadEncoding.SMILE, 'smile'],
      [PayloadEncoding.CONSUMER_OFFSETS, 'consumerOffsets'],
      [PayloadEncoding.CBOR, 'cbor'],
    ];

    for (const [encoding, expected] of cases) {
      test(`maps ${PayloadEncoding[encoding]} to '${expected}'`, () => {
        const msg = makeMessage({
          key: makePayload('test', encoding),
        });
        const result = convertListMessageData(msg);
        expect(result.key.encoding).toBe(expected);
      });
    }
  });

  describe('value encoding mapping', () => {
    const cases: [PayloadEncoding, string][] = [
      [PayloadEncoding.NULL, 'null'],
      [PayloadEncoding.JSON, 'json'],
      [PayloadEncoding.TEXT, 'text'],
      [PayloadEncoding.PROTOBUF, 'protobuf'],
      [PayloadEncoding.CBOR, 'cbor'],
    ];

    for (const [encoding, expected] of cases) {
      test(`maps ${PayloadEncoding[encoding]} to '${expected}'`, () => {
        const msg = makeMessage({
          value: makePayload('test', encoding),
        });
        const result = convertListMessageData(msg);
        expect(result.value.encoding).toBe(expected);
      });
    }
  });

  test('converts headers with key and decoded value', () => {
    const msg = makeMessage({
      headers: [
        { key: 'content-type', value: encoder.encode('application/json') },
        { key: 'trace-id', value: encoder.encode('abc-123') },
      ],
    });

    const result = convertListMessageData(msg);

    expect(result.headers).toHaveLength(2);
    expect(result.headers[0].key).toBe('content-type');
    expect(result.headers[0].value.payload).toBe(JSON.stringify('application/json'));
    expect(result.headers[0].value.encoding).toBe('text');
    expect(result.headers[0].value.size).toBe(16);
    expect(result.headers[1].key).toBe('trace-id');
    expect(result.headers[1].value.payload).toBe(JSON.stringify('abc-123'));
  });

  test('empty headers array', () => {
    const result = convertListMessageData(makeMessage({ headers: [] }));
    expect(result.headers).toEqual([]);
  });

  test('parses JSON key and value payloads', () => {
    const jsonStr = '{"id":1,"name":"test"}';
    const msg = makeMessage({
      key: makePayload(jsonStr, PayloadEncoding.JSON),
      value: makePayload(jsonStr, PayloadEncoding.JSON),
    });

    const result = convertListMessageData(msg);

    expect(result.key.payload).toEqual({ id: 1, name: 'test' });
    expect(result.value.payload).toEqual({ id: 1, name: 'test' });
    expect(result.keyJson).toBe(jsonStr);
    expect(result.valueJson).toBe(jsonStr);
  });

  test('keeps non-JSON payloads as strings', () => {
    const plainText = 'hello world';
    const msg = makeMessage({
      key: makePayload(plainText, PayloadEncoding.TEXT),
      value: makePayload(plainText, PayloadEncoding.TEXT),
    });

    const result = convertListMessageData(msg);

    expect(result.key.payload).toBe(plainText);
    expect(result.value.payload).toBe(plainText);
  });

  test('sets isPayloadNull when encoding is NULL', () => {
    const msg = makeMessage({
      key: makePayload('', PayloadEncoding.NULL),
      value: makePayload('', PayloadEncoding.NULL),
    });

    const result = convertListMessageData(msg);

    expect(result.key.isPayloadNull).toBe(true);
    expect(result.value.isPayloadNull).toBe(true);
  });

  test('sets isPayloadNull to false for non-NULL encoding', () => {
    const msg = makeMessage({
      key: makePayload('x', PayloadEncoding.TEXT),
      value: makePayload('x', PayloadEncoding.TEXT),
    });

    const result = convertListMessageData(msg);

    expect(result.key.isPayloadNull).toBe(false);
    expect(result.value.isPayloadNull).toBe(false);
  });

  test('sets isPayloadTooLarge from proto field', () => {
    const msg = makeMessage({
      key: makePayload('x', PayloadEncoding.TEXT, { isPayloadTooLarge: true }),
      value: makePayload('x', PayloadEncoding.TEXT, { isPayloadTooLarge: true }),
    });

    const result = convertListMessageData(msg);

    expect(result.key.isPayloadTooLarge).toBe(true);
    expect(result.value.isPayloadTooLarge).toBe(true);
  });

  test('sets payload size from payloadSize field', () => {
    const msg = makeMessage({
      key: makePayload('x', PayloadEncoding.TEXT, { payloadSize: 512 }),
      value: makePayload('x', PayloadEncoding.TEXT, { payloadSize: 1024 }),
    });

    const result = convertListMessageData(msg);

    expect(result.key.size).toBe(512);
    expect(result.value.size).toBe(1024);
  });
});
