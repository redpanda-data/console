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

/**
 * Federation module public exports.
 * Used by Module Federation v2.0 for Cloud UI integration.
 */

// biome-ignore lint/performance/noBarrelFile: required for Module Federation exports
export { ConsoleApp, default } from './console-app';
export type { Breadcrumb, ConsoleAppProps, SidebarItem } from './types';
