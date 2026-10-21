import { afterEach, expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

function coverageProject(include = ['example.ts', 'untested.ts']) {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  const directory = mkdtempSync(resolve('tests/.rstest/coverage-cli-'));
  directories.push(directory);
  writeFileSync(
    resolve(directory, 'example.ts'),
    "export function example(value: boolean) { return value ? 'yes' : 'no'; }\n"
  );
  writeFileSync(resolve(directory, 'untested.ts'), 'export function untested() { return 42; }\n');
  for (const [name, value, expected] of [
    ['first', true, 'yes'],
    ['second', false, 'no'],
  ]) {
    writeFileSync(
      resolve(directory, `${name}.test.ts`),
      `
      import { expect, test } from '@rstest/core';
      import { example } from './example';
      test('covers ${name} branch', () => expect(example(${value})).toBe(${JSON.stringify(expected)}));
    `
    );
  }
  const config = resolve(directory, 'rstest.config.ts');
  writeFileSync(
    config,
    `
    import config from ${JSON.stringify(resolve('rstest.config.integration.ts'))};
    export default {
      ...config, root: ${JSON.stringify(directory)}, include: ['*.test.ts'],
      testEnvironment: 'node', setupFiles: [], plugins: [],
      pool: { type: 'threads', maxWorkers: 1 }, performance: { buildCache: false },
      reporters: process.argv.some(arg => arg.startsWith('--shard'))
        ? [['blob', { outputDir: ${JSON.stringify(resolve(directory, 'blobs'))} }]]
        : [['md', { preset: 'compact' }]],
      coverage: {
        ...config.coverage, enabled: true, include: ${JSON.stringify(include)}, exclude: [],
        reporters: ['json-summary'], reportsDirectory: process.env.COVERAGE_TEST_REPORT,
      },
    };
  `
  );
  const run = (args: string[], report = 'reference') => {
    const result = spawnSync('bun', ['run', 'rstest', ...args, '--config', config], {
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, COVERAGE_TEST_REPORT: resolve(directory, report) },
    });
    expect(result.error).toBeUndefined();
    return result;
  };
  return { directory, run };
}

test('the real integration coverage CLI rejects an uncovered module at the established thresholds', () => {
  const { directory, run } = coverageProject(['untested.ts']);
  const result = run([]);
  expect(result.stdout).toContain('"passedTests": 2');
  expect(existsSync(resolve(directory, 'reference/coverage-summary.json'))).toBe(true);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain('threshold');
});

test('keeps coverage gates on measured Rstest locations rather than mixing Bun denominators', () => {
  const { directory, run } = coverageProject();
  mkdirSync(resolve(directory, 'coverage'));
  writeFileSync(
    resolve(directory, 'coverage/lcov.info'),
    'TN:\nSF:example.ts\nFNF:100\nFNH:100\nLF:100\nLH:100\nend_of_record\n'
  );
  const reference = run([]);
  expect(reference.status, reference.stdout + reference.stderr).toBe(0);
  const expected = JSON.parse(readFileSync(resolve(directory, 'reference/coverage-summary.json'), 'utf8'));
  for (const shard of ['1/2', '2/2']) {
    const result = run([`--shard=${shard}`], 'merged');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(resolve(directory, 'merged/coverage-summary.json'))).toBe(false);
  }
  const merged = run(['merge-reports', resolve(directory, 'blobs')], 'merged');
  expect(merged.status, merged.stdout + merged.stderr).toBe(0);
  const actual = JSON.parse(readFileSync(resolve(directory, 'merged/coverage-summary.json'), 'utf8'));
  for (const metric of ['lines', 'functions', 'statements', 'branches']) {
    expect(actual.total[metric]).toEqual(expected.total[metric]);
  }
  expect(actual.total.functions).toMatchObject({ total: 2, covered: 1, pct: 50 });
});
