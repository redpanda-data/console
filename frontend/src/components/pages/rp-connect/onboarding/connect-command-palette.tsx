import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'components/redpanda-ui/components/command';
import { DialogFooter } from 'components/redpanda-ui/components/dialog';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { ExternalLink, Waypoints } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

import { ConnectorLogo } from './connector-logo';
import { getConnectorDocsUrl } from '../pipeline/pipeline-flow-nodes';
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

function ComponentIcon({ component, className = 'size-5' }: { component: ConnectComponentSpec; className?: string }) {
  if (component.logoUrl) {
    return <img alt="" className={`${className} shrink-0 object-contain`} src={component.logoUrl} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return <ConnectorLogo className={`${className} shrink-0`} name={component.name as ComponentName} />;
  }
  return <Waypoints className={`${className} shrink-0 text-muted-foreground`} />;
}

// Component summaries arrive as one-line AsciiDoc, peppered with link macros
// (`url[label]`, `xref:page[label]`, `link:url[label]`). Reduce those to their label
// text and flatten to a single line for use as the preview's lead sentence.
function cleanText(text: string): string {
  return text
    .replace(/(?:xref|link):[^\s[]*\[([^\]]*)\]/g, '$1')
    .replace(/https?:\/\/[^\s[]+\[([^\]]*)\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Descriptions are multi-line AsciiDoc fragments (section titles like `== Performance`,
// link macros, `*` bullets). Convert the handful of constructs Connect actually uses to
// Markdown so react-markdown can render structured, readable prose — rather than the raw
// markup leaking through. Newlines are preserved (unlike cleanText) so titles/paragraphs
// stay distinct.
export function asciidocToMarkdown(raw: string): string {
  return (
    raw
      .replace(/\r\n/g, '\n')
      // Internal/explicit-link macros → their label text.
      .replace(/(?:xref|link):[^\s[\]]*\[([^\]]*)\]/g, '$1')
      // Bare URL macro `https://host/path[label]` → a Markdown link.
      .replace(/(https?:\/\/[^\s[\]]+)\[([^\]]*)\]/g, '[$2]($1)')
      // Section titles on their own line (`==`/`===`/… Title) → a small Markdown heading.
      .replace(/^=+\s+(.{1,60})$/gm, '#### $1')
      // Strip any leftover heading markers (over-long titles that didn't match above).
      .replace(/^=+\s+/gm, '')
      // AsciiDoc unordered list markers → Markdown bullets.
      .replace(/^\*\s+/gm, '- ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

// A compact section title, matching the inspector's small-label style (e.g. "CATEGORIES").
const MarkdownHeading = ({ children }: { children?: React.ReactNode }) => (
  <Text className="mt-2 font-semibold text-foreground text-xs uppercase tracking-wide">{children}</Text>
);

// DS-styled element map so the rendered Markdown matches the inspector's type scale
// (small headings, relaxed body, inline code, external links). Every heading level
// collapses to the same compact label — these are short section titles, not a hierarchy.
const MARKDOWN_COMPONENTS: Components = {
  h1: MarkdownHeading,
  h2: MarkdownHeading,
  h3: MarkdownHeading,
  h4: MarkdownHeading,
  h5: MarkdownHeading,
  h6: MarkdownHeading,
  p: ({ children }) => <Text className="text-foreground text-sm leading-relaxed">{children}</Text>,
  a: ({ href, children }) => (
    <Link href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </Link>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4 text-foreground text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-4 text-foreground text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

function FormattedDescription({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
    </div>
  );
}

// Long descriptions (a minority, but up to ~6.7k chars) are clamped behind a "Show
// more" toggle so the preview stays scannable — the full reference is a click away via
// the docs link. Keyed by component name at the call site so the toggle resets per row.
function DescriptionBlock({ markdown, collapsible }: { markdown: string; collapsible: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!collapsible) {
    return <FormattedDescription markdown={markdown} />;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className={expanded ? '' : 'relative max-h-44 overflow-hidden'}>
        <FormattedDescription markdown={markdown} />
        {expanded ? null : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      <button
        className="self-start font-medium text-primary text-xs hover:underline"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
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
  onPreview,
}: {
  component: ConnectComponentSpec;
  query: string;
  onPreview: (component: ConnectComponentSpec) => void;
}) {
  const category = component.categories?.[0];
  return (
    <CommandItem
      className="gap-3 hover:bg-accent/50"
      key={`${component.type}-${component.name}`}
      onSelect={() => onPreview(component)}
      value={`${component.type}:${component.name}`}
    >
      <ComponentIcon component={component} />
      <span className="flex min-w-0 items-center gap-2">
        <HighlightedName name={component.name} query={query} />
        {statusBadge(component.status, component.name)}
      </span>
      {category ? (
        <Badge className="ml-auto shrink-0" size="sm" variant="simple-outline">
          {getCategoryDisplayName(category)}
        </Badge>
      ) : null}
    </CommandItem>
  );
}

// Facet tabs (Recent / Suggested / All / per-category) that narrow the browse list
// without forcing the user through one long scroll.
type Tab = { id: string; label: string };

// Right-hand preview for the highlighted/clicked row: fills the dialog width that the
// list alone leaves empty, and surfaces the full metadata (description, categories,
// version, docs) that the condensed list rows can only hint at. Insertion is deferred
// to the footer Add action.
function DetailPane({ component }: { component?: ConnectComponentSpec }) {
  if (!component) {
    return (
      <div className="hidden flex-1 items-center justify-center p-8 text-center md:flex">
        <Text className="max-w-[28ch] text-muted-foreground text-sm">
          Select a component to see its description, categories, and documentation, then add it to your pipeline.
        </Text>
      </div>
    );
  }

  const categories = (component.categories ?? []).map(getCategoryDisplayName).filter(Boolean);
  // Lead with the concise summary, then the fuller description rendered as Markdown.
  const summary = cleanText(component.summary ?? '');
  const descriptionMd = component.description ? asciidocToMarkdown(component.description) : '';
  // Skip the description when it's just the summary repeated (some components set both).
  const showDescription = descriptionMd !== '' && cleanText(component.description ?? '') !== summary;
  const docsUrl = getConnectorDocsUrl(component.type, component.name);

  return (
    <div className="hidden min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 md:flex">
      <div className="flex items-start gap-3">
        <ComponentIcon className="size-8" component={component} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-base">{component.name}</span>
            {statusBadge(component.status, component.name)}
          </span>
          <span className="text-muted-foreground text-xs capitalize">
            {component.type.replace(/_/g, ' ')}
            {component.version ? ` · v${component.version}` : ''}
          </span>
        </div>
      </div>

      {summary ? <Text className="text-foreground text-sm leading-relaxed">{summary}</Text> : null}

      {showDescription ? (
        <DescriptionBlock
          collapsible={(component.description?.length ?? 0) > 700}
          key={`${component.type}:${component.name}`}
          markdown={descriptionMd}
        />
      ) : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Categories</Text>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <Badge key={category} size="sm" variant="neutral-inverted">
                {category}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {docsUrl ? (
        <Link
          className="inline-flex items-center gap-1 text-sm"
          href={docsUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          View documentation
          <ExternalLink className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export type ConnectCommandPaletteProps = {
  components?: ComponentList;
  additionalComponents?: ExtendedConnectComponentSpec[];
  /** Component types valid in the slot being filled — the palette locks to these unless "Show all" is toggled. */
  allowedTypes?: ConnectComponentType[];
  onSelect: (connectionName: string, connectionType: ConnectComponentType) => void;
  /** Dismisses the picker without adding anything (wired to the footer Cancel button). */
  onCancel?: () => void;
  searchPlaceholder?: string;
};

/**
 * Search-first add-node picker laid out as a master/detail panel: a condensed,
 * tab-filtered list on the left, a metadata preview on the right, and a footer that
 * defers insertion until the user commits. Fuzzy matches across name, curated aliases,
 * summary, description and categories; locks to the slot's valid types (with a
 * "Show all" escape hatch); leads with recently-used and suggested-next; keyboard-first.
 */
export const ConnectCommandPalette = ({
  components,
  additionalComponents,
  allowedTypes,
  onSelect,
  onCancel,
  searchPlaceholder,
}: ConnectCommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState('');
  // null until the user picks a tab, so the derived default can react to the catalog.
  const [tab, setTab] = useState<string | null>(null);
  const recents = useMemo(() => readRecents(), []);

  const allComponents = useMemo(() => {
    const builtIn = components ? parseSchema(components) : [];
    return [...builtIn, ...(additionalComponents ?? [])];
  }, [components, additionalComponents]);

  // The palette always locks to the slot's valid types.
  const lockedTypes = allowedTypes;

  const typeAllowed = useMemo(() => {
    const set = lockedTypes && lockedTypes.length > 0 ? new Set(lockedTypes) : null;
    return (type: ConnectComponentType) => !set || set.has(type);
  }, [lockedTypes]);

  const inScope = useMemo(() => allComponents.filter((c) => typeAllowed(c.type)), [allComponents, typeAllowed]);
  const byName = useMemo(() => new Map(inScope.map((c) => [c.name, c])), [inScope]);
  // Keyed by the CommandItem `value` (`type:name`) so the highlighted row resolves to
  // its spec for the preview pane, even when two types share a name (e.g. kafka in/out).
  const byKey = useMemo(() => new Map(inScope.map((c) => [`${c.type}:${c.name}`, c])), [inScope]);
  const activeComponent = byKey.get(activeValue);

  const handleCommit = (component: ConnectComponentSpec) => {
    pushRecent({ name: component.name, type: component.type });
    onSelect(component.name, component.type);
  };

  // Clicking (or Enter on) a row only previews it in the detail pane; cmdk also drives
  // this via hover/arrow navigation through `onValueChange`.
  const handlePreview = (component: ConnectComponentSpec) => setActiveValue(`${component.type}:${component.name}`);

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

  // Browsing facets (no query): recents + suggested + everything grouped by category.
  const recentComponents = useMemo(
    () => recents.map((r) => byName.get(r.name)).filter((c): c is ConnectComponentSpec => Boolean(c)),
    [recents, byName]
  );

  const suggested = useMemo(() => {
    const names = new Set((allowedTypes ?? []).flatMap((t) => SUGGESTED_BY_TYPE[t] ?? []));
    const recentNames = new Set(recentComponents.map((c) => c.name));
    return [...names]
      .map((n) => byName.get(n))
      .filter((c): c is ConnectComponentSpec => Boolean(c) && !recentNames.has((c as ConnectComponentSpec).name));
  }, [allowedTypes, byName, recentComponents]);

  // All in-scope components grouped by primary category — powers the "All" tab and the
  // per-category tabs (each tab just reads its matching group).
  const grouped = useMemo(() => {
    const groups = new Map<string, ConnectComponentSpec[]>();
    for (const component of inScope) {
      const key = component.categories?.[0] ?? 'other';
      const list = groups.get(key);
      if (list) {
        list.push(component);
      } else {
        groups.set(key, [component]);
      }
    }
    return [...groups.entries()]
      .map(([id, list]) => ({ id, name: getCategoryDisplayName(id), components: list.sort(byProminence) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inScope]);

  const tabs = useMemo(() => {
    const list: Tab[] = [];
    if (recentComponents.length > 0) {
      list.push({ id: 'recent', label: 'Recent' });
    }
    if (suggested.length > 0) {
      list.push({ id: 'suggested', label: 'Suggested' });
    }
    list.push({ id: 'all', label: 'All' });
    for (const group of grouped) {
      list.push({ id: `cat:${group.id}`, label: group.name });
    }
    return list;
  }, [recentComponents, suggested, grouped]);

  const defaultTab = suggested.length > 0 ? 'suggested' : 'all';
  const currentTab = tab && tabs.some((t) => t.id === tab) ? tab : defaultTab;

  // Resolve the active tab to the rows it should render.
  const browseItems = useMemo(() => {
    if (currentTab === 'recent') {
      return recentComponents;
    }
    if (currentTab === 'suggested') {
      return suggested;
    }
    if (currentTab.startsWith('cat:')) {
      const id = currentTab.slice(4);
      return grouped.find((g) => g.id === id)?.components ?? [];
    }
    return null; // "all" renders the grouped view rather than a flat list.
  }, [currentTab, recentComponents, suggested, grouped]);

  // Enter adds the highlighted component (the fast keyboard path); clicking a row only
  // previews it, so insertion stays an explicit, reversible action.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && activeComponent) {
      event.preventDefault();
      handleCommit(activeComponent);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard handling augments the inner cmdk listbox.
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
      <Command
        className="min-h-0 flex-1 rounded-none border-0 bg-transparent"
        disablePointerSelection
        onValueChange={setActiveValue}
        shouldFilter={false}
        size="full"
        value={activeValue}
      >
        <CommandInput onValueChange={setQuery} placeholder={searchPlaceholder ?? 'Search components…'} value={query} />
        {q ? (
          <div className="flex h-10 shrink-0 items-center border-b px-3">
            <Text className="text-muted-foreground text-xs">
              {results.length} result{results.length === 1 ? '' : 's'}
            </Text>
          </div>
        ) : (
          // The scroll lives on the wrapper (not the TabsList) and adds 1px of bottom
          // room: a scroll container clips to its padding box, which would otherwise cut
          // off the active underline's 1px overhang and make it look thinner than the DS.
          <div className="shrink-0 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Tabs className="w-max min-w-full gap-0" onValueChange={setTab} value={currentTab}>
              <TabsList className="w-full px-2" variant="underline">
                {tabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} variant="underline">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <CommandList className="h-full max-h-none min-w-0 flex-1 md:max-w-[28rem] md:border-r">
            <CommandEmpty>No components match “{query}”.</CommandEmpty>

            {q ? (
              <CommandGroup heading="Results">
                {results.map((component) => (
                  <Row
                    component={component}
                    key={`${component.type}-${component.name}`}
                    onPreview={handlePreview}
                    query={q}
                  />
                ))}
              </CommandGroup>
            ) : browseItems ? (
              <CommandGroup>
                {browseItems.map((component) => (
                  <Row
                    component={component}
                    key={`${component.type}-${component.name}`}
                    onPreview={handlePreview}
                    query=""
                  />
                ))}
              </CommandGroup>
            ) : (
              grouped.map((group) => (
                <CommandGroup heading={group.name} key={group.id}>
                  {group.components.map((component) => (
                    <Row
                      component={component}
                      key={`${component.type}-${component.name}`}
                      onPreview={handlePreview}
                      query=""
                    />
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>

          <DetailPane component={activeComponent} />
        </div>
      </Command>

      <DialogFooter className="border-t" direction="row" justify="between">
        <div className="flex min-w-0 items-center gap-2">
          {activeComponent ? (
            <>
              <span className="shrink-0 text-muted-foreground text-xs">Selected</span>
              <ComponentIcon className="size-4" component={activeComponent} />
              <span className="truncate font-medium font-mono text-sm">{activeComponent.name}</span>
            </>
          ) : (
            <Text className="text-muted-foreground text-sm">Select a component to add</Text>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onCancel ? (
            <Button onClick={onCancel} variant="ghost">
              Cancel
            </Button>
          ) : null}
          <Button disabled={!activeComponent} onClick={() => activeComponent && handleCommit(activeComponent)}>
            Add to pipeline
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
};
