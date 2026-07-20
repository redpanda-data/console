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
import {
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
  type TLSSettings,
  TLSSettingsSchema,
} from 'protogen/redpanda/core/common/v1/tls_pb';

import {
  type FormValues,
  SCHEMA_REGISTRY_MODE,
  type SchemaRegistryFormValues,
  SR_AUTH_METHOD,
  type SrCertificate,
  srCertificatePem,
} from './model';

// Sub-second units carry (units per second, nanos per unit) so seconds/nanos
// are computed with exact integer math — a single total-nanos float would lose
// precision past 2^53 ns (~104 days). Sub-millisecond units exist because rpk
// accepts any Go duration and those values must round-trip unchanged.
const DURATION_SUBSECOND_UNITS: Record<string, { perSecond: number; nsPerUnit: number }> = {
  ns: { perSecond: 1_000_000_000, nsPerUnit: 1 },
  us: { perSecond: 1_000_000, nsPerUnit: 1000 },
  ms: { perSecond: 1000, nsPerUnit: 1_000_000 },
};
const DURATION_SECOND_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600 };
const DURATION_INPUT_REGEX = /^(\d+)(ns|us|ms|s|m|h)$/;

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

  const count = Number(match[1]);
  const subSecond = DURATION_SUBSECOND_UNITS[match[2]];
  if (subSecond) {
    return create(DurationSchema, {
      seconds: BigInt(Math.floor(count / subSecond.perSecond)),
      nanos: (count % subSecond.perSecond) * subSecond.nsPerUnit,
    });
  }
  return create(DurationSchema, { seconds: BigInt(count) * BigInt(DURATION_SECOND_UNITS[match[2]]), nanos: 0 });
};

// Hydrated PEMs carry no file name (the dropzone sets one on upload), so this
// distinguishes server-stored material from fresh uploads.
const hydratedSrPem = (cert: SrCertificate | undefined): string =>
  cert?.fileName === '' ? srCertificatePem(cert) : '';

/**
 * TLS off normally omits the message entirely (the create contract). But an
 * edit can hydrate TLS material the server stored with `enabled: false`
 * (rpk/Admin API links); the field mask replaces the whole parent message, so
 * that material must be round-tripped or any Schema Registry edit would
 * silently delete it. Only hydrated material is preserved — file paths and
 * PEMs without a file name; fresh uploads keep today's drop-on-disable
 * behavior.
 */
const buildDisabledSrTlsSettings = (sr: SchemaRegistryFormValues): TLSSettings | undefined => {
  if (sr.mtls.filePaths) {
    return create(TLSSettingsSchema, {
      doNotSetSniHostname: sr.mtls.doNotSetSniHostname,
      enabled: false,
      tlsSettings: {
        case: 'tlsFileSettings',
        value: create(TLSFileSettingsSchema, sr.mtls.filePaths),
      },
    });
  }

  const ca = hydratedSrPem(sr.mtls.ca);
  const cert = hydratedSrPem(sr.mtls.clientCert);
  const key = hydratedSrPem(sr.mtls.clientKey);

  if (!(ca || cert || key)) {
    return;
  }

  return create(TLSSettingsSchema, {
    doNotSetSniHostname: sr.mtls.doNotSetSniHostname,
    enabled: false,
    tlsSettings: {
      case: 'tlsPemSettings',
      value: create(TLSPEMSettingsSchema, { ca, key, cert }),
    },
  });
};

/**
 * The Schema Registry section stores PEM uploads only, so unlike the
 * connection step's buildTLSSettings there is no file-path variant in the UI.
 * The raw PEM private key goes into the request as-is; an empty key with a
 * cert present means "keep the key stored server-side" (edit flow). File-path
 * settings hydrated from an rpk-created link are round-tripped verbatim.
 */
const buildSrTlsSettings = (sr: SchemaRegistryFormValues): TLSSettings | undefined => {
  if (!sr.useTls) {
    return buildDisabledSrTlsSettings(sr);
  }

  if (sr.mtls.filePaths) {
    return create(TLSSettingsSchema, {
      doNotSetSniHostname: sr.mtls.doNotSetSniHostname,
      enabled: true,
      tlsSettings: {
        case: 'tlsFileSettings',
        value: create(TLSFileSettingsSchema, sr.mtls.filePaths),
      },
    });
  }

  const ca = srCertificatePem(sr.mtls.ca);
  const cert = srCertificatePem(sr.mtls.clientCert);
  const key = srCertificatePem(sr.mtls.clientKey);

  if (!(ca || cert || key)) {
    return create(TLSSettingsSchema, { doNotSetSniHostname: sr.mtls.doNotSetSniHostname, enabled: true });
  }

  return create(TLSSettingsSchema, {
    doNotSetSniHostname: sr.mtls.doNotSetSniHostname,
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
    tlsSettings: buildSrTlsSettings(sr),
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
    // Hydrated on edit so rebuilding the message doesn't unpause a paused
    // sync; create always carries the initialValues false.
    paused: sr.paused,
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
