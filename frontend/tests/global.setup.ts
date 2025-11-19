import { test as setup } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTAINER_STATE_FILE = resolve(__dirname, '.testcontainers-state.json');
const COMPOSE_FILE = resolve(__dirname, 'config/docker-compose.yaml');
const PROJECT_NAME = 'redpanda-e2e';

async function waitForHealthy(maxAttempts = 30, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' redpanda`);
      if (stdout.trim() === 'healthy') {
        return true;
      }
    } catch (error) {
      // Container not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Redpanda container failed to become healthy');
}

async function waitForPort(port: number, maxAttempts = 60, delayMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ || echo "0"`);
      const statusCode = Number.parseInt(stdout.trim(), 10);
      if (statusCode > 0 && statusCode < 500) {
        return true;
      }
    } catch (error) {
      // Port not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error(`Port ${port} failed to become available`);
}

setup('start docker-compose environment', async () => {
  console.log('Starting docker-compose environment...');

  try {
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down -v 2>/dev/null || true`);

    console.log('Pulling images and starting containers...');
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d`);

    console.log('Waiting for Redpanda to be healthy...');
    await waitForHealthy();

    console.log('Giving Redpanda additional time to be ready for connections...');
    await new Promise(resolve => setTimeout(resolve, 15_000));

    console.log('Waiting for Kafka Connect to be ready...');
    try {
      await waitForPort(18083, 60, 3000);
      console.log('Kafka Connect is ready');
    } catch (error) {
      console.warn('Kafka Connect did not become ready within timeout. Tests may need to wait longer or skip Connect-dependent tests.');
    }

    console.log('Giving services additional time to fully initialize...');
    await new Promise(resolve => setTimeout(resolve, 10_000));

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
  } catch (error) {
    console.error('Failed to start docker-compose environment:', error);
    await execAsync(`docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down -v`).catch(() => {});
    throw error;
  }
});
