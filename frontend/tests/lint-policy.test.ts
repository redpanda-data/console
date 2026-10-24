import { spawnSync } from 'bun';

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each fixture is linted through `bun run lint:policy` in an OS-temp project whose
// config extends the checked-in one, so the real script, config and plugin run.
type Fixture = { file: string; source: string; reports: string[] };
type Diagnostic = { code?: string; message: string; severity: string; filename: string };
type PolicyRun = { exitCode: number; stderr: string; files: number; diagnostics: Diagnostic[] };

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const H = 'no-hookless-use-function';
const W = 'no-real-time-wait-in-tests';
const P = 'no-polling-loop-in-tests';
const C = 'no-wall-clock-in-tests';
const T = 'no-test-timeout-or-unreasoned-skip';
const S = 'require-suppression-reason';
const N = 'no-native-title-tooltip';
const CONSOLE_CODE = /^console\((.+)\)$/;
const CRASH_OUTPUT = /panic|failed to (load|parse)|error running/i;
const times = (rule: string, count: number) => Array.from({ length: count }, () => rule);

const suppressions: Fixture[] = [
  {
    file: 'suppression-missing.tsx',
    reports: times(S, 7),
    source: `
// biome-ignore lint/suspicious/noExplicitAny:
export type Loose = any;
// biome-ignore lint/style/useConst: <explanation>
export let mutable = 1;
/* biome-ignore-all lint/complexity/noVoid: todo */
// biome-ignore-start lint/a11y/useButtonType: ok
export const Element = () => <div>{/* biome-ignore lint/a11y/noAutofocus: needed */}</div>;
// biome-ignore-end lint/a11y/useButtonType
// @ts-expect-error
export const typed: number = 'text';
// @ts-expect-error: todo later
export const typedAgain: number = 'text';
`,
  },
  {
    file: 'suppression-forbidden.ts',
    reports: times(S, 3),
    source: `// @ts-nocheck
// @ts-ignore because the generated client types lag behind the API
export const value: number = 'text';
export const other: number = /* @ts-ignore */ 'text';
`,
  },
  {
    file: 'suppression-directives.tsx',
    reports: times(S, 3),
    source: `
// oxlint-disable-next-line console/no-native-title-tooltip
export const First = () => <span title="Copied" />;
/* eslint-disable-next-line console/no-native-title-tooltip */
export const Second = () => <span title="Copied" />;
// oxlint-disable-next-line console/no-native-title-tooltip -- todo
export const Third = () => <span title="Copied" />;
`,
  },
  {
    file: 'suppression-valid.tsx',
    reports: [],
    source: `
// biome-ignore lint/suspicious/noExplicitAny: the plugin API hands rules untyped options
export type Loose = any;
// biome-ignore lint/style/noRestrictedImports(node:fs): build scripts read the manifest synchronously
/* biome-ignore-all lint/complexity/noVoid: fire-and-forget telemetry owns its own errors */
// @ts-expect-error The SDK omits the legacy field until v3 ships
export const typed: number = 'text';
// oxlint-disable-next-line console/no-native-title-tooltip -- the third-party widget reads this attribute
export const Widget = () => <span title="Copied" />;
/* eslint-disable console/no-native-title-tooltip -- legacy embed markup mirrors the vendor snippet */
export const Legacy = () => <span title="Vendor" />;
/* eslint-enable console/no-native-title-tooltip */
export const prose = '// @ts-ignore and /* biome-ignore lint/x: */ are fixture text';
export const template = \`
  // oxlint-disable-next-line console/no-native-title-tooltip
  // @ts-nocheck
\`;
// Prefer @ts-expect-error over @ts-ignore when a suppression is unavoidable.
export const Text = () => <p>{'@ts-ignore is copy here'}</p>;
`,
  },
];

const tooltips: Fixture[] = [
  {
    file: 'tooltip-native.tsx',
    reports: times(N, 5),
    source: `
import { Button } from 'components/redpanda-ui/components/button';
import { Input as TextField } from '../redpanda-ui/components/input';
import * as Registry from '@/components/redpanda-ui/components/button';

export const Native = () => <span title="Copy" />;
export const Clear = () => <Button onClick={() => undefined} title="Clear (Esc)" />;
export const Field = () => <TextField title="Name" />;
export const Namespaced = () => <Registry.Button title="Save" />;
export const Logo = () => <img alt="" src="/logo.svg" title="Logo" />;
`,
  },
  {
    file: 'tooltip-allowed.tsx',
    reports: [],
    source: `
import { Card } from 'components/card';
import { Button } from 'components/redpanda-ui/components/button';
import { Button as LegacyButton } from 'components/legacy/button';

export const Embeds = () => (
  <>
    <iframe src="/docs" title="Documentation" />
    <object data="/chart.svg" title="Throughput chart" />
    <embed src="/clip.mp4" title="Clip" />
  </>
);
export const Icon = () => (
  <svg role="img">
    <title>Throughput</title>
    <g title="Series"><a href="#series" title="Series link" /></g>
  </svg>
);
export const Abbreviation = () => <abbr title="Kafka Connect">KC</abbr>;
export const Domain = () => <Card title="Topics" />;
export const Other = () => <LegacyButton title="Domain prop" />;
export const Labelled = () => <Button aria-label="Clear search" onClick={() => undefined} />;
export const Spread = (props: { title: string }) => <div {...props} />;
`,
  },
];

const hooks: Fixture[] = [
  {
    file: 'hooks-hookless.ts',
    reports: times(H, 5),
    source: `
import { useState } from 'react';

const FONTS = ['Inter'];
export function useFontFamily(weight: number) { return FONTS[weight]; }
export const useUpdateSettings = () => (patch: unknown) => persist(patch);
export const useLater = function () { return () => useState(0); };
export function useMiddleware(app: { use(handler: () => void): void }) { app.use(() => undefined); }
export default function useDefault() { return 1; }
function persist(_patch: unknown) {}
`,
  },
  {
    file: 'hooks-valid.tsx',
    reports: [],
    source: `
import { useQuery as fetchTopics } from '@connectrpc/connect-query';
import * as React from 'react';
import { use, use as readResource, useState as useLocalState } from 'react';
import { create } from 'zustand';

const ThemeContext = React.createContext('light');
export function useCount() { const [count] = useLocalState(0); return count; }
export const useTheme = () => use(ThemeContext);
export const useResource = (promise: Promise<string>) => readResource(promise);
export const useTopics = () => fetchTopics(listTopics);
export const useNamespaced = () => React.useContext(ThemeContext);
export function useDefaulted(value = React.useId()) { return value; }
export const useImmediately = () => (() => useLocalState(0))();
export function useConditional(enabled: boolean) { if (enabled) { return useTheme(); } return null; }
export function user() { return null; }
export const useStore = create(() => ({}));
declare const listTopics: unknown;
`,
  },
];

const waits: Fixture[] = [
  {
    file: 'wait-sleeps.test.ts',
    reports: times(W, 10),
    source: `
import { test } from 'bun:test';
import { setTimeout as pause } from 'node:timers/promises';
import * as timers from 'timers/promises';
import { promisify } from 'node:util';

const sleep = promisify(setTimeout);
test('waits for the debounce', async () => {
  await Bun.sleep(50);
  await pause(10);
  await timers.setImmediate();
  await timers.scheduler.wait(5);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await new Promise((done) => { setTimeout(() => done(undefined), 5); });
  await new Promise(requestAnimationFrame);
  await new Promise((resolve) => process.nextTick(resolve));
  await sleep(1);
});
test('waits on a deferred timer', async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 10);
  await promise;
});
`,
  },
  {
    file: 'wait-browser.spec.ts',
    reports: [W],
    source: `
import { expect, test } from '../shared/e2e';

test('opens the topic', async ({ page }) => {
  await page.waitForTimeout(1000);
  await page.waitForResponse('**/topics');
  await page.getByRole('button').waitFor();
  await expect(page.getByText('Ready')).toBeVisible();
});
`,
  },
  {
    file: 'wait-scoped.test.tsx',
    reports: times(W, 2),
    source: `
import { beforeEach, describe, rs, test } from '@rstest/core';

describe('with fake timers', () => {
  beforeEach(() => { rs.useFakeTimers(); });
  test('is driven', async () => {
    const elapsed = new Promise((resolve) => setTimeout(resolve, 10));
    await rs.advanceTimersByTimeAsync(10);
    await elapsed;
  });
});
describe('without fake timers', () => {
  test('sleeps for real', async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
});
test('waits a frame after faking only timeouts', async () => {
  rs.useFakeTimers({ toFake: ['setTimeout'] });
  await new Promise((resolve) => requestAnimationFrame(resolve));
});
`,
  },
  {
    // One test's fake timers, or an after hook's, do not cover module code or other tests.
    file: 'wait-mixed.test.tsx',
    reports: times(W, 3),
    source: `
import { afterEach, describe, rs as clock, test } from '@rstest/core';

const settled = new Promise((resolve) => setTimeout(resolve, 10));
test('drives its own fake timers', async () => {
  clock.useFakeTimers();
  const elapsed = new Promise((resolve) => setTimeout(resolve, 10));
  await clock.advanceTimersByTimeAsync(10);
  await elapsed;
  await settled;
});
test('does not inherit fake timers from another test', async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
});
describe('teardown', () => {
  afterEach(() => { clock.useFakeTimers(); });
  test('is not faked by an after hook', async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
});
`,
  },
  {
    file: 'wait-allowed.test.tsx',
    reports: [],
    source: `
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';

describe('autosave', () => {
  beforeEach(() => { rs.useFakeTimers(); });
  afterEach(() => { rs.useRealTimers(); });
  test('flushes after the debounce', async () => {
    const saved = new Promise((resolve) => setTimeout(resolve, 500));
    await rs.advanceTimersByTimeAsync(500);
    await saved;
  });
});
test('fakes timers inside the test', async () => {
  rs.useFakeTimers();
  const ready = new Promise((resolve) => { setTimeout(resolve, 50); });
  rs.advanceTimersByTime(50);
  await ready;
});
test('waits for the animation event', async () => {
  const element = document.createElement('div');
  const ended = new Promise((resolve) => element.addEventListener('animationend', resolve, { once: true }));
  element.dispatchEvent(new Event('animationend'));
  await ended;
});
test('schedules the stream message as tested behavior', () => {
  const onMessage = rs.fn();
  setTimeout(() => onMessage('tick'), 0);
  expect(onMessage).not.toHaveBeenCalled();
});
`,
  },
  {
    file: 'polling-loops.test.tsx',
    reports: [...times(P, 5), ...times(W, 3)],
    source: `
import { expect, test } from '@rstest/core';
import { screen } from '@testing-library/react';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('polls until the row renders', async () => {
  while (!screen.queryByText('orders')) {
    await tick();
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if (screen.queryByText('orders')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (let flush = 0; flush < 5; flush++) {
    await Promise.resolve();
  }
  do {
    await null;
  } while (screen.queryAllByRole('row').length === 0);
  for (const delay of [10, 50, 100]) {
    if (screen.queryByText('orders')) return;
    await Bun.sleep(delay);
  }
  expect(screen.getByText('orders')).toBeVisible();
});
`,
  },
  {
    file: 'polling-data-loops.test.ts',
    reports: [],
    source: `
import { expect, test } from 'bun:test';

test('drains the stream and saves every row', async () => {
  const reader = new ReadableStream<number>({ start(controller) { controller.enqueue(1); controller.close(); } }).getReader();
  const chunks: number[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  for (const chunk of chunks) {
    await save(chunk);
  }
  for (let index = 0; index < chunks.length; index++) {
    await Promise.resolve(save(chunks[index]));
  }
  for (let step = 0; step < 3; step++) {
    emit(step);
    await Promise.resolve();
  }
  expect(chunks).toEqual([1]);
});
async function save(_chunk: number) {}
function emit(_step: number) {}
`,
  },
];

const clocks: Fixture[] = [
  {
    file: 'clock-wall.spec.ts',
    reports: times(C, 7),
    source: `
import { expect, test } from '../shared/e2e';

const TOPIC = \`orders-\${Date.now()}\`;
test('measures the render', async ({ page }) => {
  const started = performance.now();
  await page.goto(\`/topics/\${TOPIC}\`);
  expect(performance.now() - started).toBeLessThan(1000);
  expect(new Date().getFullYear()).toBe(2026);
  expect(Date()).toContain('2026');
  expect(process.hrtime.bigint()).toBeGreaterThan(0n);
  expect(globalThis.Date.now()).toBeGreaterThan(0);
});
`,
  },
  {
    file: 'clock-scoped.test.tsx',
    reports: times(C, 4),
    source: `
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

describe('pinned', () => {
  beforeEach(() => { rs.setSystemTime(new Date('2026-01-01')); });
  const collectedAt = Date.now();
  test('reads the pinned clock', () => { expect(Date.now()).toBeGreaterThan(collectedAt); });
});
describe('real', () => {
  test('reads the real clock', () => { expect(Date.now()).toBeGreaterThan(0); });
});
test('reads before pinning', () => {
  const before = Date.now();
  rs.setSystemTime(new Date('2026-01-01'));
  expect(performance.now()).toBeGreaterThan(before);
});
`,
  },
  {
    // A pinned clock covers the rest of its own test only, through aliased or namespaced Bun APIs.
    file: 'clock-mixed.test.ts',
    reports: times(C, 2),
    source: `
import * as bunTest from 'bun:test';

const fixture = { createdAt: Date.now() };
bunTest.test('pins its own clock', () => {
  bunTest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  bunTest.expect(Date.now()).toBe(1767225600000);
});
bunTest.test('does not inherit the pinned clock', () => {
  bunTest.expect(Date.now()).toBeGreaterThan(fixture.createdAt);
});
bunTest.test('fakes through the namespaced jest object', () => {
  bunTest.jest.useFakeTimers();
  bunTest.expect(new Date().getFullYear()).toBeGreaterThan(0);
});
`,
  },
  {
    file: 'clock-controlled.test.tsx',
    reports: [],
    source: `
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

describe('relative timestamps', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    rs.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  test('formats an hour ago', () => {
    expect(formatAge(Date.now() - 3_600_000)).toBe('1 hour ago');
    expect(new Date().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(performance.now()).toBe(0);
  });
});
test('pins the clock inside the test', () => {
  rs.setSystemTime(new Date(2026, 0, 1));
  expect(new Date().getMonth()).toBe(0);
});
test('mocks the clock source', () => {
  const now = rs.fn(() => Date.now());
  rs.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-01').getTime());
  expect(now).not.toHaveBeenCalled();
});
test('uses fixed times', () => {
  expect(new Date('2026-01-01').getTime()).toBe(Date.UTC(2026, 0, 1));
});
function formatAge(_timestamp: number) { return '1 hour ago'; }
`,
  },
  {
    file: 'clock-bun.test.ts',
    reports: [],
    source: `
import { expect, mock, setSystemTime as pinClock, test } from 'bun:test';

test('pins the clock with an aliased Bun API', () => {
  pinClock(new Date('2026-01-01T00:00:00Z'));
  expect(Date.now()).toBe(1767225600000);
});
mock.module('./clock', () => ({ now: () => Date.now() }));
`,
  },
];

const skips: Fixture[] = [
  {
    file: 'skip-overrides.test.ts',
    reports: times(T, 7),
    source: `
import { beforeAll, describe, jest, setDefaultTimeout, test } from 'bun:test';

setDefaultTimeout(30_000);
jest.setTimeout(10_000);
beforeAll(() => undefined, 20_000);
test('loads slowly', () => undefined, 15_000);
test('retries', () => undefined, { retry: 3 });
test('repeats', () => undefined, { repeats: 3 });
test.each([1, 2])('case %d', () => undefined, 5000);
describe('suite', () => { test('inner', () => undefined); });
xit('legacy', () => undefined);
`,
  },
  {
    file: 'skip-overrides.spec.ts',
    reports: times(T, 5),
    source: `
import { rs } from '@rstest/core';
import { test as base } from '../shared/e2e';

const test = base.extend({});
test.describe.configure({ mode: 'serial', retries: 2 });
test.describe.configure({ mode: 'serial' });
test('waits for the cluster', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.slow();
  testInfo.setTimeout(60_000);
  await page.goto('/');
});
rs.setConfig({ testTimeout: 60_000 });
`,
  },
  {
    file: 'skip-static.spec.ts',
    reports: times(T, 8),
    source: `
import { test } from '../shared/e2e';

test.skip('creates a connector', async () => {});
// TODO: fix later
test.skip('deletes a connector', async () => {});
// UX-1216
test.skip('renames a connector', async () => {});
test.describe.skip('connectors', () => {});
test.todo('covers the empty state');
test.fixme('edits a connector', async () => {});
test('skips at runtime', async () => { test.skip(); });
test.skipIf(true)('static condition', async () => {});
`,
  },
  {
    file: 'skip-tracked.spec.ts',
    reports: [],
    source: `
import { test } from '../shared/e2e';

// UX-1216: the multi-host delete confirmation flow is unstable on CI
test.skip('deletes ACLs across hosts', async () => {});

// biome-ignore lint/suspicious/noSkippedTests: brokers drop headers until redpanda-data/console#2210 merges
test.skip('produces headers', async () => {});

test.skip('restores topic config', async () => {
  // TODO(UX-1219): un-skip once the restore endpoint returns the full config
});
test.todo('UX-1220 covers the empty partitions state for compacted topics');
test.describe.skipIf(!!process.env.CI)('debug bundle', () => {});
test('skips without the feature', async ({ page }) => {
  test.skip(!process.env.ENTERPRISE, 'needs an enterprise license');
  if (!process.env.SHADOW_LINK) {
    test.skip();
  }
  await page.goto('/');
});
test('platform gate', { skip: process.platform === 'win32' }, async () => {});
test.skip(true, 'https://github.com/redpanda-data/console/issues/2210 crashes the webkit renderer');
test.fixme(({ browserName }) => browserName === 'webkit', 'webkit drops focus after reload');
`,
  },
];

// Test helpers share the test-code scope, so moving a wait out of a spec does not hide it.
const helpers: Fixture[] = [
  {
    file: 'tests/shared/connector.utils.ts',
    reports: [W, C],
    source: `
import { expect, type Page } from './e2e';

export async function openConnector(page: Page) {
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Ready')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1000);
}
export const connectorName = () => \`connector-\${Date.now()}\`;
`,
  },
  {
    file: 'tests/test-variant-console/utils/shadowlink-page.ts',
    reports: [P, W],
    source: `
import type { Page } from '../../shared/e2e';

export class ShadowlinkPage {
  constructor(readonly page: Page) {}
  async waitForReplication() {
    while (!(await this.page.getByText('Replicated').isVisible())) {
      await this.page.reload();
      await this.page.waitForTimeout(500);
    }
  }
}
`,
  },
  {
    file: 'src/components/pages/topics/topic-test-helpers.ts',
    reports: [W],
    source: `
export const flushRender = () => new Promise((resolve) => setTimeout(resolve, 0));
`,
  },
  {
    file: 'tests/test-variant-console/quotas/quota-display.cases.ts',
    reports: [C, W],
    source: `
import { expect, test } from '../../shared/e2e';

export const quotaDisplayCases = () => {
  test('shows the quota', async ({ page }) => {
    const clientId = \`display-\${Date.now()}\`;
    await page.waitForTimeout(500);
    await expect(page.getByText(clientId)).toBeVisible();
  });
};
`,
  },
];

// The same patterns outside tests and test helpers are product code.
const scopeControl: Fixture = {
  file: 'scope-control.ts',
  reports: [],
  source: `
export async function waitUntil(ready: () => boolean) {
  while (!ready()) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await Bun.sleep(1);
  return Date.now();
}
test.skip('not a test file', () => undefined);
test('not a test file', () => undefined, 5000);
`,
};

const clusters = { suppressions, tooltips, hooks, waits, clocks, skips, helpers };
const fixtures = [...Object.values(clusters).flat(), scopeControl];
let project = '';
let mixed: PolicyRun;
let clean: PolicyRun;

function createProject() {
  const directory = mkdtempSync(join(tmpdir(), 'console-lint-policy-'));
  const { scripts } = JSON.parse(readFileSync(join(frontendRoot, 'package.json'), 'utf8'));
  symlinkSync(join(frontendRoot, 'node_modules'), join(directory, 'node_modules'), 'dir');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, scripts }));
  writeFileSync(join(directory, '.oxlintrc.json'), JSON.stringify({ extends: [join(frontendRoot, '.oxlintrc.json')] }));
  for (const fixture of fixtures) {
    mkdirSync(dirname(join(directory, fixture.file)), { recursive: true });
    writeFileSync(join(directory, fixture.file), fixture.source);
  }
  return directory;
}

function runPolicy(files: string[]): PolicyRun {
  const result = spawnSync([process.execPath, 'run', 'lint:policy', '--', '--format', 'json', ...files], {
    cwd: project,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stderr = result.stderr.toString();
  const output = result.stdout.toString();
  const report = JSON.parse(output.slice(output.indexOf('{')));
  return { exitCode: result.exitCode, stderr, files: report.number_of_files, diagnostics: report.diagnostics };
}

function reportsFor(run: PolicyRun, file: string) {
  return run.diagnostics
    .filter((diagnostic) => diagnostic.filename === file)
    .map((diagnostic) => diagnostic.code?.replace(CONSOLE_CODE, '$1') ?? `uncoded: ${diagnostic.message}`)
    .sort();
}

beforeAll(() => {
  project = createProject();
  mixed = runPolicy(fixtures.map((fixture) => fixture.file));
  clean = runPolicy(fixtures.filter((fixture) => fixture.reports.length === 0).map((fixture) => fixture.file));
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

test.each(Object.entries(clusters))('%s fixtures report exactly the expected console rules', (_name, cases) => {
  const actual = cases.map((fixture) => ({ file: fixture.file, reports: reportsFor(mixed, fixture.file) }));
  const expected = cases.map((fixture) => ({ file: fixture.file, reports: fixture.reports.toSorted() }));
  expect(actual).toEqual(expected);
});

test('fails the script with error-severity diagnostics after linting every fixture', () => {
  expect(mixed.files).toBe(fixtures.length);
  expect(mixed.diagnostics.length).toBeGreaterThan(0);
  expect(mixed.diagnostics.filter((diagnostic) => diagnostic.severity !== 'error')).toEqual([]);
  expect(mixed.exitCode).toBe(1);
});

test('keeps test-only rules out of product code and passes the negative controls cleanly', () => {
  expect(reportsFor(mixed, scopeControl.file)).toEqual([]);
  expect(clean.diagnostics).toEqual([]);
  expect(clean.files).toBe(fixtures.filter((fixture) => fixture.reports.length === 0).length);
  expect(clean.stderr).not.toMatch(CRASH_OUTPUT);
  expect(clean.exitCode).toBe(0);
});
