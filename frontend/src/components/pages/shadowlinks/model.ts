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

// ============================================================================
// Plain TypeScript Types - No Proto Dependencies
// These types decouple UI components from proto version mismatches
// ============================================================================

/**
 * Plain TypeScript name filter interface
 * Used for topic filters and consumer group filters
 */
export interface UnifiedNameFilter {
  name: string;
  patternType: number; // PatternType enum: 0=UNSPECIFIED, 1=LITERAL, 2=PREFIXED
  filterType: number; // FilterType enum: 0=UNSPECIFIED, 1=INCLUDE, 2=EXCLUDE
}

/**
 * Plain TypeScript ACL resource filter interface
 */
export interface UnifiedACLResourceFilter {
  resourceType: number; // ACLResource enum
  patternType: number; // ACLPattern enum
  name: string;
}

/**
 * Plain TypeScript ACL access filter interface
 */
export interface UnifiedACLAccessFilter {
  principal: string;
  operation: number; // ACLOperation enum
  permissionType: number; // ACLPermissionType enum
  host: string;
}

/**
 * Plain TypeScript ACL filter interface
 */
export interface UnifiedACLFilter {
  resourceFilter?: UnifiedACLResourceFilter;
  accessFilter?: UnifiedACLAccessFilter;
}

/**
 * Plain TypeScript TLS settings interface
 */
export interface UnifiedTLSSettings {
  enabled: boolean;
  tlsSettings?:
    | { case: 'tlsFileSettings'; value: { caPath?: string; keyPath?: string; certPath?: string } }
    | { case: 'tlsPemSettings'; value: { ca?: string; key?: string; cert?: string; keyFingerprint?: string } };
}

/**
 * Plain TypeScript SCRAM configuration interface
 */
export interface UnifiedScramConfig {
  username: string;
  password: string;
  scramMechanism: number;
}

/**
 * Plain TypeScript authentication configuration interface
 */
export interface UnifiedAuthenticationConfiguration {
  authentication?: { case: 'scramConfiguration'; value: UnifiedScramConfig };
}

/**
 * Plain TypeScript client options interface
 */
export interface UnifiedClientOptions {
  bootstrapServers: string[];
  clientId?: string;
  sourceClusterId?: string;
  tlsSettings?: UnifiedTLSSettings;
  authenticationConfiguration?: UnifiedAuthenticationConfiguration;
  // Mutable fields (for forms)
  metadataMaxAgeMs?: number;
  connectionTimeoutMs?: number;
  retryBackoffMs?: number;
  fetchWaitMaxMs?: number;
  fetchMinBytes?: number;
  fetchMaxBytes?: number;
  fetchPartitionMaxBytes?: number;
  // Effective fields (for display)
  effectiveMetadataMaxAgeMs?: number;
  effectiveConnectionTimeoutMs?: number;
  effectiveRetryBackoffMs?: number;
  effectiveFetchWaitMaxMs?: number;
  effectiveFetchMinBytes?: number;
  effectiveFetchMaxBytes?: number;
  effectiveFetchPartitionMaxBytes?: number;
}

/**
 * Plain TypeScript topic metadata sync options interface
 */
export interface UnifiedTopicMetadataSyncOptions {
  autoCreateShadowTopicFilters: UnifiedNameFilter[];
  syncedShadowTopicProperties: string[];
  excludeDefault: boolean;
}

/**
 * Plain TypeScript consumer offset sync options interface
 */
export interface UnifiedConsumerOffsetSyncOptions {
  groupFilters: UnifiedNameFilter[];
}

/**
 * Plain TypeScript security sync options interface
 */
export interface UnifiedSecuritySyncOptions {
  aclFilters: UnifiedACLFilter[];
}

/**
 * Plain TypeScript schema registry sync options interface
 */
export interface UnifiedSchemaRegistrySyncOptions {
  schemaRegistryShadowingMode?: { case: 'shadowSchemaRegistryTopic'; value: object } | { case: undefined };
}

/**
 * Unified configurations interface that works with both console and controlplane APIs.
 * Uses plain TypeScript types to decouple from proto version mismatches.
 */
export interface UnifiedShadowLinkConfigurations {
  clientOptions?: UnifiedClientOptions;
  topicMetadataSyncOptions?: UnifiedTopicMetadataSyncOptions;
  consumerOffsetSyncOptions?: UnifiedConsumerOffsetSyncOptions;
  securitySyncOptions?: UnifiedSecuritySyncOptions;
  schemaRegistrySyncOptions?: UnifiedSchemaRegistrySyncOptions;
}

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
};

/**
 * Unified ShadowLink model that works with both console and controlplane APIs
 */
export interface UnifiedShadowLink {
  name: string;
  id: string; // uid from console, id from controlplane
  state: UnifiedShadowLinkState;
  configurations?: UnifiedShadowLinkConfigurations;
  tasksStatus: ShadowLinkTaskStatus[];
  syncedShadowTopicProperties: string[];
  // Controlplane-only fields
  resourceGroupId?: string;
  shadowRedpandaId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// State Mapping Functions
// ============================================================================

/**
 * Map console API state (3 states) to unified state
 */
export function mapConsoleStateToUnified(state: CoreShadowLinkState): UnifiedShadowLinkState {
  // CoreShadowLinkState: UNSPECIFIED=0, ACTIVE=1, PAUSED=2
  switch (state) {
    case 1: // ACTIVE
      return UnifiedShadowLinkState.ACTIVE;
    case 2: // PAUSED
      return UnifiedShadowLinkState.PAUSED;
    default:
      return UnifiedShadowLinkState.UNSPECIFIED;
  }
}

/**
 * Map controlplane API state (8 states) to unified state
 */
export function mapControlplaneStateToUnified(state: ControlplaneShadowLinkState): UnifiedShadowLinkState {
  // ControlplaneShadowLinkState: UNSPECIFIED=0, CREATING=1, CREATION_FAILED=2, DELETING=3, DELETION_FAILED=4, ACTIVE=5, PAUSED=6
  switch (state) {
    case 1: // CREATING
      return UnifiedShadowLinkState.CREATING;
    case 2: // CREATION_FAILED
      return UnifiedShadowLinkState.CREATION_FAILED;
    case 3: // DELETING
      return UnifiedShadowLinkState.DELETING;
    case 4: // DELETION_FAILED
      return UnifiedShadowLinkState.DELETION_FAILED;
    case 5: // ACTIVE
      return UnifiedShadowLinkState.ACTIVE;
    case 6: // PAUSED
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
export function getShadowLinkStateLabel(state: ShadowLinkState): string {
  switch (state) {
    case ShadowLinkState.ACTIVE:
      return 'Running';
    case ShadowLinkState.PAUSED:
      return 'Paused';
    default:
      return 'Unknown';
  }
}
