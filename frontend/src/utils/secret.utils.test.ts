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
const SA_PREFIX_REGEX = /^SA_/;
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
    const result = generateServiceAccountSecretId('account-123', 'agent-name');
    expect(result).toBe('SA_ACCOUNT_123_AGENT_NAME');
    expect(result).toMatch(SA_PREFIX_REGEX);
  });

  test('should sanitize both service account ID and resource name', () => {
    const result = generateServiceAccountSecretId('srv-acc-123', 'My Agent');
    expect(result).toBe('SA_SRV_ACC_123_MY_AGENT');
  });

  test('should handle UUID-style service account IDs', () => {
    const result = generateServiceAccountSecretId('abc-123-def-456', 'TestAgent');
    expect(result).toBe('SA_ABC_123_DEF_456_TESTAGENT');
  });

  test('should handle special characters in both parts', () => {
    const result = generateServiceAccountSecretId('srv@acc#123', 'agent@v2.0');
    expect(result).toBe('SA_SRV_ACC_123_AGENT_V2_0');
  });

  test('should remove trailing underscores', () => {
    const result = generateServiceAccountSecretId('acc-123-', 'agent-name-');
    expect(result).toBe('SA_ACC_123_AGENT_NAME');
  });

  test('should handle real-world examples', () => {
    expect(generateServiceAccountSecretId('srv-acc-abc123', 'Customer Support Bot')).toBe(
      'SA_SRV_ACC_ABC123_CUSTOMER_SUPPORT_BOT'
    );

    expect(generateServiceAccountSecretId('service-account-uuid-123', 'My AI Agent v2.5')).toBe(
      'SA_SERVICE_ACCOUNT_UUID_123_MY_AI_AGENT_V2_5'
    );
  });

  test('should generate IDs that match the required regex pattern', () => {
    const result = generateServiceAccountSecretId('test-account', 'test-agent');
    expect(result).toMatch(SECRET_ID_REGEX);

    const complexResult = generateServiceAccountSecretId('test@#$-account', 'agent!@#');
    expect(complexResult).toMatch(SECRET_ID_REGEX);
  });
});
