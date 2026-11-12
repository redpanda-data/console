import { z } from 'zod';

import { cleanupSerializedResources, parseSerializedEnvironmentState } from './test-environment-state.mjs';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @param {string} variantName */
const getStateFile = (variantName) => resolve(__dirname, '..', `.testcontainers-state-${variantName}.json`);
const MISSING_DOCKER_RESOURCE_PATTERN = /No such (container|network)/i;

/** @param {unknown} error */
function isAlreadyRemoved(error) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? error.stderr : undefined;
  const output = `${message}\n${typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString() : ''}`;
  return MISSING_DOCKER_RESOURCE_PATTERN.test(output);
}

/** @param {string[]} args */
async function runDocker(args) {
  try {
    await execFileAsync('docker', args);
  } catch (error) {
    if (!isAlreadyRemoved(error)) {
      throw error;
    }
  }
}

/**
 * Crash-recovery fallback for a serialized state file.
 *
 * Normal Playwright runs use the teardown returned by global-setup.mjs so
 * Testcontainers can stop resources through their live handles. Invoke this
 * module manually only when a previous process exited before that teardown.
 */
/** @param {unknown} config */
function readVariantName(config) {
  return (
    z.looseObject({ metadata: z.looseObject({ variantName: z.string().optional() }).optional() }).parse(config).metadata
      ?.variantName ?? 'console'
  );
}

/** @param {unknown} config */
export default async function globalTeardown(config = {}) {
  const variantName = readVariantName(config);
  const stateFile = getStateFile(variantName);

  console.log(`\n🛑 RECOVERY TEARDOWN: ${variantName}...`);

  if (!existsSync(stateFile)) {
    console.log('No container state file found, skipping teardown');
    return;
  }

  const state = parseSerializedEnvironmentState(JSON.parse(readFileSync(stateFile, 'utf8')));
  await cleanupSerializedResources(state, {
    removeContainer: (id) => runDocker(['rm', '--force', '--volumes', id]),
    removeNetwork: (id) => runDocker(['network', 'rm', id]),
  });
  rmSync(stateFile, { force: true });
  console.log('✅ Test environment stopped successfully\n');
}
