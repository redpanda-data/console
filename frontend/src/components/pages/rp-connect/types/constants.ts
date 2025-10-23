import { defineStepper } from 'components/redpanda-ui/components/stepper';
import type { MotionProps } from 'motion/react';

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

/**
 * Fields that are critical for connection and should always be shown
 * even when they have defaults
 */
export const CRITICAL_CONNECTION_FIELDS = new Set([
  'addresses',
  'seed_brokers',
  'topics',
  'topic',
  'brokers',
  'tls',
  'consumer_group',
]);

/**
 * Configuration object fields that should be hidden for REDPANDA_SECRET_COMPONENTS
 * when wizard data exists (unless showOptionalFields is true)
 * Note: 'tls' is NOT included here because Redpanda Cloud always requires TLS enabled
 */
export const NON_CRITICAL_CONFIG_OBJECTS = new Set(['metadata', 'batching', 'backoff', 'retry']);

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

// temporary until we get backend support to filter out managed components
// currently query selecting components that are visible using this filter:
// @link https://docs.redpanda.com/redpanda-connect/components/about/?type=processor%2Cinput%2Coutput%2Cscanner%2Cmetric%2Ccache%2Ctracer%2Crate_limit%2Cbuffer&support=certified%2Ccommunity&cloud=no&enterprise=yes%2Cno
export const MANAGED_ONLY_CONNECT_COMPONENTS = [
  'amqp_1',
  'awk',
  'aws_cloudwatch',
  'beanstalkd',
  'cassandra',
  'cockroachdb_changefeed',
  'command',
  'couchbase',
  'crash',
  'cypher',
  'discord',
  'dynamic',
  'file',
  'grok',
  'hdfs',
  'influxdb',
  'jaeger',
  'javascript',
  'json_api',
  'logger',
  'msgpack',
  'nanomsg',
  'nats_stream',
  'nsq',
  'ockam_kafka',
  'ollama_chat',
  'ollama_embeddings',
  'ollama_moderation',
  'open_telemetry_collector',
  'parquet',
  'protobuf',
  'pulsar',
  'pusher',
  'redpanda_data_transform',
  'sentry_capture',
  'socket',
  'socket_server',
  'sqlite',
  'statsd',
  'stdin',
  'stdout',
  'subprocess',
  'tigerbeetle_cdc',
  'twitter_search',
  'wasm',
  'websocket',
  'zmq4',
];

export const getContextualVariableSyntax = (name: ContextualVariableName): string => `\${${name}}`;

export type ContextualVariableName = keyof typeof REDPANDA_CONTEXTUAL_VARIABLES;

export const convertToScreamingSnakeCase = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '_');

export const getSecretSyntax = (secretName: string): string => `\${secrets.${secretName}}`;

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
    title: 'Add an input',
  },
  { id: WizardStep.ADD_OUTPUT, title: 'Add an output' },
  { id: WizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: WizardStep.ADD_USER, title: 'Add permissions' },
  { id: WizardStep.CREATE_CONFIG, title: 'Edit pipeline' },
];

const Stepper = defineStepper(...wizardStepDefinitions);
export const WizardStepper = Stepper.Stepper;
export type WizardStepperSteps = typeof Stepper.Steps;

export const stepMotionProps: MotionProps = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: 'easeInOut' },
};
