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

import {
  type ShadowLink as ControlplaneShadowLink,
  ShadowLinkUpdateSchema as CpShadowLinkUpdateSchema,
  UpdateShadowLinkRequestSchema as CpUpdateShadowLinkRequestSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { create, equals } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import type { ShadowLink } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  ConsumerOffsetSyncOptionsSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  PlainConfigSchema,
  RoleSyncOptionsSchema,
  type SchemaRegistrySyncOptions,
  SchemaRegistrySyncOptionsSchema,
  ScramConfigSchema,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkClientOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkSchema,
  TopicMetadataSyncOptionsSchema,
  UpdateShadowLinkRequestSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import {
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
  TLSSettingsSchema,
} from 'protogen/redpanda/core/common/v1/tls_pb';

import type { FormValues } from '../create/model';
import { AUTH_METHOD, TLS_MODE } from '../create/model';
import { buildSchemaRegistrySyncOptions } from '../create/schema-registry-request';
import { buildDefaultFormValuesFromControlplane } from '../mappers/controlplane';
import { buildDefaultFormValues } from '../mappers/dataplane';

/**
 * Regex to strip "configurations." prefix from field mask paths
 * Used when converting dataplane field masks to controlplane format
 */
const CONFIGURATIONS_PREFIX_REGEX = /^configurations\./;

/**
 * Wildcard filter meaning "sync everything" for the 'all' mode of a category.
 * Must stay in sync with isAllNameFilter in the mappers, which round-trips
 * this exact shape back to 'all' mode when hydrating the edit form.
 */
export const allNameFilter = [
  create(NameFilterSchema, {
    patternType: PatternType.LITERAL,
    filterType: FilterType.INCLUDE,
    name: '*',
  }),
];

/**
 * Type for category update functions
 * Each category function returns the schema value and field mask paths
 */
export type UpdateResult<T> = {
  value: T;
  fieldMaskPaths: string[];
};

/**
 * Helper to compare arrays of strings (order-independent)
 */
export const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  // Sort both arrays and compare element by element
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((val, idx) => val === sortedB[idx]);
};

/**
 * Build TLS settings based on mTLS configuration
 * mTLS is determined by presence of certificates
 */
export const buildTLSSettings = (
  values: FormValues
):
  | { case: 'tlsFileSettings'; value: ReturnType<typeof create<typeof TLSFileSettingsSchema>> }
  | { case: 'tlsPemSettings'; value: ReturnType<typeof create<typeof TLSPEMSettingsSchema>> }
  | undefined => {
  // Check if any certificates are provided
  const hasCertificates =
    values.mtlsMode === TLS_MODE.FILE_PATH
      ? Boolean(values.mtls.ca?.filePath || values.mtls.clientCert?.filePath || values.mtls.clientKey?.filePath)
      : Boolean(values.mtls.ca?.pemContent || values.mtls.clientCert?.pemContent || values.mtls.clientKey?.pemContent);

  if (!hasCertificates) {
    return;
  }

  if (values.mtlsMode === TLS_MODE.FILE_PATH) {
    return {
      case: 'tlsFileSettings' as const,
      value: create(TLSFileSettingsSchema, {
        caPath: values.mtls.ca?.filePath || undefined,
        keyPath: values.mtls.clientKey?.filePath || undefined,
        certPath: values.mtls.clientCert?.filePath || undefined,
      }),
    };
  }

  return {
    case: 'tlsPemSettings' as const,
    value: create(TLSPEMSettingsSchema, {
      ca: values.mtls.ca?.pemContent || undefined,
      key: values.mtls.clientKey?.pemContent || undefined,
      cert: values.mtls.clientCert?.pemContent || undefined,
    }),
  };
};

export const hasAuthChanged = (values: FormValues, originalValues: FormValues): boolean => {
  if (values.authMethod !== originalValues.authMethod) {
    return true;
  }
  if (values.authMethod === AUTH_METHOD.SCRAM) {
    return (
      values.scramCredentials?.username !== originalValues.scramCredentials?.username ||
      values.scramCredentials?.password !== originalValues.scramCredentials?.password ||
      values.scramCredentials?.mechanism !== originalValues.scramCredentials?.mechanism
    );
  }
  if (values.authMethod === AUTH_METHOD.PLAIN) {
    return (
      values.plainCredentials?.username !== originalValues.plainCredentials?.username ||
      values.plainCredentials?.password !== originalValues.plainCredentials?.password
    );
  }
  return false;
};

export const buildAuthenticationConfiguration = (values: FormValues) => {
  if (values.authMethod === AUTH_METHOD.SCRAM) {
    return create(AuthenticationConfigurationSchema, {
      authentication: {
        case: 'scramConfiguration',
        value: create(ScramConfigSchema, {
          username: values.scramCredentials?.username,
          password: values.scramCredentials?.password,
          scramMechanism: values.scramCredentials?.mechanism,
        }),
      },
    });
  }
  if (values.authMethod === AUTH_METHOD.PLAIN) {
    return create(AuthenticationConfigurationSchema, {
      authentication: {
        case: 'plainConfiguration',
        value: create(PlainConfigSchema, {
          username: values.plainCredentials?.username,
          password: values.plainCredentials?.password,
        }),
      },
    });
  }
};

/**
 * Build the client options message from form values
 */
export const buildClientOptions = (values: FormValues) =>
  create(ShadowLinkClientOptionsSchema, {
    bootstrapServers: values.bootstrapServers.map((s) => s.value),
    tlsSettings: values.useTls
      ? create(TLSSettingsSchema, {
          enabled: true,
          tlsSettings: buildTLSSettings(values),
        })
      : undefined,
    authenticationConfiguration: buildAuthenticationConfiguration(values),
    metadataMaxAgeMs: values.advanceClientOptions.metadataMaxAgeMs,
    connectionTimeoutMs: values.advanceClientOptions.connectionTimeoutMs,
    retryBackoffMs: values.advanceClientOptions.retryBackoffMs,
    fetchWaitMaxMs: values.advanceClientOptions.fetchWaitMaxMs,
    fetchMinBytes: values.advanceClientOptions.fetchMinBytes,
    fetchMaxBytes: values.advanceClientOptions.fetchMaxBytes,
    fetchPartitionMaxBytes: values.advanceClientOptions.fetchPartitionMaxBytes,
  });

// Compare TLS settings - include if TLS changed or certificates changed
const hasTlsChanged = (values: FormValues, originalValues: FormValues): boolean => {
  const hasCertificates =
    values.mtlsMode === TLS_MODE.FILE_PATH
      ? Boolean(values.mtls.ca?.filePath || values.mtls.clientCert?.filePath || values.mtls.clientKey?.filePath)
      : Boolean(values.mtls.ca?.pemContent || values.mtls.clientCert?.pemContent || values.mtls.clientKey?.pemContent);

  const tlsChanged =
    values.useTls !== originalValues.useTls ||
    values.mtlsMode !== originalValues.mtlsMode ||
    values.mtls.ca !== originalValues.mtls.ca ||
    values.mtls.clientCert !== originalValues.mtls.clientCert ||
    values.mtls.clientKey !== originalValues.mtls.clientKey;

  return tlsChanged || hasCertificates;
};

const ADVANCED_CLIENT_OPTION_MASK_PATHS = [
  ['metadataMaxAgeMs', 'configurations.client_options.metadata_max_age_ms'],
  ['connectionTimeoutMs', 'configurations.client_options.connection_timeout_ms'],
  ['retryBackoffMs', 'configurations.client_options.retry_backoff_ms'],
  ['fetchWaitMaxMs', 'configurations.client_options.fetch_wait_max_ms'],
  ['fetchMinBytes', 'configurations.client_options.fetch_min_bytes'],
  ['fetchMaxBytes', 'configurations.client_options.fetch_max_bytes'],
  ['fetchPartitionMaxBytes', 'configurations.client_options.fetch_partition_max_bytes'],
] as const;

const getConnectionFieldMaskPaths = (values: FormValues, originalValues: FormValues): string[] => {
  const bootstrapServersChanged = !arraysEqual(
    values.bootstrapServers.map((s) => s.value),
    originalValues.bootstrapServers.map((s) => s.value)
  );

  // If bootstrap servers changed, use parent path which covers all client_options fields
  if (bootstrapServersChanged) {
    return ['configurations.client_options'];
  }

  // If bootstrap servers didn't change, use specific paths for individual field changes
  return [
    ...(hasTlsChanged(values, originalValues) ? ['configurations.client_options.tls_settings'] : []),
    // Compare authentication. Only the active branch's credentials count;
    // the inactive branch may hold scratch values from a tab the user
    // briefly opened, and those must not trigger a payload update.
    ...(hasAuthChanged(values, originalValues) ? ['configurations.client_options.authentication_configuration'] : []),
    // Compare advanced client options
    ...ADVANCED_CLIENT_OPTION_MASK_PATHS.filter(
      ([option]) => values.advanceClientOptions[option] !== originalValues.advanceClientOptions[option]
    ).map(([, path]) => path),
  ];
};

/**
 * Get update values for connection category (source/client options)
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForConnection = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof ShadowLinkClientOptionsSchema>>> => ({
  value: buildClientOptions(values),
  fieldMaskPaths: getConnectionFieldMaskPaths(values, originalValues),
});

/**
 * Get update values for topics category
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForTopics = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof TopicMetadataSyncOptionsSchema>>> => {
  const fieldMaskPaths: string[] = [];

  // Compare topic filters (mode and filters)
  const topicFiltersChanged =
    values.topicsMode !== originalValues.topicsMode ||
    values.topics.length !== originalValues.topics.length ||
    values.topics.some(
      (topic, idx) =>
        topic.name !== originalValues.topics[idx]?.name ||
        topic.patternType !== originalValues.topics[idx]?.patternType ||
        topic.filterType !== originalValues.topics[idx]?.filterType
    );

  // Compare topic properties
  const topicPropertiesChanged = !arraysEqual(values.topicProperties || [], originalValues.topicProperties || []);

  // Compare excludeDefault
  const excludeDefaultChanged = values.excludeDefault !== originalValues.excludeDefault;

  // If filters or properties changed, use parent path (covers all children including excludeDefault)
  const topicConfigChanged = topicFiltersChanged || topicPropertiesChanged;

  if (topicConfigChanged) {
    // Parent path includes filters, properties, AND excludeDefault
    fieldMaskPaths.push('configurations.topic_metadata_sync_options');
  } else if (excludeDefaultChanged) {
    // Only excludeDefault changed independently
    fieldMaskPaths.push('configurations.topic_metadata_sync_options.exclude_default');
  }

  // Build topic metadata sync options
  const topicMetadataSyncOptions = create(TopicMetadataSyncOptionsSchema, {
    autoCreateShadowTopicFilters:
      values.topicsMode === 'all'
        ? allNameFilter
        : values.topics.map((topic) =>
            create(NameFilterSchema, {
              patternType: topic.patternType,
              filterType: topic.filterType,
              name: topic.name,
            })
          ),
    syncedShadowTopicProperties: values.topicProperties || [],
    excludeDefault: values.excludeDefault,
  });

  return {
    value: topicMetadataSyncOptions,
    fieldMaskPaths,
  };
};

/**
 * Get update values for consumer groups category
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForConsumerGroups = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof ConsumerOffsetSyncOptionsSchema>>> => {
  const fieldMaskPaths: string[] = [];

  // Compare consumer groups mode and filters
  const consumerFiltersChanged =
    values.consumersMode !== originalValues.consumersMode ||
    values.consumers.length !== originalValues.consumers.length ||
    values.consumers.some(
      (consumer, idx) =>
        consumer.name !== originalValues.consumers[idx]?.name ||
        consumer.patternType !== originalValues.consumers[idx]?.patternType ||
        consumer.filterType !== originalValues.consumers[idx]?.filterType
    );

  if (consumerFiltersChanged) {
    fieldMaskPaths.push('configurations.consumer_offset_sync_options');
  }

  // Build consumer offset sync options
  const consumerOffsetSyncOptions = create(ConsumerOffsetSyncOptionsSchema, {
    groupFilters:
      values.consumersMode === 'all'
        ? allNameFilter
        : values.consumers.map((consumer) =>
            create(NameFilterSchema, {
              patternType: consumer.patternType,
              filterType: consumer.filterType,
              name: consumer.name,
            })
          ),
  });

  return {
    value: consumerOffsetSyncOptions,
    fieldMaskPaths,
  };
};

/**
 * Get update values for roles category
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForRoles = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof RoleSyncOptionsSchema>>> => {
  const fieldMaskPaths: string[] = [];

  // Compare roles mode and filters
  const roleFiltersChanged =
    values.rolesMode !== originalValues.rolesMode ||
    values.roles.length !== originalValues.roles.length ||
    values.roles.some(
      (role, idx) =>
        role.name !== originalValues.roles[idx]?.name ||
        role.patternType !== originalValues.roles[idx]?.patternType ||
        role.filterType !== originalValues.roles[idx]?.filterType
    );

  if (roleFiltersChanged) {
    fieldMaskPaths.push('configurations.role_sync_options');
  }

  // Build role sync options
  const roleSyncOptions = create(RoleSyncOptionsSchema, {
    roleNameFilters:
      values.rolesMode === 'all'
        ? allNameFilter
        : values.roles.map((role) =>
            create(NameFilterSchema, {
              patternType: role.patternType,
              filterType: role.filterType,
              name: role.name,
            })
          ),
  });

  return {
    value: roleSyncOptions,
    fieldMaskPaths,
  };
};

/**
 * Get update values for ACLs category
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForACLs = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof SecuritySettingsSyncOptionsSchema>>> => {
  const fieldMaskPaths: string[] = [];

  // Compare ACL mode and filters
  const currentACLFilters = values.aclFilters || [];
  const originalACLFilters = originalValues.aclFilters || [];

  const aclFiltersChanged =
    values.aclsMode !== originalValues.aclsMode ||
    currentACLFilters.length !== originalACLFilters.length ||
    currentACLFilters.some(
      (acl, idx) =>
        acl.resourceType !== originalACLFilters[idx]?.resourceType ||
        acl.resourcePattern !== originalACLFilters[idx]?.resourcePattern ||
        acl.resourceName !== originalACLFilters[idx]?.resourceName ||
        acl.principal !== originalACLFilters[idx]?.principal ||
        acl.operation !== originalACLFilters[idx]?.operation ||
        acl.permissionType !== originalACLFilters[idx]?.permissionType ||
        acl.host !== originalACLFilters[idx]?.host
    );

  if (aclFiltersChanged) {
    fieldMaskPaths.push('configurations.security_sync_options');
  }

  // Build security sync options
  const allACLs = [
    create(ACLFilterSchema, {
      resourceFilter: {
        resourceType: ACLResource.ACL_RESOURCE_ANY,
        patternType: ACLPattern.ACL_PATTERN_ANY,
        name: '',
      },
      accessFilter: {
        principal: '',
        operation: ACLOperation.ACL_OPERATION_ANY,
        permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
        host: '',
      },
    }),
  ];

  const securitySyncOptions = create(SecuritySettingsSyncOptionsSchema, {
    aclFilters:
      values.aclsMode === 'all'
        ? allACLs
        : currentACLFilters.map((acl) =>
            create(ACLFilterSchema, {
              resourceFilter: {
                resourceType: acl.resourceType,
                patternType: acl.resourcePattern,
                name: acl.resourceName || '',
              },
              accessFilter: {
                principal: acl.principal || '',
                operation: acl.operation,
                permissionType: acl.permissionType,
                host: acl.host || '',
              },
            })
          ),
  });

  return {
    value: securitySyncOptions,
    fieldMaskPaths,
  };
};

const srSyncOptionsChanged = (
  next: SchemaRegistrySyncOptions | undefined,
  previous: SchemaRegistrySyncOptions | undefined
): boolean => {
  if (next === undefined || previous === undefined) {
    return next !== previous;
  }
  return !equals(SchemaRegistrySyncOptionsSchema, next, previous);
};

/**
 * Get update values for Schema Registry category.
 * Both sides of the comparison are built from form values (current vs
 * hydrated originals), so hydration normalizations cancel out and scratch
 * values typed into a mode that isn't submitted never produce a mask. The
 * mask replaces the whole message, hence the single parent path.
 */
export const getUpdateValuesForSchemaRegistry = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<SchemaRegistrySyncOptions | undefined> => {
  const value = buildSchemaRegistrySyncOptions(values);
  const original = buildSchemaRegistrySyncOptions(originalValues);

  return {
    value,
    fieldMaskPaths: srSyncOptionsChanged(value, original) ? ['configurations.schema_registry_sync_options'] : [],
  };
};

type RoleSyncRoundTrip = Pick<NonNullable<ReturnType<typeof getUpdateValuesForRoles>>['value'], 'interval' | 'paused'>;

/**
 * Get update values for every category, plus the combined field mask paths.
 * Roles are skipped entirely when the shadow cluster does not support role
 * sync (Redpanda < 26.2.0): no value, no mask path.
 */
const getCategoryUpdates = (
  values: FormValues,
  originalValues: FormValues,
  {
    roleSyncSupported,
    originalRoleSyncOptions,
  }: { roleSyncSupported: boolean; originalRoleSyncOptions?: RoleSyncRoundTrip }
) => {
  const connection = getUpdateValuesForConnection(values, originalValues);
  const topics = getUpdateValuesForTopics(values, originalValues);
  const consumerGroups = getUpdateValuesForConsumerGroups(values, originalValues);
  const roles = roleSyncSupported ? getUpdateValuesForRoles(values, originalValues) : undefined;
  const acls = getUpdateValuesForACLs(values, originalValues);
  const schemaRegistry = getUpdateValuesForSchemaRegistry(values, originalValues);

  // No UI exposes interval/paused: round-trip them from the fetched link so
  // the whole-message mask path doesn't unpause a paused role sync task or
  // reset a custom interval
  if (roles && originalRoleSyncOptions) {
    roles.value.interval = originalRoleSyncOptions.interval;
    roles.value.paused = originalRoleSyncOptions.paused;
  }

  return {
    connection,
    topics,
    consumerGroups,
    roles,
    acls,
    schemaRegistry,
    fieldMaskPaths: [
      ...connection.fieldMaskPaths,
      ...topics.fieldMaskPaths,
      ...consumerGroups.fieldMaskPaths,
      ...(roles?.fieldMaskPaths ?? []),
      ...acls.fieldMaskPaths,
      ...schemaRegistry.fieldMaskPaths,
    ],
  };
};

/**
 * Build controlplane update request from form values
 * Controlplane uses flat structure with ID (not nested configurations with name)
 *
 * Uses create() with buf core schemas to build properly typed Message instances
 * that are compatible with the controlplane API.
 */
export const buildControlplaneUpdateRequest = (
  shadowLinkId: string,
  values: FormValues,
  originalShadowLink: ControlplaneShadowLink,
  { roleSyncSupported }: { roleSyncSupported: boolean }
) => {
  // Build original form values for comparison
  const originalValues = buildDefaultFormValuesFromControlplane(originalShadowLink);

  // Get update values from existing category functions (reuse the logic).
  // The controlplane rejects role_sync_options at admission on shadow clusters
  // without role sync, so roles are skipped there.
  const updates = getCategoryUpdates(values, originalValues, {
    roleSyncSupported,
    originalRoleSyncOptions: originalShadowLink.roleSyncOptions,
  });

  // Build flat shadow link update for controlplane (no nested configurations)
  // Use local proto schemas with type assertions to work around proto version
  // differences between local protos and buf packages. Wire format is compatible.
  const shadowLinkUpdate = create(CpShadowLinkUpdateSchema, {
    id: shadowLinkId,
    clientOptions: create(ShadowLinkClientOptionsSchema, updates.connection.value),
    topicMetadataSyncOptions: create(TopicMetadataSyncOptionsSchema, updates.topics.value),
    consumerOffsetSyncOptions: create(ConsumerOffsetSyncOptionsSchema, updates.consumerGroups.value),
    roleSyncOptions: updates.roles ? create(RoleSyncOptionsSchema, updates.roles.value) : undefined,
    securitySyncOptions: create(SecuritySettingsSyncOptionsSchema, updates.acls.value),
    schemaRegistrySyncOptions: updates.schemaRegistry.value
      ? create(SchemaRegistrySyncOptionsSchema, updates.schemaRegistry.value)
      : undefined,
  } as unknown as Parameters<typeof create<typeof CpShadowLinkUpdateSchema>>[1]);

  // Remove "configurations." prefix from field mask paths for controlplane
  // Dataplane uses: "configurations.client_options.tls_settings"
  // Controlplane uses: "client_options.tls_settings"
  const updateMask = create(FieldMaskSchema, {
    paths: updates.fieldMaskPaths.map((path) => path.replace(CONFIGURATIONS_PREFIX_REGEX, '')),
  });

  return create(CpUpdateShadowLinkRequestSchema, {
    shadowLink: shadowLinkUpdate,
    updateMask,
  });
};

/**
 * Transform form values to UpdateShadowLinkRequest protobuf message (dataplane)
 * Only includes fields that have changed from the original shadow link
 */
export const buildDataplaneUpdateRequest = (
  name: string,
  values: FormValues,
  originalShadowLink: ShadowLink,
  { roleSyncSupported }: { roleSyncSupported: boolean }
) => {
  // Build original form values for comparison
  const originalValues = buildDefaultFormValues(originalShadowLink);

  // Get update values for all categories
  const updates = getCategoryUpdates(values, originalValues, {
    roleSyncSupported,
    originalRoleSyncOptions: originalShadowLink.configurations?.roleSyncOptions,
  });

  // Build configurations with all category values
  const configurations = create(ShadowLinkConfigurationsSchema, {
    clientOptions: updates.connection.value,
    topicMetadataSyncOptions: updates.topics.value,
    consumerOffsetSyncOptions: updates.consumerGroups.value,
    roleSyncOptions: updates.roles?.value,
    securitySyncOptions: updates.acls.value,
    schemaRegistrySyncOptions: updates.schemaRegistry.value,
  });

  // Build shadow link
  const shadowLinkProto = create(ShadowLinkSchema, {
    name,
    configurations,
  });

  // Build field mask with all changed field paths from all categories
  const updateMask = create(FieldMaskSchema, { paths: updates.fieldMaskPaths });

  // Build final request
  return create(UpdateShadowLinkRequestSchema, {
    shadowLink: shadowLinkProto,
    updateMask,
  });
};
