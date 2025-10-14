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

export const REDPANDA_CONTEXTUAL_VARIABLES = {
  REDPANDA_BROKERS: {
    name: 'REDPANDA_BROKERS' as const,
    description: 'Bootstrap server address of the cluster',
    usedIn: ['seed_brokers', 'addresses', 'brokers'] as const,
  },
  REDPANDA_SCHEMA_REGISTRY_URL: {
    name: 'REDPANDA_SCHEMA_REGISTRY_URL' as const,
    description: 'Schema Registry URL for the cluster',
    usedIn: ['url'] as const, // Within schema_registry object
  },
  REDPANDA_ID: {
    name: 'REDPANDA_ID' as const,
    description: 'Cluster ID',
    usedIn: [] as const, // Metadata/tracking
  },
  REDPANDA_REGION: {
    name: 'REDPANDA_REGION' as const,
    description: 'Cloud region where pipeline is deployed',
    usedIn: [] as const, // Regional context
  },
  REDPANDA_PIPELINE_ID: {
    name: 'REDPANDA_PIPELINE_ID' as const,
    description: 'Pipeline ID currently running',
    usedIn: [] as const, // Pipeline tracking
  },
  REDPANDA_PIPELINE_NAME: {
    name: 'REDPANDA_PIPELINE_NAME' as const,
    description: 'Pipeline display name currently running',
    usedIn: [] as const, // Pipeline tracking
  },
} as const;

export const getContextualVariableSyntax = (name: ContextualVariableName): string => `\${${name}}`;

export type ContextualVariableName = keyof typeof REDPANDA_CONTEXTUAL_VARIABLES;

export const REDPANDA_SERVERLESS_SECRETS = {
  USERNAME: 'REDPANDA_USERNAME',
  PASSWORD: 'REDPANDA_PASSWORD',
} as const;

export const getSecretSyntax = (secretName: string): string => `\${secrets.${secretName}}`;

export const CUSTOM_COMPONENT_NAME = 'custom';

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
