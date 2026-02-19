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

import { base64ToUInt8Array } from 'utils/utils';

export const bytesToHex = (bytes: Uint8Array): string => {
  // Optimized conversion using Array.from with map for better performance with large datasets.
  // This approach avoids the overhead of individual array assignments and string concatenation.
  // See: https://stackoverflow.com/a/40031979
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const base64ToHex = (base64: string): string => bytesToHex(base64ToUInt8Array(base64));

const BYTES_FIELD_NAMES = ['traceId', 'spanId', 'parentSpanId'];

export const convertBytesFieldsToHex = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBytesFieldsToHex);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (BYTES_FIELD_NAMES.includes(key) && typeof value === 'string') {
        // Convert base64 to hex
        result[key] = base64ToHex(value);
      } else {
        result[key] = convertBytesFieldsToHex(value);
      }
    }
    return result;
  }

  return obj;
};
