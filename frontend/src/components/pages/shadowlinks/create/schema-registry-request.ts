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

import { create } from '@bufbuild/protobuf';
import { type Duration, DurationSchema } from '@bufbuild/protobuf/wkt';
import {
  HTTPBasicAuthOptionsSchema,
  SchemaRegistryAuthOptionsSchema,
  SchemaRegistryContextDestinationSchema,
  SchemaRegistryContextMapSchema,
  SchemaRegistryExactContextMappingsSchema,
  SchemaRegistrySourceFilterSchema,
  type SchemaRegistrySyncOptions,
  type SchemaRegistrySyncOptions_ShadowSchemaRegistryApi,
  SchemaRegistrySyncOptions_ShadowSchemaRegistryApiSchema,
  SchemaRegistrySyncOptions_ShadowSchemaRegistryTopicSchema,
  SchemaRegistrySyncOptionsSchema,
  UnsupportedSchemaFeaturePolicy,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { TLSPEMSettingsSchema, type TLSSettings, TLSSettingsSchema } from 'protogen/redpanda/core/common/v1/tls_pb';

import {
  type FormValues,
  SCHEMA_REGISTRY_MODE,
  type SchemaRegistryFormValues,
  SR_AUTH_METHOD,
  srCertificatePem,
} from './model';

const DURATION_UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
const DURATION_INPUT_REGEX = /^(\d+)(ms|s|m|h)$/;

/**
 * Parse a user-entered duration string ("10s", "5m", "100ms", "1h") into a
 * google.protobuf.Duration. '' or an unparseable value returns undefined so
 * the field stays unset and the cluster default applies.
 */
export const durationFromString = (value: string): Duration | undefined => {
  const match = value.trim().match(DURATION_INPUT_REGEX);
  if (!match) {
    return;
  }

  const totalMs = Number(match[1]) * DURATION_UNIT_MS[match[2]];
  return create(DurationSchema, {
    seconds: BigInt(Math.floor(totalMs / 1000)),
    nanos: (totalMs % 1000) * 1_000_000,
  });
};

/**
 * The Schema Registry section stores PEM uploads only, so unlike the
 * connection step's buildTLSSettings there is no file-path variant. The raw
 * PEM private key goes into the request as-is.
 */
const buildSrTlsSettings = (sr: SchemaRegistryFormValues): TLSSettings => {
  const ca = srCertificatePem(sr.mtls.ca);
  const cert = srCertificatePem(sr.mtls.clientCert);
  const key = srCertificatePem(sr.mtls.clientKey);

  if (!(ca || cert || key)) {
    return create(TLSSettingsSchema, { enabled: true });
  }

  return create(TLSSettingsSchema, {
    enabled: true,
    tlsSettings: {
      case: 'tlsPemSettings',
      value: create(TLSPEMSettingsSchema, { ca, key, cert }),
    },
  });
};

const SR_UNSUPPORTED_FEATURE_POLICY: Record<
  SchemaRegistryFormValues['syncBehavior']['unsupportedSchemaFeatures'],
  UnsupportedSchemaFeaturePolicy
> = {
  fail: UnsupportedSchemaFeaturePolicy.FAIL,
  remove: UnsupportedSchemaFeaturePolicy.REMOVE,
};

export const buildShadowSchemaRegistryApiOptions = (
  sr: SchemaRegistryFormValues
): SchemaRegistrySyncOptions_ShadowSchemaRegistryApi => {
  const rate = sr.syncBehavior.maxSourceRequestRate.trim();

  return create(SchemaRegistrySyncOptions_ShadowSchemaRegistryApiSchema, {
    sourceUrl: sr.sourceUrl.trim(),
    authOptions:
      sr.authMethod === SR_AUTH_METHOD.BASIC
        ? create(SchemaRegistryAuthOptionsSchema, {
            authOptions: {
              case: 'basic',
              value: create(HTTPBasicAuthOptionsSchema, {
                username: sr.basicCredentials.username.trim(),
                password: sr.basicCredentials.password,
              }),
            },
          })
        : undefined,
    tlsSettings: sr.useTls ? buildSrTlsSettings(sr) : undefined,
    tailInterval: durationFromString(sr.syncBehavior.tailInterval),
    fullSyncInterval: durationFromString(sr.syncBehavior.fullSyncInterval),
    // 0 = unset; the cluster default applies.
    maxSourceRequestsPerSecond: rate ? Number(rate) : 0,
    sourceFilter:
      sr.scopeMode === 'specify'
        ? create(SchemaRegistrySourceFilterSchema, {
            contexts: sr.contexts.map((context) => context.trim()),
            subjects: sr.subjects.map((subject) => subject.trim()),
          })
        : undefined,
    // Unset destination = preserve source context names; an empty map is the
    // same as preserve.
    destination:
      sr.destinationContextsMode === 'map' && sr.contextMappings.length > 0
        ? create(SchemaRegistryContextDestinationSchema, {
            mapping: {
              case: 'exact',
              value: create(SchemaRegistryExactContextMappingsSchema, {
                mappings: sr.contextMappings.map((mapping) =>
                  create(SchemaRegistryContextMapSchema, {
                    source: mapping.source.trim(),
                    destination: mapping.destination.trim(),
                  })
                ),
              }),
            },
          })
        : undefined,
    unsupportedSchemaFeaturePolicy: SR_UNSUPPORTED_FEATURE_POLICY[sr.syncBehavior.unsupportedSchemaFeatures],
    paused: false,
  });
};

/**
 * Build schema registry sync options from form values. 'api' mode is only
 * reachable through the redesigned (version-gated) section, which keeps
 * enableSchemaRegistrySync mirrored (mode === 'topic') — so the legacy switch
 * path below produces the exact same request as before.
 */
export const buildSchemaRegistrySyncOptions = (values: FormValues): SchemaRegistrySyncOptions | undefined => {
  if (values.schemaRegistry.mode === SCHEMA_REGISTRY_MODE.API) {
    return create(SchemaRegistrySyncOptionsSchema, {
      schemaRegistryShadowingMode: {
        case: 'shadowSchemaRegistryApi',
        value: buildShadowSchemaRegistryApiOptions(values.schemaRegistry),
      },
    });
  }

  if (!values.enableSchemaRegistrySync) {
    return;
  }

  return create(SchemaRegistrySyncOptionsSchema, {
    schemaRegistryShadowingMode: {
      case: 'shadowSchemaRegistryTopic',
      value: create(SchemaRegistrySyncOptions_ShadowSchemaRegistryTopicSchema, {}),
    },
  });
};
