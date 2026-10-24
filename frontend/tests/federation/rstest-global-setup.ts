// Copyright 2026 Redpanda Data, Inc.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../../', import.meta.url));

function buildFederatedRemote(react19: boolean): Promise<void> {
  const child = spawn('bun', ['run', 'build:federation-test'], {
    cwd: frontendRoot,
    env: { ...process.env, CONSOLE_FEDERATION_REACT19: react19 ? 'true' : '' },
    stdio: 'inherit',
  });

  return new Promise((resolveBuild, rejectBuild) => {
    child.once('error', rejectBuild);
    child.once('exit', (code) => {
      if (code === 0) {
        resolveBuild();
        return;
      }
      rejectBuild(new Error(`federation remote build exited with code ${code ?? 'unknown'}`));
    });
  });
}

export async function setup(): Promise<void> {
  await buildFederatedRemote(false);
  await buildFederatedRemote(true);
}
