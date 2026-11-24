import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function createProjectDirectory() {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  return mkdtempSync(resolve('tests/.rstest/network-isolation-'));
}

function writeNetworkIsolationProject(directory: string) {
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
      import { expect, test } from '@rstest/core';
      import { HttpResponse, http } from 'msw';
      import { HttpNetworkFrame } from 'msw/experimental';
      import { setupServer } from 'msw/node';

      async function withExpectedRoute(run: (url: string) => Promise<void>) {
        const url = new URL('/expected', window.location.href).href;
        const guardedFetch = globalThis.fetch;
        const server = setupServer(http.get(url, () => HttpResponse.json({ ready: true })));
        server.listen({
          async onUnhandledFrame({ frame }) {
            if (frame instanceof HttpNetworkFrame) {
              await guardedFetch(frame.data.request);
            }
            throw new Error('Unexpected network frame');
          },
        });
        try {
          await run(url);
        } finally {
          server.close();
        }
      }

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
      test('a request missed by MSW still fails the harness', async () => {
        await withExpectedRoute(async () => {
          const url = new URL('/unhandled-by-msw', window.location.href).href;
          await fetch(url).catch(() => undefined);
        });
      });
      test('strict MSW handler can serve an expected request', async () => {
        for (const signal of ['DOMException AbortError', 'Failed to load script', 'socket hang up', 'ECONNREFUSED', 'ECONNRESET']) {
          console.error('network diagnostics contract: ' + signal);
        }
        await withExpectedRoute(async (url) => {
          expect(await (await fetch(url)).json()).toEqual({ ready: true });
        });
      });
      test('can read storage through the window and global aliases', () => {
        window.localStorage.setItem('isolation-probe', 'saved');
        expect(localStorage.getItem('isolation-probe')).toBe('saved');
      });
      test('no storage survives into the next test', () => {
        expect(window.localStorage.getItem('isolation-probe')).toBeNull();
      });
      `
  );
}

function runProjectTests(directory: string) {
  const result = spawnSync('bun', ['run', 'rstest', '--config', resolve(directory, 'rstest.config.ts')], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  expect(result.error).toBeUndefined();
  return result;
}

function expectUnexpectedRequestsReported(output: string) {
  for (const url of [
    'http://localhost:3000/unexpected-contract',
    'http://127.0.0.1/unexpected-contract',
    'http://[::1]/unexpected-contract',
    'https://unexpected.invalid/unexpected-contract',
  ]) {
    expect(output).toContain(`Unexpected test request: POST ${url}`);
  }
  expect(output).toContain('Unexpected test request: DELETE http://localhost:3000/window-contract');
  expect(output).toContain('Unexpected test request: GET http://localhost:3000/unhandled-by-msw');
}

function expectNetworkDiagnosticsPreserved(output: string) {
  for (const signal of [
    'DOMException AbortError',
    'Failed to load script',
    'socket hang up',
    'ECONNREFUSED',
    'ECONNRESET',
  ]) {
    expect(output).toContain(`network diagnostics contract: ${signal}`);
  }
}

test('reports unexpected requests and isolates storage between tests', () => {
  const directory = createProjectDirectory();
  try {
    writeNetworkIsolationProject(directory);
    const result = runProjectTests(directory);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('"passedTests": 3');
    expect(result.stdout).toContain('"failedTests": 7');
    expectUnexpectedRequestsReported(result.stdout + result.stderr);
    expectNetworkDiagnosticsPreserved(result.stdout + result.stderr);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
