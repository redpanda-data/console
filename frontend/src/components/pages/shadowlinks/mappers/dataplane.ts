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

/**
 * Dataplane Mappers
 * Convert dataplane proto types to plain TypeScript types and form values
 */

import type { ShadowLink as DataplaneShadowLink } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink_pb';
import type {
  ACLFilter,
  AuthenticationConfiguration,
  ConsumerOffsetSyncOptions,
  NameFilter,
  SchemaRegistrySyncOptions,
  SecuritySettingsSyncOptions,
  ShadowLinkClientOptions,
  ShadowLinkConfigurations,
  TopicMetadataSyncOptions,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import type { TLSSettings } from 'protogen/redpanda/core/common/v1/tls_pb';

import type { FormValues } from '../create/model';
import { TLS_MODE } from '../create/model';
import {
  mapConsoleStateToUnified,
  type UnifiedAuthenticationConfiguration,
  type UnifiedClientOptions,
  type UnifiedConsumerOffsetSyncOptions,
  type UnifiedSchemaRegistrySyncOptions,
  type UnifiedSecuritySyncOptions,
  type UnifiedShadowLink,
  type UnifiedShadowLinkConfigurations,
  type UnifiedTLSSettings,
  type UnifiedTopicMetadataSyncOptions,
} from '../model';

// ============================================================================
// Dataplane → UnifiedShadowLink Mappers
// ============================================================================

/**
 * Map dataplane TLS settings to unified type
 */
function mapDataplaneTLSSettings(tlsSettings: TLSSettings | undefined): UnifiedTLSSettings | undefined {
  if (!tlsSettings) {
    return undefined;
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
 * Map dataplane authentication configuration to unified type
 */
function mapDataplaneAuthConfig(
  authConfig: AuthenticationConfiguration | undefined
): UnifiedAuthenticationConfiguration | undefined {
  if (!authConfig?.authentication) {
    return undefined;
  }

  if (authConfig.authentication.case === 'scramConfiguration') {
    const scram = authConfig.authentication.value;
    return {
      authentication: {
        case: 'scramConfiguration',
        value: {
          username: scram.username,
          password: scram.password,
          scramMechanism: scram.scramMechanism,
        },
      },
    };
  }

  return undefined;
}

/**
 * Map dataplane client options to unified type
 */
function mapDataplaneClientOptions(
  clientOptions: ShadowLinkClientOptions | undefined
): UnifiedClientOptions | undefined {
  if (!clientOptions) {
    return undefined;
  }

  return {
    bootstrapServers: clientOptions.bootstrapServers,
    clientId: clientOptions.clientId,
    sourceClusterId: clientOptions.sourceClusterId,
    tlsSettings: mapDataplaneTLSSettings(clientOptions.tlsSettings),
    authenticationConfiguration: mapDataplaneAuthConfig(clientOptions.authenticationConfiguration),
    metadataMaxAgeMs: clientOptions.metadataMaxAgeMs,
    connectionTimeoutMs: clientOptions.connectionTimeoutMs,
    retryBackoffMs: clientOptions.retryBackoffMs,
    fetchWaitMaxMs: clientOptions.fetchWaitMaxMs,
    fetchMinBytes: clientOptions.fetchMinBytes,
    fetchMaxBytes: clientOptions.fetchMaxBytes,
    fetchPartitionMaxBytes: clientOptions.fetchPartitionMaxBytes,
    effectiveMetadataMaxAgeMs: clientOptions.effectiveMetadataMaxAgeMs,
    effectiveConnectionTimeoutMs: clientOptions.effectiveConnectionTimeoutMs,
    effectiveRetryBackoffMs: clientOptions.effectiveRetryBackoffMs,
    effectiveFetchWaitMaxMs: clientOptions.effectiveFetchWaitMaxMs,
    effectiveFetchMinBytes: clientOptions.effectiveFetchMinBytes,
    effectiveFetchMaxBytes: clientOptions.effectiveFetchMaxBytes,
    effectiveFetchPartitionMaxBytes: clientOptions.effectiveFetchPartitionMaxBytes,
  };
}

/**
 * Map dataplane topic metadata sync options to unified type
 */
function mapDataplaneTopicMetadataSyncOptions(
  options: TopicMetadataSyncOptions | undefined
): UnifiedTopicMetadataSyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    autoCreateShadowTopicFilters: (options.autoCreateShadowTopicFilters ?? []).map((f: NameFilter) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
    syncedShadowTopicProperties: options.syncedShadowTopicProperties ?? [],
    excludeDefault: options.excludeDefault,
  };
}

/**
 * Map dataplane consumer offset sync options to unified type
 */
function mapDataplaneConsumerOffsetSyncOptions(
  options: ConsumerOffsetSyncOptions | undefined
): UnifiedConsumerOffsetSyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    groupFilters: (options.groupFilters ?? []).map((f: NameFilter) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
  };
}

/**
 * Map dataplane security sync options to unified type
 */
function mapDataplaneSecuritySyncOptions(
  options: SecuritySettingsSyncOptions | undefined
): UnifiedSecuritySyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    aclFilters: (options.aclFilters ?? []).map((f: ACLFilter) => ({
      resourceFilter: f.resourceFilter
        ? {
            resourceType: f.resourceFilter.resourceType,
            patternType: f.resourceFilter.patternType,
            name: f.resourceFilter.name,
          }
        : undefined,
      accessFilter: f.accessFilter
        ? {
            principal: f.accessFilter.principal,
            operation: f.accessFilter.operation,
            permissionType: f.accessFilter.permissionType,
            host: f.accessFilter.host,
          }
        : undefined,
    })),
  };
}

/**
 * Map dataplane schema registry sync options to unified type
 */
function mapDataplaneSchemaRegistrySyncOptions(
  options: SchemaRegistrySyncOptions | undefined
): UnifiedSchemaRegistrySyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    schemaRegistryShadowingMode:
      options.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryTopic'
        ? { case: 'shadowSchemaRegistryTopic', value: {} }
        : { case: undefined },
  };
}

/**
 * Map dataplane configurations to unified configurations
 */
function mapDataplaneConfigurations(
  config: ShadowLinkConfigurations | undefined
): UnifiedShadowLinkConfigurations | undefined {
  if (!config) {
    return undefined;
  }

  return {
    clientOptions: mapDataplaneClientOptions(config.clientOptions),
    topicMetadataSyncOptions: mapDataplaneTopicMetadataSyncOptions(config.topicMetadataSyncOptions),
    consumerOffsetSyncOptions: mapDataplaneConsumerOffsetSyncOptions(config.consumerOffsetSyncOptions),
    securitySyncOptions: mapDataplaneSecuritySyncOptions(config.securitySyncOptions),
    schemaRegistrySyncOptions: mapDataplaneSchemaRegistrySyncOptions(config.schemaRegistrySyncOptions),
  };
}

/**
 * Transform dataplane API response to unified model
 */
export function fromDataplaneShadowLink(sl: DataplaneShadowLink): UnifiedShadowLink {
  return {
    name: sl.name,
    id: sl.uid,
    state: mapConsoleStateToUnified(sl.state),
    configurations: mapDataplaneConfigurations(sl.configurations),
    tasksStatus: sl.tasksStatus,
    syncedShadowTopicProperties: sl.syncedShadowTopicProperties,
  };
}

// ============================================================================
// Dataplane → FormValues Mappers
// ============================================================================

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
 * Check if name filters represent "all" mode (single filter with name='*')
 */
const isAllNameFilter = (filters: { name: string; patternType: PatternType; filterType: FilterType }[]): boolean =>
  filters.length === 1 &&
  filters[0].name === '*' &&
  filters[0].patternType === PatternType.LITERAL &&
  filters[0].filterType === FilterType.INCLUDE;

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
 * Build default form values for connection category from shadow link client options
 */
export const buildDefaultConnectionValues = (
  shadowLink: DataplaneShadowLink
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
 * Build default form values for topics category from shadow link configurations
 */
export const buildDefaultTopicsValues = (
  shadowLink: DataplaneShadowLink
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
          patternType: filter.patternType,
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
  shadowLink: DataplaneShadowLink
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
          patternType: filter.patternType,
          filterType: filter.filterType,
        })),
  };
};

/**
 * Build default form values for ACLs category from shadow link configurations
 */
export const buildDefaultACLsValues = (
  shadowLink: DataplaneShadowLink
): Pick<FormValues, 'aclsMode' | 'aclFilters'> => {
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

/**
 * Build default form values for Schema Registry category from shadow link configurations
 */
export const buildDefaultSchemaRegistryValues = (
  shadowLink: DataplaneShadowLink
): Pick<FormValues, 'enableSchemaRegistrySync'> => {
  const schemaRegistrySyncOptions = shadowLink.configurations?.schemaRegistrySyncOptions;
  const isEnabled = schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryTopic';

  return {
    enableSchemaRegistrySync: isEnabled,
  };
};

/**
 * Build default form values from existing shadow link data (dataplane)
 * Orchestrates category-specific builders
 */
export const buildDefaultFormValues = (shadowLink: DataplaneShadowLink): FormValues => {
  const connectionValues = buildDefaultConnectionValues(shadowLink);
  const topicsValues = buildDefaultTopicsValues(shadowLink);
  const consumerGroupsValues = buildDefaultConsumerGroupsValues(shadowLink);
  const aclsValues = buildDefaultACLsValues(shadowLink);
  const schemaRegistryValues = buildDefaultSchemaRegistryValues(shadowLink);

  return {
    name: shadowLink.name || '',
    ...connectionValues,
    ...topicsValues,
    ...consumerGroupsValues,
    ...aclsValues,
    ...schemaRegistryValues,
  };
};
