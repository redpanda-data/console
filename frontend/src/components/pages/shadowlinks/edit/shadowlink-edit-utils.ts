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

import { create } from '@bufbuild/protobuf';
import type { ShadowLink } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink_pb';
import {
  type ACLFilter,
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  ConsumerOffsetSyncOptionsSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramConfigSchema,
  SecuritySettingsSyncOptionsSchema,
  type ShadowLinkClientOptions,
  ShadowLinkClientOptionsSchema,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import {
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
  type TLSSettings,
  TLSSettingsSchema,
} from 'protogen/redpanda/core/common/v1/tls_pb';

import type { FormValues } from '../create/model';
import { TLS_MODE } from '../create/model';

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
        topic.patterType !== originalValues.topics[idx]?.patterType ||
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
              patternType: topic.patterType,
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
        consumer.patterType !== originalValues.consumers[idx]?.patterType ||
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
              patternType: consumer.patterType,
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
 * Extract TLS settings from shadow link client options
 * mTLS is determined by presence of certificates
 */
const extractTLSSettings = (
  tlsCertsSettings: TLSSettings['tlsSettings'] | undefined
): Pick<FormValues, 'mtlsMode' | 'mtls'> => {
  if (!tlsCertsSettings) {
    return {
      mtlsMode: TLS_MODE.PEM,
      mtls: {
        ca: undefined,
        clientCert: undefined,
        clientKey: undefined,
      },
    };
  }

  if (tlsCertsSettings.case === 'tlsFileSettings') {
    const fileSettings = tlsCertsSettings.value;
    return {
      mtlsMode: TLS_MODE.FILE_PATH,
      mtls: {
        ca: fileSettings.caPath ? { filePath: fileSettings.caPath } : undefined,
        clientCert: fileSettings.certPath ? { filePath: fileSettings.certPath } : undefined,
        clientKey: fileSettings.keyPath ? { filePath: fileSettings.keyPath } : undefined,
      },
    };
  }

  // tlsPemSettings case
  if (tlsCertsSettings.case === 'tlsPemSettings') {
    const pemSettings = tlsCertsSettings.value;
    return {
      mtlsMode: TLS_MODE.PEM,
      mtls: {
        ca: pemSettings.ca ? { pemContent: pemSettings.ca } : undefined,
        clientCert: pemSettings.cert ? { pemContent: pemSettings.cert } : undefined,
        clientKey: pemSettings.key ? { pemContent: pemSettings.key } : undefined,
      },
    };
  }

  // Fallback for unknown cases
  return {
    mtlsMode: TLS_MODE.PEM,
    mtls: {
      ca: undefined,
      clientCert: undefined,
      clientKey: undefined,
    },
  };
};

/**
 * Extract authentication settings from shadow link client options
 */
const extractAuthSettings = (
  clientOptions: ShadowLinkClientOptions | undefined
): Pick<FormValues, 'useScram' | 'scramCredentials'> => {
  const authConfig = clientOptions?.authenticationConfiguration;
  const scramConfig =
    authConfig?.authentication?.case === 'scramConfiguration' ? authConfig.authentication.value : undefined;

  return {
    useScram: Boolean(scramConfig),
    scramCredentials: scramConfig
      ? {
          username: scramConfig.username || '',
          password: scramConfig.password || '',
          mechanism: scramConfig.scramMechanism,
        }
      : undefined,
  };
};

/**
 * Extract advanced client options from shadow link client options
 */
const extractAdvancedClientOptions = (
  clientOptions: ShadowLinkClientOptions | undefined
): FormValues['advanceClientOptions'] => ({
  metadataMaxAgeMs: clientOptions?.metadataMaxAgeMs || 10_000,
  connectionTimeoutMs: clientOptions?.connectionTimeoutMs || 1000,
  retryBackoffMs: clientOptions?.retryBackoffMs || 100,
  fetchWaitMaxMs: clientOptions?.fetchWaitMaxMs || 500,
  fetchMinBytes: clientOptions?.fetchMinBytes || 5_242_880,
  fetchMaxBytes: clientOptions?.fetchMaxBytes || 20_971_520,
  fetchPartitionMaxBytes: clientOptions?.fetchPartitionMaxBytes || 1_048_576,
});

/**
 * Build default form values for connection category from shadow link client options
 */
export const buildDefaultConnectionValues = (
  shadowLink: ShadowLink
): Pick<
  FormValues,
  'bootstrapServers' | 'useTls' | 'mtlsMode' | 'mtls' | 'useScram' | 'scramCredentials' | 'advanceClientOptions'
> => {
  const clientOptions = shadowLink.configurations?.clientOptions;
  const tlsCertsSettings = clientOptions?.tlsSettings?.tlsSettings;

  const tlsSettings = extractTLSSettings(tlsCertsSettings);
  const authSettings = extractAuthSettings(clientOptions);
  const advancedOptions = extractAdvancedClientOptions(clientOptions);

  const bootstrapServers = (clientOptions?.bootstrapServers || []).map((server) => ({ value: server }));

  return {
    bootstrapServers: bootstrapServers.length > 0 ? bootstrapServers : [{ value: '' }],
    advanceClientOptions: advancedOptions,
    useTls: Boolean(clientOptions?.tlsSettings?.enabled),
    ...tlsSettings,
    ...authSettings,
  };
};

/**
 * Check if name filters represent "all" mode (single filter with name='*')
 */
const isAllNameFilter = (filters: { name: string; patternType: PatternType; filterType: FilterType }[]): boolean =>
  filters.length === 1 &&
  filters[0].name === '*' &&
  filters[0].patternType === PatternType.LITERAL &&
  filters[0].filterType === FilterType.INCLUDE;

/**
 * Build default form values for topics category from shadow link configurations
 */
export const buildDefaultTopicsValues = (
  shadowLink: ShadowLink
): Pick<FormValues, 'topicsMode' | 'topics' | 'topicProperties' | 'excludeDefault'> => {
  const topicMetadataSyncOptions = shadowLink.configurations?.topicMetadataSyncOptions;
  const filters = topicMetadataSyncOptions?.autoCreateShadowTopicFilters || [];

  // Check if using "all topics" mode
  const isAllMode = isAllNameFilter(filters);

  return {
    topicsMode: isAllMode ? 'all' : 'specify',
    topics: isAllMode
      ? []
      : filters.map((filter) => ({
          name: filter.name,
          patterType: filter.patternType,
          filterType: filter.filterType,
        })),
    // Use the computed list from shadowLink which includes defaults merged with custom properties
    topicProperties: shadowLink.syncedShadowTopicProperties || [],
    excludeDefault: topicMetadataSyncOptions?.excludeDefault ?? false,
  };
};

/**
 * Build default form values for consumer groups category from shadow link configurations
 */
export const buildDefaultConsumerGroupsValues = (
  shadowLink: ShadowLink
): Pick<FormValues, 'enableConsumerOffsetSync' | 'consumersMode' | 'consumers'> => {
  const consumerOffsetSyncOptions = shadowLink.configurations?.consumerOffsetSyncOptions;
  const groupFilters = consumerOffsetSyncOptions?.groupFilters || [];

  // Check if using "all consumer groups" mode
  const isAllMode = isAllNameFilter(groupFilters);

  return {
    enableConsumerOffsetSync: false, // UI-only field, not stored in backend
    consumersMode: isAllMode ? 'all' : 'specify',
    consumers: isAllMode
      ? []
      : groupFilters.map((filter) => ({
          name: filter.name,
          patterType: filter.patternType,
          filterType: filter.filterType,
        })),
  };
};

/**
 * Check if ACL filters represent "all" mode (single filter matching any ACL)
 */
const isAllACLFilter = (filters: ACLFilter[]): boolean => {
  if (filters.length !== 1) {
    return false;
  }

  const filter = filters[0];
  const resourceFilter = filter.resourceFilter;
  const accessFilter = filter.accessFilter;

  return (
    resourceFilter?.resourceType === ACLResource.ACL_RESOURCE_ANY &&
    resourceFilter?.patternType === ACLPattern.ACL_PATTERN_ANY &&
    resourceFilter?.name === '' &&
    accessFilter?.principal === '' &&
    accessFilter?.operation === ACLOperation.ACL_OPERATION_ANY &&
    accessFilter?.permissionType === ACLPermissionType.ACL_PERMISSION_TYPE_ANY &&
    accessFilter?.host === ''
  );
};

/**
 * Build default form values for ACLs category from shadow link configurations
 */
export const buildDefaultACLsValues = (shadowLink: ShadowLink): Pick<FormValues, 'aclsMode' | 'aclFilters'> => {
  const securitySyncOptions = shadowLink.configurations?.securitySyncOptions;
  const aclFilters = securitySyncOptions?.aclFilters || [];

  // Check if using "all ACLs" mode
  const isAllMode = isAllACLFilter(aclFilters);

  return {
    aclsMode: isAllMode ? 'all' : 'specify',
    aclFilters: isAllMode
      ? []
      : aclFilters.map((filter) => ({
          resourceType: filter.resourceFilter?.resourceType,
          resourcePattern: filter.resourceFilter?.patternType,
          resourceName: filter.resourceFilter?.name,
          principal: filter.accessFilter?.principal,
          operation: filter.accessFilter?.operation,
          permissionType: filter.accessFilter?.permissionType,
          host: filter.accessFilter?.host,
        })),
  };
};
