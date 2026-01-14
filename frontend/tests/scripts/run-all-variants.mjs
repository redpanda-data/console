import { discoverVariants } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

async function runVariant(variant, playwrightArgs = []) {
  const configPath = join(variant.path, 'playwright.config.ts');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running variant: ${variant.name} (${variant.config.displayName})`);
  console.log(`${'='.repeat(60)}\n`);

  // Add explicit reporters in CI to ensure correct output format
  const reporterArgs = process.env.CI ? ['--reporter=github', '--reporter=html'] : [];

  const args = ['playwright', 'test', '--config', configPath, ...reporterArgs, ...playwrightArgs];

  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: variant.path,
    env: {
      ...process.env,
    },
  });

  return new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ variant: variant.name, code, skipped: false });
    });
    child.on('error', (error) => {
      console.error(`Error running variant ${variant.name}:`, error.message);
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

  console.log(`\nRunning ${runnableVariants.length} variant(s)...`);

  const results = [];

  for (const variant of runnableVariants) {
    const result = await runVariant(variant, playwrightArgs);
    results.push(result);
  }

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

  if (hasFailures) {
    console.error('Some variants failed');
    process.exit(1);
  }

  console.log('All runnable variants passed');
}

// CLI
const args = process.argv.slice(2);
runAllVariants(args);
