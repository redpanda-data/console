import { file, Glob } from 'bun';

import { expect, test } from 'bun:test';

const legacyRuntime =
  /^(?:@radix-ui\/|@hello-pangea\/dnd$|@stepperize\/|cmdk$|sonner$|react-day-picker$|react-dropzone$|react-resizable-panels$)/;
const importPath = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

test('retains the shadcn registry and Tailwind entrypoint', async () => {
  expect(await file('components.json').json()).toMatchObject({
    aliases: { ui: '@/components/redpanda-ui' },
    tailwind: { css: 'src/globals.css', cssVariables: true },
    registries: { '@redpanda': expect.stringContaining('{name}') },
  });
});

test('interactive UI does not reintroduce replaced primitive runtimes', async () => {
  const violations: string[] = [];
  for await (const path of new Glob('src/**/*.{ts,tsx}').scan()) {
    if (path.includes('/protogen/')) {
      continue;
    }
    const source = await file(path).text();
    for (const match of source.matchAll(importPath)) {
      const outsideOwner = match[1].startsWith('@base-ui/react') && !path.startsWith('src/components/redpanda-ui/');
      if (legacyRuntime.test(match[1]) || outsideOwner) {
        violations.push(`${path}: ${match[1]}`);
      }
    }
  }
  expect(violations).toEqual([]);
});
