import { COMPONENT_CATEGORIES } from '../types/rpcn-schema';

const displayNames: Record<string, string> = {
  // Component types
  input: 'Inputs',
  output: 'Outputs',
  processor: 'Processors',
  cache: 'Caches',
  buffer: 'Buffers',
  rate_limit: 'Rate Limits',
  scanner: 'Scanners',
  metrics: 'Metrics',
  tracer: 'Tracers',
  // Semantic categories
  databases: 'Databases',
  messaging: 'Message Queues',
  storage: 'File Storage',
  api: 'API Clients',
  aws: 'AWS Services',
  gcp: 'Google Cloud',
  azure: 'Azure Services',
  cloud: 'Cloud Services',
  export: 'Data Export',
  transformation: 'Data Transformation',
  monitoring: 'Monitoring & Observability',
  // Additional categories
  windowing: 'Windowing',
  utility: 'Utility',
  local: 'Local',
  social: 'Social',
  network: 'Network',
  integration: 'Integration',
  spicedb: 'SpiceDB',
  ai: 'AI/ML',
  parsing: 'Parsing',
  mapping: 'Mapping',
  composition: 'Composition',
  unstructured: 'Unstructured',
};

export const getCategoryDisplayName = (category: string): string => {
  return displayNames[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
};

const databaseComponents = [
  'sql',
  'postgres',
  'mysql',
  'redis',
  'mongodb',
  'cassandra',
  'dynamodb',
  'elasticsearch',
  'opensearch',
  'snowflake',
  'clickhouse',
  'influxdb',
];
const cloudComponents = ['aws', 'gcp', 'azure', 's3', 'sqs', 'sns', 'kinesis', 'pubsub', 'blob', 'cloud'];
const messagingComponents = ['kafka', 'nats', 'rabbitmq', 'mqtt', 'amqp', 'jetstream', 'pubsub'];
const fileComponents = ['file', 'sftp', 'ftp', 'tar', 'zip'];
const httpComponents = ['http', 'webhook', 'api', 'websocket', 'rest'];
const exportKeywords = ['json', 'xml', 'csv', 'parquet', 'avro', 'protobuf'];
const transformationKeywords = [
  'transform',
  'process',
  'map',
  'bloblang',
  'jq',
  'jmespath',
  'branch',
  'split',
  'compress',
  'decompress',
];
const monitoringKeywords = ['metric', 'log', 'trace', 'prometheus', 'jaeger', 'opentelemetry', 'statsd'];

export const inferComponentCategory = (componentName: string): string[] => {
  const name = componentName.toLowerCase();
  const categories: string[] = [];

  // Database-related components
  if (databaseComponents.some((db) => name.includes(db))) {
    categories.push(COMPONENT_CATEGORIES.DATABASES);
  }

  // Cloud/Service providers
  if (cloudComponents.some((cloud) => name.includes(cloud))) {
    categories.push(COMPONENT_CATEGORIES.CLOUD);
    if (name.includes('aws')) categories.push(COMPONENT_CATEGORIES.AWS);
    if (name.includes('gcp') || name.includes('google')) categories.push(COMPONENT_CATEGORIES.GCP);
    if (name.includes('azure')) categories.push(COMPONENT_CATEGORIES.AZURE);
  }

  // Messaging/Streaming
  if (messagingComponents.some((msg) => name.includes(msg))) {
    categories.push(COMPONENT_CATEGORIES.MESSAGING);
  }

  // File/Storage
  if (fileComponents.some((file) => name.includes(file))) {
    categories.push(COMPONENT_CATEGORIES.STORAGE);
  }

  // HTTP/API
  if (httpComponents.some((http) => name.includes(http))) {
    categories.push(COMPONENT_CATEGORIES.API);
  }

  // Data format components
  if (exportKeywords.some((exportComponent) => name.includes(exportComponent))) {
    categories.push(COMPONENT_CATEGORIES.EXPORT);
  }

  // Transformation components (processors)
  if (transformationKeywords.some((transformationComponent) => name.includes(transformationComponent))) {
    categories.push(COMPONENT_CATEGORIES.TRANSFORMATION);
  }

  // Monitoring components
  if (monitoringKeywords.some((monitoringComponent) => name.includes(monitoringComponent))) {
    categories.push(COMPONENT_CATEGORIES.MONITORING);
  }

  // If no specific category found, leave empty (don't assign 'other')
  // Components without categories will be handled by the default display logic

  return categories;
};
