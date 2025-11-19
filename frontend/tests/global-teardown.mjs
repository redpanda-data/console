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
  console.log('Stopping docker-compose environment...');

  try {
    if (!fs.existsSync(CONTAINER_STATE_FILE)) {
      console.log('No container state file found, skipping teardown');
      return;
    }

    const state = JSON.parse(fs.readFileSync(CONTAINER_STATE_FILE, 'utf8'));

    console.log(`Stopping docker-compose project: ${state.projectName}`);

    await execAsync(`docker compose -f "${state.composeFile}" -p "${state.projectName}" down -v`);

    fs.unlinkSync(CONTAINER_STATE_FILE);

    console.log('Docker-compose environment stopped successfully');
  } catch (error) {
    console.error('Failed to stop docker-compose environment:', error);
  }
}
