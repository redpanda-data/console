/**
 * Central Docker image configuration for E2E tests.
 * Reads from the shared test-images.json at the repository root.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to shared config at repo root: frontend/tests/shared -> repo root
const configPath = resolve(__dirname, '../../../test-images.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

/**
 * Format an image reference from repository and tag.
 * Uses @ separator for digests (sha256:...), : for regular tags.
 */
function formatImage(imageConfig) {
  const { repository, tag } = imageConfig;
  if (tag.startsWith('sha256:')) {
    return `${repository}@${tag}`;
  }
  return `${repository}:${tag}`;
}

/**
 * Redpanda Docker image.
 * Override with TEST_IMAGE_REDPANDA environment variable.
 */
export const REDPANDA_IMAGE = process.env.TEST_IMAGE_REDPANDA || formatImage(config.images.redpanda);

/**
 * Kafka Connect Docker image.
 * Override with TEST_IMAGE_KAFKA_CONNECT environment variable.
 */
export const KAFKA_CONNECT_IMAGE = process.env.TEST_IMAGE_KAFKA_CONNECT || formatImage(config.images.kafkaConnect);

/**
 * OwlShop Docker image.
 * Override with TEST_IMAGE_OWL_SHOP environment variable.
 */
export const OWL_SHOP_IMAGE = process.env.TEST_IMAGE_OWL_SHOP || formatImage(config.images.owlShop);
