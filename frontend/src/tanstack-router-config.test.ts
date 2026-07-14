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

import { TANSTACK_CHUNK_PATTERN, tanstackRouterConfig } from '../tanstack-router.config';

describe('tanstackRouterConfig', () => {
  it('configures file-based React routes with automatic code splitting', () => {
    expect(tanstackRouterConfig).toMatchObject({
      autoCodeSplitting: true,
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      routeFileIgnorePattern: String.raw`\.(?:test|spec)\.[cm]?[jt]sx?$`,
      routeFileIgnorePrefix: '-',
      routesDirectory: './src/routes',
      semicolons: true,
      target: 'react',
    });
  });

  it('matches TanStack packages across operating systems', () => {
    expect(TANSTACK_CHUNK_PATTERN.test('/app/node_modules/@tanstack/react-router/dist/index.js')).toBe(true);
    expect(TANSTACK_CHUNK_PATTERN.test(String.raw`C:\app\node_modules\@tanstack\react-query\dist\index.js`)).toBe(true);
    expect(TANSTACK_CHUNK_PATTERN.test('/app/node_modules/@redpanda-data/ui/dist/index.js')).toBe(false);
  });
});
