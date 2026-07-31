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

import { UnsupportedSchemaFeaturePolicy } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { initialValues, SCHEMA_REGISTRY_MODE, type SchemaRegistryFormValues, SR_AUTH_METHOD } from './model';
import {
  buildSchemaRegistrySyncOptions,
  buildShadowSchemaRegistryApiOptions,
  durationFromString,
} from './schema-registry-request';

const createApiFormValues = (overrides: Partial<SchemaRegistryFormValues> = {}): SchemaRegistryFormValues => ({
  ...initialValues.schemaRegistry,
  mode: SCHEMA_REGISTRY_MODE.API,
  sourceUrl: 'https://schema-registry.example.com:8081',
  ...overrides,
});

describe('durationFromString', () => {
  test('parses supported units', () => {
    expect(durationFromString('10s')).toMatchObject({ seconds: 10n, nanos: 0 });
    expect(durationFromString('5m')).toMatchObject({ seconds: 300n, nanos: 0 });
    expect(durationFromString('1h')).toMatchObject({ seconds: 3600n, nanos: 0 });
    expect(durationFromString('1500ms')).toMatchObject({ seconds: 1n, nanos: 500_000_000 });
  });

  test('parses sub-millisecond units exactly', () => {
    expect(durationFromString('500000ns')).toMatchObject({ seconds: 0n, nanos: 500_000 });
    expect(durationFromString('500us')).toMatchObject({ seconds: 0n, nanos: 500_000 });
    expect(durationFromString('1500000001ns')).toMatchObject({ seconds: 1n, nanos: 500_000_001 });
  });

  test('keeps integer precision for large second-based values', () => {
    expect(durationFromString('3000h')).toMatchObject({ seconds: 10_800_000n, nanos: 0 });
  });

  test('returns undefined for empty or invalid input', () => {
    expect(durationFromString('')).toBeUndefined();
    expect(durationFromString('  ')).toBeUndefined();
    expect(durationFromString('10')).toBeUndefined();
    expect(durationFromString('10d')).toBeUndefined();
  });
});

describe('buildShadowSchemaRegistryApiOptions', () => {
  test('builds minimal options with defaults', () => {
    const options = buildShadowSchemaRegistryApiOptions(createApiFormValues());

    expect(options.sourceUrl).toBe('https://schema-registry.example.com:8081');
    expect(options.authOptions).toBeUndefined();
    expect(options.tlsSettings).toMatchObject({ enabled: true, tlsSettings: { case: undefined } });
    expect(options.tailInterval).toBeUndefined();
    expect(options.fullSyncInterval).toBeUndefined();
    expect(options.maxSourceRequestsPerSecond).toBe(0);
    expect(options.sourceFilter).toBeUndefined();
    expect(options.destination).toBeUndefined();
    expect(options.unsupportedSchemaFeaturePolicy).toBe(UnsupportedSchemaFeaturePolicy.FAIL);
    expect(options.paused).toBe(false);
  });

  test('sends the raw HTTP Basic password without secret wrapping', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        authMethod: SR_AUTH_METHOD.BASIC,
        basicCredentials: { username: ' sr-replicator ', password: 'p@ssw0rd!' },
      })
    );

    expect(options.authOptions?.authOptions?.case).toBe('basic');
    if (options.authOptions?.authOptions?.case === 'basic') {
      expect(options.authOptions.authOptions.value.username).toBe('sr-replicator');
      expect(options.authOptions.authOptions.value.password).toBe('p@ssw0rd!');
      expect(options.authOptions.authOptions.value.password).not.toContain('${secrets.');
    }
  });

  test('passes an embedded-mode secret-reference password through verbatim', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        authMethod: SR_AUTH_METHOD.BASIC,
        basicCredentials: { username: 'sr-replicator', password: '${secrets.SR_PASSWORD}' },
      })
    );

    expect(options.authOptions?.authOptions?.case).toBe('basic');
    if (options.authOptions?.authOptions?.case === 'basic') {
      // The SecretSelector already stores the reference; the builder must not
      // re-wrap or unwrap it.
      expect(options.authOptions.authOptions.value.password).toBe('${secrets.SR_PASSWORD}');
    }
  });

  test('passes an embedded-mode client-key secret reference through verbatim', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          clientCert: { pemContent: 'CERT_PEM', fileName: 'client.pem' },
          clientKey: { pemContent: '${secrets.SR_MTLS_CLIENT_KEY}', fileName: '' },
        },
      })
    );

    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsPemSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
      expect(options.tlsSettings.tlsSettings.value.key).toBe('${secrets.SR_MTLS_CLIENT_KEY}');
      expect(options.tlsSettings.tlsSettings.value.cert).toBe('CERT_PEM');
    }
  });

  test('sends raw PEM contents for TLS certificates and key', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          ca: { pemContent: '-----BEGIN CERTIFICATE-----\nCA', fileName: 'ca.pem' },
          clientCert: { pemContent: '-----BEGIN CERTIFICATE-----\nCERT', fileName: 'client.pem' },
          clientKey: { pemContent: '-----BEGIN PRIVATE KEY-----\nKEY\n', fileName: 'client.key' },
        },
      })
    );

    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsPemSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
      expect(options.tlsSettings.tlsSettings.value.ca).toBe('-----BEGIN CERTIFICATE-----\nCA');
      expect(options.tlsSettings.tlsSettings.value.cert).toBe('-----BEGIN CERTIFICATE-----\nCERT');
      expect(options.tlsSettings.tlsSettings.value.key).toBe('-----BEGIN PRIVATE KEY-----\nKEY');
    }
  });

  test('omits TLS settings when TLS is disabled and material is a fresh upload', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        useTls: false,
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          ca: { pemContent: '-----BEGIN CERTIFICATE-----\nCA', fileName: 'ca.pem' },
        },
      })
    );

    expect(options.tlsSettings).toBeUndefined();
  });

  test('round-trips hydrated file-path settings stored with TLS disabled', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        useTls: false,
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          doNotSetSniHostname: true,
          filePaths: { caPath: '/etc/tls/ca.pem', keyPath: '/etc/tls/client.key', certPath: '/etc/tls/client.pem' },
        },
      })
    );

    expect(options.tlsSettings?.enabled).toBe(false);
    expect(options.tlsSettings?.doNotSetSniHostname).toBe(true);
    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsFileSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
      expect(options.tlsSettings.tlsSettings.value).toMatchObject({ caPath: '/etc/tls/ca.pem' });
    }
  });

  test('round-trips hydrated PEMs stored with TLS disabled', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        useTls: false,
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          // Hydrated material carries no fileName.
          ca: { pemContent: 'CA_PEM', fileName: '' },
          clientCert: { pemContent: 'CERT_PEM', fileName: '' },
          existingKeyConfigured: true,
          existingKeyFingerprint: 'fp=',
        },
      })
    );

    expect(options.tlsSettings?.enabled).toBe(false);
    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsPemSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
      expect(options.tlsSettings.tlsSettings.value.ca).toBe('CA_PEM');
      expect(options.tlsSettings.tlsSettings.value.cert).toBe('CERT_PEM');
      // Empty key = keep the stored key, same as the enabled path.
      expect(options.tlsSettings.tlsSettings.value.key).toBe('');
    }
  });

  test('builds source filter and exact destination mappings', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        scopeMode: 'specify',
        contexts: [' .prod '],
        subjects: ['orders-value'],
        destinationContextsMode: 'map',
        contextMappings: [{ source: ' .prod ', destination: ' .dr ' }],
        syncBehavior: {
          tailInterval: '10s',
          fullSyncInterval: '5m',
          maxSourceRequestRate: '30',
          unsupportedSchemaFeatures: 'remove',
        },
      })
    );

    expect(options.sourceFilter?.contexts).toEqual(['.prod']);
    expect(options.sourceFilter?.subjects).toEqual(['orders-value']);
    expect(options.destination?.mapping?.case).toBe('exact');
    if (options.destination?.mapping?.case === 'exact') {
      expect(options.destination.mapping.value.mappings).toMatchObject([{ source: '.prod', destination: '.dr' }]);
    }
    expect(options.tailInterval).toMatchObject({ seconds: 10n });
    expect(options.fullSyncInterval).toMatchObject({ seconds: 300n });
    expect(options.maxSourceRequestsPerSecond).toBe(30);
    expect(options.unsupportedSchemaFeaturePolicy).toBe(UnsupportedSchemaFeaturePolicy.REMOVE);
  });

  test('preserve mode and empty mapping list leave destination unset', () => {
    const preserved = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        destinationContextsMode: 'preserve',
        contextMappings: [{ source: '.prod', destination: '.dr' }],
      })
    );
    expect(preserved.destination).toBeUndefined();

    const emptyMap = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({ destinationContextsMode: 'map', contextMappings: [] })
    );
    expect(emptyMap.destination).toBeUndefined();
  });

  test('round-trips doNotSetSniHostname on every TLS shape', () => {
    const bare = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({ mtls: { ...initialValues.schemaRegistry.mtls, doNotSetSniHostname: true } })
    );
    expect(bare.tlsSettings?.doNotSetSniHostname).toBe(true);

    const withPem = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          ca: { pemContent: 'CA_PEM', fileName: 'ca.pem' },
          doNotSetSniHostname: true,
        },
      })
    );
    expect(withPem.tlsSettings?.doNotSetSniHostname).toBe(true);

    const withFilePaths = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          doNotSetSniHostname: true,
          filePaths: { caPath: '/ca.pem', keyPath: '/client.key', certPath: '/client.pem' },
        },
      })
    );
    expect(withFilePaths.tlsSettings?.doNotSetSniHostname).toBe(true);
  });

  test('round-trips paused from the form slice', () => {
    expect(buildShadowSchemaRegistryApiOptions(createApiFormValues()).paused).toBe(false);
    expect(buildShadowSchemaRegistryApiOptions(createApiFormValues({ paused: true })).paused).toBe(true);
  });

  test('round-trips file-path TLS settings verbatim', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          filePaths: { caPath: '/etc/tls/ca.pem', keyPath: '/etc/tls/client.key', certPath: '/etc/tls/client.pem' },
        },
      })
    );

    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsFileSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
      expect(options.tlsSettings.tlsSettings.value).toMatchObject({
        caPath: '/etc/tls/ca.pem',
        keyPath: '/etc/tls/client.key',
        certPath: '/etc/tls/client.pem',
      });
    }
  });

  test('sends an empty key alongside a kept server-side pair', () => {
    const options = buildShadowSchemaRegistryApiOptions(
      createApiFormValues({
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          clientCert: { pemContent: 'CERT_PEM', fileName: '' },
          existingKeyConfigured: true,
          existingKeyFingerprint: 'fp=',
        },
      })
    );

    expect(options.tlsSettings?.tlsSettings?.case).toBe('tlsPemSettings');
    if (options.tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
      expect(options.tlsSettings.tlsSettings.value.cert).toBe('CERT_PEM');
      // Empty key = keep the stored key (verified server behavior); the
      // fingerprint marker never reaches the wire.
      expect(options.tlsSettings.tlsSettings.value.key).toBe('');
      expect(options.tlsSettings.tlsSettings.value.keyFingerprint).toBe('');
    }
  });
});

describe('buildSchemaRegistrySyncOptions', () => {
  test('api mode produces the shadowSchemaRegistryApi oneof', () => {
    const options = buildSchemaRegistrySyncOptions({
      ...initialValues,
      schemaRegistry: createApiFormValues(),
    });

    expect(options?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryApi');
  });

  test('legacy switch produces the topic oneof exactly as before', () => {
    const options = buildSchemaRegistrySyncOptions({
      ...initialValues,
      enableSchemaRegistrySync: true,
    });

    expect(options?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryTopic');
  });

  test('topic mode from the redesigned section mirrors the legacy switch', () => {
    const options = buildSchemaRegistrySyncOptions({
      ...initialValues,
      enableSchemaRegistrySync: true,
      schemaRegistry: { ...initialValues.schemaRegistry, mode: SCHEMA_REGISTRY_MODE.TOPIC },
    });

    expect(options?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryTopic');
  });

  test('disabled sync produces no options', () => {
    expect(buildSchemaRegistrySyncOptions(initialValues)).toBeUndefined();
  });
});
