// Search synonyms so terse component names stay findable by intent: a query matching an alias
// key surfaces every component whose name contains a listed fragment (e.g. "queue" finds
// kafka/nats/redis). Keep entries lowercase.
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

// Does `name` contain `fragment` on `_`/string boundaries? Matches `kafka` in `kafka_franz` and
// `rate_limit` whole, but not a fragment buried mid-token (`log` in `catalog`) — names are snake_case.
function nameContainsToken(name: string, fragment: string): boolean {
  let from = 0;
  for (;;) {
    const at = name.indexOf(fragment, from);
    if (at === -1) {
      return false;
    }
    const boundedBefore = at === 0 || name[at - 1] === '_';
    const end = at + fragment.length;
    const boundedAfter = end === name.length || name[end] === '_';
    if (boundedBefore && boundedAfter) {
      return true;
    }
    from = at + 1;
  }
}

// Extra searchable terms for a name: every alias key whose fragments the name contains as a token
// (lets the search index match "queue" against `kafka_franz`).
export function aliasTermsForName(name: string): string[] {
  const lower = name.toLowerCase();
  const terms: string[] = [];
  for (const [alias, fragments] of Object.entries(COMPONENT_ALIASES)) {
    if (fragments.some((fragment) => nameContainsToken(lower, fragment))) {
      terms.push(alias);
    }
  }
  return terms;
}
