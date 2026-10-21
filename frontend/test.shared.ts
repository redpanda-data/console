// Copyright 2026 Redpanda Data, Inc.

import type { RstestConfig } from '@rstest/core';

import { fileURLToPath } from 'node:url';

const fromHere = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/** Resolution aliases for bundled integration tests. */
export const sharedAliases = {
  '@bufbuild/buf$': '@bufbuild/protobuf/dist/esm/index.js',
  'monaco-editor$': 'monaco-editor/esm/vs/editor/editor.api.js',
};

export const sharedCoverage = {
  provider: 'v8',
  reporters: ['text-summary', 'html', 'lcov', 'json-summary', 'json'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/protogen/**',
    'src/routeTree.gen.ts',
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    'src/**/*.stories.tsx',
  ],
} satisfies NonNullable<RstestConfig['coverage']>;

export { fromHere };
