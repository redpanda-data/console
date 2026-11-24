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

import type { ShadowLink as ControlplaneShadowLink } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { FilterType, PatternType, ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';

import { mapSchemaRegistrySyncOptions, mapSchemaRegistrySyncOptionsToFormValues } from './schema-registry';
import { AUTH_METHOD, type FormValues, TLS_MODE } from '../create/model';
import {
  mapControlplaneStateToUnified,
  type UnifiedAuthenticationConfiguration,
  type UnifiedClientOptions,
  type UnifiedConsumerOffsetSyncOptions,
  type UnifiedRoleSyncOptions,
  type UnifiedSecuritySyncOptions,
  type UnifiedShadowLink,
  type UnifiedShadowLinkConfigurations,
  type UnifiedTLSSettings,
  type UnifiedTopicMetadataSyncOptions,
} from '../model';

type ControlplaneClientOptions = NonNullable<ControlplaneShadowLink['clientOptions']>;

function mapControlplaneTlsSettings(tlsSettings: ControlplaneClientOptions['tlsSettings']) {
  if (!tlsSettings?.enabled) {
    return;
  }
  return {
    enabled: true,
    tlsSettings: {
      case: 'tlsPemSettings',
      value: {
        ca: tlsSettings.ca ?? '',
        key: tlsSettings.key ?? '',
        cert: tlsSettings.cert ?? '',
        keyFingerprint: '',
      },
    },
  } satisfies UnifiedTLSSettings;
}

function mapControlplaneAuthentication(authProto: ControlplaneClientOptions['authenticationConfiguration']) {
  if (authProto?.authentication?.case === 'scramConfiguration') {
    const scram = authProto.authentication.value;
    return {
      authentication: {
        case: 'scramConfiguration',
        value: {
          username: scram.username,
          password: scram.password,
          scramMechanism: scram.scramMechanism,
        },
      },
    } satisfies UnifiedAuthenticationConfiguration;
  }
  const { plainConfig } = extractRawAuthConfigs(authProto);
  if (!plainConfig) {
    return;
  }
  return {
    authentication: {
      case: 'plainConfiguration',
      value: { username: plainConfig.username ?? '', password: plainConfig.password ?? '' },
    },
  } satisfies UnifiedAuthenticationConfiguration;
}

function mapControlplaneClientOptions(clientOptions: ControlplaneShadowLink['clientOptions']) {
  if (!clientOptions) {
    return;
  }

  const tlsSettings = mapControlplaneTlsSettings(clientOptions.tlsSettings);
  const authConfig = mapControlplaneAuthentication(clientOptions.authenticationConfiguration);

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
    effectiveMetadataMaxAgeMs: 0,
    effectiveConnectionTimeoutMs: 0,
    effectiveRetryBackoffMs: 0,
    effectiveFetchWaitMaxMs: 0,
    effectiveFetchMinBytes: 0,
    effectiveFetchMaxBytes: 0,
    effectiveFetchPartitionMaxBytes: 0,
  } satisfies UnifiedClientOptions;
}

function mapControlplaneTopicMetadataSyncOptions(options: ControlplaneShadowLink['topicMetadataSyncOptions']) {
  if (!options) {
    return;
  }

  return {
    autoCreateShadowTopicFilters: (options.autoCreateShadowTopicFilters ?? []).map((f) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
    syncedShadowTopicProperties: options.syncedShadowTopicProperties ?? [],
    excludeDefault: options.excludeDefault,
  } satisfies UnifiedTopicMetadataSyncOptions;
}

function mapControlplaneConsumerOffsetSyncOptions(options: ControlplaneShadowLink['consumerOffsetSyncOptions']) {
  if (!options) {
    return;
  }

  return {
    groupFilters: (options.groupFilters ?? []).map((f) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
  } satisfies UnifiedConsumerOffsetSyncOptions;
}

function mapControlplaneRoleSyncOptions(options: ControlplaneShadowLink['roleSyncOptions']) {
  if (!options) {
    return;
  }

  return {
    roleNameFilters: (options.roleNameFilters ?? []).map((f) => ({
      name: f.name,
      patternType: f.patternType,
      filterType: f.filterType,
    })),
  } satisfies UnifiedRoleSyncOptions;
}

function mapControlplaneSecuritySyncOptions(options: ControlplaneShadowLink['securitySyncOptions']) {
  if (!options) {
    return;
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
  } satisfies UnifiedSecuritySyncOptions;
}

function mapControlplaneConfigurations(sl: ControlplaneShadowLink) {
  if (!sl.clientOptions) {
    return;
  }

  return {
    clientOptions: mapControlplaneClientOptions(sl.clientOptions),
    topicMetadataSyncOptions: mapControlplaneTopicMetadataSyncOptions(sl.topicMetadataSyncOptions),
    consumerOffsetSyncOptions: mapControlplaneConsumerOffsetSyncOptions(sl.consumerOffsetSyncOptions),
    roleSyncOptions: mapControlplaneRoleSyncOptions(sl.roleSyncOptions),
    securitySyncOptions: mapControlplaneSecuritySyncOptions(sl.securitySyncOptions),
    schemaRegistrySyncOptions: mapSchemaRegistrySyncOptions(sl.schemaRegistrySyncOptions),
  } satisfies UnifiedShadowLinkConfigurations;
}

/**
 * Transform controlplane API response to unified model.
 * Used as fallback when dataplane query fails in embedded mode.
 * Controlplane sends flat CA/key/cert fields and may send auth directly in JSON
 * instead of a deserialized protobuf oneof. Live task status and synced topic
 * properties are only available from the dataplane.
 */
export function fromControlplaneShadowLink(sl: ControlplaneShadowLink) {
  const link: UnifiedShadowLink = {
    name: sl.name,
    id: sl.id,
    state: mapControlplaneStateToUnified(sl.state),
    shadowRedpandaId: sl.shadowRedpandaId,
    createdAt: sl.createdAt ? timestampDate(sl.createdAt) : undefined,
    updatedAt: sl.updatedAt ? timestampDate(sl.updatedAt) : undefined,
    configurations: mapControlplaneConfigurations(sl),
    tasksStatus: [],
    syncedShadowTopicProperties: [],
  };
  return link;
}

type RawScramConfig = { username?: string; password?: string; scramMechanism?: ScramMechanism };
type RawPlainConfig = { username?: string; password?: string };

type ControlplaneAuthConfig = NonNullable<ControlplaneClientOptions['authenticationConfiguration']>;

const extractWireAuthConfigs = (authConfig: ControlplaneAuthConfig) => {
  const raw = authConfig as unknown as {
    scramConfiguration?: RawScramConfig;
    plainConfiguration?: RawPlainConfig;
  };
  if (raw.scramConfiguration) {
    return { scramConfig: raw.scramConfiguration };
  }
  if (raw.plainConfiguration) {
    return { plainConfig: raw.plainConfiguration };
  }
  return {};
};

const extractRawAuthConfigs = (
  authConfig: NonNullable<ControlplaneShadowLink['clientOptions']>['authenticationConfiguration'] | undefined
) => {
  if (!authConfig) {
    return {};
  }
  const oneof = authConfig.authentication as { case?: string; value?: unknown } | undefined;
  if (oneof?.case === 'scramConfiguration') {
    return { scramConfig: oneof.value as RawScramConfig };
  }
  if (oneof?.case === 'plainConfiguration') {
    return { plainConfig: oneof.value as RawPlainConfig };
  }
  return extractWireAuthConfigs(authConfig);
};

const extractControlplaneAuthSettings = (clientOptions: ControlplaneShadowLink['clientOptions']) => {
  const { scramConfig, plainConfig } = extractRawAuthConfigs(clientOptions?.authenticationConfiguration);

  let authMethod: FormValues['authMethod'] = AUTH_METHOD.NONE;
  if (scramConfig) {
    authMethod = AUTH_METHOD.SCRAM;
  } else if (plainConfig) {
    authMethod = AUTH_METHOD.PLAIN;
  }

  return {
    authMethod,
    scramCredentials: scramConfig
      ? {
          username: scramConfig.username || '',
          password: scramConfig.password || '',
          mechanism: scramConfig.scramMechanism ?? ScramMechanism.SCRAM_SHA_256,
        }
      : undefined,
    plainCredentials: plainConfig
      ? {
          username: plainConfig.username || '',
          password: plainConfig.password || '',
        }
      : undefined,
  } satisfies Pick<FormValues, 'authMethod' | 'scramCredentials' | 'plainCredentials'>;
};

const isAllNameFilter = (filters: { name: string; patternType: PatternType; filterType: FilterType }[]) =>
  filters.length === 1 &&
  filters[0].name === '*' &&
  filters[0].patternType === PatternType.LITERAL &&
  filters[0].filterType === FilterType.INCLUDE;

const isAllACLFilter = (filters: ControlplaneShadowLink['securitySyncOptions']) => {
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

const buildControlplaneConnectionValues = (shadowLink: ControlplaneShadowLink) => {
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
  } satisfies Pick<FormValues, 'bootstrapServers' | 'useTls' | 'mtlsMode' | 'mtls' | 'advanceClientOptions'>;
};

const buildControlplaneTopicsValues = (shadowLink: ControlplaneShadowLink) => {
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
  } satisfies Pick<FormValues, 'topicsMode' | 'topics' | 'topicProperties' | 'excludeDefault'>;
};

/**
 * Build consumer groups form values from controlplane shadow link
 */
const buildControlplaneConsumerGroupsValues = (shadowLink: ControlplaneShadowLink) => {
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
  } satisfies Pick<FormValues, 'enableConsumerOffsetSync' | 'consumersMode' | 'consumers'>;
};

/**
 * Build roles form values from controlplane shadow link.
 * Unset options and an empty filter list both hydrate as specify mode with no
 * filters (role sync disabled), matching the dataplane hydration so an
 * untouched edit form never emits a role_sync_options mask.
 */
const buildControlplaneRolesValues = (shadowLink: ControlplaneShadowLink) => {
  const roleNameFilters = shadowLink.roleSyncOptions?.roleNameFilters ?? [];

  const isAllMode = isAllNameFilter(roleNameFilters);

  return {
    rolesMode: isAllMode ? 'all' : 'specify',
    roles: isAllMode
      ? []
      : roleNameFilters.map((filter) => ({
          name: filter.name,
          patternType: filter.patternType,
          filterType: filter.filterType,
        })),
  } satisfies Pick<FormValues, 'rolesMode' | 'roles'>;
};

const buildControlplaneACLsValues = (shadowLink: ControlplaneShadowLink) => {
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
  } satisfies Pick<FormValues, 'aclsMode' | 'aclFilters'>;
};

const buildControlplaneSchemaRegistryValues = (shadowLink: ControlplaneShadowLink) =>
  mapSchemaRegistrySyncOptionsToFormValues(shadowLink.schemaRegistrySyncOptions);

/**
 * Build form values from controlplane shadow link data
 * Maps the controlplane structure to form fields without type casts
 */
export const buildDefaultFormValuesFromControlplane = (shadowLink: ControlplaneShadowLink) => {
  const connectionValues = buildControlplaneConnectionValues(shadowLink);
  const authSettings = extractControlplaneAuthSettings(shadowLink.clientOptions);
  const topicsValues = buildControlplaneTopicsValues(shadowLink);
  const consumerGroupsValues = buildControlplaneConsumerGroupsValues(shadowLink);
  const rolesValues = buildControlplaneRolesValues(shadowLink);
  const aclsValues = buildControlplaneACLsValues(shadowLink);
  const schemaRegistryValues = buildControlplaneSchemaRegistryValues(shadowLink);

  const values: FormValues = {
    name: shadowLink.name ?? '',
    ...rolesValues,
    ...connectionValues,
    ...authSettings,
    ...topicsValues,
    ...consumerGroupsValues,
    ...aclsValues,
    ...schemaRegistryValues,
  };
  return values;
};
