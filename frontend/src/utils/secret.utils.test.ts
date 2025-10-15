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

import { generateServiceAccountSecretId, sanitizeSecretId } from './secret.utils';

// Regex patterns for validation
const SERVICE_ACCOUNT_PREFIX_REGEX = /^SERVICE_ACCOUNT_/;
const SECRET_ID_REGEX = /^[A-Z][A-Z0-9_]*$/;

describe('sanitizeSecretId', () => {
  test('should convert to uppercase', () => {
    expect(sanitizeSecretId('my-agent')).toBe('MY_AGENT');
    expect(sanitizeSecretId('MyAgent')).toBe('MYAGENT');
  });

  test('should replace special characters with underscores', () => {
    expect(sanitizeSecretId('my-agent-name')).toBe('MY_AGENT_NAME');
    expect(sanitizeSecretId('agent.v1.0')).toBe('AGENT_V1_0');
    expect(sanitizeSecretId('test@#$agent')).toBe('TEST_AGENT');
  });

  test('should collapse consecutive underscores', () => {
    expect(sanitizeSecretId('test--agent')).toBe('TEST_AGENT');
    expect(sanitizeSecretId('test___agent')).toBe('TEST_AGENT');
  });

  test('should remove trailing underscores', () => {
    expect(sanitizeSecretId('test_')).toBe('TEST');
    expect(sanitizeSecretId('test-')).toBe('TEST');
  });

  test('should handle edge cases', () => {
    expect(sanitizeSecretId('')).toBe('');
    expect(sanitizeSecretId('---')).toBe('');
  });

  test('should handle real-world examples', () => {
    expect(sanitizeSecretId('My Customer Support Agent')).toBe('MY_CUSTOMER_SUPPORT_AGENT');
    expect(sanitizeSecretId('srv-acc-123-abc')).toBe('SRV_ACC_123_ABC');
    expect(sanitizeSecretId('abc-123-def-456')).toBe('ABC_123_DEF_456');
  });
});

describe('generateServiceAccountSecretId', () => {
  test('should generate ID with correct format', () => {
    const result = generateServiceAccountSecretId('account-123');
    expect(result).toBe('SERVICE_ACCOUNT_ACCOUNT_123');
    expect(result).toMatch(SERVICE_ACCOUNT_PREFIX_REGEX);
  });

  test('should sanitize service account ID', () => {
    const result = generateServiceAccountSecretId('srv-acc-123');
    expect(result).toBe('SERVICE_ACCOUNT_SRV_ACC_123');
  });

  test('should handle UUID-style service account IDs', () => {
    const result = generateServiceAccountSecretId('abc-123-def-456');
    expect(result).toBe('SERVICE_ACCOUNT_ABC_123_DEF_456');
  });

  test('should handle special characters', () => {
    const result = generateServiceAccountSecretId('srv@acc#123');
    expect(result).toBe('SERVICE_ACCOUNT_SRV_ACC_123');
  });

  test('should remove trailing underscores', () => {
    const result = generateServiceAccountSecretId('acc-123-');
    expect(result).toBe('SERVICE_ACCOUNT_ACC_123');
  });

  test('should handle real-world examples', () => {
    expect(generateServiceAccountSecretId('srv-acc-abc123')).toBe('SERVICE_ACCOUNT_SRV_ACC_ABC123');

    expect(generateServiceAccountSecretId('service-account-uuid-123')).toBe('SERVICE_ACCOUNT_SERVICE_ACCOUNT_UUID_123');
  });

  test('should generate IDs that match the required regex pattern', () => {
    const result = generateServiceAccountSecretId('test-account');
    expect(result).toMatch(SECRET_ID_REGEX);

    const complexResult = generateServiceAccountSecretId('test@#$-account');
    expect(complexResult).toMatch(SECRET_ID_REGEX);
  });
});
