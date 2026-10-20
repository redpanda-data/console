import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Bun store units leave shared backend exports intact for subsequent files', () => {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  const directory = mkdtempSync(resolve('tests/.rstest/bun-isolation-'));
  try {
    writeFileSync(
      resolve(directory, 'exports.test.ts'),
      `
      import { expect, test } from 'bun:test';
      import { api, rest } from ${JSON.stringify(resolve('src/state/backend-api.ts'))};
      test('unmocked backend exports remain available', () => {
        expect(typeof rest).toBe('function');
        expect(typeof api.refreshTopics).toBe('function');
        expect(api.validateConnectorConfig._isMockFunction).not.toBe(true);
      });
    `
    );
    const result = spawnSync(
      'bun',
      ['run', 'test:file:unit', './src/state/connect/state.test.ts', resolve(directory, 'exports.test.ts')],
      {
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
