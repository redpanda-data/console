import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

describe('Console build analysis', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'console-rsdoctor-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const build = (enabled: boolean, signal: AbortSignal) =>
    execute(process.execPath, ['tests/fixtures/rsdoctor-build.mjs', directory], {
      // Rsdoctor's own test mode overrides disableClientServer.
      env: { ...process.env, RSDOCTOR: enabled ? 'true' : '', RSTEST: undefined },
      signal,
    });

  test('keeps analysis reports out of normal builds', async ({ signal }) => {
    await build(false, signal);
    expect(existsSync(join(directory, 'dist/fixture.js'))).toBe(true);
    expect(existsSync(join(directory, 'dist/rsdoctor-report.html'))).toBe(false);
    expect(existsSync(join(directory, 'dist/rsdoctor-data.json'))).toBe(false);
    expect(existsSync(join(directory, 'build-stats/rsdoctor'))).toBe(false);
  });

  test('emits offline and agent reports with gzip and Brotli sizes', async ({ signal }) => {
    await build(true, signal);
    expect(existsSync(join(directory, 'dist/rsdoctor-report.html'))).toBe(false);
    expect(existsSync(join(directory, 'dist/rsdoctor-data.json'))).toBe(false);
    const reportDirectory = join(directory, 'build-stats/rsdoctor');
    expect(existsSync(join(reportDirectory, 'rsdoctor-report.html'))).toBe(true);
    const dataFile = join(reportDirectory, 'rsdoctor-data.json');
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

    const { stdout } = await execute('bun', ['run', 'analyze:agent', 'chunks', 'list', '--data-file', dataFile], {
      signal,
    });
    const analysis: unknown = JSON.parse(stdout);
    expect(analysis).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ name: 'main', assets: [{ name: 'fixture.js' }] }] },
    });
  });
});
