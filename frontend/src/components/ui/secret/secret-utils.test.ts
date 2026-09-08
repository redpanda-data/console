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

import { describe, expect, test } from '@rstest/core';

import { extractSecretName, formatSecretTemplate, SECRET_TEMPLATE_REGEX } from './secret-utils';

describe('SECRET_TEMPLATE_REGEX', () => {
  test('should match valid secret template format', () => {
    expect(SECRET_TEMPLATE_REGEX.test('${secrets.MY_SECRET}')).toBe(true);
    expect(SECRET_TEMPLATE_REGEX.test('${secrets.CLIENT_KEY}')).toBe(true);
    expect(SECRET_TEMPLATE_REGEX.test('${secrets.DB_PASSWORD_123}')).toBe(true);
  });

  test('should not match invalid formats', () => {
    expect(SECRET_TEMPLATE_REGEX.test('MY_SECRET')).toBe(false);
    expect(SECRET_TEMPLATE_REGEX.test('secrets.MY_SECRET')).toBe(false);
    expect(SECRET_TEMPLATE_REGEX.test('${MY_SECRET}')).toBe(false);
    expect(SECRET_TEMPLATE_REGEX.test('${config.MY_SECRET}')).toBe(false);
    expect(SECRET_TEMPLATE_REGEX.test('')).toBe(false);
  });
});

describe('extractSecretName', () => {
  test('should extract secret name from template format', () => {
    expect(extractSecretName('${secrets.MY_SECRET}')).toBe('MY_SECRET');
    expect(extractSecretName('${secrets.CLIENT_KEY}')).toBe('CLIENT_KEY');
    expect(extractSecretName('${secrets.POSTGRES_DSN}')).toBe('POSTGRES_DSN');
    expect(extractSecretName('${secrets.DATABASE_PASSWORD}')).toBe('DATABASE_PASSWORD');
  });

  test('should return original string if not in template format', () => {
    expect(extractSecretName('MY_SECRET')).toBe('MY_SECRET');
    expect(extractSecretName('CLIENT_KEY')).toBe('CLIENT_KEY');
  });

  test('should return empty string for empty input', () => {
    expect(extractSecretName('')).toBe('');
  });

  test('should handle edge cases', () => {
    expect(extractSecretName('${secrets.}')).toBe('${secrets.}');
    expect(extractSecretName('${secrets.A}')).toBe('A');
  });
});

describe('formatSecretTemplate', () => {
  test('should wrap secret ID with template format', () => {
    expect(formatSecretTemplate('MY_SECRET')).toBe('${secrets.MY_SECRET}');
    expect(formatSecretTemplate('CLIENT_KEY')).toBe('${secrets.CLIENT_KEY}');
    expect(formatSecretTemplate('POSTGRES_DSN')).toBe('${secrets.POSTGRES_DSN}');
    expect(formatSecretTemplate('DATABASE_PASSWORD')).toBe('${secrets.DATABASE_PASSWORD}');
  });

  test('should handle various secret name formats', () => {
    expect(formatSecretTemplate('SECRET_123')).toBe('${secrets.SECRET_123}');
    expect(formatSecretTemplate('my_secret')).toBe('${secrets.my_secret}');
    expect(formatSecretTemplate('A')).toBe('${secrets.A}');
  });

  test('should handle empty string', () => {
    expect(formatSecretTemplate('')).toBe('${secrets.}');
  });
});

describe('Round-trip conversion', () => {
  test('should maintain secret name integrity through format and extract', () => {
    const secretNames = ['CLIENT_KEY', 'POSTGRES_DSN', 'REDPANDA_PASSWORD', 'DATABASE_PASSWORD', 'SECRET_123'];

    for (const secretName of secretNames) {
      const formatted = formatSecretTemplate(secretName);
      const extracted = extractSecretName(formatted);
      expect(extracted).toBe(secretName);
    }
  });

  test('should correctly identify template format after formatting', () => {
    const secretName = 'MY_SECRET';
    const formatted = formatSecretTemplate(secretName);

    expect(SECRET_TEMPLATE_REGEX.test(formatted)).toBe(true);
    expect(SECRET_TEMPLATE_REGEX.test(secretName)).toBe(false);
  });
});
