/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';

import { base64ToHex, bytesToHex, convertBytesFieldsToHex } from './hex-utils';

describe('hex-utils', () => {
  describe('bytesToHex', () => {
    it('converts empty array to empty string', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('');
    });

    it('converts single byte to two-char hex', () => {
      expect(bytesToHex(new Uint8Array([0]))).toBe('00');
      expect(bytesToHex(new Uint8Array([15]))).toBe('0f');
      expect(bytesToHex(new Uint8Array([255]))).toBe('ff');
    });

    it('converts 8 bytes (spanId size) to 16-char hex', () => {
      const bytes = new Uint8Array([0x1e, 0xeb, 0x38, 0xc8, 0xbd, 0x23, 0xc5, 0x83]);
      expect(bytesToHex(bytes)).toBe('1eeb38c8bd23c583');
    });

    it('converts 16 bytes (traceId size) to 32-char hex', () => {
      const bytes = new Uint8Array([
        0xc4, 0x1a, 0xdc, 0xd3, 0x14, 0x45, 0x75, 0xb4, 0xf2, 0xc6, 0x04, 0xc9, 0xe5, 0xb8, 0x83, 0xd9,
      ]);
      expect(bytesToHex(bytes)).toBe('c41adcd3144575b4f2c604c9e5b883d9');
    });
  });

  describe('base64ToHex', () => {
    it('converts base64 spanId to 16-char hex', () => {
      // 8 bytes = 12-char base64 (with padding) -> 16-char hex
      expect(base64ToHex('HuszyL0jxYM=')).toBe('1eeb33c8bd23c583');
    });

    it('converts base64 traceId to 32-char hex', () => {
      // 16 bytes = 24-char base64 (with padding) -> 32-char hex
      expect(base64ToHex('xBrc0xRFdbTyxgTJ5biD2Q==')).toBe('c41adcd3144575b4f2c604c9e5b883d9');
    });
  });

  describe('convertBytesFieldsToHex', () => {
    it('returns null/undefined as-is', () => {
      expect(convertBytesFieldsToHex(null)).toBeNull();
      expect(convertBytesFieldsToHex(undefined)).toBeUndefined();
    });

    it('returns primitives unchanged', () => {
      expect(convertBytesFieldsToHex('hello')).toBe('hello');
      expect(convertBytesFieldsToHex(42)).toBe(42);
      expect(convertBytesFieldsToHex(true)).toBe(true);
    });

    it('converts spanId from base64 to hex', () => {
      const input = { spanId: 'HuszyL0jxYM=' };
      expect(convertBytesFieldsToHex(input)).toEqual({ spanId: '1eeb33c8bd23c583' });
    });

    it('converts parentSpanId from base64 to hex', () => {
      const input = { parentSpanId: 'B7FYQH7jwRU=' };
      expect(convertBytesFieldsToHex(input)).toEqual({ parentSpanId: '07b158407ee3c115' });
    });

    it('converts traceId from base64 to hex', () => {
      const input = { traceId: 'xBrc0xRFdbTyxgTJ5biD2Q==' };
      expect(convertBytesFieldsToHex(input)).toEqual({ traceId: 'c41adcd3144575b4f2c604c9e5b883d9' });
    });

    it('converts all ID fields (traceId, spanId, parentSpanId)', () => {
      const input = {
        traceId: 'xBrc0xRFdbTyxgTJ5biD2Q==',
        spanId: 'HuszyL0jxYM=',
        parentSpanId: 'B7FYQH7jwRU=',
        name: 'test-span',
      };
      expect(convertBytesFieldsToHex(input)).toEqual({
        traceId: 'c41adcd3144575b4f2c604c9e5b883d9',
        spanId: '1eeb33c8bd23c583',
        parentSpanId: '07b158407ee3c115',
        name: 'test-span',
      });
    });

    it('handles nested objects', () => {
      const input = {
        outer: {
          spanId: 'HuszyL0jxYM=',
        },
      };
      expect(convertBytesFieldsToHex(input)).toEqual({
        outer: {
          spanId: '1eeb33c8bd23c583',
        },
      });
    });

    it('handles arrays', () => {
      const input = [{ spanId: 'HuszyL0jxYM=' }, { spanId: 'B7FYQH7jwRU=' }];
      expect(convertBytesFieldsToHex(input)).toEqual([{ spanId: '1eeb33c8bd23c583' }, { spanId: '07b158407ee3c115' }]);
    });

    it('does not convert other string fields', () => {
      const input = {
        name: 'test-span',
        kind: 'SPAN_KIND_CLIENT',
        spanId: 'HuszyL0jxYM=',
      };
      expect(convertBytesFieldsToHex(input)).toEqual({
        name: 'test-span',
        kind: 'SPAN_KIND_CLIENT',
        spanId: '1eeb33c8bd23c583',
      });
    });
  });
});
