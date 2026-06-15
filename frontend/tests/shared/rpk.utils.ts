import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** ESM-safe __dirname (frontend/package.json sets "type": "module"). */
const __dirname = dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(exec);

/**
 * Get the Redpanda container ID from testcontainers state file
 * @param variantName - The test variant name (e.g., 'console', 'console-enterprise')
 * @returns Container ID string
 */
export function getRedpandaContainerId(variantName = 'console'): string {
  const stateFilePath = resolve(__dirname, `../.testcontainers-state-${variantName}.json`);
  const state = JSON.parse(readFileSync(stateFilePath, 'utf-8'));
  return state.redpandaId;
}

/**
 * Execute RPK command in the Redpanda container with SASL authentication
 * @param command - The RPK command to execute (without 'rpk' prefix)
 * @param variantName - The test variant name (e.g., 'console', 'console-enterprise')
 * @returns Command stdout
 */
export async function execRpk(command: string, variantName = 'console'): Promise<string> {
  const containerId = getRedpandaContainerId(variantName);
  const rpkCommand = `docker exec ${containerId} rpk ${command} -X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256`;
  const { stdout } = await execAsync(rpkCommand);
  return stdout;
}
