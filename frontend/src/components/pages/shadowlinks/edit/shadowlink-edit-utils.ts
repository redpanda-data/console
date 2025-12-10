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
  ShadowLinkUpdateSchema as CpShadowLinkUpdateSchema,
  UpdateShadowLinkRequestSchema as CpUpdateShadowLinkRequestSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { create } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import type { ShadowLink } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  ConsumerOffsetSyncOptionsSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  SchemaRegistrySyncOptions_ShadowSchemaRegistryTopicSchema,
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
import { TLS_MODE } from '../create/model';
import { buildDefaultFormValues } from '../mappers/dataplane';

/**
 * Regex to strip "configurations." prefix from field mask paths
 * Used when converting dataplane field masks to controlplane format
 */
const CONFIGURATIONS_PREFIX_REGEX = /^configurations\./;

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
    return undefined;
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

/**
 * Get update values for connection category (source/client options)
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForConnection = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof ShadowLinkClientOptionsSchema>>> => {
  const fieldMaskPaths: string[] = [];

  // Compare bootstrap servers
  const bootstrapServersChanged = !arraysEqual(
    values.bootstrapServers.map((s) => s.value),
    originalValues.bootstrapServers.map((s) => s.value)
  );

  if (bootstrapServersChanged) {
    // If bootstrap servers changed, use parent path which covers all client_options fields
    fieldMaskPaths.push('configurations.client_options');
  } else {
    // If bootstrap servers didn't change, use specific paths for individual field changes

    // Compare TLS settings - include if TLS changed or certificates changed
    const hasCertificates =
      values.mtlsMode === TLS_MODE.FILE_PATH
        ? Boolean(values.mtls.ca?.filePath || values.mtls.clientCert?.filePath || values.mtls.clientKey?.filePath)
        : Boolean(
            values.mtls.ca?.pemContent || values.mtls.clientCert?.pemContent || values.mtls.clientKey?.pemContent
          );

    const tlsChanged =
      values.useTls !== originalValues.useTls ||
      values.mtlsMode !== originalValues.mtlsMode ||
      values.mtls.ca !== originalValues.mtls.ca ||
      values.mtls.clientCert !== originalValues.mtls.clientCert ||
      values.mtls.clientKey !== originalValues.mtls.clientKey;

    if (tlsChanged || hasCertificates) {
      fieldMaskPaths.push('configurations.client_options.tls_settings');
    }

    // Compare authentication
    const authChanged =
      values.useScram !== originalValues.useScram ||
      values.scramCredentials?.username !== originalValues.scramCredentials?.username ||
      values.scramCredentials?.password !== originalValues.scramCredentials?.password ||
      values.scramCredentials?.mechanism !== originalValues.scramCredentials?.mechanism;
    if (authChanged) {
      fieldMaskPaths.push('configurations.client_options.authentication_configuration');
    }

    // Compare advanced client options
    if (values.advanceClientOptions.metadataMaxAgeMs !== originalValues.advanceClientOptions.metadataMaxAgeMs) {
      fieldMaskPaths.push('configurations.client_options.metadata_max_age_ms');
    }
    if (values.advanceClientOptions.connectionTimeoutMs !== originalValues.advanceClientOptions.connectionTimeoutMs) {
      fieldMaskPaths.push('configurations.client_options.connection_timeout_ms');
    }
    if (values.advanceClientOptions.retryBackoffMs !== originalValues.advanceClientOptions.retryBackoffMs) {
      fieldMaskPaths.push('configurations.client_options.retry_backoff_ms');
    }
    if (values.advanceClientOptions.fetchWaitMaxMs !== originalValues.advanceClientOptions.fetchWaitMaxMs) {
      fieldMaskPaths.push('configurations.client_options.fetch_wait_max_ms');
    }
    if (values.advanceClientOptions.fetchMinBytes !== originalValues.advanceClientOptions.fetchMinBytes) {
      fieldMaskPaths.push('configurations.client_options.fetch_min_bytes');
    }
    if (values.advanceClientOptions.fetchMaxBytes !== originalValues.advanceClientOptions.fetchMaxBytes) {
      fieldMaskPaths.push('configurations.client_options.fetch_max_bytes');
    }
    if (
      values.advanceClientOptions.fetchPartitionMaxBytes !== originalValues.advanceClientOptions.fetchPartitionMaxBytes
    ) {
      fieldMaskPaths.push('configurations.client_options.fetch_partition_max_bytes');
    }
  }

  // Build TLS settings
  const tlsSettings = buildTLSSettings(values);

  // Build client options schema
  const clientOptions = create(ShadowLinkClientOptionsSchema, {
    bootstrapServers: values.bootstrapServers.map((s) => s.value),
    tlsSettings: values.useTls
      ? create(TLSSettingsSchema, {
          enabled: true,
          tlsSettings,
        })
      : undefined,
    authenticationConfiguration: values.useScram
      ? create(AuthenticationConfigurationSchema, {
          authentication: {
            case: 'scramConfiguration',
            value: create(ScramConfigSchema, {
              username: values.scramCredentials?.username,
              password: values.scramCredentials?.password,
              scramMechanism: values.scramCredentials?.mechanism,
            }),
          },
        })
      : undefined,
    metadataMaxAgeMs: values.advanceClientOptions.metadataMaxAgeMs,
    connectionTimeoutMs: values.advanceClientOptions.connectionTimeoutMs,
    retryBackoffMs: values.advanceClientOptions.retryBackoffMs,
    fetchWaitMaxMs: values.advanceClientOptions.fetchWaitMaxMs,
    fetchMinBytes: values.advanceClientOptions.fetchMinBytes,
    fetchMaxBytes: values.advanceClientOptions.fetchMaxBytes,
    fetchPartitionMaxBytes: values.advanceClientOptions.fetchPartitionMaxBytes,
  });

  return {
    value: clientOptions,
    fieldMaskPaths,
  };
};

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
  const allNameFilter = [
    create(NameFilterSchema, {
      patternType: PatternType.LITERAL,
      filterType: FilterType.INCLUDE,
      name: '*',
    }),
  ];

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
  const allNameFilter = [
    create(NameFilterSchema, {
      patternType: PatternType.LITERAL,
      filterType: FilterType.INCLUDE,
      name: '*',
    }),
  ];

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

/**
 * Get update values for Schema Registry category
 * Compares form values with original values and returns schema + field mask paths
 */
export const getUpdateValuesForSchemaRegistry = (
  values: FormValues,
  originalValues: FormValues
): UpdateResult<ReturnType<typeof create<typeof SchemaRegistrySyncOptionsSchema>> | undefined> => {
  const fieldMaskPaths: string[] = [];

  // Compare schema registry sync enabled state
  const schemaRegistryChanged = values.enableSchemaRegistrySync !== originalValues.enableSchemaRegistrySync;

  if (schemaRegistryChanged) {
    fieldMaskPaths.push('configurations.schema_registry_sync_options');
  }

  // Build schema registry sync options (only set if enabled)
  const schemaRegistrySyncOptions = values.enableSchemaRegistrySync
    ? create(SchemaRegistrySyncOptionsSchema, {
        schemaRegistryShadowingMode: {
          case: 'shadowSchemaRegistryTopic',
          value: create(SchemaRegistrySyncOptions_ShadowSchemaRegistryTopicSchema, {}),
        },
      })
    : undefined;

  return {
    value: schemaRegistrySyncOptions,
    fieldMaskPaths,
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
  originalValues: FormValues
) => {
  // Get update values from existing category functions (reuse the logic)
  const connectionUpdate = getUpdateValuesForConnection(values, originalValues);
  const topicsUpdate = getUpdateValuesForTopics(values, originalValues);
  const consumerGroupsUpdate = getUpdateValuesForConsumerGroups(values, originalValues);
  const aclsUpdate = getUpdateValuesForACLs(values, originalValues);
  const schemaRegistryUpdate = getUpdateValuesForSchemaRegistry(values, originalValues);

  // Build flat shadow link update for controlplane (no nested configurations)
  // Use local proto schemas with type assertions to work around proto version
  // differences between local protos and buf packages. Wire format is compatible.
  const shadowLinkUpdate = create(CpShadowLinkUpdateSchema, {
    id: shadowLinkId,
    clientOptions: create(ShadowLinkClientOptionsSchema, connectionUpdate.value),
    topicMetadataSyncOptions: create(TopicMetadataSyncOptionsSchema, topicsUpdate.value),
    consumerOffsetSyncOptions: create(ConsumerOffsetSyncOptionsSchema, consumerGroupsUpdate.value),
    securitySyncOptions: create(SecuritySettingsSyncOptionsSchema, aclsUpdate.value),
    schemaRegistrySyncOptions: schemaRegistryUpdate.value
      ? create(SchemaRegistrySyncOptionsSchema, schemaRegistryUpdate.value)
      : undefined,
  } as unknown as Parameters<typeof create<typeof CpShadowLinkUpdateSchema>>[1]);

  // Remove "configurations." prefix from field mask paths for controlplane
  // Dataplane uses: "configurations.client_options.tls_settings"
  // Controlplane uses: "client_options.tls_settings"
  const paths = [
    ...connectionUpdate.fieldMaskPaths,
    ...topicsUpdate.fieldMaskPaths,
    ...consumerGroupsUpdate.fieldMaskPaths,
    ...aclsUpdate.fieldMaskPaths,
    ...schemaRegistryUpdate.fieldMaskPaths,
  ].map((path) => path.replace(CONFIGURATIONS_PREFIX_REGEX, ''));

  const updateMask = create(FieldMaskSchema, { paths });

  return create(CpUpdateShadowLinkRequestSchema, {
    shadowLink: shadowLinkUpdate,
    updateMask,
  });
};

/**
 * Transform form values to UpdateShadowLinkRequest protobuf message (dataplane)
 * Only includes fields that have changed from the original shadow link
 */
export const buildDataplaneUpdateRequest = (name: string, values: FormValues, originalShadowLink: ShadowLink) => {
  // Build original form values for comparison
  const originalValues = buildDefaultFormValues(originalShadowLink);

  // Get update values for all categories
  const connectionUpdate = getUpdateValuesForConnection(values, originalValues);
  const topicsUpdate = getUpdateValuesForTopics(values, originalValues);
  const consumerGroupsUpdate = getUpdateValuesForConsumerGroups(values, originalValues);
  const aclsUpdate = getUpdateValuesForACLs(values, originalValues);
  const schemaRegistryUpdate = getUpdateValuesForSchemaRegistry(values, originalValues);

  // Build configurations with all category values
  const configurations = create(ShadowLinkConfigurationsSchema, {
    clientOptions: connectionUpdate.value,
    topicMetadataSyncOptions: topicsUpdate.value,
    consumerOffsetSyncOptions: consumerGroupsUpdate.value,
    securitySyncOptions: aclsUpdate.value,
    schemaRegistrySyncOptions: schemaRegistryUpdate.value,
  });

  // Build shadow link
  const shadowLinkProto = create(ShadowLinkSchema, {
    name,
    configurations,
  });

  // Build field mask with all changed field paths from all categories
  const updateMask = create(FieldMaskSchema, {
    paths: [
      ...connectionUpdate.fieldMaskPaths,
      ...topicsUpdate.fieldMaskPaths,
      ...consumerGroupsUpdate.fieldMaskPaths,
      ...aclsUpdate.fieldMaskPaths,
      ...schemaRegistryUpdate.fieldMaskPaths,
    ],
  });

  // Build final request
  return create(UpdateShadowLinkRequestSchema, {
    shadowLink: shadowLinkProto,
    updateMask,
  });
};
