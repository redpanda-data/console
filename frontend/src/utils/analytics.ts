/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Check if analytics/tracking is enabled based on the backend configuration.
 * This should be used to conditionally load tracking scripts and enable analytics features.
 * 
 * @returns true if analytics is enabled, false otherwise
 */
export function isAnalyticsEnabled(): boolean {
  const enabledFeatures = (window as any).ENABLED_FEATURES ? (window as any).ENABLED_FEATURES.split(',') : [];
  return !enabledFeatures.includes('no_analytics');
} 