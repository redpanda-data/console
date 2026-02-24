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
};

/**
 * Re-export types for convenience
 */
export type { Breadcrumb, SidebarItem } from '../config';
