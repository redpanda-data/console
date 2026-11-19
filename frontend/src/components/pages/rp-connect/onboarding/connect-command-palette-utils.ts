import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';

const RECENTS_KEY = 'rpcn-recent-components';
const MAX_RECENTS = 6;

const SUGGESTED_BY_TYPE: Partial<Record<ConnectComponentType, string[]>> = {
  input: ['kafka_franz', 'redpanda', 'generate', 'http_client', 'file'],
  output: ['kafka_franz', 'redpanda', 'http_client', 'drop', 'stdout'],
  processor: ['mapping', 'bloblang', 'cache', 'http', 'rate_limit', 'log'],
  cache: ['memory', 'redis', 'memcached'],
  rate_limit: ['local'],
};

const COMMON_COMPONENTS = new Set([
  ...Object.values(SUGGESTED_BY_TYPE).flat(),
  'kafka',
  'redpanda_migrator',
  'sql_insert',
  'sql_select',
  'aws_s3',
  'gcp_cloud_storage',
  'postgres_cdc',
  'mysql_cdc',
  'switch',
  'branch',
  'workflow',
  'json_schema',
  'unarchive',
  'archive',
]);

// Experimental components are de-emphasised: sorted below stable ones. Deprecated ones never reach the palette.
function isDemoted(status: ComponentStatus): boolean {
  return status === ComponentStatus.EXPERIMENTAL;
}

export function byProminence(a: ConnectComponentSpec, b: ConnectComponentSpec): number {
  const demoted = (isDemoted(a.status) ? 1 : 0) - (isDemoted(b.status) ? 1 : 0);
  if (demoted !== 0) {
    return demoted;
  }
  const common = (COMMON_COMPONENTS.has(a.name) ? 0 : 1) - (COMMON_COMPONENTS.has(b.name) ? 0 : 1);
  if (common !== 0) {
    return common;
  }
  return a.name.localeCompare(b.name);
}

type RecentEntry = { name: string; type: ConnectComponentType };

export function readRecents(): RecentEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentEntry) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const next = [entry, ...readRecents().filter((r) => !(r.name === entry.name && r.type === entry.type))].slice(
      0,
      MAX_RECENTS
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

// listed fragment (e.g. "queue" finds kafka/nats/redis). Keep entries lowercase.
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

function nameContainsToken(name: string, fragment: string) {
  let from = 0;
  for (;;) {
    const at = name.indexOf(fragment, from);
    if (at === -1) {
      return false;
    }
    if (isTokenBoundedAt(name, at, fragment.length)) {
      return true;
    }
    from = at + 1;
  }
}

function isTokenBoundedAt(name: string, at: number, length: number): boolean {
  const end = at + length;
  const boundedBefore = at === 0 || name[at - 1] === '_';
  const boundedAfter = end === name.length || name[end] === '_';
  return boundedBefore && boundedAfter;
}

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

export function searchableText(component: ConnectComponentSpec): string {
  return [
    component.name,
    ...aliasTermsForName(component.name),
    component.summary ?? '',
    component.description ?? '',
    ...(component.categories ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

export function matchRank(component: ConnectComponentSpec, query: string, text: string): number {
  const name = component.name.toLowerCase();
  if (name === query) {
    return 0;
  }
  if (name.startsWith(query)) {
    return 1;
  }
  if (name.includes(query)) {
    return 2;
  }
  return text.includes(query) ? 3 : -1;
}

const STARTS_WITH_VOWEL_REGEX = /^[aeiou]/u;

function pluralTypeLabel(labels: string[] | undefined, emptyLabel: string): string {
  if (!labels || labels.length === 0) {
    return emptyLabel;
  }
  return labels.map((label) => `${label.replace(/_/gu, ' ')}s`).join(' or ');
}

function withArticles(labels: string[]): string {
  const labeled = labels.map((label) => {
    const humanized = label.replace(/_/gu, ' ');
    return `${STARTS_WITH_VOWEL_REGEX.test(humanized) ? 'an' : 'a'} ${humanized}`;
  });
  if (labeled.length <= 1) {
    return labeled[0] ?? '';
  }
  return `${labeled.slice(0, -1).join(', ')} or ${labeled.at(-1)}`;
}

export function buildEmptyMessage(
  query: string,
  allowedTypes?: ConnectComponentType[],
  outOfScopeTypes: ConnectComponentType[] = []
) {
  if (!query) {
    return 'No components available.';
  }
  if (outOfScopeTypes.length === 0) {
    return `No ${pluralTypeLabel(allowedTypes, 'components')} match “${query}”.`;
  }
  return `No ${pluralTypeLabel(allowedTypes, 'components')} match “${query}” — it exists as ${withArticles(outOfScopeTypes)}.`;
}

export function computeSuggested(
  allowedTypes: ConnectComponentType[] | undefined,
  byName: Map<string, ConnectComponentSpec>,
  recentComponents: ConnectComponentSpec[]
): ConnectComponentSpec[] {
  const names = new Set((allowedTypes ?? []).flatMap((t) => SUGGESTED_BY_TYPE[t] ?? []));
  const recentNames = new Set(recentComponents.map((c) => c.name));
  return [...names]
    .map((n) => byName.get(n))
    .filter((c): c is ConnectComponentSpec => c !== undefined && !recentNames.has(c.name));
}
