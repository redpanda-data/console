#!/usr/bin/env node

/**
 * Enforces merged-coverage thresholds defined in `coverage.config.json`.
 *
 * Why a script (and not `coverage.thresholds` in vitest config)?
 *   - Thresholds must apply to the MERGED summary (unit + integration), not
 *     to either individual run. Running vitest thresholds on unit-only would
 *     fail immediately because unit tests cover a small subset of .tsx code.
 *   - This script runs in CI as a post-step after `merge-coverage.mjs`.
 *
 * Exit codes: 0 on pass, 1 on threshold violation, 1 on missing summary file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SUMMARY_PATH = resolve(ROOT, 'coverage-merged/coverage-summary.json');
const CONFIG_PATH = resolve(ROOT, 'coverage.config.json');

function die(msg) {
  console.error(`check-coverage-thresholds: ${msg}`);
  process.exit(1);
}

if (!existsSync(SUMMARY_PATH)) {
  die(`missing ${SUMMARY_PATH}; run \`bun run test:coverage\` first.`);
}
if (!existsSync(CONFIG_PATH)) {
  die(`missing ${CONFIG_PATH}.`);
}

const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const thresholds = config.thresholds ?? {};

const total = summary.total ?? {};
const measured = {
  lines: total.lines?.pct ?? 0,
  statements: total.statements?.pct ?? 0,
  functions: total.functions?.pct ?? 0,
  branches: total.branches?.pct ?? 0,
};

const failures = [];
for (const metric of Object.keys(thresholds)) {
  const required = thresholds[metric];
  const actual = measured[metric] ?? 0;
  const ok = actual >= required;
  const verdict = ok ? 'OK' : 'FAIL';
  console.log(
    `  ${verdict}  ${metric.padEnd(10)} actual ${actual.toFixed(2).padStart(6)}%  required >= ${required.toFixed(2)}%`
  );
  if (!ok) {
    failures.push({ metric, actual, required });
  }
}

if (failures.length > 0) {
  console.error('\nCoverage dropped below the baseline. Either:');
  console.error('  - restore coverage by adding tests for the files listed in `bun run test:coverage:gaps`, OR');
  console.error('  - if the drop is intentional (e.g. deleted well-tested code), update coverage.config.json.');
  process.exit(1);
}

console.log('\ncheck-coverage-thresholds: all thresholds satisfied.');
