import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsDir = resolve(__dirname, '..');

function readVariant(dirName) {
  const variantPath = join(testsDir, dirName);
  const configPath = join(variantPath, 'config', 'variant.json');

  if (!existsSync(configPath)) {
    console.warn(`Variant directory ${dirName} is missing config/variant.json`);
    return null;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return {
      name: config.name,
      dirName,
      path: variantPath,
      config,
    };
  } catch (error) {
    console.error(`Error reading variant config at ${configPath}:`, error.message);
    return null;
  }
}

/**
 * Discovers variants by scanning `test-variant-*` directories, omitting missing
 * or unreadable configs.
 * @returns {Array<{name: string, dirName: string, path: string, config: object}>}
 */
export function discoverVariants() {
  const variants = [];

  const entries = readdirSync(testsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('test-variant-')) {
      const variant = readVariant(entry.name);
      if (variant) {
        variants.push(variant);
      }
    }
  }

  return variants.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a specific variant by name
 * @param {string} name - Variant name (e.g., "console")
 * @returns {object|null}
 */
export function getVariant(name) {
  return discoverVariants().find((v) => v.name === name) ?? null;
}

/**
 * Get variant directory path by name
 * @param {string} name - Variant name
 * @returns {string|null}
 */
export function getVariantPath(name) {
  const variant = getVariant(name);
  return variant ? variant.path : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const variants = discoverVariants();
  console.log('Discovered variants:');
  for (const variant of variants) {
    console.log(`  - ${variant.name} (${variant.dirName})`);
    console.log(`    Path: ${variant.path}`);
    console.log(`    Enterprise: ${variant.config.isEnterprise}`);
    console.log(`    Backend port: ${variant.config.ports.backend}`);
  }
}
