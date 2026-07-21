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
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  type SchemaRegistrySyncOptionsSchema,
  UnsupportedSchemaFeaturePolicy,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { fromDataplaneShadowLink } from './dataplane';
import type { UnifiedSchemaRegistryApiOptions } from '../model';

const buildShadowLink = (schemaRegistrySyncOptions?: MessageInitShape<typeof SchemaRegistrySyncOptionsSchema>) =>
  create(ShadowLinkSchema, {
    name: 'test-link',
    uid: 'uid-1',
    configurations: { schemaRegistrySyncOptions },
  });

const mapApiOptions = (
  apiOptions: MessageInitShape<typeof SchemaRegistrySyncOptionsSchema>['schemaRegistryShadowingMode']
): UnifiedSchemaRegistryApiOptions => {
  const shadowLink = buildShadowLink({ schemaRegistryShadowingMode: apiOptions });
  const mode =
    fromDataplaneShadowLink(shadowLink).configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode;
  if (mode?.case !== 'shadowSchemaRegistryApi') {
    throw new Error(`expected shadowSchemaRegistryApi, got ${mode?.case}`);
  }
  return mode.value;
};

describe('fromDataplaneShadowLink schema registry sync options', () => {
  test('should map the topic shadowing mode', () => {
    const shadowLink = buildShadowLink({
      schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} },
    });

    const result = fromDataplaneShadowLink(shadowLink);

    expect(result.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case).toBe(
      'shadowSchemaRegistryTopic'
    );
  });

  test('should map an absent shadowing mode to case undefined', () => {
    const shadowLink = buildShadowLink({});

    const result = fromDataplaneShadowLink(shadowLink);

    expect(result.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case).toBeUndefined();
  });

  test('should map absent sync options to undefined', () => {
    const shadowLink = buildShadowLink(undefined);

    const result = fromDataplaneShadowLink(shadowLink);

    expect(result.configurations?.schemaRegistrySyncOptions).toBeUndefined();
  });

  test('should map the full API shadowing mode', () => {
    const passwordSetAt = new Date('2026-07-01T12:00:00Z');
    const api = mapApiOptions({
      case: 'shadowSchemaRegistryApi',
      value: {
        sourceUrl: 'https://sr.example.com',
        authOptions: {
          authOptions: {
            case: 'basic',
            value: {
              username: 'sr-user',
              password: 'super-secret',
              passwordSet: true,
              passwordSetAt: timestampFromDate(passwordSetAt),
            },
          },
        },
        tlsSettings: { enabled: true, tlsSettings: { case: 'tlsPemSettings', value: { ca: 'CA_PEM' } } },
        tailInterval: { seconds: 10n },
        effectiveTailInterval: { seconds: 10n },
        fullSyncInterval: { seconds: 0n, nanos: 500_000_000 },
        effectiveFullSyncInterval: { seconds: 300n },
        maxSourceRequestsPerSecond: 30,
        effectiveMaxSourceRequestsPerSecond: 30,
        sourceFilter: { contexts: ['.prod'], subjects: ['orders-value'] },
        destination: {
          mapping: { case: 'exact', value: { mappings: [{ source: '.prod', destination: '.dr' }] } },
        },
        unsupportedSchemaFeaturePolicy: UnsupportedSchemaFeaturePolicy.REMOVE,
        paused: true,
      },
    });

    expect(api.sourceUrl).toBe('https://sr.example.com');
    expect(api.basicAuth).toEqual({ username: 'sr-user', passwordSet: true, passwordSetAt });
    // The password must never reach the unified model
    expect(api.basicAuth && 'password' in api.basicAuth).toBe(false);
    expect(api.tlsSettings?.enabled).toBe(true);
    expect(api.tlsSettings?.tlsSettings?.case).toBe('tlsPemSettings');
    expect(api.tailIntervalSeconds).toBe(10);
    expect(api.effectiveTailIntervalSeconds).toBe(10);
    expect(api.fullSyncIntervalSeconds).toBe(0.5);
    expect(api.effectiveFullSyncIntervalSeconds).toBe(300);
    expect(api.maxSourceRequestsPerSecond).toBe(30);
    expect(api.effectiveMaxSourceRequestsPerSecond).toBe(30);
    expect(api.sourceFilter).toEqual({ contexts: ['.prod'], subjects: ['orders-value'] });
    expect(api.destinationMapping).toEqual({ case: 'exact', mappings: [{ source: '.prod', destination: '.dr' }] });
    expect(api.unsupportedSchemaFeaturePolicy).toBe(UnsupportedSchemaFeaturePolicy.REMOVE);
    expect(api.paused).toBe(true);
  });

  test('should normalize unset API values to undefined', () => {
    const api = mapApiOptions({
      case: 'shadowSchemaRegistryApi',
      value: {
        sourceUrl: 'https://sr.example.com',
        tailInterval: { seconds: 0n },
        maxSourceRequestsPerSecond: 0,
      },
    });

    expect(api.basicAuth).toBeUndefined();
    expect(api.tlsSettings).toBeUndefined();
    expect(api.tailIntervalSeconds).toBeUndefined();
    expect(api.effectiveTailIntervalSeconds).toBeUndefined();
    expect(api.fullSyncIntervalSeconds).toBeUndefined();
    expect(api.maxSourceRequestsPerSecond).toBeUndefined();
    expect(api.sourceFilter).toBeUndefined();
    expect(api.destinationMapping).toBeUndefined();
    expect(api.unsupportedSchemaFeaturePolicy).toBe(UnsupportedSchemaFeaturePolicy.UNSPECIFIED);
    expect(api.paused).toBe(false);
  });

  test('should map an identity destination mapping', () => {
    const api = mapApiOptions({
      case: 'shadowSchemaRegistryApi',
      value: {
        sourceUrl: 'https://sr.example.com',
        destination: { mapping: { case: 'identity', value: {} } },
      },
    });

    expect(api.destinationMapping).toEqual({ case: 'identity' });
  });
});
