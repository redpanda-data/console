import type { AliasOptions } from 'vite';

/**
 * Shared resolve aliases for all vitest configs.
 *
 * - `@redpanda-data/ui` and `monaco-editor` are redirected to their ESM
 *   entry points because Vitest is ESM-first and the packages ship both
 *   CJS and ESM builds.
 * - `@bufbuild/buf` is rewritten to `@bufbuild/protobuf/dist/esm/index.js`.
 *   This is an intentional shim for generated code that imports from
 *   `@bufbuild/buf` (the Connect/Buf CLI-side package) but should resolve
 *   to the protobuf runtime at test time. Removing this alias breaks
 *   module resolution in unit tests that touch protobuf-generated types.
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
