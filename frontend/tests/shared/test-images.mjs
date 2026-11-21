/**
 * Central Docker image configuration for E2E tests.
 * Reads from the shared test-images.json at the repository root.
 */

import config from '../../../test-images.json' with { type: 'json' };

/**
 * Format an image reference from repository and tag.
 * Uses @ separator for digests (sha256:...), : for regular tags.
 */
/** @param {{ repository: string, tag: string }} imageConfig */
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
export const REDPANDA_IMAGE = (process.env.TEST_IMAGE_REDPANDA ?? '') || formatImage(config.images.redpanda);

/**
 * Kafka Connect Docker image.
 * Override with TEST_IMAGE_KAFKA_CONNECT environment variable.
 */
export const KAFKA_CONNECT_IMAGE =
  (process.env.TEST_IMAGE_KAFKA_CONNECT ?? '') || formatImage(config.images.kafkaConnect);

/**
 * OwlShop Docker image.
 * Override with TEST_IMAGE_OWL_SHOP environment variable.
 */
export const OWL_SHOP_IMAGE = (process.env.TEST_IMAGE_OWL_SHOP ?? '') || formatImage(config.images.owlShop);

/**
 * Apache Kafka (bitnami) Docker image.
 * Override with TEST_IMAGE_KAFKA environment variable.
 */
export const KAFKA_IMAGE = (process.env.TEST_IMAGE_KAFKA ?? '') || formatImage(config.images.kafka);
