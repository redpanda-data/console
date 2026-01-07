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

import type { AnyValue, KeyValue } from 'protogen/redpanda/otel/v1/common_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';

/**
 * Extract typed value from protobuf AnyValue union.
 * Handles all protobuf value cases and returns the appropriate JavaScript type.
 *
 * @param anyValue Protobuf AnyValue with discriminated union
 * @returns Typed value (string, number, boolean) or empty string if undefined
 */
export const getAttributeValue = (anyValue: AnyValue | undefined): string | number | boolean => {
  if (!anyValue?.value) {
    return '';
  }

  switch (anyValue.value.case) {
    case 'stringValue':
      return anyValue.value.value;
    case 'intValue': {
      // Convert BigInt to number, clamping to safe integer range
      const bigIntValue = anyValue.value.value;
      if (bigIntValue > BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number.MAX_SAFE_INTEGER;
      }
      if (bigIntValue < BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number.MIN_SAFE_INTEGER;
      }
      return Number(bigIntValue);
    }
    case 'boolValue':
      return anyValue.value.value;
    case 'doubleValue':
      return anyValue.value.value;
    default:
      return '';
  }
};

/**
 * Extract all attributes from span attributes array as a Map.
 * Converts protobuf KeyValue array to a convenient Map structure.
 *
 * @param attributes Array of protobuf KeyValue attributes (can be undefined)
 * @returns Map of attribute key-value pairs with typed values
 */
export const extractSpanAttributes = (attributes?: readonly KeyValue[]): Map<string, string | number | boolean> => {
  const attrMap = new Map<string, string | number | boolean>();
  if (!attributes) {
    return attrMap;
  }

  for (const attr of attributes) {
    if (attr.key && attr.value !== undefined) {
      attrMap.set(attr.key, getAttributeValue(attr.value));
    }
  }
  return attrMap;
};

/**
 * Get single attribute value from span by key.
 * Convenience method to extract a specific attribute without building the full map.
 *
 * @param span Span object with attributes array
 * @param key Attribute key to look up (e.g., "gen_ai.request.model")
 * @returns Typed attribute value or empty string if not found
 */
export const getAttributeFromSpan = (span: Span, key: string): string | number | boolean => {
  const attr = span.attributes?.find((a) => a.key === key);
  if (!attr?.value) {
    return '';
  }
  return getAttributeValue(attr.value);
};

/**
 * Check if span has an attribute key with a non-empty value.
 *
 * @param span Span object with attributes array
 * @param key Attribute key to check
 * @returns True if attribute exists with a value
 */
export const hasAttribute = (span: Span, key: string): boolean =>
  span.attributes?.some((attr) => attr.key === key && attr.value?.value) ?? false;
