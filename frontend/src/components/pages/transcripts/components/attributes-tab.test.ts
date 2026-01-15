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

import { create } from '@bufbuild/protobuf';
import { AnyValueSchema, ArrayValueSchema, KeyValueListSchema } from 'protogen/redpanda/otel/v1/common_pb';
import { describe, expect, it } from 'vitest';

import { extractProtoValue, getAttributeValue } from './attributes-tab';

describe('extractProtoValue', () => {
  it('returns undefined for undefined input', () => {
    expect(extractProtoValue(undefined)).toBeUndefined();
  });

  it('returns undefined for empty value', () => {
    const value = create(AnyValueSchema, {});
    expect(extractProtoValue(value)).toBeUndefined();
  });

  it('extracts string values', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'stringValue', value: 'hello world' },
    });
    expect(extractProtoValue(value)).toBe('hello world');
  });

  it('extracts boolean values', () => {
    const trueValue = create(AnyValueSchema, {
      value: { case: 'boolValue', value: true },
    });
    expect(extractProtoValue(trueValue)).toBe(true);

    const falseValue = create(AnyValueSchema, {
      value: { case: 'boolValue', value: false },
    });
    expect(extractProtoValue(falseValue)).toBe(false);
  });

  it('extracts integer values as bigint', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'intValue', value: BigInt(42) },
    });
    expect(extractProtoValue(value)).toBe(BigInt(42));
  });

  it('extracts double values', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'doubleValue', value: 42.567 },
    });
    expect(extractProtoValue(value)).toBe(42.567);
  });

  it('extracts array values recursively', () => {
    const arrayValue = create(ArrayValueSchema, {
      values: [
        create(AnyValueSchema, { value: { case: 'stringValue', value: 'one' } }),
        create(AnyValueSchema, { value: { case: 'intValue', value: BigInt(2) } }),
        create(AnyValueSchema, { value: { case: 'boolValue', value: true } }),
      ],
    });
    const value = create(AnyValueSchema, {
      value: { case: 'arrayValue', value: arrayValue },
    });
    expect(extractProtoValue(value)).toEqual(['one', BigInt(2), true]);
  });

  it('extracts key-value list values as object', () => {
    const kvList = create(KeyValueListSchema, {
      values: [
        {
          key: 'name',
          value: create(AnyValueSchema, { value: { case: 'stringValue', value: 'test' } }),
        },
        {
          key: 'count',
          value: create(AnyValueSchema, { value: { case: 'intValue', value: BigInt(5) } }),
        },
      ],
    });
    const value = create(AnyValueSchema, {
      value: { case: 'kvlistValue', value: kvList },
    });
    expect(extractProtoValue(value)).toEqual({
      name: 'test',
      count: BigInt(5),
    });
  });

  it('decodes bytes values as UTF-8 string', () => {
    const encoder = new TextEncoder();
    const value = create(AnyValueSchema, {
      value: { case: 'bytesValue', value: encoder.encode('hello bytes') },
    });
    expect(extractProtoValue(value)).toBe('hello bytes');
  });
});

describe('getAttributeValue', () => {
  it('returns empty string for undefined input', () => {
    expect(getAttributeValue(undefined)).toBe('');
  });

  it('returns empty string for empty value', () => {
    const value = create(AnyValueSchema, {});
    expect(getAttributeValue(value)).toBe('');
  });

  it('returns string values directly', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'stringValue', value: 'hello' },
    });
    expect(getAttributeValue(value)).toBe('hello');
  });

  it('converts boolean values to string', () => {
    const trueValue = create(AnyValueSchema, {
      value: { case: 'boolValue', value: true },
    });
    expect(getAttributeValue(trueValue)).toBe('true');

    const falseValue = create(AnyValueSchema, {
      value: { case: 'boolValue', value: false },
    });
    expect(getAttributeValue(falseValue)).toBe('false');
  });

  it('converts number values to string', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'doubleValue', value: 3.14 },
    });
    expect(getAttributeValue(value)).toBe('3.14');
  });

  it('converts bigint values to string', () => {
    const value = create(AnyValueSchema, {
      value: { case: 'intValue', value: BigInt(12_345_678_901_234) },
    });
    expect(getAttributeValue(value)).toBe('12345678901234');
  });

  it('formats arrays as pretty-printed JSON', () => {
    const arrayValue = create(ArrayValueSchema, {
      values: [
        create(AnyValueSchema, { value: { case: 'stringValue', value: 'one' } }),
        create(AnyValueSchema, { value: { case: 'stringValue', value: 'two' } }),
      ],
    });
    const value = create(AnyValueSchema, {
      value: { case: 'arrayValue', value: arrayValue },
    });
    const result = getAttributeValue(value);
    expect(result).toBe('[\n  "one",\n  "two"\n]');
  });

  it('formats objects as pretty-printed JSON', () => {
    const kvList = create(KeyValueListSchema, {
      values: [
        {
          key: 'name',
          value: create(AnyValueSchema, { value: { case: 'stringValue', value: 'test' } }),
        },
      ],
    });
    const value = create(AnyValueSchema, {
      value: { case: 'kvlistValue', value: kvList },
    });
    const result = getAttributeValue(value);
    expect(result).toBe('{\n  "name": "test"\n}');
  });
});
