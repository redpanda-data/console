/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ErrorInfo } from 'react';

import type { Breadcrumb, SetConfigArguments, SidebarItem } from '../config';

/**
 * Props interface for the federated Console App component.
 * Used by Cloud UI host to integrate Console via Module Federation v2.0.
 */
export type ConsoleAppProps = {
  /**
   * Function to get fresh access token from Cloud UI.
   * Called before API requests to ensure token is valid.
   * Also called automatically on 401 errors to refresh token and retry.
   */
  getAccessToken: () => Promise<string>;

  /**
   * Redpanda cluster ID to connect to.
   */
  clusterId: string;

  /**
   * Initial route path to navigate to on mount.
   * @default '/topics'
   */
  initialPath?: string;

  /**
   * Path to navigate to. When this prop changes, Console navigates to the new path.
   * Use this to programmatically navigate Console from the host.
   * If not provided, navigation is only triggered by user interactions within Console.
   */
  navigateTo?: string;

  /**
   * Callback when Console route changes.
   * Host can use this to update browser URL.
   */
  onRouteChange?: (path: string) => void;

  /**
   * Callback when Console sidebar items change.
   * Host uses this to render sidebar navigation.
   */
  onSidebarItemsChange?: (items: SidebarItem[]) => void;

  /**
   * Callback when Console breadcrumbs change.
   * Host uses this to render breadcrumb navigation.
   */
  onBreadcrumbsChange?: (items: Breadcrumb[]) => void;

  /**
   * Callback when an unhandled error occurs in Console.
   * Host can use this for error tracking/reporting.
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;

  /**
   * Configuration overrides for Console.
   * Partial subset of SetConfigArguments.
   */
  config: Partial<SetConfigArguments>;

  /**
   * Feature flags to enable/disable features in Console.
   * Passed from Cloud UI LaunchDarkly integration.
   */
  featureFlags?: Record<string, boolean>;

  /**
   * Cloud's view of the shadow links around this cluster. Redpanda doesn't record a link's source,
   * so only the host can say which clusters read from this one, or show a source cluster's box from
   * its shadow cluster. Updates as the host polls; omitted when the host has nothing to share.
   */
  shadowLinkTopology?: ShadowLinkTopology;

  /**
   * Opens a page of another cluster in the organization, such as a shadow link's source cluster.
   * `path` is a Console path on that cluster, for example `/shadowlinks?tab=source`.
   */
  onOpenCluster?: (clusterId: string, path: string) => void;
};

export type ShadowLinkPeerBoxState = 'unboxed' | 'boxing' | 'boxed' | 'unboxing';

/** Another cluster's shadow box, as the host last read it. */
export type ShadowLinkPeerBox =
  | { status: 'loading' }
  /** The cluster doesn't serve the Shadow Box API, or the viewer can't read it. */
  | { status: 'unavailable' }
  | {
      status: 'known';
      state: ShadowLinkPeerBoxState;
      revision: number;
      /** ISO 8601. */
      stateChangedAt?: string;
      exemptPrincipals: string[];
      allowAllReads: boolean;
    };

export type ShadowLinkSource =
  | { kind: 'cloud'; clusterId: string; clusterName: string; box: ShadowLinkPeerBox }
  /** A source Cloud doesn't manage, such as a seed-URL link to a self-hosted cluster. */
  | { kind: 'external'; bootstrapServers: string[] };

export type ShadowLinkReader = {
  linkName: string;
  shadowClusterId: string;
  shadowClusterName: string;
  /** The SASL user the link authenticates to this cluster as, when it uses SASL. */
  principal?: string;
};

export type ShadowLinkTopology = {
  /** This cluster's name in Cloud, for confirmations that ask the user to type it. */
  clusterName: string;
  /** Links elsewhere in the organization whose source is this cluster. */
  readers: ShadowLinkReader[];
  /** Where each shadow link on this cluster reads from, keyed by link name. */
  sources: Record<string, ShadowLinkSource>;
  /**
   * True while the host is still resolving some links, so `readers` and `sources` may be missing
   * entries. Once false, a link missing from `sources` is one the host couldn't resolve.
   */
  resolving: boolean;
  /**
   * True when the host couldn't resolve every link, for example because a request failed, so
   * `readers` may be missing some even once `resolving` is false.
   */
  readersIncomplete: boolean;
};

/**
 * Re-export types for convenience
 */
export type { Breadcrumb, SidebarItem } from '../config';
