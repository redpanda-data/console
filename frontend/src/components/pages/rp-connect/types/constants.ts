import { defineStepper } from 'components/redpanda-ui/components/stepper';

import type { ConnectComponentSpec } from './schema';

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

export const CUSTOM_COMPONENT_NAME = 'Custom';

export const customComponentConfig: ConnectComponentSpec = {
  name: CUSTOM_COMPONENT_NAME,
  type: 'custom',
  plugin: false,
};

export const WizardStep = {
  ADD_INPUT: 'add-input-step',
  ADD_OUTPUT: 'add-output-step',
  ADD_TOPIC: 'add-topic-step',
  ADD_USER: 'add-user-step',
  CREATE_CONFIG: 'create-config-step',
} as const;

export type WizardStepType = (typeof WizardStep)[keyof typeof WizardStep];

export const wizardStepDefinitions = [
  {
    id: WizardStep.ADD_INPUT,
    title: 'Send data',
  },
  { id: WizardStep.ADD_OUTPUT, title: 'Receive data' },
  { id: WizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: WizardStep.ADD_USER, title: 'Add a user' },
  { id: WizardStep.CREATE_CONFIG, title: 'Create pipeline' },
];

const Stepper = defineStepper(...wizardStepDefinitions);
export const WizardStepper = Stepper.Stepper;
export type WizardStepperSteps = typeof Stepper.Steps;
