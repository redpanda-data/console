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

import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { DurationSchema } from '@bufbuild/protobuf/wkt';
import {
  SchemaRegistrySyncOptionsSchema,
  UnsupportedSchemaFeaturePolicy,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { formatDurationForInput, mapSchemaRegistrySyncOptionsToFormValues } from './schema-registry';
import { initialValues, SCHEMA_REGISTRY_MODE, SR_AUTH_METHOD } from '../create/model';
import { durationFromString } from '../create/schema-registry-request';

const duration = (seconds: number, nanos = 0) => create(DurationSchema, { seconds: BigInt(seconds), nanos });

const apiSyncOptions = (
  api: NonNullable<
    Extract<
      MessageInitShape<typeof SchemaRegistrySyncOptionsSchema>['schemaRegistryShadowingMode'],
      { case: 'shadowSchemaRegistryApi' }
    >
  >['value']
) =>
  create(SchemaRegistrySyncOptionsSchema, {
    schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryApi', value: api },
  });

describe('formatDurationForInput', () => {
  test('maps unset and zero durations to empty (cluster default)', () => {
    expect(formatDurationForInput(undefined)).toBe('');
    expect(formatDurationForInput(duration(0))).toBe('');
  });

  test('formats the largest evenly-dividing unit', () => {
    expect(formatDurationForInput(duration(10))).toBe('10s');
    expect(formatDurationForInput(duration(90))).toBe('90s');
    expect(formatDurationForInput(duration(300))).toBe('5m');
    expect(formatDurationForInput(duration(3660))).toBe('61m');
    expect(formatDurationForInput(duration(3600))).toBe('1h');
    expect(formatDurationForInput(duration(0, 500_000_000))).toBe('500ms');
    expect(formatDurationForInput(duration(1, 500_000_000))).toBe('1500ms');
  });

  test('formats sub-millisecond durations exactly (settable via rpk)', () => {
    expect(formatDurationForInput(duration(0, 500_000))).toBe('500us');
    expect(formatDurationForInput(duration(0, 512))).toBe('512ns');
    expect(formatDurationForInput(duration(0, 1500))).toBe('1500ns');
    expect(formatDurationForInput(duration(1, 500_000))).toBe('1000500us');
  });

  test('round-trips through durationFromString', () => {
    for (const input of [
      duration(10),
      duration(300),
      duration(3600),
      duration(0, 500_000_000),
      duration(0, 500_000),
      duration(0, 512),
      duration(1, 500_000),
    ]) {
      expect(durationFromString(formatDurationForInput(input))).toMatchObject({
        seconds: input.seconds,
        nanos: input.nanos,
      });
    }
  });
});

describe('mapSchemaRegistrySyncOptionsToFormValues', () => {
  test('maps absent options and unset mode to none defaults', () => {
    for (const options of [
      undefined,
      create(SchemaRegistrySyncOptionsSchema, { schemaRegistryShadowingMode: { case: undefined } }),
    ]) {
      const result = mapSchemaRegistrySyncOptionsToFormValues(options);
      expect(result.enableSchemaRegistrySync).toBe(false);
      expect(result.schemaRegistry).toEqual(initialValues.schemaRegistry);
    }
  });

  test('maps topic mode to the legacy switch plus topic tab', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      create(SchemaRegistrySyncOptionsSchema, {
        schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} },
      })
    );
    expect(result.enableSchemaRegistrySync).toBe(true);
    expect(result.schemaRegistry).toEqual({ ...initialValues.schemaRegistry, mode: SCHEMA_REGISTRY_MODE.TOPIC });
  });

  test('maps a minimal api message to api defaults', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(apiSyncOptions({ sourceUrl: 'http://sr.example.com' }));
    expect(result.enableSchemaRegistrySync).toBe(false);
    expect(result.schemaRegistry).toEqual({
      ...initialValues.schemaRegistry,
      mode: SCHEMA_REGISTRY_MODE.API,
      sourceUrl: 'http://sr.example.com',
      useTls: false,
    });
  });

  test('hydrates basic auth without seeding the password', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'http://sr.example.com',
        authOptions: {
          authOptions: {
            case: 'basic',
            value: { username: 'sr-replicator', password: 'should-never-appear', passwordSet: true },
          },
        },
      })
    );
    expect(result.schemaRegistry.authMethod).toBe(SR_AUTH_METHOD.BASIC);
    expect(result.schemaRegistry.basicCredentials).toEqual({ username: 'sr-replicator', password: '' });
  });

  test('hydrates returned PEMs and marks the redacted key as kept server-side', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'https://sr.example.com',
        tlsSettings: {
          enabled: true,
          tlsSettings: {
            case: 'tlsPemSettings',
            value: { ca: 'CA_PEM', cert: 'CERT_PEM', key: '', keyFingerprint: 'abc123=' },
          },
        },
      })
    );
    expect(result.schemaRegistry.useTls).toBe(true);
    expect(result.schemaRegistry.mtls.ca).toEqual({ pemContent: 'CA_PEM', fileName: '' });
    expect(result.schemaRegistry.mtls.clientCert).toEqual({ pemContent: 'CERT_PEM', fileName: '' });
    expect(result.schemaRegistry.mtls.clientKey).toBeUndefined();
    expect(result.schemaRegistry.mtls.existingKeyConfigured).toBe(true);
    expect(result.schemaRegistry.mtls.existingKeyFingerprint).toBe('abc123=');
  });

  test('marks a kept key from the cert alone when the fingerprint is missing', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'https://sr.example.com',
        tlsSettings: {
          enabled: true,
          tlsSettings: { case: 'tlsPemSettings', value: { cert: 'CERT_PEM' } },
        },
      })
    );
    expect(result.schemaRegistry.mtls.existingKeyConfigured).toBe(true);
    expect(result.schemaRegistry.mtls.existingKeyFingerprint).toBe('');
  });

  test('hydrates a returned key directly instead of the kept marker', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'https://sr.example.com',
        tlsSettings: {
          enabled: true,
          tlsSettings: { case: 'tlsPemSettings', value: { cert: 'CERT_PEM', key: 'KEY_PEM' } },
        },
      })
    );
    expect(result.schemaRegistry.mtls.clientKey).toEqual({ pemContent: 'KEY_PEM', fileName: '' });
    expect(result.schemaRegistry.mtls.existingKeyConfigured).toBe(false);
  });

  test('hydrates file-path TLS settings verbatim', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'https://sr.example.com',
        tlsSettings: {
          enabled: true,
          tlsSettings: {
            case: 'tlsFileSettings',
            value: { caPath: '/etc/tls/ca.pem', keyPath: '/etc/tls/client.key', certPath: '/etc/tls/client.pem' },
          },
        },
      })
    );
    expect(result.schemaRegistry.mtls.filePaths).toEqual({
      caPath: '/etc/tls/ca.pem',
      keyPath: '/etc/tls/client.key',
      certPath: '/etc/tls/client.pem',
    });
    expect(result.schemaRegistry.mtls.ca).toBeUndefined();
    expect(result.schemaRegistry.mtls.clientCert).toBeUndefined();
    expect(result.schemaRegistry.mtls.existingKeyConfigured).toBe(false);
  });

  test('round-trips doNotSetSniHostname', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'https://sr.example.com',
        tlsSettings: { doNotSetSniHostname: true, enabled: true },
      })
    );
    expect(result.schemaRegistry.mtls.doNotSetSniHostname).toBe(true);
  });

  test('infers useTls from an https scheme when TLS settings are absent', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(apiSyncOptions({ sourceUrl: 'https://sr.example.com' }));
    expect(result.schemaRegistry.useTls).toBe(true);
  });

  test('keeps TLS on with system trust store when the oneof is unset', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({ sourceUrl: 'https://sr.example.com', tlsSettings: { enabled: true } })
    );
    expect(result.schemaRegistry.useTls).toBe(true);
    expect(result.schemaRegistry.mtls).toEqual(initialValues.schemaRegistry.mtls);
  });

  test('maps a present-but-empty source filter to the entire registry', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({ sourceUrl: 'http://sr.example.com', sourceFilter: { contexts: [], subjects: [] } })
    );
    expect(result.schemaRegistry.scopeMode).toBe('all');
    expect(result.schemaRegistry.contexts).toEqual([]);
  });

  test('maps a populated source filter to specify scope', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'http://sr.example.com',
        sourceFilter: { contexts: ['.prod'], subjects: ['orders-value', ':.prod:orders-value'] },
      })
    );
    expect(result.schemaRegistry.scopeMode).toBe('specify');
    expect(result.schemaRegistry.contexts).toEqual(['.prod']);
    expect(result.schemaRegistry.subjects).toEqual(['orders-value', ':.prod:orders-value']);
  });

  test('maps identity, unset, and empty-exact destinations to preserve', () => {
    for (const destination of [
      undefined,
      { mapping: { case: 'identity' as const, value: {} } },
      { mapping: { case: 'exact' as const, value: { mappings: [] } } },
    ]) {
      const result = mapSchemaRegistrySyncOptionsToFormValues(
        apiSyncOptions({ sourceUrl: 'http://sr.example.com', destination })
      );
      expect(result.schemaRegistry.destinationContextsMode).toBe('preserve');
      expect(result.schemaRegistry.contextMappings).toEqual([]);
    }
  });

  test('maps exact destination mappings to map rows', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'http://sr.example.com',
        destination: {
          mapping: { case: 'exact', value: { mappings: [{ source: '.prod', destination: '.dr' }] } },
        },
      })
    );
    expect(result.schemaRegistry.destinationContextsMode).toBe('map');
    expect(result.schemaRegistry.contextMappings).toEqual([{ source: '.prod', destination: '.dr' }]);
  });

  test('maps sync behavior fields including cluster defaults', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({
        sourceUrl: 'http://sr.example.com',
        tailInterval: duration(10),
        fullSyncInterval: duration(300),
        maxSourceRequestsPerSecond: 30,
        unsupportedSchemaFeaturePolicy: UnsupportedSchemaFeaturePolicy.REMOVE,
      })
    );
    expect(result.schemaRegistry.syncBehavior).toEqual({
      tailInterval: '10s',
      fullSyncInterval: '5m',
      maxSourceRequestRate: '30',
      unsupportedSchemaFeatures: 'remove',
    });
  });

  test('maps zero rate and unspecified policy to the fail default', () => {
    for (const policy of [UnsupportedSchemaFeaturePolicy.UNSPECIFIED, UnsupportedSchemaFeaturePolicy.FAIL]) {
      const result = mapSchemaRegistrySyncOptionsToFormValues(
        apiSyncOptions({ sourceUrl: 'http://sr.example.com', unsupportedSchemaFeaturePolicy: policy })
      );
      expect(result.schemaRegistry.syncBehavior).toEqual({
        tailInterval: '',
        fullSyncInterval: '',
        maxSourceRequestRate: '',
        unsupportedSchemaFeatures: 'fail',
      });
    }
  });

  test('round-trips paused', () => {
    const result = mapSchemaRegistrySyncOptionsToFormValues(
      apiSyncOptions({ sourceUrl: 'http://sr.example.com', paused: true })
    );
    expect(result.schemaRegistry.paused).toBe(true);
  });
});
