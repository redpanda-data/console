import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = new URL('../', import.meta.url);

// Keep interrupted probes outside Git without losing project imports or type inference.
function createLintProject(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'console-biome-test-'));
  const file = join(directory, 'probe.tsx');
  symlinkSync(fileURLToPath(new URL('src', frontendRoot)), join(directory, 'src'), 'dir');
  symlinkSync(fileURLToPath(new URL('node_modules', frontendRoot)), join(directory, 'node_modules'), 'dir');
  writeFileSync(
    join(directory, 'biome.json'),
    JSON.stringify({
      extends: [fileURLToPath(new URL('biome.jsonc', frontendRoot))],
      vcs: { enabled: false },
    })
  );
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ESNext', jsx: 'react-jsx' } })
  );
  writeFileSync(file, source.replaceAll('../src/', fileURLToPath(new URL('src/', frontendRoot))));
  writeFileSync(
    join(directory, 'promise-source.ts'),
    'export function persist(): Promise<void> { return Promise.resolve(); }'
  );
  return { directory, file };
}

function lint(source: string) {
  const { directory, file } = createLintProject(source);
  try {
    return spawnSync(
      [
        process.execPath,
        'run',
        'biome',
        'lint',
        file,
        '--config-path',
        directory,
        '--diagnostic-level=error',
        '--max-diagnostics=none',
      ],
      { cwd: fileURLToPath(frontendRoot), stdout: 'pipe', stderr: 'pipe' }
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('frontend lint policy', () => {
  test('rejects unsafe JavaScript and dynamic Tailwind class fragments', () => {
    const result = lint(`
      export const empty = new Object();
      export const negate = (value: string) => -value;
      export const deferred = new Promise((resolve) => { return resolve(1); });
      export const Badge = ({ color }: { color: string }) => <div className={\`bg-\${color}\`} />;
    `);
    const diagnostics = result.stdout.toString() + result.stderr.toString();

    expect(diagnostics).toContain('lint/nursery/noObjectConstructor');
    expect(diagnostics).toContain('lint/nursery/noUnsafeUnaryMinus');
    expect(diagnostics).toContain('lint/nursery/noPromiseExecutorReturn');
    expect(diagnostics).toContain('lint/nursery/useTailwindStaticClassStrings');
    expect(result.exitCode).toBe(1);
  });

  test('accepts explicit conversion and complete Tailwind classes', () => {
    const result = lint(`
      export const empty = {};
      export const negate = (value: string) => -Number(value);
      export const deferred = new Promise((resolve) => { resolve(1); });
      export const Badge = ({ active }: { active: boolean }) => (
        <div className={active ? 'bg-primary' : 'bg-destructive'} />
      );
    `);

    expectNoRuleDiagnostics(result, [
      'noObjectConstructor',
      'noUnsafeUnaryMinus',
      'noPromiseExecutorReturn',
      'useTailwindStaticClassStrings',
    ]);
  });
});

import { spawnSync } from 'bun';

test('enforces the default ten-statement limit and component appearance policy', () => {
  const rejected = lint(`
    import { Button } from '../src/components/redpanda-ui/components/button';
    export function count() { let value = 0; ${'value += 1;'.repeat(9)} return value; }
    export const Example = () => <Button className="bg-primary" disabled />;
  `);
  const diagnostics = rejected.stdout.toString() + rejected.stderr.toString();
  expect(diagnostics).toContain('lint/nursery/noExcessiveStatementsPerFunction');
  expect(diagnostics).toContain('lint/nursery/noTailwindRestyledComponents');
  expect(rejected.exitCode).toBe(1);
  const accepted = lint(`
    import { Button } from '../src/components/redpanda-ui/components/button';
    export function count() { let value = 0; ${'value += 1;'.repeat(8)} return value; }
    export const Example = () => <Button disabled variant="brand" />;
  `);
  expectNoRuleDiagnostics(accepted, ['noExcessiveStatementsPerFunction', 'noTailwindRestyledComponents']);
});

test('enforces custom label associations from the Ultracite preset', () => {
  const rejected = lint(`
    import { Label } from '../src/components/redpanda-ui/components/label';
    export const Example = () => <Label>Orphan label</Label>;
  `);
  const diagnostics = rejected.stdout.toString() + rejected.stderr.toString();
  expect(diagnostics).toContain('lint/a11y/noLabelWithoutControl');
  expect(rejected.exitCode).toBe(1);
  const accepted = lint(`
    import { Label } from '../src/components/redpanda-ui/components/label';
    import { Input } from '../src/components/redpanda-ui/components/input';
    export const Example = () => <><Label htmlFor="field">Field</Label><Input id="field" /></>;
  `);
  expectNoRuleDiagnostics(accepted, ['noLabelWithoutControl']);
});

test.each([
  [
    'imported floating promises',
    'lint/nursery/noFloatingPromises',
    "import { persist } from './promise-source'; export function saveLater() { persist(); }",
  ],
  ['promise conditions', 'lint/nursery/noMisusedPromises', 'export const allowed = Promise.resolve(true) ? 1 : 0;'],
  [
    'async callbacks passed to a synchronous API',
    'lint/nursery/noMisusedPromises',
    'declare function schedule(callback: () => void): void; schedule(() => Promise.reject(new Error("save failed")));',
  ],
  ['unnecessary async', 'lint/suspicious/useAwait', 'export async function count() { return 1; }'],
  [
    'unexplained sequential awaits',
    'lint/performance/noAwaitInLoops',
    'export async function saveAll(tasks: Array<() => Promise<void>>) { for (const save of tasks) { await save(); } }',
  ],
  ['production any types', 'lint/suspicious/noExplicitAny', 'export function identity(value: any) { return value; }'],
  [
    'unsafe optional-chain dereferences',
    'lint/correctness/noUnsafeOptionalChaining',
    'export function length(value?: { name: string }) { return (value?.name).length; }',
  ],
  [
    'missing reactive effect dependencies',
    'lint/correctness/useExhaustiveDependencies',
    `import { useEffect } from 'react';
     export function Example({ value }: { value: string }) {
       useEffect(function updateTitle() { document.title = value; }, []);
       return null;
     }`,
  ],
])('rejects %s as an error', (_label, category, source) => {
  const result = lint(source);
  expect(result.stdout.toString() + result.stderr.toString()).toContain(category);
  expect(result.exitCode).toBe(1);
});

test('accepts awaited, returned and rejection-handled promises', () => {
  const result = lint(`
    import { persist } from './promise-source';
    export async function saveAll(tasks: Array<() => Promise<void>>) { await Promise.all(tasks.map(save => save())); }
    export function save() { return persist(); }
    export function saveInBackground() { persist().catch(error => reportError(error)); }
  `);
  expectNoRuleDiagnostics(result, ['noFloatingPromises', 'noMisusedPromises', 'useAwait', 'noAwaitInLoops']);
});

function expectNoRuleDiagnostics(result: ReturnType<typeof lint>, rules: string[]) {
  const diagnostics = result.stdout.toString() + result.stderr.toString();
  expect([0, 1]).toContain(result.exitCode);
  expect(diagnostics).not.toContain('configuration ━');
  expect(diagnostics).not.toContain(' parse ━');
  for (const rule of rules) {
    expect(diagnostics).not.toContain(`/${rule}`);
  }
}
