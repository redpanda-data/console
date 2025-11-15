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
import {
  AuthenticationConfigurationSchema,
  ScramConfigSchema,
  type ShadowLinkClientOptions,
  ShadowLinkClientOptionsSchema,
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
  type TLSSettings,
  TLSSettingsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import type { FormValues } from '../create/model';
import { TLS_MODE } from '../create/model';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';

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
 */
export const buildTLSSettings = (
  values: FormValues
):
  | { case: 'tlsFileSettings'; value: ReturnType<typeof create<typeof TLSFileSettingsSchema>> }
  | { case: 'tlsPemSettings'; value: ReturnType<typeof create<typeof TLSPEMSettingsSchema>> }
  | undefined => {
  if (!values.useMtls) {
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
    fieldMaskPaths.push('configurations.client_options.bootstrap_servers');
  }

  // Compare TLS settings - always include if mTLS is enabled (to ensure certs are sent)
  const tlsChanged = values.useTls !== originalValues.useTls || values.useMtls !== originalValues.useMtls;
  if (tlsChanged || values.useMtls) {
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
 * Extract TLS settings from shadow link client options
 */
const extractTLSSettings = (
  tlsCertsSettings: TLSSettings['tlsSettings'] | undefined
): Pick<FormValues, 'useMtls' | 'mtlsMode' | 'mtls'> => {
  if (!tlsCertsSettings) {
    return {
      useMtls: false,
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
      useMtls: true,
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
      useMtls: true,
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
    useMtls: false,
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
  | 'bootstrapServers'
  | 'useTls'
  | 'useMtls'
  | 'mtlsMode'
  | 'mtls'
  | 'useScram'
  | 'scramCredentials'
  | 'advanceClientOptions'
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
  _shadowLink: ShadowLink
): Pick<FormValues, 'topicsMode' | 'topics' | 'topicProperties'> => {
  // TODO: Parse _shadowLink.configurations?.topicMetadataSyncOptions when Topics tab is implemented
  // For now, return defaults
  return {
    topicsMode: 'all',
    topics: [],
    topicProperties: [],
  };
};

/**
 * Build default form values for consumer groups category from shadow link configurations
 */
export const buildDefaultConsumerGroupsValues = (
  _shadowLink: ShadowLink
): Pick<FormValues, 'enableConsumerOffsetSync' | 'consumersMode' | 'consumers'> => {
  // TODO: Parse _shadowLink.configurations?.consumerOffsetSyncOptions when Consumer Groups tab is implemented
  // For now, return defaults
  return {
    enableConsumerOffsetSync: false,
    consumersMode: 'all',
    consumers: [],
  };
};

/**
 * Build default form values for ACLs category from shadow link configurations
 */
export const buildDefaultACLsValues = (_shadowLink: ShadowLink): Pick<FormValues, 'aclsMode' | 'aclFilters'> => {
  // TODO: Parse _shadowLink.configurations?.securitySyncOptions when ACLs tab is implemented
  // For now, return defaults
  return {
    aclsMode: 'all',
    aclFilters: [],
  };
};
