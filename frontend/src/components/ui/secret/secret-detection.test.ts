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

import { extractSecretReferences, getUniqueSecretNames } from './secret-detection';

describe('extractSecretReferences', () => {
  test('should extract simple secret reference', () => {
    const yaml = 'password: ${secrets.DB_PASSWORD}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'DB_PASSWORD',
      nestedKey: undefined,
      fullReference: '${secrets.DB_PASSWORD}',
      defaultValue: undefined,
    });
  });

  test('should extract secret with nested key', () => {
    const yaml = 'token: ${secrets.API_CREDS.token}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'API_CREDS',
      nestedKey: 'token',
      fullReference: '${secrets.API_CREDS.token}',
      defaultValue: undefined,
    });
  });

  test('should extract secret with deeply nested key', () => {
    const yaml = 'value: ${secrets.CONFIG.database.connection.password}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'CONFIG',
      nestedKey: 'database.connection.password',
      fullReference: '${secrets.CONFIG.database.connection.password}',
      defaultValue: undefined,
    });
  });

  test('should extract secret with default value', () => {
    const yaml = 'port: ${secrets.PORT:8080}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'PORT',
      nestedKey: undefined,
      fullReference: '${secrets.PORT:8080}',
      defaultValue: '8080',
    });
  });

  test('should extract secret with nested key and default value', () => {
    const yaml = 'timeout: ${secrets.CONFIG.timeout:30}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'CONFIG',
      nestedKey: 'timeout',
      fullReference: '${secrets.CONFIG.timeout:30}',
      defaultValue: '30',
    });
  });

  test('should extract multiple different secret references', () => {
    const yaml = `
      username: \${secrets.DB_USER}
      password: \${secrets.DB_PASSWORD}
      token: \${secrets.API_TOKEN}
    `;
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(3);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ secretName: 'DB_USER' }),
        expect.objectContaining({ secretName: 'DB_PASSWORD' }),
        expect.objectContaining({ secretName: 'API_TOKEN' }),
      ])
    );
  });

  test('should deduplicate identical secret references', () => {
    const yaml = `
      field1: \${secrets.SECRET}
      field2: \${secrets.SECRET}
      field3: \${secrets.SECRET}
    `;
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0].secretName).toBe('SECRET');
  });

  test('should deduplicate identical secret references with nested keys', () => {
    const yaml = `
      field1: \${secrets.API_CREDS.token}
      field2: \${secrets.API_CREDS.token}
    `;
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'API_CREDS',
      nestedKey: 'token',
      fullReference: '${secrets.API_CREDS.token}',
      defaultValue: undefined,
    });
  });

  test('should treat different nested keys as separate references', () => {
    const yaml = `
      username: \${secrets.API_CREDS.username}
      password: \${secrets.API_CREDS.password}
    `;
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ secretName: 'API_CREDS', nestedKey: 'username' }),
        expect.objectContaining({ secretName: 'API_CREDS', nestedKey: 'password' }),
      ])
    );
  });

  test('should return empty array for content with no secret references', () => {
    const yaml = 'username: admin\npassword: secret123';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  test('should return empty array for empty string', () => {
    const result = extractSecretReferences('');

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  test('should handle secret references in complex YAML structure', () => {
    const yaml = `
apiVersion: v1
kind: Config
metadata:
  name: app-config
data:
  database:
    host: \${secrets.DB.host:localhost}
    port: \${secrets.DB.port:5432}
    username: \${secrets.DB.username}
    password: \${secrets.DB.password}
  api:
    key: \${secrets.API_KEY}
    secret: \${secrets.API_SECRET}
    `;
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(6);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ secretName: 'DB', nestedKey: 'host', defaultValue: 'localhost' }),
        expect.objectContaining({ secretName: 'DB', nestedKey: 'port', defaultValue: '5432' }),
        expect.objectContaining({ secretName: 'DB', nestedKey: 'username' }),
        expect.objectContaining({ secretName: 'DB', nestedKey: 'password' }),
        expect.objectContaining({ secretName: 'API_KEY' }),
        expect.objectContaining({ secretName: 'API_SECRET' }),
      ])
    );
  });

  test('should handle default values containing special characters', () => {
    const yaml = 'url: ${secrets.API_URL:https://api.example.com/v1}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'API_URL',
      nestedKey: undefined,
      fullReference: '${secrets.API_URL:https://api.example.com/v1}',
      defaultValue: 'https://api.example.com/v1',
    });
  });

  test('should handle secret references with underscores and numbers', () => {
    const yaml = 'key: ${secrets.SECRET_KEY_123}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0].secretName).toBe('SECRET_KEY_123');
  });

  test('should ignore malformed references missing secrets prefix', () => {
    const yaml = 'value: ${config.PASSWORD}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(0);
  });

  test('should handle inline secret references', () => {
    const yaml = 'connection_string: postgresql://user:\${secrets.DB_PASS}@localhost:5432/db';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0].secretName).toBe('DB_PASS');
  });

  test('should handle multiple references on same line', () => {
    const yaml = 'auth: ${secrets.USER}:${secrets.PASS}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ secretName: 'USER' }),
        expect.objectContaining({ secretName: 'PASS' }),
      ])
    );
  });

  test('should handle default values with colons', () => {
    const yaml = 'time: ${secrets.TIMESTAMP:2025-01-01T00:00:00}';
    const result = extractSecretReferences(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      secretName: 'TIMESTAMP',
      nestedKey: undefined,
      fullReference: '${secrets.TIMESTAMP:2025-01-01T00:00:00}',
      defaultValue: '2025-01-01T00:00:00',
    });
  });
});

describe('getUniqueSecretNames', () => {
  test('should return unique secret names from references', () => {
    const references = [
      { secretName: 'DB_PASSWORD', fullReference: '${secrets.DB_PASSWORD}' },
      { secretName: 'API_KEY', fullReference: '${secrets.API_KEY}' },
      { secretName: 'DB_PASSWORD', nestedKey: 'value', fullReference: '${secrets.DB_PASSWORD.value}' },
    ];

    const result = getUniqueSecretNames(references);

    expect(result).toHaveLength(2);
    expect(result).toEqual(['API_KEY', 'DB_PASSWORD']);
  });

  test('should return sorted array of secret names', () => {
    const references = [
      { secretName: 'ZEBRA', fullReference: '${secrets.ZEBRA}' },
      { secretName: 'ALPHA', fullReference: '${secrets.ALPHA}' },
      { secretName: 'BETA', fullReference: '${secrets.BETA}' },
    ];

    const result = getUniqueSecretNames(references);

    expect(result).toEqual(['ALPHA', 'BETA', 'ZEBRA']);
  });

  test('should return empty array for empty input', () => {
    const result = getUniqueSecretNames([]);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  test('should handle single reference', () => {
    const references = [
      { secretName: 'SINGLE_SECRET', fullReference: '${secrets.SINGLE_SECRET}' },
    ];

    const result = getUniqueSecretNames(references);

    expect(result).toEqual(['SINGLE_SECRET']);
  });

  test('should deduplicate multiple references to same secret', () => {
    const references = [
      { secretName: 'CONFIG', nestedKey: 'key1', fullReference: '${secrets.CONFIG.key1}' },
      { secretName: 'CONFIG', nestedKey: 'key2', fullReference: '${secrets.CONFIG.key2}' },
      { secretName: 'CONFIG', nestedKey: 'key3', fullReference: '${secrets.CONFIG.key3}' },
    ];

    const result = getUniqueSecretNames(references);

    expect(result).toHaveLength(1);
    expect(result).toEqual(['CONFIG']);
  });
});
