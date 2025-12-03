import { exec } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getStateFile = (isEnterprise) =>
  resolve(__dirname, isEnterprise ? '.testcontainers-state-enterprise.json' : '.testcontainers-state.json');

export default async function globalTeardown(config) {
  const isEnterprise = config.metadata?.isEnterprise ?? false;
  const CONTAINER_STATE_FILE = getStateFile(isEnterprise);

  console.log(`\n🛑 Stopping test environment ${isEnterprise ? '(ENTERPRISE MODE)' : '(OSS MODE)'}...`);

  try {
    if (!fs.existsSync(CONTAINER_STATE_FILE)) {
      console.log('No container state file found, skipping teardown');
      return;
    }

    const state = JSON.parse(fs.readFileSync(CONTAINER_STATE_FILE, 'utf8'));

    // Stop backend container
    if (state.backendId) {
      console.log(`Stopping backend container...`);
      await execAsync(`docker stop ${state.backendId}`).catch(() => {});
      await execAsync(`docker rm ${state.backendId}`).catch(() => {});
    }

    // Stop Docker containers (testcontainers)
    if (state.connectId) {
      console.log(`Stopping Kafka Connect container...`);
      await execAsync(`docker stop ${state.connectId}`).catch(() => {});
      await execAsync(`docker rm ${state.connectId}`).catch(() => {});
    }

    if (state.owlshopId) {
      console.log(`Stopping OwlShop container...`);
      await execAsync(`docker stop ${state.owlshopId}`).catch(() => {});
      await execAsync(`docker rm ${state.owlshopId}`).catch(() => {});
    }

    if (state.redpandaId) {
      console.log(`Stopping Redpanda container...`);
      await execAsync(`docker stop ${state.redpandaId}`).catch(() => {});
      await execAsync(`docker rm ${state.redpandaId}`).catch(() => {});
    }

    if (state.networkId) {
      console.log(`Removing Docker network...`);
      await execAsync(`docker network rm ${state.networkId}`).catch(() => {});
    }

    fs.unlinkSync(CONTAINER_STATE_FILE);

    console.log('✅ Test environment stopped successfully\n');
  } catch (error) {
    console.error('Failed to stop test environment:', error);
  }
}
