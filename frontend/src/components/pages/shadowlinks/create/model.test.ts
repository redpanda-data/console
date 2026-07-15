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

import { AUTH_METHOD, FormSchema, initialValues, SCHEMA_REGISTRY_MODE, SR_AUTH_METHOD, TLS_MODE } from './model';

// Helper to create valid base form values
const createValidFormValues = () => ({
  ...initialValues,
  name: 'test-shadow-link',
  bootstrapServers: [{ value: 'localhost:9092' }],
  authMethod: AUTH_METHOD.NONE,
  useTls: true,
});

describe('Shadow Link Form Validation', () => {
  describe('Certificate validation', () => {
    test('should pass validation when no certificates are provided', () => {
      const values = {
        ...createValidFormValues(),
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should pass validation when all certificates are provided in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: {
            filePath: '/etc/redpanda/certs/client.crt',
          },
          clientKey: {
            filePath: '/etc/redpanda/certs/client.key',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should pass validation when all certificates are provided in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCA...',
            fileName: 'ca.crt',
          },
          clientCert: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCERT...',
            fileName: 'client.crt',
          },
          clientKey: {
            pemContent: '-----BEGIN PRIVATE KEY-----\nKEY...',
            fileName: 'client.key',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should pass validation when only CA certificate is provided', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should fail validation when client key is provided without cert in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: undefined,
          clientKey: {
            filePath: '/etc/redpanda/certs/client.key',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('Client certificate is required when client private key is provided');
      }
    });

    test('should fail validation when client cert is provided without key in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: {
            filePath: '/etc/redpanda/certs/client.crt',
          },
          clientKey: undefined,
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('Client private key is required when client certificate is provided');
      }
    });

    test('should fail validation when client key is provided without cert in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCA...',
            fileName: 'ca.crt',
          },
          clientCert: undefined,
          clientKey: {
            pemContent: '-----BEGIN PRIVATE KEY-----\nKEY...',
            fileName: 'client.key',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('Client certificate is required when client private key is provided');
      }
    });

    test('should fail validation when client cert is provided without key in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCA...',
            fileName: 'ca.crt',
          },
          clientCert: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCERT...',
            fileName: 'client.crt',
          },
          clientKey: undefined,
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('Client private key is required when client certificate is provided');
      }
    });

    test('should ignore empty strings and treat them as not provided in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: {
            filePath: '   ',
          },
          clientKey: {
            filePath: '',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should ignore empty strings and treat them as not provided in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCA...',
            fileName: 'ca.crt',
          },
          clientCert: {
            pemContent: '   ',
            fileName: 'client.crt',
          },
          clientKey: {
            pemContent: '',
            fileName: 'client.key',
          },
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });
  });

  describe('Authentication validation', () => {
    test('passes when authMethod is none and no credentials provided', () => {
      const result = FormSchema.safeParse({
        ...createValidFormValues(),
        authMethod: AUTH_METHOD.NONE,
      });
      expect(result.success).toBe(true);
    });

    test('passes when SCRAM credentials are complete', () => {
      const result = FormSchema.safeParse({
        ...createValidFormValues(),
        authMethod: AUTH_METHOD.SCRAM,
        scramCredentials: {
          username: 'admin',
          password: 'secret',
          mechanism: initialValues.scramCredentials?.mechanism ?? 1,
        },
      });
      expect(result.success).toBe(true);
    });

    test('fails when SCRAM is selected but credentials are empty', () => {
      const result = FormSchema.safeParse({
        ...createValidFormValues(),
        authMethod: AUTH_METHOD.SCRAM,
        scramCredentials: {
          username: '   ',
          password: '',
          mechanism: initialValues.scramCredentials?.mechanism ?? 1,
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages).toContain('Username is required when SCRAM is enabled');
        expect(messages).toContain('Password is required when SCRAM is enabled');
      }
    });

    test('passes when PLAIN credentials are complete', () => {
      const result = FormSchema.safeParse({
        ...createValidFormValues(),
        authMethod: AUTH_METHOD.PLAIN,
        plainCredentials: { username: 'admin', password: 'secret' },
      });
      expect(result.success).toBe(true);
    });

    test('fails when PLAIN is selected but credentials are empty', () => {
      const result = FormSchema.safeParse({
        ...createValidFormValues(),
        authMethod: AUTH_METHOD.PLAIN,
        plainCredentials: { username: '   ', password: '' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages).toContain('Username is required when PLAIN is enabled');
        expect(messages).toContain('Password is required when PLAIN is enabled');
      }
    });
  });

  describe('Schema Registry validation', () => {
    const createApiModeValues = (schemaRegistry: Partial<(typeof initialValues)['schemaRegistry']> = {}) => ({
      ...createValidFormValues(),
      schemaRegistry: {
        ...initialValues.schemaRegistry,
        mode: SCHEMA_REGISTRY_MODE.API,
        sourceUrl: 'https://schema-registry.example.com:8081',
        ...schemaRegistry,
      },
    });

    const issueMessages = (result: ReturnType<typeof FormSchema.safeParse>): string[] =>
      result.success ? [] : result.error.issues.map((issue) => issue.message);

    test('never blocks topic and none modes on empty api fields', () => {
      for (const mode of [SCHEMA_REGISTRY_MODE.TOPIC, SCHEMA_REGISTRY_MODE.NONE]) {
        const result = FormSchema.safeParse({
          ...createValidFormValues(),
          schemaRegistry: { ...initialValues.schemaRegistry, mode },
        });
        expect(result.success).toBe(true);
      }
    });

    test('passes with minimal api mode configuration', () => {
      const result = FormSchema.safeParse(createApiModeValues());
      expect(result.success).toBe(true);
    });

    test('requires a source URL in api mode', () => {
      const result = FormSchema.safeParse(createApiModeValues({ sourceUrl: '   ' }));
      expect(issueMessages(result)).toContain('Source URL is required');
    });

    test('rejects non-http(s) source URLs', () => {
      const result = FormSchema.safeParse(createApiModeValues({ sourceUrl: 'ftp://example.com' }));
      expect(issueMessages(result)).toContain('Must be a valid URL, e.g. https://schema-registry.example.com:8081');
    });

    test('rejects http URLs while TLS is enabled', () => {
      const result = FormSchema.safeParse(createApiModeValues({ sourceUrl: 'http://example.com:8081', useTls: true }));
      expect(issueMessages(result)).toContain('Use an https:// URL when TLS is enabled, or turn off Enable TLS');
    });

    test('allows http URLs when TLS is disabled', () => {
      const result = FormSchema.safeParse(createApiModeValues({ sourceUrl: 'http://example.com:8081', useTls: false }));
      expect(result.success).toBe(true);
    });

    test('rejects https URLs while TLS is disabled', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({ sourceUrl: 'https://example.com:8081', useTls: false })
      );
      expect(issueMessages(result)).toContain('Enable TLS to use an https:// URL, or use an http:// URL');
    });

    test('requires username and password for HTTP Basic', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          authMethod: SR_AUTH_METHOD.BASIC,
          basicCredentials: { username: '  ', password: '' },
        })
      );
      const messages = issueMessages(result);
      expect(messages).toContain('Username is required when HTTP Basic is enabled');
      expect(messages).toContain('Password is required when HTTP Basic is enabled');
    });

    test('accepts any raw password for HTTP Basic', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          authMethod: SR_AUTH_METHOD.BASIC,
          basicCredentials: { username: 'sr-replicator', password: 'lowercase p@ssw0rd!' },
        })
      );
      expect(result.success).toBe(true);
    });

    test('requires the client certificate and key as a pair', () => {
      const keyOnly = FormSchema.safeParse(
        createApiModeValues({
          mtls: {
            ca: undefined,
            clientCert: undefined,
            clientKey: { pemContent: '-----BEGIN PRIVATE KEY-----\nKEY...', fileName: 'client.key' },
          },
        })
      );
      expect(issueMessages(keyOnly)).toContain('Client certificate is required when client private key is provided');

      const certOnly = FormSchema.safeParse(
        createApiModeValues({
          mtls: {
            ca: undefined,
            clientCert: { pemContent: '-----BEGIN CERTIFICATE-----\nCERT...', fileName: 'client.crt' },
            clientKey: undefined,
          },
        })
      );
      expect(issueMessages(certOnly)).toContain('Client private key is required when client certificate is provided');
    });

    test('ignores leftover mtls uploads while TLS is off', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          // http to stay consistent with TLS being off (https + no TLS is rejected)
          sourceUrl: 'http://schema-registry.example.com:8081',
          useTls: false,
          mtls: {
            ca: undefined,
            clientCert: undefined,
            clientKey: { pemContent: '-----BEGIN PRIVATE KEY-----\nKEY...', fileName: 'client.key' },
          },
        })
      );
      expect(result.success).toBe(true);
    });

    test('requires at least one context or subject when scope is specify', () => {
      const result = FormSchema.safeParse(createApiModeValues({ scopeMode: 'specify' }));
      expect(issueMessages(result)).toContain('Add at least one context or subject');
    });

    test('requires contexts to be dot-prefixed', () => {
      const result = FormSchema.safeParse(createApiModeValues({ scopeMode: 'specify', contexts: ['prod'] }));
      expect(issueMessages(result)).toContain('Context must start with a dot, e.g. . or .prod');
    });

    test('accepts subjects without contexts when scope is specify', () => {
      const result = FormSchema.safeParse(createApiModeValues({ scopeMode: 'specify', subjects: ['orders-value'] }));
      expect(result.success).toBe(true);
    });

    test('validates mapping rows when destination contexts are mapped', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          destinationContextsMode: 'map',
          contextMappings: [
            { source: '.prod', destination: '.dr' },
            { source: '.prod', destination: '' },
          ],
        })
      );
      const messages = issueMessages(result);
      expect(messages).toContain('Each source context can be mapped only once');
      expect(messages).toContain('Destination context is required');
    });

    test('requires distinct destination contexts', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          destinationContextsMode: 'map',
          contextMappings: [
            { source: '.a', destination: '.dr' },
            { source: '.b', destination: '.dr' },
          ],
        })
      );
      expect(issueMessages(result)).toContain('Destination contexts must be distinct');
    });

    test('requires every in-scope context to have a mapping row', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          scopeMode: 'specify',
          contexts: ['.prod', '.staging'],
          destinationContextsMode: 'map',
          contextMappings: [{ source: '.prod', destination: '.dr' }],
        })
      );
      expect(issueMessages(result)).toContain(
        'Add a destination mapping for every context in scope. Missing: .staging'
      );
    });

    test('passes when every in-scope context is mapped to a distinct destination', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          scopeMode: 'specify',
          contexts: ['.prod', '.staging'],
          destinationContextsMode: 'map',
          contextMappings: [
            { source: '.prod', destination: '.dr-prod' },
            { source: '.staging', destination: '.dr-staging' },
          ],
        })
      );
      expect(result.success).toBe(true);
    });

    test('ignores mapping rows while destinations are preserved', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          destinationContextsMode: 'preserve',
          contextMappings: [{ source: '', destination: '' }],
        })
      );
      expect(result.success).toBe(true);
    });

    test('validates sync behavior formats only when set', () => {
      const empty = FormSchema.safeParse(
        createApiModeValues({
          syncBehavior: {
            tailInterval: '',
            fullSyncInterval: '',
            maxSourceRequestRate: '',
            unsupportedSchemaFeatures: 'fail',
          },
        })
      );
      expect(empty.success).toBe(true);

      const invalid = FormSchema.safeParse(
        createApiModeValues({
          syncBehavior: {
            tailInterval: '10',
            fullSyncInterval: '5x',
            maxSourceRequestRate: '0',
            unsupportedSchemaFeatures: 'fail',
          },
        })
      );
      const messages = issueMessages(invalid);
      expect(messages).toContain('Use a number with a unit, e.g. 10s or 5m');
      expect(messages).toContain('Must be a positive whole number');
    });

    test('rejects out-of-range durations and request rates', () => {
      const result = FormSchema.safeParse(
        createApiModeValues({
          syncBehavior: {
            tailInterval: '999999999999h',
            fullSyncInterval: '',
            maxSourceRequestRate: '2147483648',
            unsupportedSchemaFeatures: 'fail',
          },
        })
      );
      const messages = issueMessages(result);
      expect(messages).toContain('Interval is too large');
      expect(messages).toContain('Must be 2147483647 or less');
    });
  });
});
