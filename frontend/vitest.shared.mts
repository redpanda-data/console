import type { AliasOptions } from 'vite';

/**
 * Shared resolve aliases for all vitest configs.
 *
 * Redirects @redpanda-data/ui, @bufbuild/buf, and monaco-editor imports to
 * ESM versions that Vitest can resolve correctly.
 */
export const sharedAliases: AliasOptions = [
  {
    find: /^@redpanda-data\/ui$/,
    replacement: '@redpanda-data/ui/dist/index.js',
  },
  {
    find: /^@bufbuild\/buf$/,
    replacement: '@bufbuild/protobuf/dist/esm/index.js',
  },
  {
    find: /^monaco-editor$/,
    replacement: 'monaco-editor/esm/vs/editor/editor.api.js',
  },
];
