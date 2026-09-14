import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsDir = resolve(__dirname, '..');

/**
 * Discovers all test variants by scanning for test-variant-* directories
 * @returns {Array<{name: string, dirName: string, path: string, config: object}>}
 */
export function discoverVariants() {
  const variants = [];

  const entries = readdirSync(testsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('test-variant-')) {
      const variantPath = join(testsDir, entry.name);
      const configPath = join(variantPath, 'config', 'variant.json');

      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          variants.push({
            name: config.name,
            dirName: entry.name,
            path: variantPath,
            config,
          });
        } catch (error) {
          console.error(`Error reading variant config at ${configPath}:`, error.message);
        }
      } else {
        console.warn(`Variant directory ${entry.name} is missing config/variant.json`);
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

// CLI usage
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
