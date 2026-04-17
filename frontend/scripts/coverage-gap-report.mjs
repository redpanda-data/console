#!/usr/bin/env node

/**
 * Print the 30 lowest-covered files by line % from
 * `coverage-merged/coverage-summary.json`. For each file, print:
 *   - relative path
 *   - line % + covered/total
 *   - uncovered line ranges (read from coverage-final.json when available)
 *
 * Helps engineers prioritize which modules to add tests to first.
 *
 * Usage: node scripts/coverage-gap-report.mjs [--limit=30] [--threshold=100]
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SUMMARY_PATH = resolve(ROOT, 'coverage-merged/coverage-summary.json');
const FINAL_PATH = resolve(ROOT, 'coverage-merged/coverage-final.json');
const LEADING_DASHES = /^--/;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(LEADING_DASHES, '').split('=');
    return [k, v];
  })
);
const LIMIT = Number(args.limit ?? 30);
const THRESHOLD = Number(args.threshold ?? 100); // only include files < threshold%

function loadSummary() {
  if (!existsSync(SUMMARY_PATH)) {
    console.error(`coverage-gap-report: ${SUMMARY_PATH} not found; run \`bun run test:coverage\` first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
}

function loadFinal() {
  if (!existsSync(FINAL_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(FINAL_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function collectUncoveredLines(statementMap, hitCounts) {
  const uncoveredLines = new Set();
  for (const [id, loc] of Object.entries(statementMap)) {
    if ((hitCounts[id] ?? 0) > 0) {
      continue;
    }
    const start = loc?.start?.line;
    if (!start) {
      continue;
    }
    const end = loc?.end?.line ?? start;
    for (let l = start; l <= end; l++) {
      uncoveredLines.add(l);
    }
  }
  return uncoveredLines;
}

function compressRanges(sorted) {
  if (sorted.length === 0) {
    return [];
  }
  const ranges = [];
  let lo = sorted[0];
  let hi = lo;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === hi + 1) {
      hi = sorted[i];
    } else {
      ranges.push(lo === hi ? `${lo}` : `${lo}-${hi}`);
      lo = sorted[i];
      hi = lo;
    }
  }
  ranges.push(lo === hi ? `${lo}` : `${lo}-${hi}`);
  return ranges;
}

function uncoveredLineRangesFor(filePath, finalData) {
  if (!finalData) {
    return null;
  }
  const entry = finalData[filePath];
  if (!entry) {
    return null;
  }
  // istanbul counters: statementMap + s (hit counts). Compute unique uncovered
  // source lines from statements that were not executed.
  const { statementMap = {}, s = {} } = entry;
  const uncovered = collectUncoveredLines(statementMap, s);
  if (uncovered.size === 0) {
    return [];
  }
  return compressRanges([...uncovered].sort((a, b) => a - b));
}

function fmtPct(n) {
  return `${n.toFixed(1).padStart(5)}%`;
}

function main() {
  const summary = loadSummary();
  const finalData = loadFinal();

  const entries = Object.entries(summary)
    .filter(([k]) => k !== 'total')
    .map(([file, m]) => ({
      file,
      rel: relative(ROOT, file),
      linesPct: m.lines?.pct ?? 0,
      linesCovered: m.lines?.covered ?? 0,
      linesTotal: m.lines?.total ?? 0,
      fnPct: m.functions?.pct ?? 0,
      brPct: m.branches?.pct ?? 0,
    }))
    .filter((e) => e.linesTotal > 0 && e.linesPct < THRESHOLD)
    .sort((a, b) => a.linesPct - b.linesPct || b.linesTotal - a.linesTotal)
    .slice(0, LIMIT);

  if (entries.length === 0) {
    console.log('No files found below the coverage threshold. Nice.');
    return;
  }

  const total = summary.total ?? {};
  console.log(
    `Overall: lines ${fmtPct(total.lines?.pct ?? 0)} | statements ${fmtPct(total.statements?.pct ?? 0)} | functions ${fmtPct(total.functions?.pct ?? 0)} | branches ${fmtPct(total.branches?.pct ?? 0)}`
  );
  console.log(`\nTop ${entries.length} lowest-covered files (by line %):\n`);

  const maxRel = Math.min(
    80,
    entries.reduce((m, e) => Math.max(m, e.rel.length), 0)
  );
  const header = `  ${'lines%'.padStart(6)}  ${'covered'.padStart(13)}  ${'fn%'.padStart(6)}  ${'br%'.padStart(6)}  file`;
  console.log(header);
  console.log(`  ${'-'.repeat(6)}  ${'-'.repeat(13)}  ${'-'.repeat(6)}  ${'-'.repeat(6)}  ${'-'.repeat(maxRel)}`);
  for (const e of entries) {
    const covered = `${e.linesCovered}/${e.linesTotal}`.padStart(13);
    const linePct = fmtPct(e.linesPct);
    const fnPct = fmtPct(e.fnPct);
    const brPct = fmtPct(e.brPct);
    console.log(`  ${linePct}  ${covered}  ${fnPct}  ${brPct}  ${e.rel}`);
    const ranges = uncoveredLineRangesFor(e.file, finalData);
    if (ranges && ranges.length > 0) {
      // Trim very long range lists
      const shown =
        ranges.length > 12 ? `${ranges.slice(0, 12).join(', ')}, +${ranges.length - 12} more` : ranges.join(', ');
      console.log(`              uncovered lines: ${shown}`);
    }
  }
}

main();
