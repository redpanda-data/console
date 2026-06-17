import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'components/redpanda-ui/components/command';
import { Toggle } from 'components/redpanda-ui/components/toggle';
import { Text } from 'components/redpanda-ui/components/typography';
import { Waypoints } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo, useState } from 'react';

import { ConnectorLogo } from './connector-logo';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import { getCategoryDisplayName } from '../utils/categories';
import { aliasTermsForName } from '../utils/component-aliases';
import { componentStatusToString, parseSchema } from '../utils/schema';

const RECENTS_KEY = 'rpcn-recent-components';
const MAX_RECENTS = 6;

// Curated "likely next" components per slot kind, so an opened palette leads with
// sensible defaults before the user types. Names that don't exist in the catalog are
// silently dropped.
const SUGGESTED_BY_TYPE: Partial<Record<ConnectComponentType, string[]>> = {
  input: ['kafka_franz', 'redpanda', 'generate', 'http_client', 'file'],
  output: ['kafka_franz', 'redpanda', 'http_client', 'drop', 'stdout'],
  processor: ['mapping', 'bloblang', 'cache', 'http', 'rate_limit', 'log'],
  cache: ['memory', 'redis', 'memcached'],
  rate_limit: ['local'],
};

// Everyday components that should sort ahead of the long tail when browsing — the
// per-slot suggestions plus a few broadly-common connectors/processors.
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

// Deprecated/experimental components are real but de-emphasised: sorted below stable
// ones so they don't crowd the common choices.
function isDemoted(status: ComponentStatus): boolean {
  return status === ComponentStatus.DEPRECATED || status === ComponentStatus.EXPERIMENTAL;
}

// Tiebreaker ordering (used after search relevance, and as the primary order when
// browsing): stable before deprecated/experimental, common before long tail, then name.
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

function readRecents(): RecentEntry[] {
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

function pushRecent(entry: RecentEntry): void {
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

// Lowercased searchable text per component (name + aliases + summary + description +
// categories), so a single substring test covers intent-based search.
function searchableText(component: ConnectComponentSpec): string {
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

// Rank a query match: exact name > name prefix > name substring > other text. Lower
// is better; -1 means no match.
function matchRank(component: ConnectComponentSpec, query: string, text: string): number {
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

function ComponentIcon({ component }: { component: ConnectComponentSpec }) {
  if (component.logoUrl) {
    return <img alt="" className="size-5 shrink-0 object-contain" src={component.logoUrl} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return <ConnectorLogo className="size-5 shrink-0" name={component.name as ComponentName} />;
  }
  return <Waypoints className="size-5 shrink-0 text-muted-foreground" />;
}

function statusBadge(status: ComponentStatus, name: string) {
  if (
    name !== 'redpanda' &&
    (status === ComponentStatus.BETA ||
      status === ComponentStatus.EXPERIMENTAL ||
      status === ComponentStatus.DEPRECATED)
  ) {
    return (
      <Badge size="sm" variant="neutral-inverted">
        {componentStatusToString(status)}
      </Badge>
    );
  }
  return null;
}

// Bold the contiguous matched span of the name (when the query hits it) so users see
// why a result surfaced.
function HighlightedName({ name, query }: { name: string; query: string }) {
  const idx = query ? name.toLowerCase().indexOf(query) : -1;
  if (idx < 0) {
    return <span className="font-mono font-semibold text-sm">{name}</span>;
  }
  return (
    <span className="font-mono font-semibold text-sm">
      {name.slice(0, idx)}
      <span className="bg-primary/15 text-primary">{name.slice(idx, idx + query.length)}</span>
      {name.slice(idx + query.length)}
    </span>
  );
}

function Row({
  component,
  query,
  onSelect,
}: {
  component: ConnectComponentSpec;
  query: string;
  onSelect: (component: ConnectComponentSpec) => void;
}) {
  const category = component.categories?.[0];
  return (
    <CommandItem
      className="gap-3"
      key={`${component.type}-${component.name}`}
      onSelect={() => onSelect(component)}
      value={`${component.type}:${component.name}`}
    >
      <ComponentIcon component={component} />
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <HighlightedName name={component.name} query={query} />
          {statusBadge(component.status, component.name)}
        </span>
        {component.summary ? <span className="truncate text-muted-foreground text-xs">{component.summary}</span> : null}
      </div>
      <span className="ml-auto shrink-0 whitespace-nowrap text-muted-foreground text-xs capitalize">
        {component.type.replace(/_/g, ' ')}
        {category ? ` · ${getCategoryDisplayName(category)}` : ''}
      </span>
    </CommandItem>
  );
}

export type ConnectCommandPaletteProps = {
  components?: ComponentList;
  additionalComponents?: ExtendedConnectComponentSpec[];
  /** Component types valid in the slot being filled — the palette locks to these unless "Show all" is toggled. */
  allowedTypes?: ConnectComponentType[];
  onSelect: (connectionName: string, connectionType: ConnectComponentType) => void;
  searchPlaceholder?: string;
};

/**
 * Search-first add-node picker. Fuzzy matches across name, curated aliases, summary,
 * description and categories; locks to the slot's valid types (with a "Show all"
 * escape hatch); leads with recently-used and suggested-next; keyboard-first.
 */
export const ConnectCommandPalette = ({
  components,
  additionalComponents,
  allowedTypes,
  onSelect,
  searchPlaceholder,
}: ConnectCommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [onlyValid, setOnlyValid] = useState(true);
  const recents = useMemo(() => readRecents(), []);

  const allComponents = useMemo(() => {
    const builtIn = components ? parseSchema(components) : [];
    return [...builtIn, ...(additionalComponents ?? [])];
  }, [components, additionalComponents]);

  const lockedTypes = onlyValid ? allowedTypes : undefined;

  const typeAllowed = useMemo(() => {
    const set = lockedTypes && lockedTypes.length > 0 ? new Set(lockedTypes) : null;
    return (type: ConnectComponentType) => !set || set.has(type);
  }, [lockedTypes]);

  const inScope = useMemo(() => allComponents.filter((c) => typeAllowed(c.type)), [allComponents, typeAllowed]);
  const byName = useMemo(() => new Map(inScope.map((c) => [c.name, c])), [inScope]);

  const handleSelect = (component: ConnectComponentSpec) => {
    pushRecent({ name: component.name, type: component.type });
    onSelect(component.name, component.type);
  };

  const q = query.trim().toLowerCase();

  // Searching: a single ranked, flat list across the in-scope catalog.
  const results = useMemo(() => {
    if (!q) {
      return [];
    }
    return (
      inScope
        .map((component) => ({ component, rank: matchRank(component, q, searchableText(component)) }))
        .filter((r) => r.rank >= 0)
        // Relevance first; within equal relevance, prominence (stable + common) wins.
        .sort((a, b) => a.rank - b.rank || byProminence(a.component, b.component))
        .map((r) => r.component)
    );
  }, [inScope, q]);

  // Browsing (no query): recents + suggested + the rest grouped by category.
  const recentComponents = useMemo(
    () => (q ? [] : recents.map((r) => byName.get(r.name)).filter((c): c is ConnectComponentSpec => Boolean(c))),
    [q, recents, byName]
  );

  const suggested = useMemo(() => {
    if (q) {
      return [];
    }
    const names = new Set((allowedTypes ?? []).flatMap((t) => SUGGESTED_BY_TYPE[t] ?? []));
    const recentNames = new Set(recentComponents.map((c) => c.name));
    return [...names]
      .map((n) => byName.get(n))
      .filter((c): c is ConnectComponentSpec => Boolean(c) && !recentNames.has((c as ConnectComponentSpec).name));
  }, [q, allowedTypes, byName, recentComponents]);

  const grouped = useMemo(() => {
    if (q) {
      return [];
    }
    const excluded = new Set([...recentComponents, ...suggested].map((c) => c.name));
    const groups = new Map<string, ConnectComponentSpec[]>();
    for (const component of inScope) {
      if (excluded.has(component.name)) {
        continue;
      }
      const key = component.categories?.[0] ?? 'other';
      const list = groups.get(key);
      if (list) {
        list.push(component);
      } else {
        groups.set(key, [component]);
      }
    }
    return [...groups.entries()]
      .map(([id, list]) => ({
        id,
        name: getCategoryDisplayName(id),
        components: list.sort(byProminence),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, inScope, recentComponents, suggested]);

  return (
    <Command className="rounded-lg border" shouldFilter={false}>
      <CommandInput onValueChange={setQuery} placeholder={searchPlaceholder ?? 'Search components…'} value={query} />
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <Text className="text-muted-foreground text-xs">
          {q
            ? `${results.length} result${results.length === 1 ? '' : 's'}`
            : 'Type to search · ↑↓ to navigate · ↵ to add'}
        </Text>
        {allowedTypes && allowedTypes.length > 0 ? (
          <Toggle
            aria-label="Toggle showing all component types"
            className="h-6 px-2 text-xs"
            onPressedChange={(pressed) => setOnlyValid(!pressed)}
            pressed={!onlyValid}
            size="sm"
            variant="outline"
          >
            {onlyValid ? 'Only valid here' : 'Showing all'}
          </Toggle>
        ) : null}
      </div>
      <CommandList className="max-h-[55vh]">
        <CommandEmpty>No components match “{query}”.</CommandEmpty>

        {q ? (
          <CommandGroup heading="Results">
            {results.map((component) => (
              <Row
                component={component}
                key={`${component.type}-${component.name}`}
                onSelect={handleSelect}
                query={q}
              />
            ))}
          </CommandGroup>
        ) : (
          <>
            {recentComponents.length > 0 ? (
              <CommandGroup heading="Recently used">
                {recentComponents.map((component) => (
                  <Row
                    component={component}
                    key={`recent-${component.type}-${component.name}`}
                    onSelect={handleSelect}
                    query=""
                  />
                ))}
              </CommandGroup>
            ) : null}
            {suggested.length > 0 ? (
              <CommandGroup heading="Suggested">
                {suggested.map((component) => (
                  <Row
                    component={component}
                    key={`suggested-${component.type}-${component.name}`}
                    onSelect={handleSelect}
                    query=""
                  />
                ))}
              </CommandGroup>
            ) : null}
            {grouped.map((group) => (
              <CommandGroup heading={group.name} key={group.id}>
                {group.components.map((component) => (
                  <Row
                    component={component}
                    key={`${component.type}-${component.name}`}
                    onSelect={handleSelect}
                    query=""
                  />
                ))}
              </CommandGroup>
            ))}
          </>
        )}
      </CommandList>
    </Command>
  );
};
