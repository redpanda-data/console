import { discoverVariants } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBackendImage } from '../shared/global-setup.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsDir = resolve(__dirname, '..', 'playwright-report');

// Number of shards for variants with many tests. Controlled via E2E_SHARD_COUNT env var.
const SHARD_COUNT = Number.parseInt(process.env.E2E_SHARD_COUNT ?? '2', 10);
// Minimum test file count to enable sharding (don't shard tiny variants)
const SHARD_THRESHOLD = 5;

function spawnPlaywright(variant, extraArgs, label) {
  const configPath = join(variant.path, 'playwright.config.ts');
  const startTime = Date.now();
  const args = ['playwright', 'test', '--config', configPath, ...extraArgs];

  const isParallel = process.env.CI;
  let logStream;
  let child;

  if (isParallel) {
    mkdirSync(reportsDir, { recursive: true });
    const logPath = join(reportsDir, `${label.replace(/\//g, '-')}.log`);
    logStream = createWriteStream(logPath);

    child = spawn('npx', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: variant.path,
      env: {
        ...process.env,
        TESTCONTAINERS_HOST_OVERRIDE: process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1',
      },
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
  } else {
    child = spawn('npx', args, {
      stdio: 'inherit',
      cwd: variant.path,
      env: {
        ...process.env,
        TESTCONTAINERS_HOST_OVERRIDE: process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1',
      },
    });
  }

  return new Promise((resolve) => {
    child.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const status = code === 0 ? 'PASSED' : 'FAILED';
      console.log(`[${label}] ${status} (${elapsed}s)`);
      if (logStream) logStream.end();
      resolve({ variant: label, code, skipped: false });
    });
    child.on('error', (error) => {
      console.error(`[${label}] Error: ${error.message}`);
      if (logStream) logStream.end();
      resolve({ variant: label, code: 1, skipped: false });
    });
  });
}

/**
 * Count spec files for a variant to decide whether sharding is worthwhile.
 */
async function countSpecFiles(variantPath) {
  const { readdirSync } = await import('node:fs');
  let count = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.spec.ts')) count++;
    }
  }
  walk(variantPath);
  return count;
}

async function runVariant(variant, playwrightArgs = []) {
  const specCount = await countSpecFiles(variant.path);
  const shouldShard = process.env.CI && SHARD_COUNT > 1 && specCount >= SHARD_THRESHOLD;

  if (shouldShard) {
    console.log(`[${variant.name}] Sharding into ${SHARD_COUNT} (${specCount} spec files)...`);

    // Launch shard 1 first — it will run global setup and create containers.
    // Then launch remaining shards which will find the state file and skip setup.
    const shard1Label = `${variant.name}/shard-1`;
    const shard1Result = await new Promise((resolve) => {
      const p = spawnPlaywright(variant, [...playwrightArgs, `--shard=1/${SHARD_COUNT}`], shard1Label);
      // Wait briefly for global setup to write the state file before launching other shards.
      // We poll for the state file rather than waiting a fixed time.
      const stateFile = join(dirname(variant.path), `.testcontainers-state-${variant.config.name}.json`);
      const checkInterval = setInterval(async () => {
        const { existsSync } = await import('node:fs');
        if (existsSync(stateFile)) {
          clearInterval(checkInterval);
          // State file exists — launch remaining shards
          const otherShards = [];
          for (let i = 2; i <= SHARD_COUNT; i++) {
            const label = `${variant.name}/shard-${i}`;
            otherShards.push(spawnPlaywright(variant, [...playwrightArgs, `--shard=${i}/${SHARD_COUNT}`], label));
          }
          // Wait for shard 1 + all other shards
          const [s1, ...rest] = await Promise.all([p, ...otherShards]);
          resolve([s1, ...rest]);
        }
      }, 1000);

      // Fallback: if shard 1 finishes before state file appears (e.g. setup failed),
      // clear interval and return its result alone
      p.then((result) => {
        clearInterval(checkInterval);
        resolve([result]);
      });
    });

    // Flatten results — treat any shard failure as variant failure
    const shardResults = Array.isArray(shard1Result) ? shard1Result : [shard1Result];
    const worstCode = Math.max(...shardResults.map((r) => r.code));
    return { variant: variant.name, code: worstCode, skipped: false, shardResults };
  }

  // No sharding — run directly
  console.log(`[${variant.name}] Starting...`);
  return spawnPlaywright(variant, playwrightArgs, variant.name);
}

async function runAllVariants(playwrightArgs = []) {
  const allVariants = discoverVariants({ includeUnrunnable: true });

  if (allVariants.length === 0) {
    console.error('No variants found. Make sure test-variant-* directories exist with config/variant.json');
    process.exit(1);
  }

  const runnableVariants = allVariants.filter((v) => v.canRun);
  const skippedVariants = allVariants.filter((v) => !v.canRun);

  console.log(`Found ${allVariants.length} variant(s): ${allVariants.map((v) => v.name).join(', ')}`);

  if (skippedVariants.length > 0) {
    console.log(`\nSkipping ${skippedVariants.length} variant(s) due to missing requirements:`);
    for (const variant of skippedVariants) {
      console.log(`  - ${variant.name}: ${variant.skipReason}`);
    }
  }

  if (runnableVariants.length === 0) {
    console.error('\nNo runnable variants found');
    process.exit(1);
  }

  // Pre-build backend Docker images once before launching variants in parallel.
  console.log('\nPre-building backend Docker image(s)...');
  const needsEnterprise = runnableVariants.some((v) => v.config.isEnterprise);
  const ossImageTag = await buildBackendImage(false);
  process.env.E2E_PREBUILT_IMAGE_TAG = ossImageTag;

  if (needsEnterprise) {
    const enterpriseImageTag = await buildBackendImage(true);
    process.env.E2E_PREBUILT_IMAGE_TAG_ENTERPRISE = enterpriseImageTag;
  }

  console.log(`\nRunning ${runnableVariants.length} variant(s) in parallel...`);

  const results = await Promise.all(runnableVariants.map((variant) => runVariant(variant, playwrightArgs)));

  // Add skipped variants
  for (const variant of skippedVariants) {
    results.push({ variant: variant.name, code: 0, skipped: true, skipReason: variant.skipReason });
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log(`${'='.repeat(60)}`);

  let hasFailures = false;
  for (const result of results) {
    if (result.skipped) {
      console.log(`  \u23ED ${result.variant}: SKIPPED`);
    } else if (result.shardResults) {
      for (const shard of result.shardResults) {
        const status = shard.code === 0 ? 'PASSED' : 'FAILED';
        const icon = shard.code === 0 ? '\u2714' : '\u2718';
        console.log(`  ${icon} ${shard.variant}: ${status}`);
      }
      if (result.code !== 0) hasFailures = true;
    } else {
      const status = result.code === 0 ? 'PASSED' : 'FAILED';
      const icon = result.code === 0 ? '\u2714' : '\u2718';
      console.log(`  ${icon} ${result.variant}: ${status}`);
      if (result.code !== 0) hasFailures = true;
    }
  }

  console.log('');

  // On failure in CI, dump log files for failed shards/variants
  if (hasFailures && process.env.CI) {
    const failedLabels = [];
    for (const result of results) {
      if (result.skipped) continue;
      if (result.shardResults) {
        for (const shard of result.shardResults) {
          if (shard.code !== 0) failedLabels.push(shard.variant);
        }
      } else if (result.code !== 0) {
        failedLabels.push(result.variant);
      }
    }

    for (const label of failedLabels) {
      const logPath = join(reportsDir, `${label.replace(/\//g, '-')}.log`);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Logs for failed: ${label}`);
      console.log(`${'='.repeat(60)}`);
      try {
        const { readFileSync } = await import('node:fs');
        const logContent = readFileSync(logPath, 'utf-8');
        const lines = logContent.split('\n');
        const tail = lines.slice(-200).join('\n');
        if (lines.length > 200) {
          console.log(`... (showing last 200 of ${lines.length} lines)`);
        }
        console.log(tail);
      } catch {
        console.log(`(could not read log file: ${logPath})`);
      }
    }
  }

  if (hasFailures) {
    console.error('Some variants failed');
    process.exit(1);
  }

  console.log('All runnable variants passed');
}

// CLI
const args = process.argv.slice(2);
runAllVariants(args);
