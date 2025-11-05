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

import { describe, expect, it } from 'vitest';

import { deepParseJson, tryParseJson } from './json-utils';

describe('tryParseJson', () => {
  it('should parse valid JSON object strings', () => {
    const result = tryParseJson('{"city":"Singapore","temp":28}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ city: 'Singapore', temp: 28 });
  });

  it('should parse valid JSON array strings', () => {
    const result = tryParseJson('[1,2,3]');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('should not parse plain strings', () => {
    const result = tryParseJson('hello world');
    expect(result.success).toBe(false);
    expect(result.data).toBe('hello world');
  });

  it('should not parse malformed JSON', () => {
    const result = tryParseJson('{invalid json}');
    expect(result.success).toBe(false);
    expect(result.data).toBe('{invalid json}');
  });
});

describe('deepParseJson', () => {
  describe('basic types', () => {
    it('should return null as-is', () => {
      expect(deepParseJson(null)).toBe(null);
    });

    it('should return undefined as-is', () => {
      expect(deepParseJson(undefined)).toBe(undefined);
    });

    it('should return numbers as-is', () => {
      expect(deepParseJson(42)).toBe(42);
    });

    it('should return booleans as-is', () => {
      expect(deepParseJson(true)).toBe(true);
      expect(deepParseJson(false)).toBe(false);
    });

    it('should return plain strings as-is', () => {
      expect(deepParseJson('hello world')).toBe('hello world');
    });
  });

  describe('JSON string parsing', () => {
    it('should parse JSON object strings', () => {
      const result = deepParseJson('{"city":"Singapore","temp":28}');
      expect(result).toEqual({ city: 'Singapore', temp: 28 });
    });

    it('should parse JSON array strings', () => {
      const result = deepParseJson('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should not parse malformed JSON strings', () => {
      const result = deepParseJson('{invalid}');
      expect(result).toBe('{invalid}');
    });
  });

  describe('nested objects', () => {
    it('should parse nested JSON strings in objects', () => {
      const input = {
        text: '{"city":"Singapore","temp":28}',
        description: 'Weather data',
      };
      const result = deepParseJson(input);
      expect(result).toEqual({
        text: { city: 'Singapore', temp: 28 },
        description: 'Weather data',
      });
    });

    it('should parse deeply nested JSON strings', () => {
      const input = {
        level1: '{"level2":"{\\"level3\\":\\"value\\"}"}',
      };
      const result = deepParseJson(input);
      expect(result).toEqual({
        level1: { level2: { level3: 'value' } },
      });
    });

    it('should handle objects with mixed types', () => {
      const input = {
        jsonString: '{"data":"value"}',
        plainString: 'hello',
        number: 42,
        boolean: true,
        null: null,
      };
      const result = deepParseJson(input);
      expect(result).toEqual({
        jsonString: { data: 'value' },
        plainString: 'hello',
        number: 42,
        boolean: true,
        null: null,
      });
    });
  });

  describe('arrays', () => {
    it('should parse JSON strings in arrays', () => {
      const input = [
        { type: 'text', text: '{"city":"Singapore"}' },
        { type: 'text', text: '{"temp":28}' },
      ];
      const result = deepParseJson(input);
      expect(result).toEqual([
        { type: 'text', text: { city: 'Singapore' } },
        { type: 'text', text: { temp: 28 } },
      ]);
    });

    it('should handle arrays with mixed types', () => {
      const input = ['{"data":"value"}', 'plain string', 42, true, null];
      const result = deepParseJson(input);
      expect(result).toEqual([{ data: 'value' }, 'plain string', 42, true, null]);
    });

    it('should handle nested arrays', () => {
      const input = [['{"a":1}', '{"b":2}'], ['{"c":3}']];
      const result = deepParseJson(input);
      expect(result).toEqual([[{ a: 1 }, { b: 2 }], [{ c: 3 }]]);
    });
  });

  describe('real-world examples from tool calls', () => {
    it('should parse weather tool response', () => {
      const input = [
        {
          type: 'text',
          text: '{"city":"Singapore","description":"Partly cloudy","feels_like":32,"humidity":70,"metadata":{"fetched_at":"2025-10-27T15:44:26.638Z","source":"wttr.in"},"pressure":1011,"temperature":28,"wind_speed":7}',
        },
      ];
      const result = deepParseJson(input);
      expect(result).toEqual([
        {
          type: 'text',
          text: {
            city: 'Singapore',
            description: 'Partly cloudy',
            feels_like: 32,
            humidity: 70,
            metadata: {
              fetched_at: '2025-10-27T15:44:26.638Z',
              source: 'wttr.in',
            },
            pressure: 1011,
            temperature: 28,
            wind_speed: 7,
          },
        },
      ]);
    });

    it('should parse tool request parameters', () => {
      const input = {
        description: 'Current weather summary for Singapore',
        name: 'Singapore Weather Report',
        text: 'Weather in Singapore (fetched 2025-10-27T15:44:26.638Z):\n\n- Condition: Partly cloudy\n- Temperature: 28°C (feels like 32°C)\n- Humidity: 70%\n- Pressure: 1011 hPa\n- Wind: 7 km/h\n\nSource: wttr.in\n\nNo active weather alerts reported.',
      };
      const result = deepParseJson(input);
      // In this case, the text is not a JSON string, so it should remain as-is
      expect(result).toEqual(input);
    });
  });

  describe('edge cases', () => {
    it('should prevent infinite recursion with depth limit', () => {
      const deeplyNested =
        '{"a":"{\\"b\\":\\"{\\\\\\"c\\\\\\":\\\\\\"{\\\\\\\\\\\\\\"d\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"{\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"e\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"{\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"f\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"value\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"}\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"}\\\\\\\\\\\\\\"}\\\\\\"}\\"}"}';
      // Should not throw, should stop at max depth
      expect(() => deepParseJson(deeplyNested)).not.toThrow();
    });

    it('should handle empty objects', () => {
      expect(deepParseJson({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(deepParseJson([])).toEqual([]);
    });

    it('should handle empty string', () => {
      expect(deepParseJson('')).toBe('');
    });

    it('should handle objects with special characters in keys', () => {
      const input = {
        'key-with-dashes': '{"data":"value"}',
        key_with_underscores: '{"data":"value"}',
        'key.with.dots': '{"data":"value"}',
      };
      const result = deepParseJson(input);
      expect(result).toEqual({
        'key-with-dashes': { data: 'value' },
        key_with_underscores: { data: 'value' },
        'key.with.dots': { data: 'value' },
      });
    });
  });

  describe('non-object types as root', () => {
    it('should handle JSON string as root', () => {
      const result = deepParseJson('{"key":"value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle array JSON string as root', () => {
      const result = deepParseJson('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
