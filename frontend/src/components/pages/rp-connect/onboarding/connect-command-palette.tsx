import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import clsx from 'clsx';
import { TonedIcon } from 'components/pages/shared/toned-icon';
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
import { Separator } from 'components/redpanda-ui/components/separator';
import { ScrollableTabsList, Tabs, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link } from 'components/redpanda-ui/components/typography';
import { ExternalLink, Waypoints } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { pluralizeWithNumber } from 'utils/string';

import {
  buildEmptyMessage,
  byProminence,
  computeSuggested,
  matchRank,
  pushRecent,
  readRecents,
  searchableText,
} from './connect-command-palette-utils';
import { ConnectorLogo } from './connector-logo';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import { asciidocToMarkdown, markdownToPlainText } from '../utils/asciidoc';
import { getCategoryDisplayName } from '../utils/categories';
import { getConnectorDocsUrl } from '../utils/connector-docs';
import { componentStatusToString, parseSchema } from '../utils/schema';

function ComponentIcon({ component, className = 'size-5' }: { component: ConnectComponentSpec; className?: string }) {
  if (component.logoUrl) {
    return <img alt="" className={clsx(className, 'shrink-0 object-contain')} src={component.logoUrl} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return <ConnectorLogo className={clsx(className, 'shrink-0')} name={component.name as ComponentName} />;
  }

  return <TonedIcon className={clsx(className, 'shrink-0')} icon={Waypoints} tone="muted" />;
}

// Compact section title matching the inspector's small-label style.
const MarkdownHeading = ({ children }: { children?: React.ReactNode }) => (
  <div className="mt-2 text-body-sm font-semibold tracking-wide text-foreground uppercase">{children}</div>
);

// All heading levels collapse to the same compact label — these are short section titles, not a hierarchy.
const MARKDOWN_COMPONENTS: Components = {
  h1: MarkdownHeading,
  h2: MarkdownHeading,
  h3: MarkdownHeading,
  h4: MarkdownHeading,
  h5: MarkdownHeading,
  h6: MarkdownHeading,
  p: ({ children }) => <div className="text-body leading-relaxed text-foreground">{children}</div>,
  // Markdown can produce an anchor with no destination, which is text rather than a link.
  a: ({ href, children }) =>
    href ? (
      <Link href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </Link>
    ) : (
      <>{children}</>
    ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-body-sm">{children}</code>,
  ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4 text-body text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-4 text-body text-foreground">{children}</ol>,
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
      <Badge size="sm" tone="default" variant="subtle">
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
    return <span className="font-mono text-body font-semibold">{name}</span>;
  }
  return (
    <span className="font-mono text-body font-semibold">
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
        <Badge className="ml-auto shrink-0" size="sm" tone="default" variant="outline">
          <span className="capitalize">{badgeLabel}</span>
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
        <div className="max-w-[28ch] text-body text-muted-foreground">
          Select a component to see its description, categories, and documentation, then add it to your pipeline.
        </div>
      </div>
    );
  }

  const categories = (component.categories ?? []).map(getCategoryDisplayName).filter(Boolean);
  const summary = markdownToPlainText(asciidocToMarkdown(component.summary ?? ''));
  const descriptionMd = component.description ? asciidocToMarkdown(component.description) : '';
  // Skip the description when it just repeats the summary.
  const showDescription = descriptionMd !== '' && markdownToPlainText(descriptionMd) !== summary;
  const docsUrl = getConnectorDocsUrl(component.type, component.name);

  return (
    <div className="hidden min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 md:flex">
      <div className="flex items-start gap-3">
        <ComponentIcon className="size-8" component={component} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-body-lg font-semibold">{component.name}</span>
            {statusBadge(component.status, component.name)}
          </span>
          <span className="text-body-sm text-muted-foreground capitalize">
            {component.type.replace(/_/g, ' ')}
            {component.version ? ` · v${component.version}` : ''}
          </span>
        </div>
      </div>

      {summary ? <div className="text-body leading-relaxed text-foreground">{summary}</div> : null}

      {showDescription ? <FormattedDescription markdown={descriptionMd} /> : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">Categories</div>
          <BadgeGroup
            gap="md"
            maxVisible={6}
            renderOverflowContent={(overflow) => <div className="flex flex-col gap-1">{overflow}</div>}
            tone="default"
            variant="subtle"
            wrap
          >
            {categories.map((category) => (
              <Badge key={category} size="sm" tone="default" variant="subtle">
                {category}
              </Badge>
            ))}
          </BadgeGroup>
        </div>
      ) : null}

      {docsUrl ? (
        <div className="flex flex-col text-body">
          <Link className="inline-flex items-center" href={docsUrl} rel="noopener noreferrer" target="_blank">
            View documentation
            <ExternalLink className="ml-1 size-3.5" />
          </Link>
        </div>
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

type CategoryGroup = { id: string; name: string; components: ConnectComponentSpec[] };

// A component appears under EVERY category it lists, not just the first.
function groupByCategory(components: ConnectComponentSpec[]): CategoryGroup[] {
  const groups = new Map<string, ConnectComponentSpec[]>();
  for (const component of components) {
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
}

// The "All" tab lists every component once, deduped across the category groups it may appear in.
function dedupeAcrossGroups(grouped: CategoryGroup[]): CategoryGroup[] {
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
}

function buildTabs(
  recentComponents: ConnectComponentSpec[],
  suggested: ConnectComponentSpec[],
  grouped: CategoryGroup[]
): Tab[] {
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
}

// The flat list a browse tab shows; `null` for "all", which renders the grouped view instead.
function browseItemsForTab(
  tab: string,
  recentComponents: ConnectComponentSpec[],
  suggested: ConnectComponentSpec[],
  grouped: CategoryGroup[]
): ConnectComponentSpec[] | null {
  if (tab === 'recent') {
    return recentComponents;
  }
  if (tab === 'suggested') {
    return suggested;
  }
  if (tab.startsWith('cat:')) {
    const id = tab.slice(4);
    return grouped.find((g) => g.id === id)?.components ?? [];
  }
  return null;
}

// The in-scope catalog and its lookups, derived once per catalog rather than per keystroke.
function usePaletteCatalog({
  components,
  additionalComponents,
  allowedTypes,
}: Pick<ConnectCommandPaletteProps, 'components' | 'additionalComponents' | 'allowedTypes'>) {
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
  return { allComponents, typeAllowed, inScope, searchIndex, byName, byKey };
}

type PaletteCatalog = ReturnType<typeof usePaletteCatalog>;

// Searching: a single ranked, flat list across the in-scope catalog, plus — on a type-locked
// miss — the out-of-scope types that DO match, shown in the empty state so the miss isn't read as a gap.
function usePaletteSearch(catalog: PaletteCatalog, query: string, allowedTypes?: ConnectComponentType[]) {
  const { allComponents, inScope, searchIndex, typeAllowed } = catalog;
  const q = query.trim().toLowerCase();
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

  return { q, results, outOfScopeTypes };
}

// Browse facets (no query): recents + suggested + everything grouped by category.
function usePaletteFacets({
  catalog,
  recents,
  allowedTypes,
  tab,
}: {
  catalog: PaletteCatalog;
  recents: ReturnType<typeof readRecents>;
  allowedTypes?: ConnectComponentType[];
  tab: string | null;
}) {
  const { byName, inScope } = catalog;
  const recentComponents = useMemo(
    () => recents.map((r) => byName.get(r.name)).filter((c): c is ConnectComponentSpec => Boolean(c)),
    [recents, byName]
  );
  const suggested = useMemo(
    () => computeSuggested(allowedTypes, byName, recentComponents),
    [allowedTypes, byName, recentComponents]
  );
  const grouped = useMemo(() => groupByCategory(inScope), [inScope]);
  const allGroups = useMemo(() => dedupeAcrossGroups(grouped), [grouped]);
  const tabs = useMemo(() => buildTabs(recentComponents, suggested, grouped), [recentComponents, suggested, grouped]);

  const defaultTab = suggested.length > 0 ? 'suggested' : 'all';
  const currentTab = tab && tabs.some((t) => t.id === tab) ? tab : defaultTab;
  const browseItems = useMemo(
    () => browseItemsForTab(currentTab, recentComponents, suggested, grouped),
    [currentTab, recentComponents, suggested, grouped]
  );
  return { allGroups, tabs, currentTab, browseItems };
}

// Committing records the component as recent. State, not a mount-once memo, so a component
// committed while the palette stays mounted shows up.
function useCommitWithRecents(onSelect: ConnectCommandPaletteProps['onSelect']) {
  const [recents, setRecents] = useState(() => readRecents());
  const commit = (component: ConnectComponentSpec) => {
    pushRecent({ name: component.name, type: component.type });
    setRecents(readRecents());
    onSelect(component.name, component.type);
  };
  return { recents, commit };
}

function PaletteFacetTabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 shrink-0">
      <Tabs className="min-w-0" onValueChange={onValueChange} value={value}>
        <ScrollableTabsList variant="underline">
          {tabs.map((t, index) => (
            // Margins on the end triggers inset the labels without insetting the strip's baseline.
            <TabsTrigger
              className={clsx(index === 0 && 'ml-2', index === tabs.length - 1 && 'mr-2')}
              key={t.id}
              value={t.id}
              variant="underline"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
      </Tabs>
    </div>
  );
}

function PaletteListGroups({
  query,
  results,
  browseItems,
  allGroups,
  onCommit,
  onPreview,
}: {
  query: string;
  results: ConnectComponentSpec[];
  browseItems: ConnectComponentSpec[] | null;
  allGroups: CategoryGroup[];
  onCommit: (component: ConnectComponentSpec) => void;
  onPreview: (component: ConnectComponentSpec) => void;
}) {
  if (query) {
    return (
      <CommandGroup heading="Results">
        {results.map((component) => (
          <Row
            component={component}
            key={`${component.type}-${component.name}`}
            onCommit={onCommit}
            onPreview={onPreview}
            query={query}
          />
        ))}
      </CommandGroup>
    );
  }
  if (browseItems) {
    return (
      <CommandGroup>
        {browseItems.map((component) => (
          <Row
            component={component}
            key={`${component.type}-${component.name}`}
            onCommit={onCommit}
            onPreview={onPreview}
          />
        ))}
      </CommandGroup>
    );
  }
  return allGroups.map((group) => (
    <CommandGroup heading={group.name} key={group.id}>
      {group.components.map((component) => (
        <Row
          component={component}
          key={`${component.type}-${component.name}`}
          onCommit={onCommit}
          onPreview={onPreview}
        />
      ))}
    </CommandGroup>
  ));
}

function PaletteFooter({
  activeComponent,
  onCancel,
  onCommit,
}: {
  activeComponent?: ConnectComponentSpec;
  onCancel?: () => void;
  onCommit: (component: ConnectComponentSpec) => void;
}) {
  return (
    <DialogFooter direction="row" justify="between">
      <div className="flex min-w-0 items-center gap-2">
        {activeComponent ? (
          <>
            <span className="shrink-0 text-body-sm text-muted-foreground">Selected</span>
            <ComponentIcon className="size-4" component={activeComponent} />
            <span className="truncate font-mono text-body font-medium">{activeComponent.name}</span>
          </>
        ) : (
          <div className="text-body text-muted-foreground">Select a component to add</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onCancel ? (
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        ) : null}
        <Button disabled={!activeComponent} onClick={() => activeComponent && onCommit(activeComponent)}>
          Add to pipeline
        </Button>
      </div>
    </DialogFooter>
  );
}

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
  const { recents, commit } = useCommitWithRecents(onSelect);
  const catalog = usePaletteCatalog({ components, additionalComponents, allowedTypes });
  const activeComponent = catalog.byKey.get(activeValue);
  const { q, results, outOfScopeTypes } = usePaletteSearch(catalog, query, allowedTypes);
  const { allGroups, tabs, currentTab, browseItems } = usePaletteFacets({ catalog, recents, allowedTypes, tab });

  // Enter commits the highlighted component; a single click only previews, double-click commits.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && activeComponent) {
      event.preventDefault();
      commit(activeComponent);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard handling augments the inner cmdk listbox.
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
      <Command
        className="min-h-0 flex-1"
        disablePointerSelection
        onValueChange={setActiveValue}
        shouldFilter={false}
        size="full"
        value={activeValue}
        variant="minimal"
      >
        <CommandInput onValueChange={setQuery} placeholder={searchPlaceholder ?? 'Search components…'} value={query} />
        {q ? (
          <div className="flex h-10 shrink-0 items-center border-b px-3">
            <div className="text-body-sm text-muted-foreground">{pluralizeWithNumber(results.length, 'result')}</div>
          </div>
        ) : (
          <PaletteFacetTabs onValueChange={setTab} tabs={tabs} value={currentTab} />
        )}

        <div className="flex min-h-0 flex-1">
          <CommandList className="h-full max-h-none min-w-0 flex-1 md:max-w-[28rem]">
            <CommandEmpty>{buildEmptyMessage(query.trim(), allowedTypes, outOfScopeTypes)}</CommandEmpty>
            <PaletteListGroups
              allGroups={allGroups}
              browseItems={browseItems}
              onCommit={commit}
              // Clicking a row only previews it; cmdk also drives this via hover/arrow nav through `onValueChange`.
              onPreview={(component) => setActiveValue(`${component.type}:${component.name}`)}
              query={q}
              results={results}
            />
          </CommandList>
          <Separator className="hidden md:block" orientation="vertical" />

          <DetailPane component={activeComponent} />
        </div>
      </Command>

      <Separator />
      <PaletteFooter activeComponent={activeComponent} onCancel={onCancel} onCommit={commit} />
    </div>
  );
};
