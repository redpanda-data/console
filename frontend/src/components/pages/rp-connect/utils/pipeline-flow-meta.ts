/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// A metadata line shown on an expanded pipeline node card.
export type NodeMetaEntry = { label: string; value: string };

const MAX_META = 3;
const MAX_VALUE_LEN = 52;

// Rendered as dedicated chips, never as a plain meta row.
const TOPIC_FIELDS = new Set(['topic', 'topics']);

// Shorter labels for verbose keys so the value fits the fixed-width card.
const LABEL_OVERRIDES: Record<string, string> = {
  consumer_group: 'group',
  seed_brokers: 'brokers',
  default_ttl: 'ttl',
  request_map: 'request',
  result_map: 'result',
  result_codec: 'codec',
  max_in_flight: 'in flight',
  server_address: 'server',
  collection_name: 'collection',
  queue_name: 'queue',
  table_name: 'table',
  channel_id: 'channel',
  channel_prefix: 'channel',
  error_message: 'error',
};

// Credentials and generic infra knobs the fallback must never surface.
const NOISE_FIELDS = new Set([
  'api_key',
  'apikey',
  'password',
  'secret',
  'secret_key',
  'secret_access_key',
  'access_key_id',
  'token',
  'credentials',
  'private_key',
  'tls',
  'region',
  'enabled',
  'client_id',
  'client_secret',
]);

export function truncate(value: string, max = MAX_VALUE_LEN): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

// Fields to surface per component, in priority order (a generous superset — `pushField` emits
// only those present). Topics omitted (render as chips).
const PREFERRED_FIELDS: Record<string, string[]> = {
  // Kafka / Redpanda family
  kafka: ['consumer_group', 'partition', 'key'],
  kafka_franz: ['consumer_group', 'partition', 'key'],
  redpanda: ['consumer_group', 'partition', 'key'],
  redpanda_common: ['consumer_group', 'key'],
  redpanda_migrator: ['consumer_group'],
  // HTTP
  http: ['url', 'verb'],
  http_client: ['url', 'verb'],
  http_server: ['path'],
  // Generation / files
  generate: ['interval', 'count'],
  file: ['paths', 'path', 'codec'],
  csv: ['paths'],
  // Object storage
  aws_s3: ['bucket', 'prefix', 'path'],
  gcp_cloud_storage: ['bucket', 'prefix', 'path'],
  azure_blob_storage: ['container', 'prefix', 'path'],
  // Queues / messaging
  aws_sqs: ['url'],
  gcp_pubsub: ['subscription', 'project'],
  amqp_0_9: ['url', 'queue', 'exchange'],
  amqp_1: ['url', 'source_address', 'target_address'],
  mqtt: ['urls'],
  nats: ['subject', 'urls'],
  nats_jetstream: ['subject', 'urls'],
  nats_kv: ['bucket', 'key'],
  nsq: ['channel'],
  // SQL
  sql_select: ['driver', 'table'],
  sql_insert: ['driver', 'table'],
  sql_raw: ['driver', 'query'],
  // Stores / search
  redis: ['url', 'default_ttl', 'command', 'operator'],
  redis_streams: ['url'],
  mongodb: ['database', 'collection', 'operation'],
  elasticsearch: ['index', 'urls'],
  opensearch: ['index', 'urls'],
  cassandra: ['query'],
  // AI / ML — the model is the key fact
  openai_chat_completion: ['model'],
  openai_embeddings: ['model'],
  openai_image_generation: ['model'],
  openai_speech: ['model'],
  openai_transcription: ['model'],
  aws_bedrock_chat: ['model'],
  aws_bedrock_embeddings: ['model'],
  gcp_vertex_ai_chat: ['model'],
  gcp_vertex_ai_embeddings: ['model'],
  ollama_chat: ['model', 'server_address'],
  ollama_embeddings: ['model', 'server_address'],
  cohere_chat: ['model'],
  cohere_embeddings: ['model'],
  // Vector stores (RAG)
  qdrant: ['collection_name'],
  pinecone: ['index', 'operation'],
  // More cloud sources / sinks
  aws_kinesis: ['stream'],
  aws_kinesis_firehose: ['stream'],
  aws_dynamodb: ['table'],
  gcp_bigquery: ['dataset', 'table'],
  gcp_bigquery_select: ['table', 'columns'],
  pulsar: ['url'],
  snowflake_streaming: ['table', 'channel_prefix'],
  websocket: ['url'],
  socket: ['address', 'network'],
  socket_server: ['address', 'network'],
  sftp: ['address', 'paths'],
  azure_queue_storage: ['queue_name'],
  azure_cosmosdb: ['container', 'database'],
  azure_table_storage: ['table_name'],
  splunk_hec: ['url'],
  discord: ['channel_id'],
  // Processors
  grok: ['expressions'],
  xml: ['operator'],
  parse_log: ['format'],
  sql: ['driver', 'query'],
  log: ['level', 'message'],
  cache: ['resource', 'operator', 'key'],
  rate_limit: ['resource'],
  dedupe: ['cache', 'key'],
  jmespath: ['query'],
  jq: ['query'],
  schema_registry_encode: ['subject', 'url'],
  schema_registry_decode: ['url'],
  protobuf: ['operator'],
  compress: ['algorithm'],
  decompress: ['algorithm'],
  archive: ['format'],
  unarchive: ['format'],
  aws_lambda: ['function'],
  subprocess: ['name'],
  metric: ['type', 'name'],
  workflow: ['order'],
  // Outputs
  reject: ['error_message'],
  // Resource engines (cache_resources / rate_limit_resources)
  local: ['count', 'interval', 'default_ttl'],
  memcached: ['addresses', 'default_ttl', 'prefix'],
  ristretto: ['default_ttl'],
  lru: ['cap', 'default_ttl'],
  ttlru: ['cap', 'default_ttl'],
  couchbase: ['url', 'bucket', 'default_ttl'],
};

// Identifying scalar field names to prefer before falling back to whatever comes first.
const SALIENT_FIELD_NAMES = [
  'model',
  'url',
  'urls',
  'address',
  'addresses',
  'host',
  'endpoint',
  'uri',
  'dsn',
  'stream',
  'dataset',
  'collection_name',
  'subject',
  'channel',
  'queue',
  'path',
  'paths',
  'bucket',
  'container',
  'table',
  'query',
  'index',
  'collection',
  'database',
  'subscription',
  'command',
  'operator',
  'operation',
  'function',
  'key',
  'name',
  'count',
  'interval',
];

function pushField(meta: NodeMetaEntry[], config: Record<string, unknown>, key: string): void {
  if (TOPIC_FIELDS.has(key)) {
    return;
  }
  const value = config[key];
  if (value === undefined || value === null || value === '') {
    return;
  }
  const label = LABEL_OVERRIDES[key] ?? key;
  if (isScalar(value)) {
    meta.push({ label, value: truncate(String(value)) });
  } else if (Array.isArray(value) && value.length > 0) {
    const display = value.every((item) => isScalar(item))
      ? truncate(value.join(', '))
      : `${value.length} item${value.length === 1 ? '' : 's'}`;
    meta.push({ label, value: display });
  }
}

// Fallback when no preferred field matched: salient-named scalars first, then the first couple of
// remaining scalar/scalar-array fields (skipping booleans, noise, and topics).
function fallbackFields(record: Record<string, unknown>): NodeMetaEntry[] {
  const meta: NodeMetaEntry[] = [];
  for (const name of SALIENT_FIELD_NAMES) {
    if (meta.length >= 2) {
      break;
    }
    if (name in record) {
      pushField(meta, record, name);
    }
  }
  if (meta.length > 0) {
    return meta;
  }
  for (const [key, value] of Object.entries(record)) {
    if (meta.length >= 2) {
      break;
    }
    if (key === 'label' || TOPIC_FIELDS.has(key) || NOISE_FIELDS.has(key) || typeof value === 'boolean') {
      continue;
    }
    pushField(meta, record, key);
  }
  return meta;
}

/**
 * Derive up to a few of the most relevant config values for a node card. Deterministic.
 * `config` is the component's inner config; for mapping/bloblang it can be a bare string.
 */
export function summarizeComponent(componentName: string, config: unknown): NodeMetaEntry[] {
  if (typeof config === 'string') {
    return config.trim() ? [{ label: 'expr', value: truncate(config.split('\n')[0]) }] : [];
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return [];
  }
  const record = config as Record<string, unknown>;

  const meta: NodeMetaEntry[] = [];
  for (const key of PREFERRED_FIELDS[componentName] ?? []) {
    if (meta.length >= MAX_META) {
      break;
    }
    pushField(meta, record, key);
  }

  const result = meta.length === 0 ? fallbackFields(record) : meta;
  return result.slice(0, MAX_META);
}
