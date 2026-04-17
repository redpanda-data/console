#!/usr/bin/env node

/**
 * Merge v8 coverage output from unit + integration Vitest runs into a single
 * `coverage-merged/` directory. The merge is a file-level union: for each source
 * file, we take the max coverage seen across both runs (i.e. a line covered by
 * EITHER run counts as covered). We operate on `coverage-summary.json` which is
 * already aggregated per-file by istanbul, so we just pick the highest hit counts.
 *
 * Usage: node scripts/merge-coverage.mjs
 * Inputs:  coverage/coverage-summary.json, coverage-integration/coverage-summary.json
 * Outputs: coverage-merged/coverage-summary.json
 *          coverage-merged/coverage-final.json   (if both runs produced it)
 *          coverage-merged/lcov.info             (concatenated)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const UNIT_DIR = join(ROOT, 'coverage');
const INT_DIR = join(ROOT, 'coverage-integration');
const OUT_DIR = join(ROOT, 'coverage-merged');

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function maxCounts(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return {
    total: Math.max(a.total ?? 0, b.total ?? 0),
    covered: Math.max(a.covered ?? 0, b.covered ?? 0),
    skipped: Math.max(a.skipped ?? 0, b.skipped ?? 0),
    pct:
      // recompute pct below after picking totals; this is a placeholder
      0,
  };
}

function computePct(metric) {
  if (!metric?.total) {
    return { ...metric, pct: 0 };
  }
  return { ...metric, pct: Number(((metric.covered / metric.total) * 100).toFixed(2)) };
}

const METRIC_KEYS = ['lines', 'statements', 'functions', 'branches', 'branchesTrue'];

function mergeFileEntry(a, b) {
  const out = {};
  for (const k of METRIC_KEYS) {
    const merged = maxCounts(a?.[k], b?.[k]);
    if (merged) {
      out[k] = computePct(merged);
    }
  }
  return out;
}

function accumulateTotals(totals, entry) {
  for (const metric of METRIC_KEYS) {
    const m = entry[metric];
    if (!m) {
      continue;
    }
    totals[metric].total = (totals[metric].total ?? 0) + (m.total ?? 0);
    totals[metric].covered = (totals[metric].covered ?? 0) + (m.covered ?? 0);
    totals[metric].skipped = (totals[metric].skipped ?? 0) + (m.skipped ?? 0);
  }
}

function mergeSummaries(unit, integration) {
  const merged = {};
  const keys = new Set([...Object.keys(unit ?? {}), ...Object.keys(integration ?? {})]);
  for (const key of keys) {
    merged[key] = mergeFileEntry(unit?.[key], integration?.[key]);
  }

  // Recompute 'total' entry as the sum across all non-'total' file entries.
  const totals = Object.fromEntries(METRIC_KEYS.map((k) => [k, {}]));
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'total') {
      continue;
    }
    accumulateTotals(totals, v);
  }
  for (const metric of METRIC_KEYS) {
    totals[metric] = computePct(totals[metric]);
  }
  merged.total = totals;
  return merged;
}

function mergeHitArrays(av, bv) {
  const aArr = av || [];
  const bArr = bv || [];
  const len = Math.max(aArr.length, bArr.length);
  const arr = new Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Math.max(aArr[i] ?? 0, bArr[i] ?? 0);
  }
  return arr;
}

function mergeHitMap(aMap, bMap) {
  const out = {};
  const ids = new Set([...Object.keys(aMap), ...Object.keys(bMap)]);
  for (const id of ids) {
    const av = aMap[id] ?? 0;
    const bv = bMap[id] ?? 0;
    if (Array.isArray(av) || Array.isArray(bv)) {
      out[id] = mergeHitArrays(av, bv);
    } else {
      out[id] = Math.max(av, bv);
    }
  }
  return out;
}

function mergeFinalEntry(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  const out = { ...a };
  for (const counter of ['s', 'f', 'b']) {
    if (!(a[counter] && b[counter])) {
      continue;
    }
    out[counter] = mergeHitMap(a[counter], b[counter]);
  }
  return out;
}

function mergeFinal(unit, integration) {
  // coverage-final.json is keyed by absolute file path; each entry has istanbul
  // coverage counters. For merge semantics we take the max of each counter.
  const merged = {};
  const keys = new Set([...Object.keys(unit ?? {}), ...Object.keys(integration ?? {})]);
  for (const key of keys) {
    merged[key] = mergeFinalEntry(unit?.[key], integration?.[key]);
  }
  return merged;
}

function concatLcov(paths, outPath) {
  const parts = [];
  for (const p of paths) {
    if (existsSync(p)) {
      parts.push(readFileSync(p, 'utf8'));
    }
  }
  if (parts.length === 0) {
    return false;
  }
  writeFileSync(outPath, parts.join('\n'));
  return true;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const unitSummary = readJsonIfExists(join(UNIT_DIR, 'coverage-summary.json'));
  const intSummary = readJsonIfExists(join(INT_DIR, 'coverage-summary.json'));
  if (!(unitSummary || intSummary)) {
    console.error(
      'merge-coverage: neither coverage/ nor coverage-integration/ has coverage-summary.json; did you run with --coverage?'
    );
    process.exit(1);
  }

  const mergedSummary = mergeSummaries(unitSummary ?? {}, intSummary ?? {});
  writeFileSync(join(OUT_DIR, 'coverage-summary.json'), `${JSON.stringify(mergedSummary, null, 2)}\n`);

  const unitFinal = readJsonIfExists(join(UNIT_DIR, 'coverage-final.json'));
  const intFinal = readJsonIfExists(join(INT_DIR, 'coverage-final.json'));
  if (unitFinal || intFinal) {
    const mergedFinal = mergeFinal(unitFinal ?? {}, intFinal ?? {});
    writeFileSync(join(OUT_DIR, 'coverage-final.json'), JSON.stringify(mergedFinal));
  }

  concatLcov([join(UNIT_DIR, 'lcov.info'), join(INT_DIR, 'lcov.info')], join(OUT_DIR, 'lcov.info'));

  // Copy the HTML report from whichever run has the richer set of files.
  // The integration run is typically more comprehensive for .tsx components,
  // so prefer it when present; fall back to unit.
  const htmlSource = existsSync(join(INT_DIR, 'index.html')) ? INT_DIR : UNIT_DIR;
  if (existsSync(join(htmlSource, 'index.html'))) {
    copyDirSync(htmlSource, OUT_DIR, new Set(['coverage-summary.json', 'coverage-final.json', 'lcov.info']));
  }

  const total = mergedSummary.total;
  console.log('merge-coverage: merged coverage written to coverage-merged/');
  console.log(
    `  lines: ${total.lines?.pct ?? 0}% | statements: ${total.statements?.pct ?? 0}% | functions: ${total.functions?.pct ?? 0}% | branches: ${total.branches?.pct ?? 0}%`
  );
}

function copyDirSync(src, dst, skipNames = new Set()) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (skipNames.has(entry)) {
      continue;
    }
    const s = join(src, entry);
    const d = join(dst, entry);
    const st = statSync(s);
    if (st.isDirectory()) {
      copyDirSync(s, d, skipNames);
    } else {
      copyFileSync(s, d);
    }
  }
}

main();
