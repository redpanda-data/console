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
 * Controlplane Mappers
 * Convert controlplane proto types (buf packages) to plain TypeScript types
 */

import type { ShadowLink as ControlplaneShadowLink } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';

import { type FormValues, TLS_MODE } from '../create/model';
import {
  mapControlplaneStateToUnified,
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

/**
 * Map controlplane client options to unified type
 * Note: Controlplane TLS uses flat structure (ca, key, cert directly on tlsSettings object)
 */
function mapControlplaneClientOptions(
  clientOptions: ControlplaneShadowLink['clientOptions']
): UnifiedClientOptions | undefined {
  if (!clientOptions) {
    return undefined;
  }

  // Map TLS settings - controlplane uses flat structure
  let tlsSettings: UnifiedTLSSettings | undefined;
  if (clientOptions.tlsSettings?.enabled) {
    tlsSettings = {
      enabled: true,
      tlsSettings: {
        case: 'tlsPemSettings',
        value: {
          ca: clientOptions.tlsSettings.ca ?? '',
          key: clientOptions.tlsSettings.key ?? '',
          cert: clientOptions.tlsSettings.cert ?? '',
          keyFingerprint: '',
        },
      },
    };
  }

  // Map authentication configuration
  let authConfig: UnifiedAuthenticationConfiguration | undefined;
  const authProto = clientOptions.authenticationConfiguration;
  if (authProto?.authentication?.case === 'scramConfiguration') {
    const scram = authProto.authentication.value;
    authConfig = {
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

  return {
    bootstrapServers: clientOptions.bootstrapServers,
    clientId: clientOptions.clientId,
    sourceClusterId: clientOptions.sourceClusterId,
    tlsSettings,
    authenticationConfiguration: authConfig,
    metadataMaxAgeMs: clientOptions.metadataMaxAgeMs,
    connectionTimeoutMs: clientOptions.connectionTimeoutMs,
    retryBackoffMs: clientOptions.retryBackoffMs,
    fetchWaitMaxMs: clientOptions.fetchWaitMaxMs,
    fetchMinBytes: clientOptions.fetchMinBytes,
    fetchMaxBytes: clientOptions.fetchMaxBytes,
    fetchPartitionMaxBytes: clientOptions.fetchPartitionMaxBytes,
    // Effective fields not available from controlplane yet
    effectiveMetadataMaxAgeMs: 0,
    effectiveConnectionTimeoutMs: 0,
    effectiveRetryBackoffMs: 0,
    effectiveFetchWaitMaxMs: 0,
    effectiveFetchMinBytes: 0,
    effectiveFetchMaxBytes: 0,
    effectiveFetchPartitionMaxBytes: 0,
  };
}

/**
 * Map controlplane topic metadata sync options to unified type
 */
function mapControlplaneTopicMetadataSyncOptions(
  options: ControlplaneShadowLink['topicMetadataSyncOptions']
): UnifiedTopicMetadataSyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    autoCreateShadowTopicFilters: (options.autoCreateShadowTopicFilters ?? []).map((f) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
    syncedShadowTopicProperties: options.syncedShadowTopicProperties ?? [],
    excludeDefault: options.excludeDefault,
  };
}

/**
 * Map controlplane consumer offset sync options to unified type
 */
function mapControlplaneConsumerOffsetSyncOptions(
  options: ControlplaneShadowLink['consumerOffsetSyncOptions']
): UnifiedConsumerOffsetSyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    groupFilters: (options.groupFilters ?? []).map((f) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
  };
}

/**
 * Map controlplane security sync options to unified type
 */
function mapControlplaneSecuritySyncOptions(
  options: ControlplaneShadowLink['securitySyncOptions']
): UnifiedSecuritySyncOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    aclFilters: (options.aclFilters ?? []).map((f) => ({
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
 * Map controlplane schema registry sync options to unified type
 */
function mapControlplaneSchemaRegistrySyncOptions(
  options: ControlplaneShadowLink['schemaRegistrySyncOptions']
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
 * Map controlplane configurations to unified configurations
 */
function mapControlplaneConfigurations(sl: ControlplaneShadowLink): UnifiedShadowLinkConfigurations | undefined {
  if (!sl.clientOptions) {
    return undefined;
  }

  return {
    clientOptions: mapControlplaneClientOptions(sl.clientOptions),
    topicMetadataSyncOptions: mapControlplaneTopicMetadataSyncOptions(sl.topicMetadataSyncOptions),
    consumerOffsetSyncOptions: mapControlplaneConsumerOffsetSyncOptions(sl.consumerOffsetSyncOptions),
    securitySyncOptions: mapControlplaneSecuritySyncOptions(sl.securitySyncOptions),
    schemaRegistrySyncOptions: mapControlplaneSchemaRegistrySyncOptions(sl.schemaRegistrySyncOptions),
  };
}

/**
 * Transform controlplane API response to unified model.
 * Used as fallback when dataplane query fails in embedded mode.
 * Note: tasksStatus and syncedShadowTopicProperties are not available from controlplane.
 */
export function fromControlplaneShadowLink(sl: ControlplaneShadowLink): UnifiedShadowLink {
  return {
    name: sl.name,
    id: sl.id,
    state: mapControlplaneStateToUnified(sl.state),
    resourceGroupId: sl.resourceGroupId,
    shadowRedpandaId: sl.shadowRedpandaId,
    createdAt: sl.createdAt ? timestampDate(sl.createdAt) : undefined,
    updatedAt: sl.updatedAt ? timestampDate(sl.updatedAt) : undefined,
    configurations: mapControlplaneConfigurations(sl),
    tasksStatus: [],
    syncedShadowTopicProperties: [],
  };
}

// ============================================================================
// Controlplane → FormValues Mappers
// ============================================================================

/**
 * Extract authentication settings from controlplane shadow link client options
 * Controlplane uses the same core AuthenticationConfiguration type (oneof pattern)
 *
 * Note: The JSON wire format may have scramConfiguration directly under authenticationConfiguration,
 * while the TypeScript types expect authentication.case === 'scramConfiguration'.
 * We handle both formats for robustness.
 */
const extractControlplaneAuthSettings = (
  clientOptions: ControlplaneShadowLink['clientOptions']
): Pick<FormValues, 'useScram' | 'scramCredentials'> => {
  const authConfig = clientOptions?.authenticationConfiguration;

  // Try the proper protobuf-es oneof pattern first
  let scramConfig =
    authConfig?.authentication?.case === 'scramConfiguration' ? authConfig.authentication.value : undefined;

  // Fallback: check if scramConfiguration is directly on authConfig (JSON wire format)
  // This can happen if the response wasn't fully deserialized through protobuf-es
  if (!scramConfig && authConfig) {
    const rawAuthConfig = authConfig as unknown as {
      scramConfiguration?: { username?: string; password?: string; scramMechanism?: number };
    };
    if (rawAuthConfig.scramConfiguration) {
      scramConfig = rawAuthConfig.scramConfiguration as unknown as typeof scramConfig;
    }
  }

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
const isAllACLFilter = (filters: ControlplaneShadowLink['securitySyncOptions']): boolean => {
  const aclFilters = filters?.aclFilters ?? [];
  if (aclFilters.length !== 1) {
    return false;
  }

  const filter = aclFilters[0];
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
 * Build connection form values from controlplane shadow link
 */
const buildControlplaneConnectionValues = (
  shadowLink: ControlplaneShadowLink
): Pick<FormValues, 'bootstrapServers' | 'useTls' | 'mtlsMode' | 'mtls' | 'advanceClientOptions'> => {
  const clientOptions = shadowLink.clientOptions;
  const tlsSettings = clientOptions?.tlsSettings;

  const bootstrapServers = (clientOptions?.bootstrapServers ?? []).map((server) => ({ value: server }));

  return {
    bootstrapServers: bootstrapServers.length > 0 ? bootstrapServers : [{ value: '' }],
    useTls: Boolean(tlsSettings?.enabled),
    mtlsMode: TLS_MODE.PEM,
    mtls: {
      ca: tlsSettings?.ca ? { pemContent: tlsSettings.ca } : undefined,
      clientCert: tlsSettings?.cert ? { pemContent: tlsSettings.cert } : undefined,
      clientKey: tlsSettings?.key ? { pemContent: tlsSettings.key } : undefined,
    },
    advanceClientOptions: {
      metadataMaxAgeMs: clientOptions?.metadataMaxAgeMs ?? 10_000,
      connectionTimeoutMs: clientOptions?.connectionTimeoutMs ?? 1000,
      retryBackoffMs: clientOptions?.retryBackoffMs ?? 100,
      fetchWaitMaxMs: clientOptions?.fetchWaitMaxMs ?? 500,
      fetchMinBytes: clientOptions?.fetchMinBytes ?? 5_242_880,
      fetchMaxBytes: clientOptions?.fetchMaxBytes ?? 20_971_520,
      fetchPartitionMaxBytes: clientOptions?.fetchPartitionMaxBytes ?? 1_048_576,
    },
  };
};

/**
 * Build topics form values from controlplane shadow link
 */
const buildControlplaneTopicsValues = (
  shadowLink: ControlplaneShadowLink
): Pick<FormValues, 'topicsMode' | 'topics' | 'topicProperties' | 'excludeDefault'> => {
  const topicMetadataSyncOptions = shadowLink.topicMetadataSyncOptions;
  const filters = topicMetadataSyncOptions?.autoCreateShadowTopicFilters ?? [];

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
    topicProperties: topicMetadataSyncOptions?.syncedShadowTopicProperties ?? [],
    excludeDefault: topicMetadataSyncOptions?.excludeDefault ?? false,
  };
};

/**
 * Build consumer groups form values from controlplane shadow link
 */
const buildControlplaneConsumerGroupsValues = (
  shadowLink: ControlplaneShadowLink
): Pick<FormValues, 'enableConsumerOffsetSync' | 'consumersMode' | 'consumers'> => {
  const consumerOffsetSyncOptions = shadowLink.consumerOffsetSyncOptions;
  const groupFilters = consumerOffsetSyncOptions?.groupFilters ?? [];

  const isAllMode = isAllNameFilter(groupFilters);

  return {
    enableConsumerOffsetSync: false,
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
 * Build ACLs form values from controlplane shadow link
 */
const buildControlplaneACLsValues = (
  shadowLink: ControlplaneShadowLink
): Pick<FormValues, 'aclsMode' | 'aclFilters'> => {
  const securitySyncOptions = shadowLink.securitySyncOptions;
  const aclFilters = securitySyncOptions?.aclFilters ?? [];

  const isAllMode = isAllACLFilter(securitySyncOptions);

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
 * Build schema registry form values from controlplane shadow link
 */
const buildControlplaneSchemaRegistryValues = (
  shadowLink: ControlplaneShadowLink
): Pick<FormValues, 'enableSchemaRegistrySync'> => {
  const schemaRegistrySyncOptions = shadowLink.schemaRegistrySyncOptions;
  const isEnabled = schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryTopic';

  return {
    enableSchemaRegistrySync: isEnabled,
  };
};

/**
 * Build form values from controlplane shadow link data
 * Maps the controlplane structure to form fields without type casts
 */
export const buildDefaultFormValuesFromControlplane = (shadowLink: ControlplaneShadowLink): FormValues => {
  const connectionValues = buildControlplaneConnectionValues(shadowLink);
  const authSettings = extractControlplaneAuthSettings(shadowLink.clientOptions);
  const topicsValues = buildControlplaneTopicsValues(shadowLink);
  const consumerGroupsValues = buildControlplaneConsumerGroupsValues(shadowLink);
  const aclsValues = buildControlplaneACLsValues(shadowLink);
  const schemaRegistryValues = buildControlplaneSchemaRegistryValues(shadowLink);

  return {
    name: shadowLink.name ?? '',
    ...connectionValues,
    ...authSettings,
    ...topicsValues,
    ...consumerGroupsValues,
    ...aclsValues,
    ...schemaRegistryValues,
  };
};
