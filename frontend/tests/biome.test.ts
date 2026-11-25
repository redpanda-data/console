import { spawnSync } from 'bun';

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = new URL('../', import.meta.url);

// Keep interrupted probes outside Git without losing project imports or type inference.
function createLintProject(source: string, filename = 'probe.tsx') {
  const directory = mkdtempSync(join(tmpdir(), 'console-biome-test-'));
  const file = join(directory, filename);
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

function lint(source: string, filename = 'probe.tsx') {
  const { directory, file } = createLintProject(source, filename);
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

    expect(
      ruleFailures(result, [
        'noObjectConstructor',
        'noUnsafeUnaryMinus',
        'noPromiseExecutorReturn',
        'useTailwindStaticClassStrings',
      ])
    ).toStrictEqual([]);
  });
});

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
  expect(ruleFailures(accepted, ['noExcessiveStatementsPerFunction', 'noTailwindRestyledComponents'])).toStrictEqual(
    []
  );
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
  expect(ruleFailures(accepted, ['noLabelWithoutControl'])).toStrictEqual([]);
});

test.each([
  [
    'GET request bodies',
    'lint/nursery/noInvalidFetchOptions',
    "export const response = fetch('/', { method: 'GET', body: 'payload' });",
  ],
  [
    'non-global matchAll regexes',
    'lint/nursery/useGlobalRegexInMatchAll',
    "export const matches = 'value'.matchAll(/value/);",
  ],
  [
    'non-global replaceAll regexes',
    'lint/nursery/useGlobalRegexInReplaceAll',
    "export const replaced = 'value'.replaceAll(/value/, 'next');",
  ],
  [
    'duplicate union members',
    'lint/nursery/noDuplicateTypeConstituents',
    'export type Value = string | number | string;',
  ],
  [
    'non-contextual caught error names',
    'lint/nursery/useCatchErrorName',
    'export const result = Promise.resolve(1).catch(failure => reportError(failure));',
  ],
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
  expect(ruleFailures(result, ['noFloatingPromises', 'noMisusedPromises', 'useAwait', 'noAwaitInLoops'])).toStrictEqual(
    []
  );
});

test('accepts POST bodies, global regexes and distinct union members', () => {
  const result = lint(`
    export const response = fetch('/', { method: 'POST', body: 'payload' });
    export const matches = 'value'.matchAll(/value/g);
    export const replaced = 'value'.replaceAll(/value/g, 'next');
    export type Value = string | number;
  `);
  expect(result.exitCode).toBe(0);
});

test('accepts contextual error names and open license literals', () => {
  const result = lint(`
    export const result = Promise.resolve(1).catch(loginError => reportError(loginError));
    export type LicenseSource = 'console' | 'cluster' | (string & {});
    export type LicenseType = 'free_trial' | 'open_source' | 'enterprise' | (string & {});
  `);
  expect(result.exitCode).toBe(0);
});

test('fails lint checks on warnings', () => {
  const { directory, file } = createLintProject(
    '// biome-ignore lint/suspicious/noConsole: intentionally unused to probe warning enforcement.\nexport const value = 1;\n'
  );
  try {
    const result = spawnSync(
      [
        process.execPath,
        'run',
        'lint:check:file',
        file,
        '--config-path',
        directory,
        '--formatter-enabled=false',
        '--assist-enabled=false',
      ],
      { cwd: fileURLToPath(frontendRoot), stdout: 'pipe', stderr: 'pipe' }
    );
    expect(result.stdout.toString() + result.stderr.toString()).toContain('suppressions/unused');
    expect(result.exitCode).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function commandFailures(result: ReturnType<typeof lint>, diagnostics: string): string[] {
  const failures: string[] = [];
  if (![0, 1].includes(result.exitCode)) {
    failures.push(`Unexpected exit code: ${result.exitCode}`);
  }
  if (diagnostics.includes('configuration ━')) {
    failures.push('Configuration error');
  }
  if (diagnostics.includes(' parse ━')) {
    failures.push('Parse error');
  }
  return failures;
}

function ruleFailures(result: ReturnType<typeof lint>, rules: string[]): string[] {
  const diagnostics = result.stdout.toString() + result.stderr.toString();
  return [...commandFailures(result, diagnostics), ...rules.filter((rule) => diagnostics.includes(`/${rule}`))];
}

test('requires ordinary error causes while preserving AggregateError cleanup chains', () => {
  const rejected = lint(
    `export function fail() { try { throw new Error('setup'); } catch (error) { throw new Error('cleanup'); } }`
  );
  expect(rejected.stdout.toString() + rejected.stderr.toString()).toContain('lint/style/useErrorCause');
  expect(rejected.exitCode).toBe(1);
  const accepted = lint(`
    export function fail() {
      try { throw new Error('setup'); } catch (error) {
        // biome-ignore lint/style/useErrorCause: AggregateError stores the caught cause in its third constructor argument.
        throw new AggregateError([error], 'cleanup', { cause: error });
      }
    }
  `);
  expect(ruleFailures(accepted, ['useErrorCause'])).toStrictEqual([]);
});

test.each([
  ['probe.scss', '$brand: red; .card { --card-color: $brand; }', 'lint/nursery/noMissingScssInterpolation'],
  ['probe.yaml', 'true: unsupported-boolean-key\n', 'lint/nursery/noYamlBooleanKeys'],
  ['README.md', '# Main\n### Skipped\n', 'lint/nursery/useConsistentHeadingLevel'],
  ['README.md', '## No title\n', 'lint/nursery/useTopLevelHeading'],
  ['README.md', '# First\n# Second\n', 'lint/nursery/useSingleTopLevelHeading'],
  ['README.md', '# Main\n```\nexample\n```\n', 'lint/nursery/useFencedCodeLanguage'],
])('checks newly supported %s sources', (filename, source, category) => {
  const result = lint(source, filename);
  expect(result.stdout.toString() + result.stderr.toString()).toContain(category);
  expect(result.exitCode).toBe(1);
});

test('accepts Sass interpolation, CSS Modules scoping and string YAML keys', () => {
  const sass = lint('$brand: red; .card { --card-color: #{$brand}; }', 'probe.scss');
  const module = lint(':global(.host) .card { color: var(--color-foreground); }', 'probe.module.scss');
  const yaml = lint('"true": supported-string-key\n', 'probe.yaml');
  expect([sass.exitCode, module.exitCode, yaml.exitCode]).toStrictEqual([0, 0, 0]);
});

test.each([
  [
    'README.md',
    '# Guide\n- Literal [ ] stays.\n\n```ts\nconst example:any=null;\n```\n',
    '# Guide\n\n- Literal [ ] stays.\n\n```ts\nconst example:any=null;\n```\n',
  ],
  ['probe.yaml', 'message: \'[ ]\'\nprocessors:\n - mapping: |\n     root = " [ ] "\n', null],
])('preserves literal YAML and Markdown code fences in %s', (filename, source, formatted) => {
  const { directory, file } = createLintProject(source, filename);
  try {
    const result = spawnSync([process.execPath, 'run', 'biome', 'check', '--write', '--config-path', directory, file], {
      cwd: fileURLToPath(frontendRoot),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(formatted ?? source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  ['noBufferConstructor', 'export const bytes = new Buffer(4);', 'export const bytes = Buffer.alloc(4);'],
  [
    'noConfusingArraySplice',
    'export function replace(items: string[], value: string) { items.splice(0, 1, value); }',
    'export function replace(items: string[], value: string) { if (items.length > 0) items[0] = value; }',
  ],
  [
    'noDynamicRequire',
    'export function load(name: string) { return require(name); }',
    'export const load = import("./promise-source");',
  ],
  [
    'noDynamicRequire',
    'export function load(name: string) { return import(name); }',
    'export function load() { return import("./promise-source"); }',
  ],
  [
    'noLateCurrentTargetAccess',
    'document.body.addEventListener("click", async event => { await Promise.resolve(); console.log(event.currentTarget); });',
    'document.body.addEventListener("click", async event => { const target = event.currentTarget; await Promise.resolve(); console.log(target); });',
  ],
  [
    'noMisusedSpread',
    'export const user = { ...Promise.resolve({ name: "user" }) };',
    'export async function load() { return { ...(await Promise.resolve({ name: "user" })) }; }',
  ],
  [
    'noTripleSlashReference',
    '/// <reference path="./promise-source.ts" />\nexport const ready = true;',
    'export { persist } from "./promise-source";',
  ],
  [
    'useTopLevelRequire',
    'export function load() { return require("node:fs"); }',
    'const fs = require("node:fs"); export { fs };',
  ],
  [
    'useValidNamespaceImports',
    'import * as operations from "./promise-source"; export const save = operations.missing;',
    'import * as operations from "./promise-source"; export const save = operations.persist;',
  ],
])('enforces Biome 2.6.8 %s with valid counterexamples', (rule, rejected, accepted) => {
  expect(ruleFailures(lint(rejected), [rule])).toContain(rule);
  expect(ruleFailures(lint(accepted), [rule])).toStrictEqual([]);
});

test.each([
  ['noYamlEmptyMapKeys', 'probe.yaml', ': value\n', 'null: value\n'],
  ['noYamlEmptyMapValues', 'probe.yaml', 'value:\n', 'value: null\n'],
  ['noYamlEmptySequenceEntries', 'probe.yaml', 'values:\n  -\n', 'values:\n  - null\n'],
  [
    'usePackageJsonValidLicense',
    'package.json',
    '{ "name": "fixture", "license": "GPL3" }',
    '{ "name": "fixture", "license": "MIT OR Apache-2.0" }',
  ],
])('enforces Biome 2.6.8 %s without rejecting explicit values', (rule, filename, rejected, accepted) => {
  expect(ruleFailures(lint(rejected, filename), [rule])).toContain(rule);
  expect(ruleFailures(lint(accepted, filename), [rule])).toStrictEqual([]);
});

test.each([
  ['useCalledWith', 'expect(notify).toHaveBeenCalled();', 'expect(notify).toHaveBeenCalledWith("ready");'],
  ['useExpectToHaveBeenCalled', 'expect(notify).toHaveBeenCalledTimes(0);', 'expect(notify).not.toHaveBeenCalled();'],
  [
    'useExpectToHaveBeenCalledTimes',
    'expect(notify.mock.calls).toHaveLength(1);',
    'expect(notify).toHaveBeenCalledTimes(1);',
  ],
])('enforces %s for imported Rstest expectations', (rule, rejected, accepted) => {
  const source = (assertion: string) => `
    import { expect, rs, test } from '@rstest/core';
    test('notifies readiness', () => { const notify = rs.fn(); notify('ready'); ${assertion} });
  `;
  expect(ruleFailures(lint(source(rejected), 'probe.test.tsx'), [rule])).toContain(rule);
  expect(ruleFailures(lint(source(accepted), 'probe.test.tsx'), [rule])).toStrictEqual([]);
});

test('requires restorable spies for the mock spellings Biome supports', () => {
  const rule = 'useSpyOn';
  const source = (assignment: string) => `
    import { rs as jest, test } from '@rstest/core';
    test('controls time', () => { ${assignment} });
  `;
  expect(ruleFailures(lint(source('Date.now = jest.fn(() => 10);'), 'probe.test.tsx'), [rule])).toContain(rule);
  expect(
    ruleFailures(lint(source('jest.spyOn(Date, "now").mockReturnValue(10);'), 'probe.test.tsx'), [rule])
  ).toStrictEqual([]);
});

test('tracks conditional promise results and narrowed boolean values', () => {
  const rejected = lint(`
    type Result<T> = T extends true ? Promise<void> : void;
    declare function persist(): Result<true>;
    export function save() { persist(); }
    export function enabled(value: boolean | undefined) {
      if (typeof value !== 'boolean') return false;
      return Boolean(value);
    }
  `);
  expect(ruleFailures(rejected, ['noFloatingPromises', 'noUselessTypeConversion'])).toStrictEqual([
    'noFloatingPromises',
    'noUselessTypeConversion',
  ]);
});

test.each([
  [
    'noCanvasToImage',
    'export function copy(source: CanvasRenderingContext2D, target: CanvasRenderingContext2D) { target.putImageData(source.getImageData(0, 0, 2, 2), 0, 0); }',
    'export function copy(source: CanvasRenderingContext2D, target: CanvasRenderingContext2D) { target.drawImage(source.canvas, 0, 0); }',
  ],
  [
    'noImmediateMutation',
    'const entries: string[] = []; entries.push("row"); export { entries };',
    'export const entries = ["row"];',
  ],
  [
    'noTailwindConflictingClasses',
    'export const Layout = () => <div className="flex grid" />;',
    'export const Layout = () => <div className="flex md:grid" />;',
  ],
  [
    'noUselessBind',
    'export const run = (() => 42).bind(null);',
    'export const run = function (this: { value: number }) { return this.value; }.bind({ value: 42 });',
  ],
  [
    'noUselessDefaultAssignment',
    'export const title = ({ label = "empty" }: { label: string }) => label;',
    'export const title = ({ label = "empty" }: { label?: string }) => label;',
  ],
  [
    'noUselessNestedTernary',
    'export const shade = (active: boolean, selected: boolean) => active ? (selected ? "high" : "low") : "low";',
    'export const shade = (active: boolean, selected: boolean) => active && selected ? "high" : "low";',
  ],
  [
    'noUselessSetConstruction',
    'const left = new Set([1]); const right = new Set([2]); export const all = left.union(new Set(right));',
    'const left = new Set([1]); const right = new Set([2]); export const all = left.union(right);',
  ],
  [
    'useConsistentIndexedObjectStyle',
    'export type Counts = { [name: string]: number };',
    'export type Counts = Record<string, number>;',
  ],
  [
    'useEarlyContinue',
    'export function collect(values: string[]) { for (const v of values) { if (v !== "") { console.log(v); console.log(v.length); } } }',
    'export function collect(values: string[]) { for (const v of values) { if (v === "") { continue; } console.log(v); console.log(v.length); } }',
  ],
  ['noExcessiveClassesPerFile', 'export class First {} export class Second {}', 'export class First {}'],
])('enforces the new %s policy', (rule, rejected, accepted) => {
  expect(ruleFailures(lint(rejected), [rule])).toContain(rule);
  expect(ruleFailures(lint(accepted), [rule])).toStrictEqual([]);
});

test.each([
  ['noExpectToHaveBeenCalledOnce', 'expect(send).toHaveBeenCalledOnce();', 'expect(send).toHaveBeenCalledTimes(1);'],
  ['noReturnInTest', 'return expect(rows).toHaveLength(1);', 'expect(rows).toHaveLength(1);'],
  ['useExpectToHaveLength', 'expect(rows.length).toBe(1);', 'expect(rows).toHaveLength(1);'],
  ['useExpectToStrictEqual', 'expect(rows).toEqual(["done"]);', 'expect(rows).toStrictEqual(["done"]);'],
])('enforces %s with the Rstest imports', (rule, rejected, accepted) => {
  const source = (assertion: string) =>
    [
      "import { expect, rs, test } from '@rstest/core';",
      "test('reads a completed row', () => { const rows = ['done']; const send = rs.fn(); send(rows);",
      assertion,
      '});',
    ].join('\n');
  expect(ruleFailures(lint(source(rejected), 'probe.test.tsx'), [rule])).toContain(rule);
  expect(ruleFailures(lint(source(accepted), 'probe.test.tsx'), [rule])).toStrictEqual([]);
});

test('requires explicit test runner imports', () => {
  const rule = 'noTestGlobals';
  const source = 'test("reads a row", () => { expect(["done"]).toHaveLength(1); });';
  expect(ruleFailures(lint(source, 'probe.test.tsx'), [rule])).toContain(rule);
  expect(
    ruleFailures(lint(`import { expect, test } from '@rstest/core';\n${source}`, 'probe.test.tsx'), [rule])
  ).toStrictEqual([]);
});

test.each([
  [
    'useTanstackQueryExhaustiveDependencies',
    "const useRow = (id: string) => useQuery({ queryKey: ['row'], queryFn: () => Promise.resolve(id) });",
    "const useRow = (id: string) => useQuery({ queryKey: ['row', id], queryFn: () => Promise.resolve(id) });",
  ],
  [
    'useTanstackQueryMutationPropertyOrder',
    'const useSave = () => useMutation({ mutationFn: async () => 7, onError: () => 0, onMutate: () => 1 });',
    'const useSave = () => useMutation({ mutationFn: async () => 7, onMutate: () => 1, onError: () => 0 });',
  ],
])('enforces %s without rearranging unrelated keys', (rule, rejected, accepted) => {
  const source = (declaration: string) =>
    `import { useMutation, useQuery } from '@tanstack/react-query';\n${declaration}`;
  expect(ruleFailures(lint(source(rejected)), [rule])).toContain(rule);
  expect(ruleFailures(lint(source(accepted)), [rule])).toStrictEqual([]);
});
