import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LintReport = { summary: { errors: number }; diagnostics: { category: string; severity: string }[] };

function writeLintFixture(directory: string, source: string) {
  const fixture = resolve(directory, 'example.test.ts');
  writeFileSync(fixture, source);
  return fixture;
}

function lintRunnerPolicy(fixture: string) {
  return spawnSync(
    'bun',
    [
      'run',
      'lint:check:file',
      fixture,
      '--only=style/noRestrictedImports',
      '--only=suspicious/noFocusedTests',
      '--formatter-enabled=false',
      '--assist-enabled=false',
      '--reporter=json',
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
}

function expectRuleViolations(report: LintReport, rule: string, violations: number) {
  expect(report.summary.errors).toBe(violations);
  expect(
    report.diagnostics.filter((diagnostic) => diagnostic.category === rule && diagnostic.severity === 'error')
  ).toHaveLength(violations);
}

test.each([
  {
    name: 'rejects direct legacy runner imports, including subpaths',
    source:
      "import 'vitest'; import 'vitest/config'; import '@vitest/spy'; import 'jsdom'; import '@playwright/test'; void import('vitest/node'); export { JSDOM } from 'jsdom';",
    rule: 'lint/style/noRestrictedImports',
    violations: 7,
  },
  {
    name: 'rejects focused suites and tests across runners',
    source:
      "import { describe, test } from 'bun:test'; test.only('focused', () => {}); describe.only('focused', () => {});",
    rule: 'lint/suspicious/noFocusedTests',
    violations: 2,
  },
  {
    name: 'allows the supported runners, native browser APIs and DOM selector helpers',
    source:
      "import 'bun:test'; import '@rstest/core'; import '@rstest/playwright'; import 'playwright'; import 'happy-dom'; import 'ivya';",
    rule: '',
    violations: 0,
  },
])('$name', ({ source, rule, violations }) => {
  const directory = mkdtempSync(resolve('tests/runner-policy-'));
  try {
    const fixture = writeLintFixture(directory, source);
    const result = lintRunnerPolicy(fixture);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(violations ? 1 : 0);
    expect(result.stdout, result.stderr).not.toBe('');
    expectRuleViolations(JSON.parse(result.stdout), rule, violations);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
