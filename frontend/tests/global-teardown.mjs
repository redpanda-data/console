import { exec } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTAINER_STATE_FILE = resolve(__dirname, '.testcontainers-state.json');

export default async function globalTeardown() {
  console.log('\n🛑 Stopping test environment...');

  try {
    if (!fs.existsSync(CONTAINER_STATE_FILE)) {
      console.log('No container state file found, skipping teardown');
      return;
    }

    const state = JSON.parse(fs.readFileSync(CONTAINER_STATE_FILE, 'utf8'));

    // Stop backend server
    if (state.backendPid) {
      console.log(`Stopping backend server (PID: ${state.backendPid})...`);
      try {
        await execAsync(`kill ${state.backendPid}`);
      } catch (error) {
        console.log('Backend already stopped or not found');
      }
    }

    // Stop frontend server
    if (state.frontendPid) {
      console.log(`Stopping frontend server (PID: ${state.frontendPid})...`);
      try {
        await execAsync(`kill ${state.frontendPid}`);
      } catch (error) {
        console.log('Frontend already stopped or not found');
      }
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
