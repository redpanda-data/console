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

import { FilterType, PatternType, ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { z } from 'zod';

// TLS mode: either file paths or PEM content
export const TLS_MODE = {
  FILE_PATH: 'file_path',
  PEM: 'pem',
} as const;

export type TLSMode = (typeof TLS_MODE)[keyof typeof TLS_MODE];

// SASL authentication method
export const AUTH_METHOD = {
  NONE: 'none',
  SCRAM: 'scram',
  PLAIN: 'plain',
} as const;

export type AuthMethod = (typeof AUTH_METHOD)[keyof typeof AUTH_METHOD];

// Schema Registry shadowing modes; 'api' is only selectable through the
// redesigned (version-gated) Schema Registry section.
export const SCHEMA_REGISTRY_MODE = {
  TOPIC: 'topic',
  API: 'api',
  NONE: 'none',
} as const;

export type SchemaRegistryMode = (typeof SCHEMA_REGISTRY_MODE)[keyof typeof SCHEMA_REGISTRY_MODE];

// Authentication against the source Schema Registry (HTTP API)
export const SR_AUTH_METHOD = {
  NONE: 'none',
  BASIC: 'basic',
} as const;

export type SrAuthMethod = (typeof SR_AUTH_METHOD)[keyof typeof SR_AUTH_METHOD];

// PEM content stored with its file name so the dropzone can display it
const srCertificateSchema = z.object({
  pemContent: z.string(),
  fileName: z.string(),
});

export type SrCertificate = z.infer<typeof srCertificateSchema>;

// Single source of truth for "is a certificate present": the UI badges,
// validation, and request building must all agree that a whitespace-only
// upload counts as absent.
export const srCertificatePem = (cert: SrCertificate | undefined): string => cert?.pemContent.trim() ?? '';

export const hasSrCertificate = (cert: SrCertificate | undefined): boolean => srCertificatePem(cert).length > 0;

const schemaRegistrySchema = z.object({
  mode: z.enum([SCHEMA_REGISTRY_MODE.TOPIC, SCHEMA_REGISTRY_MODE.API, SCHEMA_REGISTRY_MODE.NONE]),
  sourceUrl: z.string(),
  authMethod: z.enum([SR_AUTH_METHOD.NONE, SR_AUTH_METHOD.BASIC]),
  basicCredentials: z.object({
    username: z.string(),
    password: z.string(),
  }),
  useTls: z.boolean(),
  // Unlike the connection step's mTLS block, certificates here are PEM uploads
  // only (no file-path mode) and the client key is a PEM upload too.
  mtls: z.object({
    ca: srCertificateSchema.optional(),
    clientCert: srCertificateSchema.optional(),
    clientKey: srCertificateSchema.optional(),
    // The API never returns the stored client key, only its fingerprint. On
    // edit these mark a key that exists server-side; sending an empty key in
    // the update keeps it.
    existingKeyConfigured: z.boolean(),
    existingKeyFingerprint: z.string(),
    // TLS configured as certificate file paths (e.g. via rpk). Console can't
    // edit these; they are round-tripped verbatim.
    filePaths: z
      .object({
        caPath: z.string(),
        keyPath: z.string(),
        certPath: z.string(),
      })
      .optional(),
    // TLSSettings.do_not_set_sni_hostname, round-tripped so rebuilding the
    // message doesn't silently reset it. No UI; only rpk/API-created links
    // set it.
    doNotSetSniHostname: z.boolean(),
  }),
  scopeMode: z.enum(['all', 'specify']),
  contexts: z.array(z.string()),
  subjects: z.array(z.string()),
  destinationContextsMode: z.enum(['preserve', 'map']),
  contextMappings: z.array(
    z.object({
      source: z.string(),
      destination: z.string(),
    })
  ),
  // Intervals and rate stay strings in form state ('' = unset, cluster
  // defaults apply); the request builder converts them.
  syncBehavior: z.object({
    tailInterval: z.string(),
    fullSyncInterval: z.string(),
    maxSourceRequestRate: z.string(),
    unsupportedSchemaFeatures: z.enum(['fail', 'remove']),
  }),
  // No UI: hydrated on edit and round-tripped so a message rebuild doesn't
  // silently unpause a paused sync. Create always sends false.
  paused: z.boolean(),
});

export type SchemaRegistryFormValues = z.infer<typeof schemaRegistrySchema>;

// The key side of the mTLS pair is satisfied by a fresh upload or by a key
// already stored server-side (edit flow).
export const hasSrClientKeyMaterial = (mtls: SchemaRegistryFormValues['mtls']): boolean =>
  hasSrCertificate(mtls.clientKey) || mtls.existingKeyConfigured;

// Form schema with validation
const formSchemaShape = z.object({
  // Basic info
  name: z.string().min(1, 'Shadow link name is required'),

  // Source cluster connection
  bootstrapServers: z
    .array(
      z.object({
        value: z
          .string()
          .trim()
          .min(1, 'at least one server url is required')
          .regex(/^[a-zA-Z0-9.-]+:\d+$/, 'Must be in format host:port (e.g., localhost:9092)'),
      })
    )
    .min(1, 'At least one bootstrap server is required'),

  // SASL authentication
  authMethod: z.enum([AUTH_METHOD.NONE, AUTH_METHOD.SCRAM, AUTH_METHOD.PLAIN]),
  scramCredentials: z
    .object({
      username: z.string(),
      password: z.string(),
      mechanism: z.enum(ScramMechanism),
    })
    .optional(),
  plainCredentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  advanceClientOptions: z.object({
    metadataMaxAgeMs: z.number(),
    connectionTimeoutMs: z.number(),
    retryBackoffMs: z.number(),
    fetchWaitMaxMs: z.number(),
    fetchMinBytes: z.number(),
    fetchMaxBytes: z.number(),
    fetchPartitionMaxBytes: z.number(),
  }),
  // TLS configuration
  useTls: z.boolean(),

  // mTLS configuration (optional - determined by presence of certificates)
  mtlsMode: z.enum([TLS_MODE.FILE_PATH, TLS_MODE.PEM]),
  mtls: z.object({
    ca: z
      .object({
        filePath: z.string().optional(),
        pemContent: z.string().optional(),
        fileName: z.string().optional(),
      })
      .optional(),
    clientCert: z
      .object({
        filePath: z.string().optional(),
        pemContent: z.string().optional(),
        fileName: z.string().optional(),
      })
      .optional(),
    clientKey: z
      .object({
        filePath: z.string().optional(),
        pemContent: z.string().optional(),
        fileName: z.string().optional(),
      })
      .optional(),
  }),

  // Topic selection
  topicsMode: z.enum(['all', 'specify']),
  topics: z.array(
    z.object({
      patternType: z.enum(PatternType),
      filterType: z.enum(FilterType),
      name: z.string().trim().min(1, 'name is required'),
    })
  ),
  // Topic properties
  topicProperties: z.array(z.string()).optional(),
  excludeDefault: z.boolean(),

  // Consumer offset sync
  enableConsumerOffsetSync: z.boolean(),
  consumersMode: z.enum(['all', 'specify']),
  consumers: z.array(
    z.object({
      patternType: z.enum(PatternType),
      filterType: z.enum(FilterType),
      name: z.string().trim().min(1, 'name is required'),
    })
  ),

  // ACL filters
  aclsMode: z.enum(['all', 'specify']),
  aclFilters: z
    .array(
      z.object({
        // Resource filter
        resourceType: z.enum(ACLResource).optional(),
        resourcePattern: z.enum(ACLPattern).optional(),
        resourceName: z.string().optional(),

        // Access filter
        principal: z.string().optional(),
        operation: z.enum(ACLOperation).optional(),
        permissionType: z.enum(ACLPermissionType).optional(),
        host: z.string().optional(),
      })
    )
    .optional(),

  // Schema Registry sync (legacy switch; mirrored to schemaRegistry.mode by
  // the redesigned section so the topic-mode request path stays unchanged)
  enableSchemaRegistrySync: z.boolean(),

  // Redesigned Schema Registry section (version-gated on the connected
  // cluster's shadowLinkSchemaRegistrySync feature)
  schemaRegistry: schemaRegistrySchema,
});

export const FormSchema = formSchemaShape.superRefine((data, ctx) => {
  refineAuthCredentials(data, ctx);
  refineMtlsConsistency(data, ctx);
  refineShadowSchemaRegistry(data.schemaRegistry, ctx);
});

/**
 * Edit-page variant used while the Schema Registry feature gate is closed:
 * the redesigned SR section isn't rendered there, so an api-mode link's
 * hydrated slice (e.g. its never-returned basic-auth password) must not block
 * saving the rest of the form. The SR slice itself stays untouched in that
 * state, so the update builder emits no SR mask for it.
 */
export const FormSchemaWithoutSchemaRegistryRules = formSchemaShape.superRefine((data, ctx) => {
  refineAuthCredentials(data, ctx);
  refineMtlsConsistency(data, ctx);
});

const refineAuthCredentials = (
  data: {
    authMethod: AuthMethod;
    scramCredentials?: { username: string; password: string };
    plainCredentials?: { username: string; password: string };
  },
  ctx: z.RefinementCtx
) => {
  if (data.authMethod === AUTH_METHOD.SCRAM) {
    if (!data.scramCredentials?.username?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Username is required when SCRAM is enabled',
        path: ['scramCredentials', 'username'],
      });
    }
    if (!data.scramCredentials?.password) {
      ctx.addIssue({
        code: 'custom',
        message: 'Password is required when SCRAM is enabled',
        path: ['scramCredentials', 'password'],
      });
    }
    return;
  }
  if (data.authMethod === AUTH_METHOD.PLAIN) {
    if (!data.plainCredentials?.username?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Username is required when PLAIN is enabled',
        path: ['plainCredentials', 'username'],
      });
    }
    if (!data.plainCredentials?.password) {
      ctx.addIssue({
        code: 'custom',
        message: 'Password is required when PLAIN is enabled',
        path: ['plainCredentials', 'password'],
      });
    }
  }
};

const refineMtlsConsistency = (
  data: {
    mtlsMode: TLSMode;
    mtls: {
      clientKey?: { filePath?: string; pemContent?: string };
      clientCert?: { filePath?: string; pemContent?: string };
    };
  },
  ctx: z.RefinementCtx
) => {
  const hasClientKey =
    data.mtlsMode === TLS_MODE.FILE_PATH
      ? Boolean(data.mtls.clientKey?.filePath?.trim())
      : Boolean(data.mtls.clientKey?.pemContent?.trim());

  const hasClientCert =
    data.mtlsMode === TLS_MODE.FILE_PATH
      ? Boolean(data.mtls.clientCert?.filePath?.trim())
      : Boolean(data.mtls.clientCert?.pemContent?.trim());

  if (hasClientKey && !hasClientCert) {
    ctx.addIssue({
      code: 'custom',
      message: 'Client certificate is required when client private key is provided',
      path: ['mtls', 'clientCert'],
    });
  }

  if (hasClientCert && !hasClientKey) {
    ctx.addIssue({
      code: 'custom',
      message: 'Client private key is required when client certificate is provided',
      path: ['mtls', 'clientKey'],
    });
  }
};

const SR_DURATION_REGEX = /^(\d+)(ns|us|ms|s|m|h)$/;
const SR_DURATION_UNIT_SECONDS: Record<string, number> = {
  ns: 0.000_000_001,
  us: 0.000_001,
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
};
const SR_POSITIVE_INT_REGEX = /^[1-9]\d*$/;
// google.protobuf.Duration and int32 upper bounds: past these the request
// fails at serialization.
const SR_DURATION_MAX_SECONDS = 315_576_000_000;
const SR_MAX_REQUEST_RATE = 2_147_483_647;
const SR_CONTEXT_MESSAGE = 'Context must start with a dot, e.g. . or .prod';

// Schema Registry contexts are dot-prefixed (the default context is `.`).
const isValidSchemaRegistryContext = (value: string): boolean => value.trim().startsWith('.');

const addSrContextIssue = (value: string, path: (string | number)[], ctx: z.RefinementCtx) => {
  if (!isValidSchemaRegistryContext(value)) {
    ctx.addIssue({ code: 'custom', message: SR_CONTEXT_MESSAGE, path });
  }
};

const urlProtocol = (value: string): string | null => {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
};

const addSrDurationIssues = (value: string, path: (string | number)[], ctx: z.RefinementCtx) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const match = trimmed.match(SR_DURATION_REGEX);
  if (!match) {
    ctx.addIssue({ code: 'custom', message: 'Use a number with a unit, e.g. 10s or 5m', path });
    return;
  }

  if (Number(match[1]) * SR_DURATION_UNIT_SECONDS[match[2]] > SR_DURATION_MAX_SECONDS) {
    ctx.addIssue({ code: 'custom', message: 'Interval is too large', path });
  }
};

const addSrSourceUrlIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  const trimmed = sr.sourceUrl.trim();
  if (!trimmed) {
    ctx.addIssue({
      code: 'custom',
      message: 'Source URL is required',
      path: ['schemaRegistry', 'sourceUrl'],
    });
    return;
  }

  const protocol = urlProtocol(trimmed);
  if (protocol !== 'http:' && protocol !== 'https:') {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be a valid URL, e.g. https://schema-registry.example.com:8081',
      path: ['schemaRegistry', 'sourceUrl'],
    });
    return;
  }

  // The TLS toggle and the URL scheme must agree, otherwise the request
  // connects over the wrong transport with no feedback: an http:// endpoint
  // can't be reached over TLS, and an https:// endpoint won't be reached
  // without it.
  if (sr.useTls && protocol === 'http:') {
    ctx.addIssue({
      code: 'custom',
      message: 'Use an https:// URL when TLS is enabled, or turn off Enable TLS',
      path: ['schemaRegistry', 'sourceUrl'],
    });
  }
  if (!sr.useTls && protocol === 'https:') {
    ctx.addIssue({
      code: 'custom',
      message: 'Enable TLS to use an https:// URL, or use an http:// URL',
      path: ['schemaRegistry', 'sourceUrl'],
    });
  }
};

const addSrBasicAuthIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (sr.authMethod !== SR_AUTH_METHOD.BASIC) {
    return;
  }

  if (!sr.basicCredentials.username.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Username is required when HTTP Basic is enabled',
      path: ['schemaRegistry', 'basicCredentials', 'username'],
    });
  }

  if (!sr.basicCredentials.password) {
    ctx.addIssue({
      code: 'custom',
      message: 'Password is required when HTTP Basic is enabled',
      path: ['schemaRegistry', 'basicCredentials', 'password'],
    });
  }
};

// Client key and cert are individually optional, but if one is provided both
// must be. Skipped when TLS is off: the mTLS UI is hidden and the request
// builder omits TLS settings, so leftover uploads must not block the wizard
// invisibly. Also skipped for file-path TLS (rpk-created links): those
// settings are read-only and round-tripped verbatim.
const addSrMtlsPairIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (!sr.useTls || sr.mtls.filePaths) {
    return;
  }

  const hasClientKey = hasSrClientKeyMaterial(sr.mtls);
  const hasClientCert = hasSrCertificate(sr.mtls.clientCert);

  if (hasClientKey && !hasClientCert) {
    ctx.addIssue({
      code: 'custom',
      message: 'Client certificate is required when client private key is provided',
      path: ['schemaRegistry', 'mtls', 'clientCert'],
    });
  }

  if (hasClientCert && !hasClientKey) {
    ctx.addIssue({
      code: 'custom',
      message: 'Client private key is required when client certificate is provided',
      path: ['schemaRegistry', 'mtls', 'clientKey'],
    });
  }

  // A cert uploaded this session (hydrated certs carry no fileName) cannot
  // pair with the key stored server-side. Require the matching key upload.
  const certReplaced = hasClientCert && Boolean(sr.mtls.clientCert?.fileName);
  if (certReplaced && sr.mtls.existingKeyConfigured && !hasSrCertificate(sr.mtls.clientKey)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Upload the matching private key when replacing the client certificate',
      path: ['schemaRegistry', 'mtls', 'clientKey'],
    });
  }
};

const addSrScopeIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (sr.scopeMode !== 'specify') {
    return;
  }

  if (sr.contexts.length === 0 && sr.subjects.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Add at least one context or subject',
      path: ['schemaRegistry', 'contexts'],
    });
  }
  for (const context of sr.contexts) {
    addSrContextIssue(context, ['schemaRegistry', 'contexts'], ctx);
  }
};

// A row's context is required; when present it must be dot-prefixed like any
// other context input.
const addSrMappingField = (value: string, path: (string | number)[], requiredMessage: string, ctx: z.RefinementCtx) => {
  if (value.trim()) {
    addSrContextIssue(value, path, ctx);
  } else {
    ctx.addIssue({ code: 'custom', message: requiredMessage, path });
  }
};

const addSrMappingRowIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  sr.contextMappings.forEach((mapping, index) => {
    addSrMappingField(
      mapping.source,
      ['schemaRegistry', 'contextMappings', index, 'source'],
      'Source context is required',
      ctx
    );
    addSrMappingField(
      mapping.destination,
      ['schemaRegistry', 'contextMappings', index, 'destination'],
      'Destination context is required',
      ctx
    );
  });
};

// The proto requires each source context to map exactly once, to a distinct
// destination.
const addSrMappingUniquenessIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  const seenSources = new Set<string>();
  const seenDestinations = new Set<string>();

  sr.contextMappings.forEach((mapping, index) => {
    const source = mapping.source.trim();
    if (source && seenSources.has(source)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Each source context can be mapped only once',
        path: ['schemaRegistry', 'contextMappings', index, 'source'],
      });
    }
    seenSources.add(source);

    const destination = mapping.destination.trim();
    if (destination && seenDestinations.has(destination)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Destination contexts must be distinct',
        path: ['schemaRegistry', 'contextMappings', index, 'destination'],
      });
    }
    seenDestinations.add(destination);
  });
};

// The proto requires every source context in the effective scope to have
// exactly one mapping. Only 'specify' scope enumerates its contexts, so 'all'
// scope is left to the backend to enforce. Contexts implied by qualified
// subjects aren't expanded here, so the backend still has the final say.
const addSrMappingCompletenessIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (sr.scopeMode !== 'specify') {
    return;
  }

  const mappedSources = new Set(sr.contextMappings.map((mapping) => mapping.source.trim()).filter(Boolean));
  const missing = sr.contexts
    .map((context) => context.trim())
    .filter((context) => context && !mappedSources.has(context));

  if (missing.length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: `Add a destination mapping for every context in scope. Missing: ${missing.join(', ')}`,
      path: ['schemaRegistry', 'contexts'],
    });
  }
};

const addSrMappingIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (sr.destinationContextsMode !== 'map') {
    return;
  }

  addSrMappingRowIssues(sr, ctx);
  addSrMappingUniquenessIssues(sr, ctx);
  addSrMappingCompletenessIssues(sr, ctx);
};

// Sync-behavior fields are optional ('' = cluster default), so each is only
// validated when non-empty.
const addSrSyncBehaviorIssues = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  addSrDurationIssues(sr.syncBehavior.tailInterval, ['schemaRegistry', 'syncBehavior', 'tailInterval'], ctx);
  addSrDurationIssues(sr.syncBehavior.fullSyncInterval, ['schemaRegistry', 'syncBehavior', 'fullSyncInterval'], ctx);

  const rate = sr.syncBehavior.maxSourceRequestRate.trim();
  if (!rate) {
    return;
  }

  if (!SR_POSITIVE_INT_REGEX.test(rate)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be a positive whole number',
      path: ['schemaRegistry', 'syncBehavior', 'maxSourceRequestRate'],
    });
  } else if (Number(rate) > SR_MAX_REQUEST_RATE) {
    ctx.addIssue({
      code: 'custom',
      message: `Must be ${SR_MAX_REQUEST_RATE} or less`,
      path: ['schemaRegistry', 'syncBehavior', 'maxSourceRequestRate'],
    });
  }
};

// Only the redesigned (version-gated) UI can select 'api'; 'topic' and 'none'
// need no extra fields, so the legacy UI path is never blocked here.
const refineShadowSchemaRegistry = (sr: SchemaRegistryFormValues, ctx: z.RefinementCtx) => {
  if (sr.mode !== SCHEMA_REGISTRY_MODE.API) {
    return;
  }

  addSrSourceUrlIssues(sr, ctx);
  addSrBasicAuthIssues(sr, ctx);
  addSrMtlsPairIssues(sr, ctx);
  addSrScopeIssues(sr, ctx);
  addSrMappingIssues(sr, ctx);
  addSrSyncBehaviorIssues(sr, ctx);
};

export type FormValues = z.infer<typeof FormSchema>;

export const initialValues: FormValues = {
  name: '',
  bootstrapServers: [{ value: '' }],
  advanceClientOptions: {
    metadataMaxAgeMs: 10_000, // 10 sec
    connectionTimeoutMs: 1000, // 1 sec
    retryBackoffMs: 100, // 100 ms
    fetchWaitMaxMs: 500, // 500 ms
    fetchMinBytes: 5_242_880, // 5MiB
    fetchMaxBytes: 20_971_520, // 20MiB
    fetchPartitionMaxBytes: 1_048_576, // 1MiB
  },
  authMethod: AUTH_METHOD.SCRAM,
  scramCredentials: {
    username: '',
    password: '',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  plainCredentials: {
    username: '',
    password: '',
  },
  useTls: true,
  mtlsMode: TLS_MODE.PEM,
  mtls: {
    ca: undefined,
    clientCert: undefined,
    clientKey: undefined,
  },
  topicsMode: 'all',
  topics: [],
  topicProperties: [],
  excludeDefault: false,
  enableConsumerOffsetSync: false,
  consumersMode: 'all',
  consumers: [],
  aclsMode: 'all',
  aclFilters: [], // No default filter - user adds as needed
  enableSchemaRegistrySync: false,
  schemaRegistry: {
    mode: SCHEMA_REGISTRY_MODE.NONE,
    sourceUrl: '',
    authMethod: SR_AUTH_METHOD.NONE,
    basicCredentials: {
      username: '',
      password: '',
    },
    useTls: true,
    mtls: {
      ca: undefined,
      clientCert: undefined,
      clientKey: undefined,
      existingKeyConfigured: false,
      existingKeyFingerprint: '',
      filePaths: undefined,
      doNotSetSniHostname: false,
    },
    scopeMode: 'all',
    contexts: [],
    subjects: [],
    destinationContextsMode: 'preserve',
    contextMappings: [],
    syncBehavior: {
      tailInterval: '',
      fullSyncInterval: '',
      maxSourceRequestRate: '',
      unsupportedSchemaFeatures: 'fail',
    },
    paused: false,
  },
};
