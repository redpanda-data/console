import { discoverVariants } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsDir = resolve(__dirname, '..', 'playwright-report');

async function runVariant(variant, playwrightArgs = []) {
  const configPath = join(variant.path, 'playwright.config.ts');
  const startTime = Date.now();

  console.log(`[${variant.name}] Starting...`);

  const args = ['playwright', 'test', '--config', configPath, ...playwrightArgs];

  // In CI with parallel variants, pipe output to log files to avoid interleaving.
  // Locally or with a single variant, inherit stdio for immediate feedback.
  const isParallel = process.env.CI;
  let logStream;
  let child;

  if (isParallel) {
    mkdirSync(reportsDir, { recursive: true });
    const logPath = join(reportsDir, `${variant.name}.log`);
    logStream = createWriteStream(logPath);

    child = spawn('npx', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: variant.path,
      env: {
        ...process.env,
        // Force IPv4 for testcontainers wait strategies
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
      console.log(`[${variant.name}] ${status} (${elapsed}s)`);
      if (logStream) logStream.end();
      resolve({ variant: variant.name, code, skipped: false });
    });
    child.on('error', (error) => {
      console.error(`[${variant.name}] Error: ${error.message}`);
      if (logStream) logStream.end();
      resolve({ variant: variant.name, code: 1, skipped: false });
    });
  });
}

async function runAllVariants(playwrightArgs = []) {
  // Get all variants including unrunnable ones for display
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

  console.log(`\nRunning ${runnableVariants.length} variant(s) in parallel...`);

  // Run all variants in parallel — each uses different ports and Docker networks
  const results = await Promise.all(runnableVariants.map((variant) => runVariant(variant, playwrightArgs)));

  // Add skipped variants to results
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
    } else {
      const status = result.code === 0 ? 'PASSED' : 'FAILED';
      const icon = result.code === 0 ? '\u2714' : '\u2718';
      console.log(`  ${icon} ${result.variant}: ${status}`);
      if (result.code !== 0) {
        hasFailures = true;
      }
    }
  }

  console.log('');

  // On failure in CI, dump the log files for failed variants
  if (hasFailures && process.env.CI) {
    for (const result of results) {
      if (!result.skipped && result.code !== 0) {
        const logPath = join(reportsDir, `${result.variant}.log`);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Logs for failed variant: ${result.variant}`);
        console.log(`${'='.repeat(60)}`);
        try {
          const { readFileSync } = await import('node:fs');
          const logContent = readFileSync(logPath, 'utf-8');
          // Print last 200 lines to avoid overwhelming output
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
