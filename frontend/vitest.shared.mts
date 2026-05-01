import { fileURLToPath } from 'node:url';
import type { AliasOptions } from 'vite';

const fromHere = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

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
 * - `date-fns-tz` is stubbed (matches the rsbuild aliases). `@redpanda-data/ui`
 *   pulls in `date-fns-tz` v2 module-level, which then reaches into private
 *   `date-fns/_lib/...` paths that v4 no longer exports. The only caller
 *   (`<DateTimeInput>`) was replaced; the stub keeps imports resolvable.
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
  {
    find: /^date-fns-tz\/zonedTimeToUtc$/,
    replacement: fromHere('./src/utils/vendor/zonedTimeToUtc.ts'),
  },
  {
    find: /^date-fns-tz$/,
    replacement: fromHere('./src/utils/vendor/date-fns-tz-shim.ts'),
  },
];
