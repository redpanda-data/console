import { exec } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getStateFile = (variantName) => resolve(__dirname, '..', `.testcontainers-state-${variantName}.json`);
const getRefCountFile = (variantName) => resolve(__dirname, '..', `.testcontainers-refcount-${variantName}`);

export default async function globalTeardown(config = {}) {
  const variantName = config?.metadata?.variantName ?? 'console';
  const CONTAINER_STATE_FILE = getStateFile(variantName);
  const REF_COUNT_FILE = getRefCountFile(variantName);

  console.log(`\n🛑 TEARDOWN: ${variantName}...`);

  try {
    if (!fs.existsSync(CONTAINER_STATE_FILE)) {
      console.log('No container state file found, skipping teardown');
      return;
    }

    // If a ref count file exists, decrement it. Only the last shard tears down.
    if (fs.existsSync(REF_COUNT_FILE)) {
      const count = Number.parseInt(fs.readFileSync(REF_COUNT_FILE, 'utf8').trim(), 10) - 1;
      if (count > 0) {
        fs.writeFileSync(REF_COUNT_FILE, String(count));
        console.log(`Other shard(s) still running (${count} remaining), skipping teardown`);
        return;
      }
      // Last shard — clean up ref count file and proceed with teardown
      fs.unlinkSync(REF_COUNT_FILE);
    }

    const state = JSON.parse(fs.readFileSync(CONTAINER_STATE_FILE, 'utf8'));

    // Stop backend containers
    if (state.sourceBackendId) {
      console.log('Stopping source backend container...');
      await execAsync(`docker stop ${state.sourceBackendId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.sourceBackendId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
    }

    if (state.backendId) {
      console.log('Stopping backend container...');
      await execAsync(`docker stop ${state.backendId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.backendId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
    }

    // Stop Docker containers (testcontainers)
    if (state.connectId) {
      console.log('Stopping Kafka Connect container...');
      await execAsync(`docker stop ${state.connectId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.connectId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
    }

    if (state.owlshopId) {
      console.log('Stopping OwlShop container...');
      await execAsync(`docker stop ${state.owlshopId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.owlshopId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
    }

    // Stop destination cluster if it exists (shadowlink tests)
    if (state.destRedpandaId) {
      console.log('Stopping destination Redpanda container...');
      await execAsync(`docker stop ${state.destRedpandaId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.destRedpandaId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
    }

    // Stop source cluster (existing/main redpanda)
    if (state.redpandaId) {
      console.log('Stopping source Redpanda container...');
      await execAsync(`docker stop ${state.redpandaId}`).catch(() => {
        // Ignore errors - container might already be stopped
      });
      await execAsync(`docker rm ${state.redpandaId}`).catch(() => {
        // Ignore errors - container might already be removed
      });
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
