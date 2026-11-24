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

import type { Config } from '@tanstack/router-plugin/rspack';

export const TANSTACK_CHUNK_PATTERN = /[\\/]node_modules[\\/]@tanstack[\\/]/u;

export const tanstackRouterConfig = {
  target: 'react',
  autoCodeSplitting: true,
  // WARNING: Disable route-level HMR on an embedded dev server; the global router is the host's. Component Fast Refresh still works.
  codeSplittingOptions: { addHmr: !process.env.PROXY_TARGET },
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  routeFileIgnorePattern: String.raw`\.(?:test|spec)\.[cm]?[jt]sx?$`,
  quoteStyle: 'single',
  semicolons: true,
} satisfies Partial<Config>;
