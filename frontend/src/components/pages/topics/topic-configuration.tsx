import { useNavigate, useSearch } from '@tanstack/react-router';
import clsx from 'clsx';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Empty, EmptyDescription } from 'components/redpanda-ui/components/empty';
import { Group } from 'components/redpanda-ui/components/group';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from 'components/redpanda-ui/components/input-group';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Slider } from 'components/redpanda-ui/components/slider';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Pencil as EditIcon, Search, X as XIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, type SubmitHandler, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { isServerless } from '../../../config';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { ConfigEntryExtended, ConfigEntrySynonym } from '../../../state/rest-interfaces';
import {
  entryHasInfiniteValue,
  formatConfigValue,
  getInfiniteValueForEntry,
} from '../../../utils/formatters/config-value-formatter';

type ConfigurationEditorProps = {
  targetTopic: string; // topic name, or null if default configs
  entries: ConfigEntryExtended[];
  onForceRefresh: () => void;
};

type Inputs = {
  valueType: 'default' | 'infinite' | 'custom';
  customValue: string | number | undefined | null;
};

// ── Shared config helpers ───────────────────────────────────────────────────────

const SOURCE_PRIORITY_ORDER = [
  'DYNAMIC_TOPIC_CONFIG',
  'DYNAMIC_BROKER_CONFIG',
  'DYNAMIC_DEFAULT_BROKER_CONFIG',
  'STATIC_BROKER_CONFIG',
  'DEFAULT_CONFIG',
];

/** Highest-priority synonym that represents the inherited (non topic-level) default. */
function getDefaultConfigSynonym(entry: ConfigEntryExtended): ConfigEntrySynonym | undefined {
  return entry.synonyms
    ?.filter(({ source }) => source !== 'DYNAMIC_TOPIC_CONFIG')
    .sort((a, b) => SOURCE_PRIORITY_ORDER.indexOf(a.source) - SOURCE_PRIORITY_ORDER.indexOf(b.source))[0];
}

/** A config is "modified" when this topic explicitly overrides the cluster/broker default. */
function isConfigModified(entry: ConfigEntryExtended): boolean {
  return entry.isExplicitlySet;
}

/** First option for enum-style editors, used as the fallback when there's no value. */
function getFirstSelectOption(entry: ConfigEntryExtended): string | undefined {
  if (entry.frontendFormat === 'BOOLEAN') {
    return 'false';
  }
  if (entry.frontendFormat === 'SELECT') {
    return entry.enumValues?.[0];
  }
}

// Curated categories + order for the grouped layout. Anything the backend tags
// with a category outside this set falls back to "Other".
const CONFIG_CATEGORIES = [
  { name: 'Retention', blurb: 'How long and how much data this topic retains.' },
  { name: 'Compaction', blurb: 'Log cleanup and key-based compaction behavior.' },
  { name: 'Replication', blurb: 'Durability and in-sync replica requirements.' },
  { name: 'Tiered Storage', blurb: 'Offloading topic data to object storage.' },
  { name: 'Write Caching', blurb: 'Write acknowledgement and caching behavior.' },
  { name: 'Iceberg', blurb: 'Apache Iceberg table integration for this topic.' },
  { name: 'Schema Registry and Validation', blurb: 'Schema ID validation for keys and values.' },
  { name: 'Message Handling', blurb: 'Message size, timestamps, and conversion behavior.' },
  { name: 'Compression', blurb: 'Message compression behavior.' },
  { name: 'Storage Internals', blurb: 'Low-level segment and index storage settings.' },
  { name: 'Other', blurb: 'Additional topic configuration.' },
] as const;

const ALLOWED_CATEGORIES = new Set<string>(CONFIG_CATEGORIES.map((c) => c.name));

function categoryForEntry(entry: ConfigEntryExtended): string {
  return entry.category && ALLOWED_CATEGORIES.has(entry.category) ? entry.category : 'Other';
}

function getDefaultValueType(entry: ConfigEntryExtended): Inputs['valueType'] {
  if (!entry.isExplicitlySet) {
    return 'default';
  }
  return entryHasInfiniteValue(entry) ? 'infinite' : 'custom';
}

function getEditorDefaultValues(entry: ConfigEntryExtended): Inputs {
  const defaultConfigSynonym = getDefaultConfigSynonym(entry);
  const explicitCustomValue = entry.isExplicitlySet && !entryHasInfiniteValue(entry) ? entry.value : '';
  // Seed Custom from the resolved/inherited value (explicit override → current effective
  // value → inherited default) so opening Custom and saving without touching the control
  // doesn't silently overwrite a non-default BOOLEAN/SELECT value. Only fall back to the
  // first enum option when nothing is resolved, so the dropdown still shows a concrete choice.
  const resolvedValue = explicitCustomValue || entry.value || defaultConfigSynonym?.value || '';
  return {
    valueType: getDefaultValueType(entry),
    customValue: resolvedValue || getFirstSelectOption(entry) || '',
  };
}

function getValueTypeOptions(entry: ConfigEntryExtended): Array<{ label: string; value: Inputs['valueType'] }> {
  const hasInfiniteValue =
    entry.frontendFormat && ['BYTE_SIZE', 'DURATION'].includes(entry.frontendFormat) && !entry.noInfiniteValue;
  const valueTypeOptions: Array<{
    label: string;
    value: Inputs['valueType'];
  }> = [];
  valueTypeOptions.push({
    label: 'Default',
    value: 'default',
  });
  if (hasInfiniteValue) {
    valueTypeOptions.push({
      label: 'Infinite',
      value: 'infinite',
    });
  }
  valueTypeOptions.push({
    label: 'Custom',
    value: 'custom',
  });
  return valueTypeOptions;
}

function resolveConfigChange(entry: ConfigEntryExtended, { valueType, customValue }: Inputs) {
  const operation = valueType === 'infinite' || valueType === 'custom' ? 'SET' : 'DELETE';

  let value: number | string | undefined | null;
  if (valueType === 'infinite') {
    value = getInfiniteValueForEntry(entry);
  } else if (valueType === 'custom') {
    value = customValue;
  }

  return { operation, configValue: operation === 'SET' ? String(value) : undefined } as const;
}

const ConfigEditorForm: FC<{
  editedEntry: ConfigEntryExtended;
  onClose: () => void;
  onSuccess: () => void;
  targetTopic: string;
}> = ({ editedEntry, onClose, targetTopic, onSuccess }) => {
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fieldId = useId();
  const defaultConfigSynonym = getDefaultConfigSynonym(editedEntry);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<Inputs>({
    defaultValues: getEditorDefaultValues(editedEntry),
  });

  const valueTypeOptions = getValueTypeOptions(editedEntry);

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const { operation, configValue } = resolveConfigChange(editedEntry, inputs);
    try {
      await api.changeTopicConfig(targetTopic, [
        {
          key: editedEntry.name,
          op: operation,
          value: configValue,
        },
      ]);
      toast.success(`Config ${editedEntry.name} updated`);
      onSuccess();
      onClose();
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error while applying config change', { err, configEntry: editedEntry });
      setGlobalError(err instanceof Error ? err.message : String(err));
    }
  };

  const valueType = useWatch({ control, name: 'valueType' });

  // Route "Reset to default" through the normal submit path (which DELETEs for the
  // 'default' value type) instead of firing an out-of-band DELETE. This shares the
  // single pending/disabled state with Save/Cancel, so reset can't race a concurrent
  // Save and the buttons disable together while the mutation is in flight.
  const handleReset = () => {
    setValue('valueType', 'default');
    void handleSubmit(onSubmit)();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent size="lg">
        <form className="contents" onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{`Edit ${editedEntry.name}`}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="pb-6">{editedEntry.documentation}</p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-label" id={`${fieldId}-value-type`}>
                  {editedEntry.name}
                </p>
                <Controller
                  control={control}
                  name="valueType"
                  render={({ field: { onChange, value } }) => (
                    <RadioGroup aria-labelledby={`${fieldId}-value-type`} onValueChange={onChange} value={value}>
                      {valueTypeOptions.map((opt) => (
                        <div className="flex items-center gap-2" key={opt.value}>
                          <RadioGroupItem id={`value-type-${opt.value}`} value={opt.value} />
                          <Label htmlFor={`value-type-${opt.value}`}>{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                />
              </div>
              {valueType === 'custom' && (
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`${fieldId}-custom-value`}
                  >{`Set a custom ${editedEntry.name} value for this topic`}</Label>
                  <div className="w-fit">
                    <Controller
                      control={control}
                      name="customValue"
                      render={({ field: { onChange, value } }) => (
                        <ConfigEntryEditorController
                          entry={editedEntry}
                          id={`${fieldId}-custom-value`}
                          onChange={onChange}
                          value={value}
                        />
                      )}
                    />
                  </div>
                </div>
              )}
              {valueType === 'default' && defaultConfigSynonym && (
                <div>
                  The default value is{' '}
                  <strong>{formatConfigValue(editedEntry.name, defaultConfigSynonym.value, 'friendly')}</strong>. This
                  is inherited from {defaultConfigSynonym.source}.
                </div>
              )}
            </div>
            {Boolean(globalError) && (
              <Alert className="mt-2" variant="destructive">
                <AlertDescription>{globalError}</AlertDescription>
              </Alert>
            )}
          </DialogBody>
          <DialogFooter>
            {editedEntry.isExplicitlySet ? (
              <Button className="mr-auto" disabled={isSubmitting} onClick={handleReset} type="button" variant="ghost">
                Reset to default
              </Button>
            ) : null}
            <Button
              disabled={isSubmitting}
              onClick={() => {
                onClose();
              }}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ── Grouped, navigable layout ─────

type ConfigSection = {
  name: string;
  blurb: string;
  rows: ConfigEntryExtended[];
  modifiedCount: number;
};

function useConfigSearchParams() {
  const navigate = useNavigate({ from: '/topics/$topicName/' });
  const { configFilter = '', configScope = 'all' } = useSearch({ from: '/topics/$topicName/' });

  const setFilter = (value: string) => {
    navigate({ search: (prev) => ({ ...prev, configFilter: value || undefined }), replace: true }).catch(
      (error: unknown) => {
        toast.error('Failed to update configuration filter', { description: String(error) });
      }
    );
  };

  const setScope = (value: 'all' | 'modified') => {
    navigate({
      search: (prev) => ({ ...prev, configScope: value === 'all' ? undefined : value }),
      replace: true,
    }).catch((error: unknown) => {
      toast.error('Failed to update configuration scope', { description: String(error) });
    });
  };

  return { configFilter, scope: configScope, setFilter, setScope };
}

function useConfigSections(entries: ConfigEntryExtended[], query: string, scope: 'all' | 'modified') {
  const totalModifiedCount = useMemo(() => entries.filter(isConfigModified).length, [entries]);

  const sections = useMemo<ConfigSection[]>(() => {
    const matchesQuery = (e: ConfigEntryExtended) =>
      !query || e.name.toLowerCase().includes(query) || (e.documentation ?? '').toLowerCase().includes(query);

    return CONFIG_CATEGORIES.map(({ name, blurb }) => {
      const rows = entries.filter(
        (e) => categoryForEntry(e) === name && matchesQuery(e) && (scope === 'all' || isConfigModified(e))
      );
      return { name, blurb, rows, modifiedCount: rows.filter(isConfigModified).length };
    }).filter((s) => s.rows.length > 0);
  }, [entries, query, scope]);

  // Sidebar is a stable index of the topic's categories — not subject to the
  // search/scope filter, so it never reflows as you type or toggle Modified.
  const sidebarCategories = useMemo(
    () =>
      CONFIG_CATEGORIES.map(({ name }) => {
        const categoryEntries = entries.filter((e) => categoryForEntry(e) === name);
        return { name, count: categoryEntries.length, modifiedCount: categoryEntries.filter(isConfigModified).length };
      }).filter((c) => c.count > 0),
    [entries]
  );

  return { totalModifiedCount, sections, sidebarCategories };
}

// The sections render in their own scroll container; clicking a sidebar category
// scrolls to its section *within this panel* (not by filtering, and without
// scrolling the whole page).
function useConfigScrollSpy(sections: ConfigSection[]) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const sectionsContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const scrollToCategory = (name: string) => {
    const container = sectionsContainerRef.current;
    const section = sectionRefs.current[name];
    if (!(container && section)) {
      return;
    }
    const top = section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top, behavior: 'smooth' });
    setActiveCategory(name);
  };

  // Scroll-spy: highlight the sidebar category whose section is at the top of the
  // scroll container as the user scrolls. Re-attaches whenever the rendered section
  // set changes so the observer always tracks the current section elements.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on section set change
  useEffect(() => {
    const container = sectionsContainerRef.current;
    if (!container) {
      return;
    }
    const observer = new IntersectionObserver(
      (observed) => {
        const topmost = observed
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topmost) {
          setActiveCategory(topmost.target.getAttribute('data-category'));
        }
      },
      { root: container, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    for (const el of Object.values(sectionRefs.current)) {
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, [sections]);

  return { activeCategory, sectionsContainerRef, sectionRefs, scrollToCategory };
}

const ConfigurationEditor: FC<ConfigurationEditorProps> = (props) => {
  const { configFilter, scope, setFilter, setScope } = useConfigSearchParams();
  const [editedEntry, setEditedEntry] = useState<ConfigEntryExtended | null>(null);
  const topicPermissions = useApiStoreHook((s) => s.topicPermissions.get(props.targetTopic));
  const hasEditPermissions = props.targetTopic ? (topicPermissions?.canEditTopicConfig ?? true) : true;

  const { totalModifiedCount, sections, sidebarCategories } = useConfigSections(
    props.entries,
    configFilter.toLowerCase(),
    scope
  );
  const { activeCategory, sectionsContainerRef, sectionRefs, scrollToCategory } = useConfigScrollSpy(sections);

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6" data-testid="config-group-table">
      {editedEntry !== null && (
        <ConfigEditorForm
          editedEntry={editedEntry}
          onClose={() => setEditedEntry(null)}
          onSuccess={() => props.onForceRefresh()}
          targetTopic={props.targetTopic}
        />
      )}

      <aside className="sticky top-4 self-start">
        <nav aria-label="Configuration categories" className="flex flex-col gap-1">
          {sidebarCategories.map((c) => {
            const active = c.name === activeCategory;
            return (
              <button
                aria-current={active ? 'true' : undefined}
                className={clsx(
                  'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-body transition-colors',
                  active ? 'bg-muted font-medium' : 'hover:bg-muted/50'
                )}
                key={c.name}
                onClick={() => scrollToCategory(c.name)}
                type="button"
              >
                <span className="min-w-0 truncate">{c.name}</span>
                {c.modifiedCount > 0 ? (
                  <Badge aria-label={`${c.modifiedCount} modified`} size="sm" tone="informative" variant="subtle">
                    {c.modifiedCount}
                  </Badge>
                ) : (
                  <Badge size="sm" tone="default" variant="outline">
                    {c.count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <InputGroup>
              <InputGroupAddon>
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Filter configuration"
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter"
                value={configFilter}
              />
              {configFilter ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="Clear filter" onClick={() => setFilter('')} size="icon-xs">
                    <XIcon className="size-4" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
          <ToggleGroup
            onValueChange={([v]) => {
              if (v) {
                setScope(v as 'all' | 'modified');
              }
            }}
            value={[scope]}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="modified">
              Modified
              {totalModifiedCount > 0 && (
                <Badge className="ml-2" size="sm" tone="informative" variant="subtle">
                  {totalModifiedCount}
                </Badge>
              )}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-6 overflow-y-auto pr-1" ref={sectionsContainerRef}>
          {sections.length === 0 ? (
            <Empty>
              <EmptyDescription>No configuration entries match your filters</EmptyDescription>
            </Empty>
          ) : (
            sections.map((s) => (
              <section
                aria-labelledby={`config-section-${s.name}`}
                data-category={s.name}
                key={s.name}
                ref={(el) => {
                  sectionRefs.current[s.name] = el;
                }}
              >
                <div className="mb-3 flex flex-col">
                  <h3 className="text-heading-md font-semibold" id={`config-section-${s.name}`}>
                    {s.name}
                  </h3>
                  <p className="text-body text-muted-foreground">{s.blurb}</p>
                </div>
                <div className="divide-y rounded-lg border">
                  {s.rows.map((entry) => (
                    <ConfigRow
                      entry={entry}
                      hasEditPermissions={hasEditPermissions}
                      key={entry.name}
                      onEditEntry={setEditedEntry}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const ConfigRow: FC<{
  entry: ConfigEntryExtended;
  hasEditPermissions: boolean;
  onEditEntry: (entry: ConfigEntryExtended) => void;
}> = ({ entry, hasEditPermissions, onEditEntry }) => {
  const { canEdit, reason: nonEdittableReason } = isTopicConfigEdittable(entry, hasEditPermissions);
  const modified = isConfigModified(entry);
  const friendlyValue = formatConfigValue(entry.name, entry.value, 'friendly');
  const defaultSynonym = getDefaultConfigSynonym(entry);
  const defaultValue = defaultSynonym ? formatConfigValue(entry.name, defaultSynonym.value, 'friendly') : null;

  const valueButton = (
    <button
      className={
        canEdit
          ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-0.5 hover:bg-muted hover:text-primary'
          : 'inline-flex cursor-default items-center gap-1.5 rounded-sm px-1.5 py-0.5 [&_svg]:opacity-50'
      }
      onClick={() => {
        if (canEdit) {
          onEditEntry(entry);
        }
      }}
      type="button"
    >
      <span className="font-mono text-body">{friendlyValue}</span>
      <EditIcon className="size-4" />
    </button>
  );

  return (
    <div className={clsx('flex items-start justify-between gap-4 px-4 py-3', modified ? 'bg-muted/30' : '')}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {entry.documentation ? (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    className="cursor-pointer font-mono text-body underline decoration-dotted underline-offset-4 hover:text-primary"
                    type="button"
                  >
                    {entry.name}
                  </button>
                }
              />
              <PopoverContent className="w-80">
                <div className="flex flex-col gap-2">
                  <p className="font-bold">{entry.name}</p>
                  <p className="text-body">{entry.documentation}</p>
                  <p className="text-body text-muted-foreground">{getConfigDescription(entry.source)}</p>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="font-mono text-body">{entry.name}</span>
          )}
          {modified ? (
            <Badge size="sm" tone="informative" variant="subtle">
              Modified
            </Badge>
          ) : null}
        </div>
        {modified && defaultValue !== null && (
          <p className="text-body-sm text-muted-foreground">
            Default: <span className="font-mono">{defaultValue}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canEdit ? (
          valueButton
        ) : (
          <Tooltip>
            <TooltipTrigger render={valueButton} />
            <TooltipContent side="left">{nonEdittableReason}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default ConfigurationEditor;

function isTopicConfigEdittable(
  entry: ConfigEntryExtended,
  hasEditPermissions: boolean
): { canEdit: boolean; reason?: string } {
  if (!hasEditPermissions) {
    return { canEdit: false, reason: "You don't have permissions to change topic configuration entries" };
  }

  if (isServerless()) {
    const edittableEntries = [
      'retention.ms',
      'retention.bytes',
      'cleanup.policy',
      'write.caching',
      'max.message.bytes',
      'unclean.leader.election.enable',
      'min.insync.replicas',
    ];

    if (edittableEntries.includes(entry.name)) {
      return { canEdit: true };
    }

    return { canEdit: false, reason: 'This configuration is not editable on Serverless clusters' };
  }

  return { canEdit: true };
}

export const ConfigEntryEditorController = <T extends string | number>(p: {
  entry: ConfigEntryExtended;
  value: T;
  onChange: (e: T) => void;
  className?: string;
  /** Id for the entry's primary labellable control. */
  id?: string;
}) => {
  const { entry, value, onChange } = p;
  switch (entry.frontendFormat) {
    case 'BOOLEAN':
      return (
        <Select onValueChange={(v) => onChange(v as T)} value={String(value)}>
          <SelectTrigger id={p.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">False</SelectItem>
            <SelectItem value="true">True</SelectItem>
          </SelectContent>
        </Select>
      );

    case 'SELECT':
      return (
        <Select onValueChange={(v) => onChange(v as T)} value={String(value)}>
          <SelectTrigger className={p.className} id={p.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(entry.enumValues ?? []).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'BYTE_SIZE':
      return (
        <DataSizeSelect id={p.id} onChange={(e) => onChange(Math.round(e) as T)} valueBytes={Number(value ?? 0)} />
      );

    case 'DURATION':
      return (
        <DurationSelect
          id={p.id}
          onChange={(e) => onChange(Math.round(e) as T)}
          valueMilliseconds={Number(value ?? 0)}
        />
      );

    case 'PASSWORD':
      return (
        <Input id={p.id} onChange={(x) => onChange(x.target.value as T)} type="password" value={String(value ?? '')} />
      );

    case 'RATIO':
      return <RatioInput id={p.id} onChange={(x) => onChange(x as T)} value={Number(value || entry.value)} />;

    case 'INTEGER':
      return <NumInput id={p.id} onChange={(e) => onChange(Math.round(e ?? 0) as T)} value={Number(value)} />;

    case 'DECIMAL':
      return <NumInput id={p.id} onChange={(e) => onChange(e as T)} value={Number(value)} />;

    default:
      return <Input id={p.id} onChange={(e) => onChange(e.target.value as T)} value={String(value)} />;
  }
};

function getConfigDescription(source: string): string {
  switch (source) {
    case 'DEFAULT_CONFIG':
      return 'Inherited from DEFAULT_CONFIG';
    case 'DYNAMIC_TOPIC_CONFIG':
      return 'This is a custom setting for this topic';
    case 'DYNAMIC_BROKER_CONFIG':
    case 'STATIC_BROKER_CONFIG':
      return 'This is a custom setting set on the BROKER_CONFIG level.';
    default:
      return '';
  }
}

// ── Local input helpers ────────────────────────────────────────────────────────

function NumInput(p: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  addonAfter?: ReactNode;
  id?: string;
}) {
  const [editValue, setEditValue] = useState(p.value === undefined ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value === undefined ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled) {
      return;
    }
    let v = x;
    if (v !== undefined && p.min !== undefined && v < p.min) {
      v = p.min;
    }
    if (v !== undefined && p.max !== undefined && v > p.max) {
      v = p.max;
    }
    setEditValue(v === undefined ? undefined : String(v));
    p.onChange?.(v);
  };

  const input = (
    <Input
      className={p.addonAfter ? 'flex-1' : undefined}
      disabled={p.disabled}
      id={p.id}
      onBlur={() => {
        if (!editValue) {
          commit(undefined);
          setEditValue('');
          return;
        }
        const n = Number(editValue);
        if (!Number.isFinite(n)) {
          commit(undefined);
          setEditValue('');
          return;
        }
        commit(n);
      }}
      onChange={(e) => {
        setEditValue(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && !Number.isNaN(n)) {
          p.onChange?.(n);
        } else {
          p.onChange?.(undefined);
        }
      }}
      onWheel={(e) => commit(Math.round((p.value ?? 0) - Math.sign(e.deltaY)))}
      placeholder={p.placeholder}
      spellCheck={false}
      value={p.disabled && p.placeholder && p.value === undefined ? '' : (editValue ?? '')}
    />
  );

  if (!p.addonAfter) {
    return input;
  }
  // An attached group joins the input and its addon into one control.
  return (
    <Group attached>
      {input}
      {p.addonAfter}
    </Group>
  );
}

function UnitInput<U extends string>({
  baseValue,
  unitFactors,
  onChange,
  id,
}: {
  baseValue: number;
  unitFactors: Readonly<Record<U, number>>;
  onChange: (v: number) => void;
  id?: string;
}) {
  const getInitialUnit = (): U => {
    const pairs = (Object.entries(unitFactors) as [U, number][])
      .map(([unit, factor]) => ({ unit, text: String(baseValue / factor) }))
      .sort((a, b) => a.text.length - b.text.length);
    return pairs[0].unit;
  };

  const [unit, setUnit] = useState<U>(getInitialUnit);
  const unitValue = baseValue / unitFactors[unit];

  return (
    <NumInput
      addonAfter={
        <Select onValueChange={(u) => setUnit(u as U)} value={unit}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(unitFactors) as U[]).map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      id={id}
      min={0}
      onChange={(x) => onChange((x ?? 0) * unitFactors[unit])}
      value={unitValue}
    />
  );
}

const dataSizeFactors = {
  Bytes: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
} as const;

const durationFactors = {
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

function DataSizeSelect(p: { valueBytes: number; onChange: (v: number) => void; id?: string }) {
  return <UnitInput baseValue={p.valueBytes} id={p.id} onChange={p.onChange} unitFactors={dataSizeFactors} />;
}

function DurationSelect(p: { valueMilliseconds: number; onChange: (v: number) => void; id?: string }) {
  return <UnitInput baseValue={p.valueMilliseconds} id={p.id} onChange={p.onChange} unitFactors={durationFactors} />;
}

function RatioInput(p: { value: number; onChange: (ratio: number) => void; id?: string }) {
  const pct = Math.round(p.value * 100);
  const generatedId = useId();
  const inputId = p.id ?? `${generatedId}-input`;
  const captionId = `${generatedId}-caption`;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-label" id={captionId}>
          Percentage ({pct}%)
        </p>
        <Slider
          aria-labelledby={captionId}
          className="w-full"
          max={100}
          min={0}
          onValueChange={(values) => p.onChange(values[0] / 100)}
          step={1}
          value={[pct]}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap" htmlFor={inputId}>
          Precise value:
        </Label>
        <div className="relative shrink-0">
          <Input
            className="w-20 text-right"
            id={inputId}
            max={100}
            min={0}
            onChange={(e) => {
              if (e.target.value === '') {
                return;
              }
              const n = Number(e.target.value);
              if (!Number.isNaN(n) && n >= 0 && n <= 100) {
                p.onChange(n / 100);
              }
            }}
            type="number"
            value={pct}
          >
            {/* The end slot pads the input to fit the unit. */}
            <InputEnd>
              <span className="text-body text-muted-foreground">%</span>
            </InputEnd>
          </Input>
        </div>
      </div>
    </div>
  );
}
