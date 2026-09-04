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

export const TANSTACK_CHUNK_PATTERN = /[\\/]node_modules[\\/]@tanstack[\\/]/;

export const tanstackRouterConfig = {
  target: 'react',
  autoCodeSplitting: true,
  // Route-level HMR finds its router through window.__TSR_ROUTER__; embedded in
  // cloud-ui's dev server that is the host's router and Console fails to load.
  // Component edits still hot-swap through Fast Refresh with this off.
  codeSplittingOptions: { addHmr: !process.env.PROXY_TARGET },
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  routeFileIgnorePattern: String.raw`\.(?:test|spec)\.[cm]?[jt]sx?$`,
  quoteStyle: 'single',
  semicolons: true,
} satisfies Partial<Config>;
