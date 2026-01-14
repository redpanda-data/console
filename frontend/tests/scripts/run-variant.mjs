import { discoverVariants, getVariant } from './discover-variants.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsDir = resolve(__dirname, '..');

function printUsage() {
  console.log('Usage: bun run e2e-test:variant <variant-name> [playwright-options]');
  console.log('');
  console.log('Available variants:');
  const variants = discoverVariants();
  for (const variant of variants) {
    console.log(`  - ${variant.name}`);
  }
  console.log('');
  console.log('Examples:');
  console.log('  bun run e2e-test:variant console');
  console.log('  bun run e2e-test:variant console-enterprise --ui');
  console.log('  bun run e2e-test:variant console --headed');
}

async function runVariant(variantName, playwrightArgs = []) {
  const variant = getVariant(variantName);

  if (!variant) {
    console.error(`Error: Variant "${variantName}" not found.`);
    console.log('');
    printUsage();
    process.exit(1);
  }

  const configPath = join(variant.path, 'playwright.config.ts');

  if (!existsSync(configPath)) {
    console.error(`Error: Playwright config not found at ${configPath}`);
    process.exit(1);
  }

  console.log(`Running variant: ${variant.name} (${variant.config.displayName})`);
  console.log(`Config: ${configPath}`);
  console.log('');

  // Add explicit reporters in CI to ensure correct output format
  const reporterArgs = process.env.CI ? ['--reporter=github', '--reporter=html'] : [];

  const args = ['playwright', 'test', '--config', configPath, ...reporterArgs, ...playwrightArgs];

  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: testsDir,
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Playwright exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

// CLI
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
  process.exit(0);
}

const variantName = args[0];
const playwrightArgs = args.slice(1);

runVariant(variantName, playwrightArgs).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
