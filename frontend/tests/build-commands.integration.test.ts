// Copyright 2026 Redpanda Data, Inc.

import { expect, test } from '@rstest/core';

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { scripts } from '../package.json';

const execute = promisify(execFile);
const bunExecutable = process.env.npm_execpath;
if (!bunExecutable) {
  throw new Error('Run build command tests through bun run');
}

test('local E2E builds compile the app once with fixture metadata and no release-only checks', async ({ signal }) => {
  const { directory, log } = await createCommandFixture();
  try {
    await execute(bunExecutable, ['run', 'build-local-test'], {
      cwd: directory,
      env: { ...process.env, COMMAND_LOG: log },
      signal,
    });
    const commands: unknown[] = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(commands).toEqual([
      {
        tool: 'rsbuild',
        args: ['build'],
        business: 'true',
        gitSha: 'abc123',
        gitRef: 'local',
        buildTimestamp: '32503680000',
        devHint: 'true',
      },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createCommandFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'console-build-command-'));
  const log = join(directory, 'commands.jsonl');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', scripts }));
  const bin = join(directory, 'node_modules/.bin');
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, 'rsbuild'),
    `#!/usr/bin/env bun
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.COMMAND_LOG, JSON.stringify({
  tool: 'rsbuild', args: process.argv.slice(2), business: process.env.REACT_APP_BUSINESS,
  gitSha: process.env.REACT_APP_CONSOLE_GIT_SHA, gitRef: process.env.REACT_APP_CONSOLE_GIT_REF,
  buildTimestamp: process.env.REACT_APP_BUILD_TIMESTAMP, devHint: process.env.REACT_APP_DEV_HINT,
}) + '\\n');
`,
    { mode: 0o755 }
  );
  const theme = join(directory, 'src/components/redpanda-ui/style/theme-check');
  await mkdir(theme, { recursive: true });
  await writeFile(
    join(theme, 'cli.mts'),
    `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.COMMAND_LOG, JSON.stringify({ tool: 'theme:check' }) + '\\n');`
  );
  return { directory, log };
}
