import { discoverVariants } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBackendImage } from '../shared/global-setup.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsDir = resolve(__dirname, '..', '.rstest');

function variantStatus(code, rstestArgs) {
  return code === 0 ? (rstestArgs.includes('list') ? 'COLLECTED' : 'PASSED') : 'FAILED';
}

function variantEnv(variant) {
  return {
    ...process.env,
    E2E_VARIANT: variant.name,
    // Force IPv4 for testcontainers wait strategies
    TESTCONTAINERS_HOST_OVERRIDE: process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1',
  };
}

function spawnVariantWithLogFile(variant, bunArgs) {
  mkdirSync(reportsDir, { recursive: true });
  const logPath = join(reportsDir, `${variant.name}.log`);
  const logStream = createWriteStream(logPath);

  const child = spawn('bun', bunArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: resolve(__dirname, '..'),
    env: variantEnv(variant),
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return { child, logStream };
}

function spawnVariantWithInheritedOutput(variant, bunArgs) {
  const child = spawn('bun', bunArgs, {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
    env: variantEnv(variant),
  });
  return { child, logStream: undefined };
}

function waitForVariant(variant, { child, logStream }, startTime, rstestArgs) {
  return new Promise((resolve) => {
    child.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const status = variantStatus(code, rstestArgs);
      console.log(`[${variant.name}] ${status} (${elapsed}s)`);
      if (logStream) {
        logStream.end();
      }
      resolve({ variant: variant.name, code });
    });
    child.on('error', (error) => {
      console.error(`[${variant.name}] Error: ${error.message}`);
      if (logStream) {
        logStream.end();
      }
      resolve({ variant: variant.name, code: 1 });
    });
  });
}

function runVariant(variant, rstestArgs = []) {
  const configPath = join(variant.path, 'rstest.config.ts');
  const startTime = Date.now();

  console.log(`[${variant.name}] Starting...`);

  const args = ['run', 'rstest', ...rstestArgs, '--config', configPath];

  // In CI with parallel variants, pipe output to log files to avoid interleaving.
  // Locally or with a single variant, inherit stdio for immediate feedback.
  const isParallel = process.env.CI;
  const spawned = isParallel ? spawnVariantWithLogFile(variant, args) : spawnVariantWithInheritedOutput(variant, args);

  return waitForVariant(variant, spawned, startTime, rstestArgs);
}

// Pre-build backend Docker images once before launching variants in parallel.
// This avoids race conditions where multiple variants try to copy frontend assets
// and build the same Docker image concurrently.
async function prebuildBackendImages(variants) {
  console.log('\nPre-building backend Docker image(s)...');
  const needsEnterprise = variants.some((v) => v.config.isEnterprise);
  const ossImageTag = await buildBackendImage(false);
  process.env.E2E_PREBUILT_IMAGE_TAG = ossImageTag;

  if (needsEnterprise) {
    const enterpriseImageTag = await buildBackendImage(true);
    process.env.E2E_PREBUILT_IMAGE_TAG_ENTERPRISE = enterpriseImageTag;
  }
}

function printBanner(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log(`${'='.repeat(60)}`);
}

function printSummary(results, rstestArgs) {
  printBanner('Summary');

  for (const result of results) {
    const status = variantStatus(result.code, rstestArgs);
    const icon = result.code === 0 ? '\u2714' : '\u2718';
    console.log(`  ${icon} ${result.variant}: ${status}`);
  }

  console.log('');
}

function printLogTail(logContent) {
  // Print last 200 lines to avoid overwhelming output
  const lines = logContent.split('\n');
  const tail = lines.slice(-200).join('\n');
  if (lines.length > 200) {
    console.log(`... (showing last 200 of ${lines.length} lines)`);
  }
  console.log(tail);
}

function printFailedVariantLog(variantName) {
  const logPath = join(reportsDir, `${variantName}.log`);
  printBanner(`Logs for failed variant: ${variantName}`);
  try {
    const logContent = readFileSync(logPath, 'utf-8');
    printLogTail(logContent);
  } catch {
    console.log(`(could not read log file: ${logPath})`);
  }
}

function printFailedVariantLogs(results) {
  for (const result of results) {
    if (result.code !== 0) {
      printFailedVariantLog(result.variant);
    }
  }
}

function runVariantsInParallel(variants, rstestArgs) {
  console.log(`\nRunning ${variants.length} variant(s) in parallel...`);

  // Run all variants in parallel — each uses different ports and Docker networks
  return Promise.all(variants.map((variant) => runVariant(variant, rstestArgs)));
}

function reportResults(results, rstestArgs) {
  printSummary(results, rstestArgs);
  const hasFailures = results.some((result) => result.code !== 0);

  // On failure in CI, dump the log files for failed variants
  if (hasFailures && process.env.CI) {
    printFailedVariantLogs(results);
  }

  if (hasFailures) {
    console.error('Some variants failed');
    process.exitCode = 1;
    return;
  }

  console.log(
    rstestArgs.includes('list') ? 'All variant inventories collected; no tests executed' : 'All variants passed'
  );
}

async function runAllVariants(rstestArgs = []) {
  const variants = discoverVariants();

  if (variants.length === 0) {
    console.error('No variants found. Make sure test-variant-* directories exist with config/variant.json');
    process.exitCode = 1;
    return;
  }

  console.log(`Found ${variants.length} variant(s): ${variants.map((v) => v.name).join(', ')}`);

  if (!rstestArgs.includes('list')) {
    await prebuildBackendImages(variants);
  }

  const results = await runVariantsInParallel(variants, rstestArgs);

  reportResults(results, rstestArgs);
}

// CLI: top-level await lets Node report a failed run and exit non-zero.
const args = process.argv.slice(2);
await runAllVariants(args);
