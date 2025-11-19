import { exec } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTAINER_STATE_FILE = resolve(__dirname, '.testcontainers-state.json');
const COMPOSE_FILE = resolve(__dirname, 'config/docker-compose.yaml');
const PROJECT_NAME = 'redpanda-e2e';

async function waitForHealthy(maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' redpanda`);
      if (stdout.trim() === 'healthy') {
        return true;
      }
    } catch (_error) {
      // Container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Redpanda container failed to become healthy');
}

async function waitForPort(port, maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ || echo "0"`
      );
      const statusCode = Number.parseInt(stdout.trim(), 10);
      if (statusCode > 0 && statusCode < 500) {
        return true;
      }
    } catch (_error) {
      // Port not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Port ${port} failed to become available`);
}

export default async function globalSetup() {
  console.log('Starting docker-compose environment...');

  try {
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down -v 2>/dev/null || true`);

    console.log('Pulling images and starting containers...');
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d`);

    console.log('Waiting for Redpanda to be healthy...');
    await waitForHealthy();

    console.log('Checking if Admin API is ready...');
    await waitForPort(19_644, 15, 1000);
    console.log('Admin API is ready');

    console.log('Checking if Schema Registry is ready...');
    await waitForPort(18_081, 15, 1000);
    console.log('Schema Registry is ready');

    console.log('Checking if Kafka Connect is ready (optional)...');
    try {
      await waitForPort(18_083, 10, 1000);
      console.log('Kafka Connect is ready');
    } catch (_error) {
      console.log('Kafka Connect not ready yet (this is OK - it will continue starting in the background)');
    }

    const state = {
      projectName: PROJECT_NAME,
      composeFile: COMPOSE_FILE,
    };

    fs.writeFileSync(CONTAINER_STATE_FILE, JSON.stringify(state, null, 2));

    console.log('Docker-compose environment started successfully');
    console.log('Redpanda broker: localhost:19092');
    console.log('Schema Registry: http://localhost:18081');
    console.log('Admin API: http://localhost:19644');
    console.log('Kafka Connect: http://localhost:18083');

    return async () => {
      console.log('Global setup complete - containers will remain running for tests');
    };
  } catch (error) {
    console.error('Failed to start docker-compose environment:', error);
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down -v`).catch(() => {});
    throw error;
  }
}
