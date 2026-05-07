import { exec } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getStateFile = (variantName) => resolve(__dirname, '..', `.testcontainers-state-${variantName}.json`);

export default async function globalTeardown(config = {}) {
  const variantName = config?.metadata?.variantName ?? 'console';
  const CONTAINER_STATE_FILE = getStateFile(variantName);

  console.log(`\n🛑 TEARDOWN: ${variantName}...`);

  try {
    if (!fs.existsSync(CONTAINER_STATE_FILE)) {
      console.log('No container state file found, skipping teardown');
      return;
    }

    const state = JSON.parse(fs.readFileSync(CONTAINER_STATE_FILE, 'utf8'));

    // Stop backend process if running as host process (OIDC variant)
    if (state.backendPid) {
      console.log(`Stopping backend process (PID ${state.backendPid})...`);
      await execAsync(`kill ${state.backendPid}`).catch(() => {});
    }

    // Stop containers in dependency order (dependents first, then infrastructure).
    // Each entry is [stateKey, label]. Errors are ignored since containers may
    // already be stopped/removed.
    for (const [key, label] of [
      ['sourceBackendId', 'source backend'],
      ['backendId', 'backend'],
      ['connectId', 'Kafka Connect'],
      ['owlshopId', 'OwlShop'],
      ['destRedpandaId', 'destination Redpanda'],
      ['zitadelProxyId', 'Zitadel proxy'],
      ['zitadelLoginId', 'Zitadel Login'],
      ['zitadelId', 'Zitadel API'],
      ['zitadelDbId', 'Zitadel PostgreSQL'],
      ['redpandaId', 'source Redpanda'],
    ]) {
      if (state[key]) {
        console.log(`Stopping ${label} container...`);
        await execAsync(`docker stop ${state[key]}`).catch(() => {});
        await execAsync(`docker rm ${state[key]}`).catch(() => {});
      }
    }

    if (state.networkId) {
      console.log('Removing Docker network...');
      await execAsync(`docker network rm ${state.networkId}`).catch(() => {
        // Ignore errors - network might already be removed
      });
    }

    fs.unlinkSync(CONTAINER_STATE_FILE);

    console.log('✅ Test environment stopped successfully\n');
  } catch (error) {
    console.error('Failed to stop test environment:', error);
  }
}
