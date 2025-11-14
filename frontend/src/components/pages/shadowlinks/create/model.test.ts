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

import { FormSchema, initialValues, TLS_MODE } from './model';

// Helper to create valid base form values
const createValidFormValues = () => ({
  ...initialValues,
  name: 'test-shadow-link',
  bootstrapServers: [{ value: 'localhost:9092' }],
  useScram: false,
  useTls: true,
});

describe('Shadow Link Form Validation', () => {
  describe('mTLS validation', () => {
    test('should pass validation when mTLS is disabled', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: false,
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(true);
    });

    test('should pass validation when both client key and cert are provided in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
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

    test('should pass validation when both client key and cert are provided in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
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

    test('should pass validation when neither client key nor cert are provided', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
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

    test('should fail validation when CA certificate is not provided in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: undefined,
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('CA certificate is required when mTLS is enabled');
      }
    });

    test('should fail validation when CA certificate is not provided in PEM mode', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: undefined,
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = FormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain('CA certificate is required when mTLS is enabled');
      }
    });

    test('should fail validation when client key is provided without cert in FILE_PATH mode', () => {
      const values = {
        ...createValidFormValues(),
        useMtls: true,
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
        useMtls: true,
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
        useMtls: true,
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
        useMtls: true,
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
        useMtls: true,
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
        useMtls: true,
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
});
