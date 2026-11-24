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

import type { ShadowLink_State as ControlplaneShadowLinkState } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  type ShadowLinkState as CoreShadowLinkState,
  ShadowLinkState,
  type ShadowLinkTaskStatus,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

/**
 * Plain TypeScript name filter interface
 * Used for topic filters and consumer group filters
 *
 * PatternType: 0 unspecified, 1 literal, 2 prefixed. FilterType: 0 unspecified, 1 include, 2 exclude.
 */
export type UnifiedNameFilter = {
  name: string;
  patternType: number;
  filterType: number;
};

/**
 * Plain TypeScript ACL resource filter interface
 *
 * Uses ACLResource and ACLPattern wire values.
 */
export type UnifiedACLResourceFilter = {
  resourceType: number;
  patternType: number;
  name: string;
};

/**
 * Plain TypeScript ACL access filter interface
 *
 * Uses ACLOperation and ACLPermissionType wire values.
 */
export type UnifiedACLAccessFilter = {
  principal: string;
  operation: number;
  permissionType: number;
  host: string;
};

/**
 * Plain TypeScript ACL filter interface
 */
export type UnifiedACLFilter = {
  resourceFilter?: UnifiedACLResourceFilter;
  accessFilter?: UnifiedACLAccessFilter;
};

/**
 * Plain TypeScript TLS settings interface
 */
export type UnifiedTLSSettings = {
  enabled: boolean;
  tlsSettings?:
    | { case: 'tlsFileSettings'; value: { caPath?: string; keyPath?: string; certPath?: string } }
    | { case: 'tlsPemSettings'; value: { ca?: string; key?: string; cert?: string; keyFingerprint?: string } };
};

/**
 * Plain TypeScript SCRAM configuration interface
 */
export type UnifiedScramConfig = {
  username: string;
  password: string;
  scramMechanism: number;
};

/**
 * Plain TypeScript authentication configuration interface
 */
export type UnifiedAuthenticationConfiguration = {
  authentication?:
    | { case: 'scramConfiguration'; value: UnifiedScramConfig }
    | { case: 'plainConfiguration'; value: { username: string; password: string } };
};

/**
 * Plain TypeScript client options interface
 */
export type UnifiedClientOptions = {
  bootstrapServers: string[];
  clientId?: string;
  sourceClusterId?: string;
  tlsSettings?: UnifiedTLSSettings;
  authenticationConfiguration?: UnifiedAuthenticationConfiguration;
  metadataMaxAgeMs?: number;
  connectionTimeoutMs?: number;
  retryBackoffMs?: number;
  fetchWaitMaxMs?: number;
  fetchMinBytes?: number;
  fetchMaxBytes?: number;
  fetchPartitionMaxBytes?: number;
  effectiveMetadataMaxAgeMs?: number;
  effectiveConnectionTimeoutMs?: number;
  effectiveRetryBackoffMs?: number;
  effectiveFetchWaitMaxMs?: number;
  effectiveFetchMinBytes?: number;
  effectiveFetchMaxBytes?: number;
  effectiveFetchPartitionMaxBytes?: number;
};

/**
 * Plain TypeScript topic metadata sync options interface
 */
export type UnifiedTopicMetadataSyncOptions = {
  autoCreateShadowTopicFilters: UnifiedNameFilter[];
  syncedShadowTopicProperties: string[];
  excludeDefault: boolean;
};

/**
 * Plain TypeScript consumer offset sync options interface
 */
export type UnifiedConsumerOffsetSyncOptions = {
  groupFilters: UnifiedNameFilter[];
};

/**
 * Plain TypeScript role sync options interface
 */
export type UnifiedRoleSyncOptions = {
  roleNameFilters: UnifiedNameFilter[];
};

/**
 * Plain TypeScript security sync options interface
 */
export type UnifiedSecuritySyncOptions = {
  aclFilters: UnifiedACLFilter[];
};

/**
 * Plain TypeScript HTTP Basic auth interface for the source Schema Registry.
 * The password itself is never mapped — only whether/when it was set.
 */
export type UnifiedSchemaRegistryBasicAuth = {
  username: string;
  passwordSet: boolean;
  passwordSetAt?: Date;
};

/**
 * Plain TypeScript source-to-destination Schema Registry context mapping
 */
export type UnifiedSchemaRegistryContextMapping = {
  source: string;
  destination: string;
};

/**
 * Plain TypeScript options for Schema Registry replication over the REST API.
 * Durations are seconds; undefined means unset/zero, so the cluster default applies.
 *
 * UnsupportedSchemaFeaturePolicy: 0 unspecified, 1 fail sync, 2 remove unsupported features.
 */
export type UnifiedSchemaRegistryApiOptions = {
  sourceUrl: string;
  /** undefined = requests are sent without authentication */
  basicAuth?: UnifiedSchemaRegistryBasicAuth;
  tlsSettings?: UnifiedTLSSettings;
  tailIntervalSeconds?: number;
  effectiveTailIntervalSeconds?: number;
  fullSyncIntervalSeconds?: number;
  effectiveFullSyncIntervalSeconds?: number;
  maxSourceRequestsPerSecond?: number;
  effectiveMaxSourceRequestsPerSecond?: number;
  /** undefined = the entire source Schema Registry is replicated */
  sourceFilter?: { contexts: string[]; subjects: string[] };
  /** undefined = source context names are preserved (same as identity) */
  destinationMapping?: { case: 'identity' } | { case: 'exact'; mappings: UnifiedSchemaRegistryContextMapping[] };
  unsupportedSchemaFeaturePolicy: number;
  paused: boolean;
};

/**
 * Plain TypeScript schema registry sync options interface
 */
export type UnifiedSchemaRegistrySyncOptions = {
  schemaRegistryShadowingMode?:
    | { case: 'shadowSchemaRegistryTopic'; value: object }
    | { case: 'shadowSchemaRegistryApi'; value: UnifiedSchemaRegistryApiOptions }
    | { case: undefined };
};

/**
 * Unified configurations interface that works with both console and controlplane APIs.
 * Uses plain TypeScript types to decouple from proto version mismatches.
 */
export type UnifiedShadowLinkConfigurations = {
  clientOptions?: UnifiedClientOptions;
  topicMetadataSyncOptions?: UnifiedTopicMetadataSyncOptions;
  consumerOffsetSyncOptions?: UnifiedConsumerOffsetSyncOptions;
  /** undefined = not configured, or the source API does not expose role sync (controlplane) */
  roleSyncOptions?: UnifiedRoleSyncOptions;
  securitySyncOptions?: UnifiedSecuritySyncOptions;
  schemaRegistrySyncOptions?: UnifiedSchemaRegistrySyncOptions;
};

/**
 * Unified state values combining console (3 states) and controlplane (8 states) APIs
 */
export const UnifiedShadowLinkState = {
  UNSPECIFIED: 0,
  ACTIVE: 1,
  PAUSED: 2,
  CREATING: 3,
  CREATION_FAILED: 4,
  DELETING: 5,
  DELETION_FAILED: 6,
  FAILING_OVER: 7,
  FAILED_OVER: 8,
  /** A failover phase timed out and the failover stopped; failing over again resumes it. */
  FAILOVER_FAULTED: 9,
} as const;

export type UnifiedShadowLinkState = (typeof UnifiedShadowLinkState)[keyof typeof UnifiedShadowLinkState];

/**
 * Labels for displaying state in UI
 */
export const UnifiedShadowLinkStateLabel: Record<UnifiedShadowLinkState, string> = {
  [UnifiedShadowLinkState.UNSPECIFIED]: 'Unknown',
  [UnifiedShadowLinkState.ACTIVE]: 'Active',
  [UnifiedShadowLinkState.PAUSED]: 'Paused',
  [UnifiedShadowLinkState.CREATING]: 'Creating',
  [UnifiedShadowLinkState.CREATION_FAILED]: 'Creation Failed',
  [UnifiedShadowLinkState.DELETING]: 'Deleting',
  [UnifiedShadowLinkState.DELETION_FAILED]: 'Deletion Failed',
  [UnifiedShadowLinkState.FAILING_OVER]: 'Failing over',
  [UnifiedShadowLinkState.FAILED_OVER]: 'Failed over',
  [UnifiedShadowLinkState.FAILOVER_FAULTED]: 'Failover stopped',
};

/**
 * Unified ShadowLink model that works with both console and controlplane APIs
 *
 * Uses the Console UID or the control-plane ID, depending on which API returned the link.
 */
export type UnifiedShadowLink = {
  name: string;
  id: string;
  state: UnifiedShadowLinkState;
  configurations?: UnifiedShadowLinkConfigurations;
  tasksStatus: ShadowLinkTaskStatus[];
  syncedShadowTopicProperties: string[];
  shadowRedpandaId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Map console API state (3 states) to unified state
 *
 * Console state numbers 1–5 represent active, paused, failing over, failed over and failover faulted.
 */
export function mapConsoleStateToUnified(state: CoreShadowLinkState): UnifiedShadowLinkState {
  switch (state) {
    case 1:
      return UnifiedShadowLinkState.ACTIVE;
    case 2:
      return UnifiedShadowLinkState.PAUSED;
    case 3:
      return UnifiedShadowLinkState.FAILING_OVER;
    case 4:
      return UnifiedShadowLinkState.FAILED_OVER;
    case 5:
      return UnifiedShadowLinkState.FAILOVER_FAULTED;
    default:
      return UnifiedShadowLinkState.UNSPECIFIED;
  }
}

/**
 * Map controlplane API state (8 states) to unified state
 *
 * Control-plane numbers 1–6 represent creating, creation failed, deleting, deletion failed, active and paused; they differ from Console states.
 */
export function mapControlplaneStateToUnified(state: ControlplaneShadowLinkState): UnifiedShadowLinkState {
  switch (state) {
    case 1:
      return UnifiedShadowLinkState.CREATING;
    case 2:
      return UnifiedShadowLinkState.CREATION_FAILED;
    case 3:
      return UnifiedShadowLinkState.DELETING;
    case 4:
      return UnifiedShadowLinkState.DELETION_FAILED;
    case 5:
      return UnifiedShadowLinkState.ACTIVE;
    case 6:
      return UnifiedShadowLinkState.PAUSED;
    default:
      return UnifiedShadowLinkState.UNSPECIFIED;
  }
}

/**
 * Converts ShadowLinkState proto enum to human-readable string.
 * Use this when you have the raw proto state from API responses.
 * For unified state, use UnifiedShadowLinkStateLabel instead.
 */
export function getShadowLinkStateLabel(state: ShadowLinkState) {
  switch (state) {
    case ShadowLinkState.ACTIVE:
      return 'Running';
    case ShadowLinkState.PAUSED:
      return 'Paused';
    case ShadowLinkState.FAILING_OVER:
      return 'Failing over';
    case ShadowLinkState.FAILED_OVER:
      return 'Failed over';
    case ShadowLinkState.FAILOVER_FAULTED:
      return 'Failover stopped';
    default:
      return 'Unknown';
  }
}
