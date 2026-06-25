// Search synonyms so terse Redpanda Connect component names stay findable by intent.
// A query matching an alias key surfaces every component whose name contains a listed
// fragment (e.g. "queue" finds kafka/nats/redis). Keep entries lowercase, intent-driven.
export const COMPONENT_ALIASES: Record<string, string[]> = {
  queue: ['kafka', 'nats', 'redis', 'amqp', 'sqs', 'pubsub', 'nsq', 'mqtt'],
  stream: ['kafka', 'redpanda', 'kinesis'],
  topic: ['kafka', 'redpanda'],
  transform: ['mapping', 'bloblang', 'mutation', 'jq'],
  map: ['mapping', 'bloblang'],
  enrich: ['branch', 'cache', 'http'],
  filter: ['mapping', 'bloblang', 'filter'],
  database: ['sql', 'postgres', 'mysql', 'mongodb', 'redis'],
  db: ['sql', 'postgres', 'mysql', 'mongodb'],
  sql: ['sql', 'postgres', 'mysql'],
  cdc: ['cdc'],
  cache: ['cache', 'redis', 'memcached'],
  throttle: ['rate_limit'],
  ratelimit: ['rate_limit'],
  http: ['http', 'http_client', 'http_server'],
  rest: ['http'],
  api: ['http'],
  webhook: ['http_server'],
  s3: ['aws_s3'],
  blob: ['aws_s3', 'gcp_cloud_storage', 'azure_blob_storage'],
  bucket: ['aws_s3', 'gcp_cloud_storage', 'azure_blob_storage'],
  warehouse: ['snowflake', 'bigquery', 'redshift'],
  ai: ['openai', 'gpt', 'cohere', 'ollama', 'embeddings'],
  llm: ['openai', 'gpt', 'cohere', 'ollama'],
  vector: ['pinecone', 'qdrant', 'pgvector', 'embeddings'],
  log: ['log'],
  delay: ['sleep', 'rate_limit'],
  retry: ['retry'],
  json: ['mapping', 'bloblang', 'json'],
};

// Extra searchable terms for a component name: every alias key whose fragments the name
// contains. Lets the search index match "queue" against `kafka_franz`.
export function aliasTermsForName(name: string): string[] {
  const lower = name.toLowerCase();
  const terms: string[] = [];
  for (const [alias, fragments] of Object.entries(COMPONENT_ALIASES)) {
    if (fragments.some((fragment) => lower.includes(fragment))) {
      terms.push(alias);
    }
  }
  return terms;
}
