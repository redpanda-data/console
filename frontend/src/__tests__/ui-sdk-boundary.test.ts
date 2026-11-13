import { file, Glob } from 'bun';

import { expect, test } from 'bun:test';

const legacyRuntime =
  /^(?:@base-ui\/react(?:\/|$)|@radix-ui\/|@hello-pangea\/dnd$|@stepperize\/|cmdk$|sonner$|react-day-picker$|react-dropzone$|react-resizable-panels$)/;
const importPath = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

test('interactive UI does not reintroduce replaced primitive runtimes', async () => {
  const violations: string[] = [];
  for await (const path of new Glob('src/**/*.{ts,tsx}').scan()) {
    if (path.includes('/protogen/')) {
      continue;
    }
    const source = await file(path).text();
    for (const match of source.matchAll(importPath)) {
      if (legacyRuntime.test(match[1])) {
        violations.push(`${path}: ${match[1]}`);
      }
    }
  }
  expect(violations).toEqual([]);
});
