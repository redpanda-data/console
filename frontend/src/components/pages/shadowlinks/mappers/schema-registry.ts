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
import {
  type SchemaRegistryAuthOptions,
  type SchemaRegistryContextDestination,
  type SchemaRegistrySourceFilter,
  UnsupportedSchemaFeaturePolicy,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { TLSSettings } from 'protogen/redpanda/core/common/v1/tls_pb';

import {
  type FormValues,
  initialValues,
  SCHEMA_REGISTRY_MODE,
  type SchemaRegistryFormValues,
  SR_AUTH_METHOD,
} from '../create/model';
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
 * Format a proto Duration as the largest single-unit string the sync-behavior
 * inputs accept ("90s", "5m") so it round-trips through durationFromString.
 * Zero or unset durations map to '' so the cluster default applies.
 *
 * Deliberately hand-rolled: protobuf-es durationMs rounds sub-millisecond
 * nanos away (rpk accepts any Go duration, so those values exist and must
 * round-trip exactly), pretty-ms emits either multi-unit strings the input
 * grammar rejects ("1m 30s") or lossy compact ones (90s -> "1m"), and
 * date-fns formatDuration produces prose ("5 minutes").
 */
export function formatDurationForInput(duration: Duration | undefined): string {
  if (!duration) {
    return '';
  }
  const seconds = Number(duration.seconds);
  if (seconds < 0 || duration.nanos < 0 || (seconds === 0 && duration.nanos === 0)) {
    return '';
  }

  if (duration.nanos !== 0) {
    // Sub-second precision present, so the largest exact unit is at most ms.
    const totalNs = seconds * 1_000_000_000 + duration.nanos;
    if (totalNs % 1000 !== 0) {
      return `${totalNs}ns`;
    }
    const totalUs = totalNs / 1000;
    if (totalUs % 1000 !== 0) {
      return `${totalUs}us`;
    }
    return `${totalUs / 1000}ms`;
  }

  if (seconds % 60 !== 0) {
    return `${seconds}s`;
  }
  const minutes = seconds / 60;
  if (minutes % 60 !== 0) {
    return `${minutes}m`;
  }
  return `${minutes / 60}h`;
}

function mapTlsToMtlsSlice(tls: TLSSettings | undefined): SchemaRegistryFormValues['mtls'] {
  const base = structuredClone(initialValues.schemaRegistry.mtls);
  // Round-tripped so rebuilding the whole message doesn't reset the flag.
  base.doNotSetSniHostname = Boolean(tls?.doNotSetSniHostname);
  const settings = tls?.tlsSettings;

  if (settings?.case === 'tlsFileSettings') {
    const files = settings.value;
    return {
      ...base,
      filePaths: { caPath: files.caPath, keyPath: files.keyPath, certPath: files.certPath },
    };
  }
  if (settings?.case === 'tlsPemSettings') {
    const pem = settings.value;
    return {
      ...base,
      ca: pem.ca ? { pemContent: pem.ca, fileName: '' } : undefined,
      clientCert: pem.cert ? { pemContent: pem.cert, fileName: '' } : undefined,
      clientKey: pem.key ? { pemContent: pem.key, fileName: '' } : undefined,
      // The key is redacted on GET; a fingerprint marks a key kept
      // server-side. A returned cert implies the same (the proto requires
      // key and cert to be provided together), covering backends that omit
      // the fingerprint.
      existingKeyConfigured: !pem.key && Boolean(pem.keyFingerprint || pem.cert),
      existingKeyFingerprint: pem.keyFingerprint ?? '',
    };
  }
  return base;
}

function applyApiOptionsToFormSlice(api: SchemaRegistryApiOptionsMessage): SchemaRegistryFormValues {
  const basic = api.authOptions?.authOptions?.case === 'basic' ? api.authOptions.authOptions.value : undefined;
  const filter = api.sourceFilter;
  const hasFilter = Boolean(filter && ((filter.contexts?.length ?? 0) > 0 || (filter.subjects?.length ?? 0) > 0));
  const exactMappings =
    api.destination?.mapping?.case === 'exact' ? (api.destination.mapping.value.mappings ?? []) : [];

  // Every field is set explicitly (no base spread) so adding a schema field
  // without deciding its hydration fails to compile.
  return {
    mode: SCHEMA_REGISTRY_MODE.API,
    sourceUrl: api.sourceUrl,
    authMethod: basic ? SR_AUTH_METHOD.BASIC : SR_AUTH_METHOD.NONE,
    // The password is never returned; like the connection credentials it is
    // re-entered on save.
    basicCredentials: { username: basic?.username ?? '', password: '' },
    // TLS settings may be omitted entirely (e.g. rpk-created links); infer
    // the toggle from the URL scheme so the hydrated form passes the URL/TLS
    // cross-check untouched.
    useTls: api.tlsSettings ? api.tlsSettings.enabled : api.sourceUrl.trim().toLowerCase().startsWith('https:'),
    mtls: mapTlsToMtlsSlice(api.tlsSettings),
    scopeMode: hasFilter ? 'specify' : 'all',
    contexts: hasFilter ? [...(filter?.contexts ?? [])] : [],
    subjects: hasFilter ? [...(filter?.subjects ?? [])] : [],
    destinationContextsMode: exactMappings.length > 0 ? 'map' : 'preserve',
    contextMappings: exactMappings.map((mapping) => ({ source: mapping.source, destination: mapping.destination })),
    syncBehavior: {
      tailInterval: formatDurationForInput(api.tailInterval),
      fullSyncInterval: formatDurationForInput(api.fullSyncInterval),
      maxSourceRequestRate: api.maxSourceRequestsPerSecond > 0 ? String(api.maxSourceRequestsPerSecond) : '',
      unsupportedSchemaFeatures:
        api.unsupportedSchemaFeaturePolicy === UnsupportedSchemaFeaturePolicy.REMOVE ? 'remove' : 'fail',
    },
    paused: api.paused,
  };
}

/**
 * Hydrate the schemaRegistry form slice from the server message, for the edit
 * flow. Secrets are never seeded into form state: the password stays '' and a
 * stored client key is represented only by existingKeyConfigured /
 * existingKeyFingerprint (sending them empty on update keeps the stored
 * values).
 */
export function mapSchemaRegistrySyncOptionsToFormValues(
  options: SchemaRegistrySyncOptionsMessage | undefined
): Pick<FormValues, 'enableSchemaRegistrySync' | 'schemaRegistry'> {
  const mode = options?.schemaRegistryShadowingMode;

  if (mode?.case === 'shadowSchemaRegistryTopic') {
    const schemaRegistry = structuredClone(initialValues.schemaRegistry);
    schemaRegistry.mode = SCHEMA_REGISTRY_MODE.TOPIC;
    return { enableSchemaRegistrySync: true, schemaRegistry };
  }
  if (mode?.case === 'shadowSchemaRegistryApi') {
    return { enableSchemaRegistrySync: false, schemaRegistry: applyApiOptionsToFormSlice(mode.value) };
  }
  return { enableSchemaRegistrySync: false, schemaRegistry: structuredClone(initialValues.schemaRegistry) };
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
