import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('bun preload provides DOM globals without replacing native networking', () => {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  const directory = mkdtempSync(resolve('tests/.rstest/bun-runtime-'));
  try {
    writeFileSync(
      resolve(directory, 'capture.ts'),
      'globalThis.nativeNetworking = { fetch, Request, Response, Headers, URL, URLSearchParams, AbortController, AbortSignal, Blob, File, FormData, ReadableStream, WritableStream, TransformStream };'
    );
    writeFileSync(
      resolve(directory, 'bunfig.toml'),
      `[test]\npreload = ["./capture.ts", ${JSON.stringify(resolve('bun.setup.ts'))}]\n`
    );
    writeFileSync(
      resolve(directory, 'runtime.test.ts'),
      `
      import { expect, test } from 'bun:test';
      test('native networking and DOM coexist', async () => {
        for (const [name, value] of Object.entries(globalThis.nativeNetworking)) {
          expect(globalThis[name], name).toBe(value);
        }
        expect(await new Response(new Blob(['ready'])).text()).toBe('ready');
        const form = new FormData();
        form.set('key', 'value');
        expect(await new Request('http://localhost', { method: 'POST', body: form }).text()).toContain('value');
        expect(document.createElement('div').tagName).toBe('DIV');
        localStorage.setItem('host', 'ready');
        expect(localStorage.getItem('host')).toBe('ready');
      });
    `
    );
    const result = spawnSync('bun', ['test'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
