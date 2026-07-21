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

/**
 * Schema Registry sync-options mappers shared by the dataplane and
 * controlplane mappers. Both planes carry the same redpanda.core.admin.v2
 * messages (dataplane via local protogen, controlplane via the @buf npm SDK),
 * so unlike the per-plane client-options mappers there is no structural
 * difference to justify duplicating this logic.
 */

import { type Duration, timestampDate } from '@bufbuild/protobuf/wkt';
import type {
  SchemaRegistryAuthOptions,
  SchemaRegistryContextDestination,
  SchemaRegistrySourceFilter,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { TLSSettings } from 'protogen/redpanda/core/common/v1/tls_pb';

import type { UnifiedSchemaRegistryApiOptions, UnifiedSchemaRegistrySyncOptions, UnifiedTLSSettings } from '../model';

/**
 * Structural view of redpanda.core.admin.v2 ShadowSchemaRegistryApi accepted
 * from either generated package. The protogen and @buf declarations are
 * structurally identical; the one nominal mismatch (the policy enum) is
 * widened to number so both packages' values are assignable.
 */
export type SchemaRegistryApiOptionsMessage = {
  sourceUrl: string;
  authOptions?: SchemaRegistryAuthOptions;
  tlsSettings?: TLSSettings;
  tailInterval?: Duration;
  effectiveTailInterval?: Duration;
  fullSyncInterval?: Duration;
  effectiveFullSyncInterval?: Duration;
  maxSourceRequestsPerSecond: number;
  effectiveMaxSourceRequestsPerSecond: number;
  sourceFilter?: SchemaRegistrySourceFilter;
  destination?: SchemaRegistryContextDestination;
  unsupportedSchemaFeaturePolicy: number;
  paused: boolean;
};

/**
 * Structural view of redpanda.core.admin.v2 SchemaRegistrySyncOptions accepted
 * from either generated package.
 */
export type SchemaRegistrySyncOptionsMessage = {
  schemaRegistryShadowingMode:
    | { case: 'shadowSchemaRegistryTopic'; value: unknown }
    | { case: 'shadowSchemaRegistryApi'; value: SchemaRegistryApiOptionsMessage }
    | { case: undefined; value?: undefined };
};

/**
 * Convert a proto Duration to seconds.
 * Zero or unset durations map to undefined so the cluster default applies.
 */
export function durationToSeconds(duration: Duration | undefined): number | undefined {
  if (!duration) {
    return;
  }
  const seconds = Number(duration.seconds) + duration.nanos / 1_000_000_000;
  return seconds > 0 ? seconds : undefined;
}

/**
 * Map the core common TLS settings oneof to unified type
 */
export function mapTLSSettings(tlsSettings: TLSSettings | undefined): UnifiedTLSSettings | undefined {
  if (!tlsSettings) {
    return;
  }

  let tlsSettingsValue: UnifiedTLSSettings['tlsSettings'];

  if (tlsSettings.tlsSettings?.case === 'tlsFileSettings') {
    const fileSettings = tlsSettings.tlsSettings.value;
    tlsSettingsValue = {
      case: 'tlsFileSettings',
      value: {
        caPath: fileSettings.caPath,
        keyPath: fileSettings.keyPath,
        certPath: fileSettings.certPath,
      },
    };
  } else if (tlsSettings.tlsSettings?.case === 'tlsPemSettings') {
    const pemSettings = tlsSettings.tlsSettings.value;
    tlsSettingsValue = {
      case: 'tlsPemSettings',
      value: {
        ca: pemSettings.ca,
        key: pemSettings.key,
        cert: pemSettings.cert,
        keyFingerprint: pemSettings.keyFingerprint,
      },
    };
  }

  return {
    enabled: tlsSettings.enabled,
    tlsSettings: tlsSettingsValue,
  };
}

/**
 * Map the schema registry destination context mapping to unified type
 */
function mapDestinationMapping(
  destination: SchemaRegistryContextDestination | undefined
): UnifiedSchemaRegistryApiOptions['destinationMapping'] {
  if (destination?.mapping?.case === 'identity') {
    return { case: 'identity' };
  }
  if (destination?.mapping?.case === 'exact') {
    return {
      case: 'exact',
      mappings: (destination.mapping.value.mappings ?? []).map((mapping) => ({
        source: mapping.source,
        destination: mapping.destination,
      })),
    };
  }
  return;
}

/**
 * Map API-mode schema registry options to unified type.
 * The password itself is never mapped — only password_set/password_set_at.
 */
function mapSchemaRegistryApiOptions(api: SchemaRegistryApiOptionsMessage): UnifiedSchemaRegistryApiOptions {
  const basic = api.authOptions?.authOptions?.case === 'basic' ? api.authOptions.authOptions.value : undefined;

  return {
    sourceUrl: api.sourceUrl,
    basicAuth: basic
      ? {
          username: basic.username,
          passwordSet: basic.passwordSet,
          passwordSetAt: basic.passwordSetAt ? timestampDate(basic.passwordSetAt) : undefined,
        }
      : undefined,
    tlsSettings: mapTLSSettings(api.tlsSettings),
    tailIntervalSeconds: durationToSeconds(api.tailInterval),
    effectiveTailIntervalSeconds: durationToSeconds(api.effectiveTailInterval),
    fullSyncIntervalSeconds: durationToSeconds(api.fullSyncInterval),
    effectiveFullSyncIntervalSeconds: durationToSeconds(api.effectiveFullSyncInterval),
    maxSourceRequestsPerSecond: api.maxSourceRequestsPerSecond > 0 ? api.maxSourceRequestsPerSecond : undefined,
    effectiveMaxSourceRequestsPerSecond:
      api.effectiveMaxSourceRequestsPerSecond > 0 ? api.effectiveMaxSourceRequestsPerSecond : undefined,
    sourceFilter: api.sourceFilter
      ? { contexts: api.sourceFilter.contexts ?? [], subjects: api.sourceFilter.subjects ?? [] }
      : undefined,
    destinationMapping: mapDestinationMapping(api.destination),
    unsupportedSchemaFeaturePolicy: api.unsupportedSchemaFeaturePolicy,
    paused: api.paused,
  };
}

/**
 * Map schema registry sync options to unified type
 */
export function mapSchemaRegistrySyncOptions(
  options: SchemaRegistrySyncOptionsMessage | undefined
): UnifiedSchemaRegistrySyncOptions | undefined {
  if (!options) {
    return;
  }

  const mode = options.schemaRegistryShadowingMode;
  if (mode?.case === 'shadowSchemaRegistryTopic') {
    return { schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} } };
  }
  if (mode?.case === 'shadowSchemaRegistryApi') {
    return {
      schemaRegistryShadowingMode: {
        case: 'shadowSchemaRegistryApi',
        value: mapSchemaRegistryApiOptions(mode.value),
      },
    };
  }
  return { schemaRegistryShadowingMode: { case: undefined } };
}
