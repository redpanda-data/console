import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { pluralTypeLabel, withArticles } from 'utils/string';

import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { aliasTermsForName } from '../utils/component-aliases';

export const RECENTS_KEY = 'rpcn-recent-components';
export const MAX_RECENTS = 6;

// Curated "likely next" defaults per slot kind, shown before the user types. Names absent from the catalog are dropped.
export const SUGGESTED_BY_TYPE: Partial<Record<ConnectComponentType, string[]>> = {
  input: ['kafka_franz', 'redpanda', 'generate', 'http_client', 'file'],
  output: ['kafka_franz', 'redpanda', 'http_client', 'drop', 'stdout'],
  processor: ['mapping', 'bloblang', 'cache', 'http', 'rate_limit', 'log'],
  cache: ['memory', 'redis', 'memcached'],
  rate_limit: ['local'],
};

// Everyday components sorted ahead of the long tail when browsing.
export const COMMON_COMPONENTS = new Set([
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

// Deprecated/experimental components are de-emphasised: sorted below stable ones.
function isDemoted(status: ComponentStatus): boolean {
  return status === ComponentStatus.DEPRECATED || status === ComponentStatus.EXPERIMENTAL;
}

// Tiebreaker order (after relevance, primary when browsing): stable before demoted, common before long tail, then name.
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

export type RecentEntry = { name: string; type: ConnectComponentType };

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

export function pushRecent(entry: RecentEntry): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const next = [entry, ...readRecents().filter((r) => !(r.name === entry.name && r.type === entry.type))].slice(
      0,
      MAX_RECENTS
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort; ignore storage failures.
  }
}

// Lowercased searchable text (name + aliases + summary + description + categories) for substring matching.
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

// Rank a match: exact name > prefix > substring > other text. Lower is better; -1 = no match.
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

// Reduce one-line AsciiDoc summaries (link macros, code spans) to plain label text on a single line.
export function cleanText(text: string): string {
  return text
    .replace(/(?:xref|link):[^\s[]*\[([^\]]*)\]/g, '$1')
    .replace(/https?:\/\/[^\s[]+\[([^\]]*)\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert the AsciiDoc constructs Connect uses (titles, link macros, bullets) to Markdown for react-markdown.
// Unlike cleanText, newlines are preserved so titles/paragraphs stay distinct.
export function asciidocToMarkdown(raw: string): string {
  return (
    raw
      .replace(/\r\n/g, '\n')
      // Link macros → label text.
      .replace(/(?:xref|link):[^\s[\]]*\[([^\]]*)\]/g, '$1')
      // Bare URL macro → Markdown link.
      .replace(/(https?:\/\/[^\s[\]]+)\[([^\]]*)\]/g, '[$2]($1)')
      // Section titles (`==`/`===`/… Title) → small heading.
      .replace(/^=+\s+(.{1,60})$/gm, '#### $1')
      // Strip leftover markers from over-long titles.
      .replace(/^=+\s+/gm, '')
      // List markers → bullets.
      .replace(/^\*\s+/gm, '- ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

// Empty-state copy. A type-locked miss that matches other component types is explained
// ("it exists as an input") so it doesn't read as a missing integration.
export function buildEmptyMessage(
  query: string,
  allowedTypes?: ConnectComponentType[],
  outOfScopeTypes: ConnectComponentType[] = []
): string {
  if (!query) {
    return 'No components available.';
  }
  if (outOfScopeTypes.length === 0) {
    return `No ${pluralTypeLabel(allowedTypes, 'components')} match “${query}”.`;
  }
  return `No ${pluralTypeLabel(allowedTypes, 'components')} match “${query}” — it exists as ${withArticles(outOfScopeTypes)}.`;
}

// Browse-mode "Suggested" list: the curated names for the slot's allowed types, resolved against the
// catalog and with anything already surfaced under "Recent" dropped.
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
