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

import { AUTH_METHOD, FormSchema, initialValues, TLS_MODE } from './model';

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
});
