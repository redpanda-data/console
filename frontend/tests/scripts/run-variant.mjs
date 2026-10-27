import { discoverVariants, getVariant } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsDir = resolve(__dirname, '..');

// Listen on `port` once: calls `onFree` after the listener closes, or `onBusy`
// when the bind fails.
function probePort(port, onFree, onBusy) {
  const srv = net.createServer();
  srv.unref();
  srv.once('error', () => onBusy());
  srv.listen(port, '127.0.0.1', () => {
    srv.close(() => onFree());
  });
}

// Find a free TCP port in a NON-ephemeral range. Binding to :0 returns an
// ephemeral port (macOS 49152–65535), which the OS may hand to an outbound
// connection in the gap before Docker binds it (→ "address already in use").
// Probing a fixed range below that window avoids the race. `taken` excludes
// ports already chosen this run so we don't hand out duplicates.
function getFreePort(taken = new Set(), min = 20_000, max = 45_000) {
  return new Promise((resolveP, rejectP) => {
    let attempts = 0;
    const tryPort = () => {
      if (attempts++ > 100) {
        rejectP(new Error('Could not find a free port'));
        return;
      }
      const port = min + Math.floor(Math.random() * (max - min));
      if (taken.has(port)) {
        tryPort();
        return;
      }
      probePort(
        port,
        () => {
          taken.add(port);
          resolveP(port);
        },
        () => tryPort()
      );
    };
    tryPort();
  });
}

// Assigns a free port to each key, one key at a time: a probe only records its
// port in `taken` once it finishes, so concurrent probes could hand two services
// the same port.
async function allocatePorts([key, ...remainingKeys], taken, ports = {}) {
  if (key === undefined) {
    return ports;
  }
  ports[key] = await getFreePort(taken);
  return allocatePorts(remainingKeys, taken, ports);
}

// Allocate a fresh free host port for every service the variant exposes, so
// local runs never collide with whatever is already on the default ports (e.g.
// a dev Console on :3000). CI keeps the fixed variant.json ports — separate
// runners, no collisions — unless E2E_DYNAMIC_PORTS=1 is set.
function resolveDynamicPorts(variant) {
  const staticPorts = variant.config.ports ?? {};
  const useDynamic =
    process.env.E2E_DYNAMIC_PORTS === '1' || (!process.env.CI && process.env.E2E_DYNAMIC_PORTS !== '0');
  if (!useDynamic) {
    return Promise.resolve(null);
  }
  return allocatePorts(Object.keys(staticPorts), new Set());
}

function printAvailableVariants() {
  console.log('Available variants:');
  const variants = discoverVariants();
  for (const variant of variants) {
    console.log(`  - ${variant.name}`);
  }
}

function printExamples() {
  console.log('Examples:');
  console.log('  bun run e2e-test:variant console');
  console.log('  bun run e2e-test:variant console-enterprise --watch');
  console.log('  bun run e2e-test:variant console --watch');
}

function printUsage() {
  console.log('Usage: bun run e2e-test:variant <variant-name> [rstest-options]');
  console.log('');
  printAvailableVariants();
  console.log('');
  printExamples();
}

function printUnknownVariant(variantName) {
  console.error(`Error: Variant "${variantName}" not found.`);
  console.log('');
  printUsage();
}

// Returns the variant and its Rstest config path, or null after explaining why it cannot run.
function findRunnableVariant(variantName) {
  const variant = getVariant(variantName);

  if (!variant) {
    printUnknownVariant(variantName);
    return null;
  }

  const configPath = join(variant.path, 'rstest.config.ts');

  if (!existsSync(configPath)) {
    console.error(`Error: Rstest config not found at ${configPath}`);
    return null;
  }

  return { variant, configPath };
}

function printVariantHeader(variant, configPath) {
  console.log(`Running variant: ${variant.name} (${variant.config.displayName})`);
  console.log(`Config: ${configPath}`);
  console.log('');
}

// Pick free host ports up front (before Rstest loads its config, so the
// config's baseURL can read REACT_APP_ORIGIN). global-setup merges
// E2E_PORTS_OVERRIDE over variant.json for the container port mappings.
async function resolvePortEnv(variant) {
  const dynamicPorts = await resolveDynamicPorts(variant);
  const portEnv = {};
  if (dynamicPorts) {
    portEnv.E2E_PORTS_OVERRIDE = JSON.stringify(dynamicPorts);
    if (dynamicPorts.backend && !process.env.REACT_APP_ORIGIN) {
      portEnv.REACT_APP_ORIGIN = `http://localhost:${dynamicPorts.backend}`;
    }
    console.log(`Using dynamic host ports: ${JSON.stringify(dynamicPorts)}`);
    console.log('');
  }
  return portEnv;
}

function spawnRstest(variant, configPath, rstestArgs, portEnv) {
  const args = ['run', 'rstest', ...rstestArgs, '--config', configPath];

  return spawn('bun', args, {
    stdio: 'inherit',
    cwd: testsDir,
    env: {
      ...process.env,
      E2E_VARIANT: variant.name,
      // Force IPv4 for testcontainers wait strategies (localhost resolves to ::1 on macOS, causing hangs)
      TESTCONTAINERS_HOST_OVERRIDE: process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1',
      ...portEnv,
    },
  });
}

function waitForSuccessfulExit(child) {
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Rstest exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function runVariant(variantName, rstestArgs = []) {
  const runnable = findRunnableVariant(variantName);

  if (!runnable) {
    process.exitCode = 1;
    return;
  }

  const { variant, configPath } = runnable;
  printVariantHeader(variant, configPath);

  const portEnv = await resolvePortEnv(variant);
  const child = spawnRstest(variant, configPath, rstestArgs, portEnv);

  return waitForSuccessfulExit(child);
}

// CLI
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
} else {
  const variantName = args[0];
  const rstestArgs = args.slice(1);

  runVariant(variantName, rstestArgs).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
