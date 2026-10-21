import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('unexpected integration requests fail the CLI even when the application catches the rejection', () => {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  const directory = mkdtempSync(resolve('tests/.rstest/network-isolation-'));
  try {
    writeFileSync(
      resolve(directory, 'rstest.config.ts'),
      `
      import config from ${JSON.stringify(resolve('rstest.config.integration.ts'))};
      export default {
        ...config, root: ${JSON.stringify(directory)}, include: ['*.test.ts'],
        setupFiles: [${JSON.stringify(resolve('rstest.setup.ts'))}], plugins: [],
        pool: { type: 'threads', maxWorkers: 1 }, performance: { buildCache: false },
        onConsoleLog(content) { process.stderr.write(content); },
      };
      `
    );
    writeFileSync(
      resolve(directory, 'network.test.ts'),
      `
      import { expect, rs, test } from '@rstest/core';
      test.each([
        '/unexpected-contract',
        'http://localhost:3000/unexpected-contract',
        'http://127.0.0.1/unexpected-contract',
        'http://[::1]/unexpected-contract',
        'https://unexpected.invalid/unexpected-contract',
      ])('application swallows %s', async (url) => {
        await fetch(url, { method: 'POST' }).catch(() => undefined);
      });
      test('window fetch is also guarded', async () => {
        await window.fetch(new Request('http://localhost:3000/window-contract', { method: 'DELETE' })).catch(() => undefined);
      });
      test('explicit response fixture', async () => {
        for (const signal of ['DOMException AbortError', 'Failed to load script', 'socket hang up', 'ECONNREFUSED', 'ECONNRESET']) {
          console.error('network diagnostics contract: ' + signal);
        }
        const mock = rs.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ready: true }));
        try {
          expect(await (await fetch('/expected')).json()).toEqual({ ready: true });
        } finally {
          mock.mockRestore();
        }
      });
      `
    );
    const result = spawnSync('bun', ['run', 'rstest', '--config', resolve(directory, 'rstest.config.ts')], {
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('"passedTests": 1');
    expect(result.stdout).toContain('"failedTests": 6');
    for (const url of [
      'http://localhost:3000/unexpected-contract',
      'http://127.0.0.1/unexpected-contract',
      'http://[::1]/unexpected-contract',
      'https://unexpected.invalid/unexpected-contract',
    ]) {
      expect(result.stdout + result.stderr).toContain(`Unexpected test request: POST ${url}`);
    }
    expect(result.stdout + result.stderr).toContain(
      'Unexpected test request: DELETE http://localhost:3000/window-contract'
    );
    for (const signal of [
      'DOMException AbortError',
      'Failed to load script',
      'socket hang up',
      'ECONNREFUSED',
      'ECONNRESET',
    ]) {
      expect(result.stdout + result.stderr).toContain(`network diagnostics contract: ${signal}`);
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
