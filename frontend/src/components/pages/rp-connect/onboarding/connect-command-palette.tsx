import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
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
import { ScrollableTabsList, Tabs, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link } from 'components/redpanda-ui/components/typography';
import { ExternalLink, Waypoints } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { pluralizeWithNumber } from 'utils/string';

import {
  asciidocToMarkdown,
  buildEmptyMessage,
  byProminence,
  cleanText,
  computeSuggested,
  matchRank,
  pushRecent,
  readRecents,
  searchableText,
} from './connect-command-palette-utils';
import { ConnectorLogo } from './connector-logo';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import { getCategoryDisplayName } from '../utils/categories';
import { getConnectorDocsUrl } from '../utils/connector-docs';
import { componentStatusToString, parseSchema } from '../utils/schema';

function ComponentIcon({ component, className = 'size-5' }: { component: ConnectComponentSpec; className?: string }) {
  if (component.logoUrl) {
    return <img alt="" className={`${className} shrink-0 object-contain`} src={component.logoUrl} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return <ConnectorLogo className={`${className} shrink-0`} name={component.name as ComponentName} />;
  }
  return <Waypoints className={`${className} shrink-0 text-muted-foreground`} />;
}

// Compact section title matching the inspector's small-label style.
const MarkdownHeading = ({ children }: { children?: React.ReactNode }) => (
  <div className="mt-2 font-semibold text-foreground text-xs uppercase tracking-wide">{children}</div>
);

// All heading levels collapse to the same compact label — these are short section titles, not a hierarchy.
const MARKDOWN_COMPONENTS: Components = {
  h1: MarkdownHeading,
  h2: MarkdownHeading,
  h3: MarkdownHeading,
  h4: MarkdownHeading,
  h5: MarkdownHeading,
  h6: MarkdownHeading,
  p: ({ children }) => <div className="text-foreground text-sm leading-relaxed">{children}</div>,
  a: ({ href, children }) => (
    <Link href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </Link>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
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

// Bold the matched span of the name so users see why a result surfaced.
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
  query = '',
  onPreview,
  onCommit,
}: {
  component: ConnectComponentSpec;
  query?: string;
  onPreview: (component: ConnectComponentSpec) => void;
  onCommit: (component: ConnectComponentSpec) => void;
}) {
  const category = component.categories?.[0];
  // Fall back to the humanized type so same-named components (redis cache vs redis rate-limit) stay distinguishable.
  const badgeLabel = category ? getCategoryDisplayName(category) : component.type.replace(/_/g, ' ');
  return (
    <CommandItem
      className="gap-3 hover:bg-accent/50"
      key={`${component.type}-${component.name}`}
      onDoubleClick={() => onCommit(component)}
      onSelect={() => onPreview(component)}
      value={`${component.type}:${component.name}`}
    >
      <ComponentIcon component={component} />
      <span className="flex min-w-0 items-center gap-2">
        <HighlightedName name={component.name} query={query} />
        {statusBadge(component.status, component.name)}
      </span>
      {badgeLabel ? (
        <Badge className="ml-auto shrink-0 capitalize" size="sm" variant="simple-outline">
          {badgeLabel}
        </Badge>
      ) : null}
    </CommandItem>
  );
}

// Facet tabs (Recent / Suggested / All / per-category) that narrow the browse list.
type Tab = { id: string; label: string };

// Right-hand preview of the highlighted row; insertion is deferred to the footer Add action.
function DetailPane({ component }: { component?: ConnectComponentSpec }) {
  if (!component) {
    return (
      <div className="hidden flex-1 items-center justify-center p-8 text-center md:flex">
        <div className="max-w-[28ch] text-muted-foreground text-sm">
          Select a component to see its description, categories, and documentation, then add it to your pipeline.
        </div>
      </div>
    );
  }

  const categories = (component.categories ?? []).map(getCategoryDisplayName).filter(Boolean);
  const summary = cleanText(component.summary ?? '');
  const descriptionMd = component.description ? asciidocToMarkdown(component.description) : '';
  // Skip the description when it just repeats the summary.
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

      {summary ? <div className="text-foreground text-sm leading-relaxed">{summary}</div> : null}

      {showDescription ? <FormattedDescription markdown={descriptionMd} /> : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Categories</div>
          <BadgeGroup
            gap="md"
            maxVisible={6}
            renderOverflowContent={(overflow) => <div className="flex flex-col gap-1">{overflow}</div>}
            variant="neutral-inverted"
            wrap
          >
            {categories.map((category) => (
              <Badge key={category} size="sm" variant="neutral-inverted">
                {category}
              </Badge>
            ))}
          </BadgeGroup>
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

type ConnectCommandPaletteProps = {
  components?: ComponentList;
  /** Pre-parsed specs appended to the catalog — the seam tests use to inject fixtures without a raw schema. */
  additionalComponents?: ExtendedConnectComponentSpec[];
  /** Component types valid in the slot being filled; the palette lists only these. */
  allowedTypes?: ConnectComponentType[];
  onSelect: (connectionName: string, connectionType: ConnectComponentType) => void;
  /** When provided, the footer shows a Cancel button wired to this. */
  onCancel?: () => void;
  searchPlaceholder?: string;
};

/**
 * Search-first add-node picker as a master/detail panel: tab-filtered list, metadata preview, and a
 * footer that defers insertion until commit. Matches name/aliases/summary/description/categories.
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
  // State, not a mount-once memo, so a component committed while the palette stays mounted shows up.
  const [recents, setRecents] = useState(() => readRecents());

  const allComponents = useMemo(() => {
    const builtIn = components ? parseSchema(components) : [];
    return [...builtIn, ...(additionalComponents ?? [])];
  }, [components, additionalComponents]);

  const typeAllowed = useMemo(() => {
    const set = allowedTypes && allowedTypes.length > 0 ? new Set(allowedTypes) : null;
    return (type: ConnectComponentType) => !set || set.has(type);
  }, [allowedTypes]);

  const inScope = useMemo(() => allComponents.filter((c) => typeAllowed(c.type)), [allComponents, typeAllowed]);

  // Searchable text is derived once per catalog: building it walks the alias table and joins each
  // component's full description — too costly to redo per keystroke across hundreds of components.
  const searchIndex = useMemo(
    () => new Map(allComponents.map((component) => [component, searchableText(component)])),
    [allComponents]
  );
  const byName = useMemo(() => new Map(inScope.map((c) => [c.name, c])), [inScope]);
  // Keyed by CommandItem `value` (`type:name`) since two types can share a name (e.g. kafka in/out).
  const byKey = useMemo(() => new Map(inScope.map((c) => [`${c.type}:${c.name}`, c])), [inScope]);
  const activeComponent = byKey.get(activeValue);

  const handleCommit = (component: ConnectComponentSpec) => {
    pushRecent({ name: component.name, type: component.type });
    setRecents(readRecents());
    onSelect(component.name, component.type);
  };

  // Clicking a row only previews it; cmdk also drives this via hover/arrow nav through `onValueChange`.
  const handlePreview = (component: ConnectComponentSpec) => setActiveValue(`${component.type}:${component.name}`);

  const q = query.trim().toLowerCase();

  // Searching: a single ranked, flat list across the in-scope catalog.
  const results = useMemo(() => {
    if (!q) {
      return [];
    }
    return inScope
      .map((component) => ({
        component,
        rank: matchRank(component, q, searchIndex.get(component) ?? ''),
      }))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank || byProminence(a.component, b.component))
      .map((r) => r.component);
  }, [inScope, q, searchIndex]);

  // On a type-locked miss, the out-of-scope types that DO match — shown in the empty state so the
  // miss isn't read as a gap.
  const outOfScopeTypes = useMemo(() => {
    if (!q || results.length > 0 || !allowedTypes || allowedTypes.length === 0) {
      return [];
    }
    const types = new Set<ConnectComponentType>();
    for (const component of allComponents) {
      if (!typeAllowed(component.type) && matchRank(component, q, searchIndex.get(component) ?? '') >= 0) {
        types.add(component.type);
      }
    }
    return [...types].sort();
  }, [q, results, allowedTypes, allComponents, typeAllowed, searchIndex]);

  // Browse facets (no query): recents + suggested + everything grouped by category.
  const recentComponents = useMemo(
    () => recents.map((r) => byName.get(r.name)).filter((c): c is ConnectComponentSpec => Boolean(c)),
    [recents, byName]
  );

  const suggested = useMemo(
    () => computeSuggested(allowedTypes, byName, recentComponents),
    [allowedTypes, byName, recentComponents]
  );

  // Grouped by category for the tabs; a component appears under EVERY category it lists, not just the first.
  const grouped = useMemo(() => {
    const groups = new Map<string, ConnectComponentSpec[]>();
    for (const component of inScope) {
      const cats = component.categories?.length ? component.categories : ['other'];
      for (const key of cats) {
        const list = groups.get(key);
        if (list) {
          list.push(component);
        } else {
          groups.set(key, [component]);
        }
      }
    }
    return [...groups.entries()]
      .map(([id, list]) => ({ id, name: getCategoryDisplayName(id), components: list.sort(byProminence) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inScope]);

  // The "All" tab lists every component once, deduped across the category groups it may appear in.
  const allGroups = useMemo(() => {
    const seen = new Set<string>();
    return grouped
      .map((group) => ({
        ...group,
        components: group.components.filter((c) => {
          const key = `${c.type}:${c.name}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        }),
      }))
      .filter((group) => group.components.length > 0);
  }, [grouped]);

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
    return null; // "all" renders the grouped view, not a flat list.
  }, [currentTab, recentComponents, suggested, grouped]);

  // Enter commits the highlighted component; a single click only previews, double-click commits.
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
            <div className="text-muted-foreground text-xs">{pluralizeWithNumber(results.length, 'result')}</div>
          </div>
        ) : (
          <div className="min-w-0 shrink-0">
            <Tabs className="min-w-0 gap-0" onValueChange={setTab} value={currentTab}>
              <ScrollableTabsList className="px-2" variant="underline">
                {tabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} variant="underline">
                    {t.label}
                  </TabsTrigger>
                ))}
              </ScrollableTabsList>
            </Tabs>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <CommandList className="h-full max-h-none min-w-0 flex-1 md:max-w-[28rem] md:border-r">
            <CommandEmpty>{buildEmptyMessage(query.trim(), allowedTypes, outOfScopeTypes)}</CommandEmpty>

            {q ? (
              <CommandGroup heading="Results">
                {results.map((component) => (
                  <Row
                    component={component}
                    key={`${component.type}-${component.name}`}
                    onCommit={handleCommit}
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
                    onCommit={handleCommit}
                    onPreview={handlePreview}
                  />
                ))}
              </CommandGroup>
            ) : (
              allGroups.map((group) => (
                <CommandGroup heading={group.name} key={group.id}>
                  {group.components.map((component) => (
                    <Row
                      component={component}
                      key={`${component.type}-${component.name}`}
                      onCommit={handleCommit}
                      onPreview={handlePreview}
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
            <div className="text-muted-foreground text-sm">Select a component to add</div>
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
