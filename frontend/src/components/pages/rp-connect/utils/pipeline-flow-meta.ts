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

// A single key metadata line shown on an expanded pipeline node card.
export type NodeMetaEntry = { label: string; value: string };

const MAX_META = 3;
const MAX_VALUE_LEN = 52;

// `topic`/`topics` are surfaced as dedicated chips on the card, so they're never
// repeated as a plain meta row.
const TOPIC_FIELDS = new Set(['topic', 'topics']);

// Shorter, friendlier labels for a few verbose config keys so the value has room
// on the fixed-width card. Keys not listed keep their raw name.
const LABEL_OVERRIDES: Record<string, string> = {
  consumer_group: 'group',
  seed_brokers: 'brokers',
  default_ttl: 'ttl',
  request_map: 'request',
  result_map: 'result',
  result_codec: 'codec',
  max_in_flight: 'in flight',
};

function truncate(value: string, max = MAX_VALUE_LEN): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * The fields most worth surfacing per component, in priority order. `pushField`
 * only emits the fields actually present, so listing a generous superset (across
 * the input/processor/output uses of the same component name) is safe. Topics are
 * deliberately omitted — they render as chips.
 */
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
  // Processors
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

// When no preferred field matches, prefer scalar fields with these "identifying"
// names before falling back to whatever scalar comes first.
const SALIENT_FIELD_NAMES = [
  'url',
  'urls',
  'address',
  'addresses',
  'host',
  'endpoint',
  'uri',
  'dsn',
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
  } else if (Array.isArray(value) && value.length > 0 && value.every((item) => isScalar(item))) {
    meta.push({ label, value: truncate(value.join(', ')) });
  } else if (Array.isArray(value) && value.length > 0) {
    meta.push({ label, value: `${value.length} item${value.length === 1 ? '' : 's'}` });
  }
}

// Fallback when no preferred field matched: identifying-named scalars first, then
// the first couple of remaining scalar/scalar-array fields (skipping booleans and
// topics, which rarely help identify a node and add noise).
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
    if (key === 'label' || TOPIC_FIELDS.has(key) || typeof value === 'boolean') {
      continue;
    }
    pushField(meta, record, key);
  }
  return meta;
}

/**
 * Derive up to a few of the most relevant config values for a component, for
 * display on its node card. Deterministic: same config always yields the same
 * lines. `config` is the component's inner config (the value under its name key);
 * for components like `mapping`/`bloblang` it can be a bare string.
 */
export function summarizeComponent(componentName: string, config: unknown): NodeMetaEntry[] {
  // Some processors (mapping/bloblang) are configured with a bare string.
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
