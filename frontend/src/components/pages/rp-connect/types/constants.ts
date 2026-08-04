import { defineStepper } from 'components/redpanda-ui/components/stepper';

/**
 * Components that include keys for redpanda topics and users/sasl/acls
 */
export const REDPANDA_TOPIC_AND_USER_COMPONENTS = [
  'kafka',
  'kafka_franz',
  'redpanda',
  'redpanda_common',
  'redpanda_migrator',
  'redpanda_migrator_bundle',
  'redpanda_migrator_offsets',
];

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

export const getContextualVariableSyntax = (name: string): string => `\${${name}}`;

export type ContextualVariableName = keyof typeof REDPANDA_CONTEXTUAL_VARIABLES;

export const convertToScreamingSnakeCase = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '_');

export const getSecretSyntax = (secretName: string): string => `\${secrets.${secretName}}`;

export const RedpandaConnectorSetupStep = {
  ADD_TOPIC: 'redpanda-connector-add-topic',
  ADD_USER: 'redpanda-connector-add-user',
} as const;

export const redpandaConnectorSetupStepDefinitions = [
  { id: RedpandaConnectorSetupStep.ADD_TOPIC, title: 'Add a topic' },
  { id: RedpandaConnectorSetupStep.ADD_USER, title: 'Add permissions' },
] as const;

const RedpandaConnectorSetupStepDefinition = defineStepper(...redpandaConnectorSetupStepDefinitions);
export const RedpandaConnectorSetupStepper = RedpandaConnectorSetupStepDefinition.Stepper;
export type RedpandaConnectorSetupSteps = typeof RedpandaConnectorSetupStepDefinition.Steps;

export type PipelineMode = 'create' | 'edit' | 'view';
