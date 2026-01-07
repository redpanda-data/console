import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsDir = resolve(__dirname, '..');

// Default license file path for enterprise variants
const DEFAULT_LICENSE_PATH = resolve(
  __dirname,
  '../../../../console-enterprise/frontend/tests/config/redpanda.license'
);

/**
 * Check if a variant can run based on its requirements
 * @param {object} config - Variant configuration
 * @returns {{canRun: boolean, reason: string|null}}
 */
function checkVariantRequirements(config) {
  // Check if license is required and available
  if (config.requiresLicense) {
    const licensePath = process.env.REDPANDA_LICENSE_PATH || DEFAULT_LICENSE_PATH;
    const hasLicenseEnv = Boolean(process.env.ENTERPRISE_LICENSE_CONTENT);
    const hasLicenseFile = existsSync(licensePath);

    if (!(hasLicenseEnv || hasLicenseFile)) {
      return {
        canRun: false,
        reason: `License required but not found. Set ENTERPRISE_LICENSE_CONTENT env var or place license at ${licensePath}`,
      };
    }
  }

  return { canRun: true, reason: null };
}

/**
 * Discovers all test variants by scanning for test-variant-* directories
 * @param {{includeUnrunnable?: boolean}} options
 * @returns {Array<{name: string, path: string, config: object, canRun: boolean, skipReason: string|null}>}
 */
export function discoverVariants(options = {}) {
  const { includeUnrunnable = false } = options;
  const variants = [];

  const entries = readdirSync(testsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('test-variant-')) {
      const variantPath = join(testsDir, entry.name);
      const configPath = join(variantPath, 'config', 'variant.json');

      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const { canRun, reason } = checkVariantRequirements(config);

          if (canRun || includeUnrunnable) {
            variants.push({
              name: config.name,
              dirName: entry.name,
              path: variantPath,
              config,
              canRun,
              skipReason: reason,
            });
          }
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
  const variants = discoverVariants();
  return variants.find((v) => v.name === name) || null;
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
