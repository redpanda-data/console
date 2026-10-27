import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const frontendDirectory = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/rsdoctor-build.mjs', import.meta.url));
const bunExecutable = process.env.npm_execpath;
if (!bunExecutable) {
  throw new Error('Run these integration tests through bun run');
}

function expectNoReportsInDist(directory: string) {
  expect(existsSync(join(directory, 'dist/rsdoctor-report.html'))).toBe(false);
  expect(existsSync(join(directory, 'dist/rsdoctor-data.json'))).toBe(false);
}

async function expectCompressedAssetSizes(dataFile: string) {
  const report: unknown = JSON.parse(await readFile(dataFile, 'utf8'));
  expect(report).toMatchObject({
    data: {
      chunkGraph: {
        assets: expect.arrayContaining([
          expect.objectContaining({
            path: 'fixture.js',
            gzipSize: expect.any(Number),
            brotliSize: expect.any(Number),
          }),
        ]),
      },
    },
  });
}

async function listChunksWithAgent(executable: string, dataFile: string, signal: AbortSignal) {
  const { stdout } = await execute(executable, ['run', 'analyze:agent', 'chunks', 'list', '--data-file', dataFile], {
    cwd: frontendDirectory,
    signal,
    maxBuffer: 10 * 1024 * 1024,
  });
  const analysis: unknown = JSON.parse(stdout);
  return analysis;
}

describe('console build analysis', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'console-rsdoctor-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const build = (enabled: boolean, signal: AbortSignal) =>
    execute(process.execPath, [fixture, directory], {
      cwd: tmpdir(),
      // Rsdoctor's own test mode overrides disableClientServer.
      env: { ...process.env, RSDOCTOR: enabled ? 'true' : '', RSTEST: undefined },
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });

  // Covers the configuration's opt-in gate, not the plugin's disabled behavior.
  test('keeps analysis reports out of normal builds', async ({ signal }) => {
    await build(false, signal);
    expect(existsSync(join(directory, 'dist/fixture.js'))).toBe(true);
    expectNoReportsInDist(directory);
    expect(existsSync(join(directory, 'build-stats/rsdoctor'))).toBe(false);
  });

  test('emits offline and agent reports with gzip and Brotli sizes', async ({ signal }) => {
    await build(true, signal);
    expectNoReportsInDist(directory);
    const reportDirectory = join(directory, 'build-stats/rsdoctor');
    expect(existsSync(join(reportDirectory, 'rsdoctor-report.html'))).toBe(true);
    const dataFile = join(reportDirectory, 'rsdoctor-data.json');
    await expectCompressedAssetSizes(dataFile);

    const analysis = await listChunksWithAgent(bunExecutable, dataFile, signal);
    expect(analysis).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ name: 'main', assets: [{ name: 'fixture.js' }] }] },
    });
  });
});
