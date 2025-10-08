/**
 * Components that support Redpanda secret population from wizard
 * Includes Kafka-compatible components and Redpanda migrator tools
 */
export const REDPANDA_SECRET_COMPONENTS = [
  'kafka',
  'kafka_franz',
  'redpanda',
  'redpanda_common',
  'redpanda_migrator',
  'redpanda_migrator_bundle',
  'redpanda_migrator_offsets',
];

/**
 * Fields that are critical for connection and should always be shown
 * even when they have defaults
 */
export const CRITICAL_CONNECTION_FIELDS = new Set(['addresses', 'seed_brokers', 'topics', 'topic', 'brokers']);

/**
 * Configuration object fields that should be hidden for REDPANDA_SECRET_COMPONENTS
 * when wizard data exists (unless showOptionalFields is true)
 */
export const NON_CRITICAL_CONFIG_OBJECTS = new Set(['tls', 'metadata', 'batching', 'backoff', 'retry']);

export const WizardStep = {
  ADD_INPUT: 'add-input-step',
  ADD_OUTPUT: 'add-output-step',
  ADD_TOPIC: 'add-topic-step',
  ADD_USER: 'add-user-step',
} as const;

export type WizardStepType = (typeof WizardStep)[keyof typeof WizardStep];
