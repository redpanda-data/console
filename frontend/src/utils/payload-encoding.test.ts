import { payloadEncodingParser } from './payload-encoding';
import { expect, test } from 'bun:test';
import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';

test('keeps known URL encodings and rejects values that cannot identify a decoder', () => {
  expect(payloadEncodingParser.parse(String(PayloadEncoding.AVRO))).toBe(PayloadEncoding.AVRO);
  expect(payloadEncodingParser.parse(String(PayloadEncoding.UNSPECIFIED))).toBe(PayloadEncoding.UNSPECIFIED);
  expect(payloadEncodingParser.parse('99999')).toBeNull();
  expect(payloadEncodingParser.parse('unknown')).toBeNull();
  expect(payloadEncodingParser.defaultValue).toBe(PayloadEncoding.UNSPECIFIED);
});
