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

import { useRouterState } from '@tanstack/react-router';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Empty, EmptyDescription } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from 'components/redpanda-ui/components/item';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Label } from 'components/redpanda-ui/components/label';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableRow } from 'components/redpanda-ui/components/table';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Cog,
  Database,
  Eye,
  FileCode,
  Flag,
  Info,
  RotateCw,
  Trash2,
  Zap,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { pluralizeWithNumber } from 'utils/string';

import { CONNECT_CONFIG_FIXTURES, type ConnectConfigFixture } from './connect-config-fixtures';
import { DebugPanda } from './debug-panda';
import {
  clearOverrides as clearFlagOverrides,
  getAllFlagKeys,
  getEffectiveFlags,
  getOverrides as getFlagOverrides,
  setOverride as setFlagOverride,
} from './feature-flag-overrides';
import {
  clearVisualDebuggers,
  getEnabledVisualDebuggers,
  setVisualDebugger,
  VISUAL_DEBUGGERS,
} from './visual-debuggers';
import { useHotKey } from '../../hooks/use-hot-key';
import env, { IsDev } from '../../utils/env';
import { FEATURE_FLAGS } from '../constants';
import { PIPELINE_END_RUNS, PipelineRunsCell } from '../pages/rp-connect/pipeline/pipeline-end-chip';
import { type PipelineEndStatus, summarizePipelineEndYaml } from '../pages/rp-connect/utils/input-end-behavior';

type BadgeProps = React.ComponentProps<typeof Badge>;

const TAG_TONE: Record<ConnectConfigFixture['tags'][number], BadgeProps['tone']> = {
  simple: 'success',
  medium: 'informative',
  complex: 'warning',
  'edge-case': 'brand',
  invalid: 'destructive',
  stops: 'primary',
};

const RUNS_LABEL = new Map(PIPELINE_END_RUNS.map((option) => [option.value, option.label]));

type ButtonVariant = React.ComponentProps<typeof Button>['variant'];

function copyToClipboard(text: string, successMsg = 'Copied to clipboard') {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(successMsg))
    .catch(() => toast.error('Failed to copy to clipboard'));
}

function emitConsole(level: 'log' | 'info' | 'warn' | 'error', message: string): void {
  // biome-ignore lint/suspicious/noConsole: intentional debug helper for the Simulate panel
  console[level](message);
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function readStorageEntries(storage: Storage): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      entries.push({ key, value: storage.getItem(key) ?? '' });
    }
  }
  return entries;
}

function useForceUpdate(): () => void {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((n) => n + 1), []);
}

// Scale/fade pop for small elements that mount and unmount (badges, count dots).
// Render inside an <AnimatePresence> so the exit animation can play.
function PopIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.span
      animate={{ opacity: 1, scale: 1 }}
      className={cn('inline-flex', className)}
      exit={{ opacity: 0, scale: 0.5 }}
      initial={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Empty>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}

function DebugSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-full overflow-hidden" size="sm" variant="standard">
      <CardHeader spacing="tight">
        <CardTitle>
          <span className="text-body-sm font-medium">{title}</span>
        </CardTitle>
        {description ? (
          <CardDescription>
            <span className="text-body-sm">{description}</span>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type FixtureTag = ConnectConfigFixture['tags'][number];

// The Configs panel's sections, in the order they read.
const FIXTURE_GROUPS: { tag: FixtureTag; label: string; chip: string; description: string }[] = [
  { tag: 'simple', label: 'Simple', chip: 'Simple', description: 'Small pipelines to start from.' },
  { tag: 'medium', label: 'Medium', chip: 'Medium', description: 'One source, a few processors, one sink.' },
  {
    tag: 'complex',
    label: 'Complex',
    chip: 'Complex',
    description: 'Large, branching pipelines for the visual editor.',
  },
  {
    tag: 'edge-case',
    label: 'Edge cases',
    chip: 'Edge',
    description: 'Resource indirection, many secrets, editor perf.',
  },
  {
    tag: 'stops',
    label: 'Stop conditions',
    chip: 'Stops',
    description: 'Whether a pipeline ends on its own: input stop rows, the Runs column, the schedule preview.',
  },
  { tag: 'invalid', label: 'Invalid', chip: 'Invalid', description: 'Configs the editor or Connect should reject.' },
];

// A stop-condition fixture lists under Stop conditions; any other under its first tag.
const groupOf = (f: ConnectConfigFixture): FixtureTag => (f.tags.includes('stops') ? 'stops' : f.tags[0]);

const SECRET_REF_RE = /\$\{secrets\.([A-Za-z0-9_]+)\}/g;

type FixtureEntry = {
  fixture: ConnectConfigFixture;
  group: FixtureTag;
  end: PipelineEndStatus;
  lineCount: number;
  /** Console secrets that must exist before Cloud saves it. */
  secrets: string[];
};

function ConfigFixtureRow({ entry }: { entry: FixtureEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { fixture, group, end, lineCount, secrets } = entry;

  return (
    <Collapsible className="border-b last:border-0" onOpenChange={setExpanded} open={expanded}>
      <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/40">
        <CollapsibleTrigger
          aria-label={`${expanded ? 'Hide' : 'Show'} the YAML for ${fixture.name}`}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? (
            <ChevronDown className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-body-sm">{fixture.name}</span>
              {fixture.tags
                .filter((tag) => tag !== group)
                .map((tag) => (
                  <Badge className="shrink-0" key={tag} size="sm" tone={TAG_TONE[tag]} variant="subtle">
                    {tag}
                  </Badge>
                ))}
            </span>
            <span className={cn('text-body-sm text-muted-foreground', !expanded && 'line-clamp-2')}>
              {fixture.description}
              {secrets.length > 0 ? (
                <span className="whitespace-nowrap text-muted-foreground/70">
                  {' · '}
                  {pluralizeWithNumber(secrets.length, 'secret')}
                </span>
              ) : null}
            </span>
          </span>
        </CollapsibleTrigger>
        <span className="w-28 shrink-0 pt-0.5">
          <PipelineRunsCell status={end} />
        </span>
        <CopyButton
          aria-label={`Copy the YAML for ${fixture.name}`}
          className="shrink-0"
          content={fixture.yaml}
          size="icon-xs"
          title="Copy YAML"
          variant="ghost"
        />
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 pr-3 pb-2.5 pl-7.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm text-muted-foreground">
            {pluralizeWithNumber(lineCount, 'line')} ·
            {secrets.length > 0 ? (
              <>
                {' '}
                needs {secrets.length === 1 ? 'the secret' : 'the secrets'}
                {secrets.map((name) => (
                  <InlineCode className="py-0 font-medium text-body-sm leading-normal" key={name}>
                    {name}
                  </InlineCode>
                ))}
              </>
            ) : (
              ' needs no secrets'
            )}
          </div>
          <SimpleCodeBlock
            allowCopy={false}
            className="my-0"
            code={fixture.yaml}
            language="yaml"
            maxHeight="sm"
            size="sm"
            width="full"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConnectConfigsPanel() {
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState<'all' | FixtureTag>('all');
  const entries = useMemo(
    (): FixtureEntry[] =>
      CONNECT_CONFIG_FIXTURES.map((fixture) => ({
        fixture,
        group: groupOf(fixture),
        // How it ends, as the pipelines list's Runs column reads it.
        end: summarizePipelineEndYaml(fixture.yaml).status,
        lineCount: fixture.yaml.split('\n').length,
        secrets: [...new Set(Array.from(fixture.yaml.matchAll(SECRET_REF_RE), (m) => m[1]))],
      })),
    []
  );
  const sections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (e: FixtureEntry) =>
      !q ||
      [e.fixture.name, e.fixture.description, ...e.fixture.tags, RUNS_LABEL.get(e.end) ?? '', ...e.secrets].some((s) =>
        s.toLowerCase().includes(q)
      );
    return FIXTURE_GROUPS.filter((g) => shown === 'all' || g.tag === shown)
      .map((g) => ({ ...g, entries: entries.filter((e) => e.group === g.tag && matches(e)) }))
      .filter((g) => g.entries.length > 0);
  }, [entries, filter, shown]);

  return (
    <div className="flex flex-col gap-3">
      {/* Stays in view while the list scrolls. Sticky offsets count from inside the scroller's padding,
          so the negative top and margins cancel it. */}
      <div className="sticky -top-4 z-10 -mx-5 -mt-4 flex flex-wrap items-center gap-2 border-b bg-background px-5 py-2">
        <Input
          aria-label="Filter configs by name, tag, secret or how they run"
          containerClassName="min-w-40 flex-1"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter configs…"
          size="sm"
          value={filter}
        />
        <ToggleGroup
          aria-label="Show"
          attached={false}
          onValueChange={([next]) => {
            if (next) {
              setShown(next as 'all' | FixtureTag);
            }
          }}
          size="sm"
          value={[shown]}
        >
          <ToggleGroupItem className="text-body-sm" value="all">
            All
          </ToggleGroupItem>
          {FIXTURE_GROUPS.map((g) => (
            <ToggleGroupItem className="text-body-sm" key={g.tag} value={g.tag}>
              {g.chip}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {sections.length === 0 ? (
        <EmptyState>No configs match “{filter}”.</EmptyState>
      ) : (
        sections.map((section) => (
          <section aria-label={section.label} className="overflow-hidden rounded-md border" key={section.tag}>
            <div className="flex items-baseline gap-2 border-b bg-muted/30 px-3 py-1.5">
              <span className="shrink-0 font-medium text-body-sm">{section.label}</span>
              <Badge className="shrink-0" size="sm" tone="default" variant="outline">
                {section.entries.length}
              </Badge>
              <span className="min-w-0 text-body-sm text-muted-foreground">{section.description}</span>
            </div>
            {section.entries.map((entry) => (
              <ConfigFixtureRow entry={entry} key={entry.fixture.id} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function ErrorThrower(): never {
  throw new Error('DebugDialog: synthetic render error to test ErrorBoundary');
}

const TOAST_ACTIONS: { label: string; variant: ButtonVariant; run: () => void }[] = [
  { label: 'Success', variant: 'primary', run: () => toast.success('Looking good — operation succeeded.') },
  { label: 'Info', variant: 'outline', run: () => toast.info('Heads up — informational toast.') },
  { label: 'Warning', variant: 'outline', run: () => toast.warning('Be careful — this might be slow.') },
  { label: 'Error', variant: 'destructive', run: () => toast.error('Something broke. Check the console.') },
  {
    label: 'With action',
    variant: 'outline',
    run: () =>
      toast.message('Action required', {
        description: 'A toast with a description and an action button.',
        action: { label: 'Undo', onClick: () => toast('Undone') },
      }),
  },
  {
    label: 'Loading → success',
    variant: 'outline',
    run: () => {
      const id = toast.loading('Processing… (5s)');
      setTimeout(() => toast.success('Done', { id }), 5000);
    },
  },
  {
    label: 'Stack 6',
    variant: 'outline',
    run: () => {
      for (let i = 0; i < 6; i++) {
        toast(`Stacked toast #${i + 1}`);
      }
    },
  },
];

function SimulatePanel({ onClose }: { onClose: () => void }) {
  const [renderThrow, setRenderThrow] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <DebugSection
        description="Fire each toast variant to verify rendering, stacking, and rich colors."
        title="Toasts"
      >
        <div className="flex flex-wrap gap-1.5">
          {TOAST_ACTIONS.map(({ label, variant, run }) => (
            <Button key={label} onClick={run} size="sm" variant={variant}>
              {label}
            </Button>
          ))}
        </div>
      </DebugSection>

      <DebugSection
        description="Force errors to verify ErrorBoundary, error toasts, and unhandled-rejection paths."
        title="Errors & console"
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            onClick={() => {
              onClose();
              // Defer the throw so the dialog finishes unmounting before the boundary trips.
              setTimeout(() => setRenderThrow(true), 50);
            }}
            size="sm"
            variant="destructive"
          >
            Throw in render (ErrorBoundary)
          </Button>
          <Button
            onClick={() => {
              emitConsole('error', 'DebugDialog: synthetic console.error');
              throw new Error('DebugDialog: uncaught synthetic error from event handler');
            }}
            size="sm"
            variant="destructive"
          >
            Throw in event handler
          </Button>
          <Button
            // biome-ignore lint/complexity/noVoid: an unhandled rejection is the point of this button
            onClick={() => void Promise.reject(new Error('DebugDialog: synthetic unhandled rejection'))}
            size="sm"
            variant="destructive"
          >
            Unhandled promise rejection
          </Button>
          <Button
            onClick={() => {
              emitConsole('warn', 'DebugDialog: synthetic console.warn');
              emitConsole('error', 'DebugDialog: synthetic console.error');
              emitConsole('info', 'DebugDialog: synthetic console.info');
              toast.success('Wrote 3 messages to the console');
            }}
            size="sm"
            variant="outline"
          >
            Console noise
          </Button>
        </div>
      </DebugSection>

      {renderThrow ? <ErrorThrower /> : null}
    </div>
  );
}

function VisualPanel({ onMutate }: { onMutate: () => void }) {
  const enabled = getEnabledVisualDebuggers();

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <Button
          disabled={enabled.length === 0}
          icon={<Trash2 />}
          onClick={() => {
            clearVisualDebuggers();
            toast.success('Disabled all visual debuggers');
            onMutate();
          }}
          size="xs"
          variant="destructive-ghost"
        >
          Disable all ({enabled.length})
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        {VISUAL_DEBUGGERS.map(({ id, label, description }) => (
          <div className="flex items-center gap-2.5 border-b px-3 py-1.5 last:border-0" key={id}>
            <Switch
              checked={enabled.includes(id)}
              onCheckedChange={(checked) => {
                setVisualDebugger(id, checked);
                onMutate();
              }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="text-body-sm font-medium">{label}</div>
              <div className="text-body-sm text-muted-foreground">{description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function dumpStorage(storage: Storage): Record<string, string> {
  return Object.fromEntries(readStorageEntries(storage).map(({ key, value }) => [key, value]));
}

function tryFormatValue(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function StorageEntryRow({ storageKey, value }: { storageKey: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = useMemo(() => tryFormatValue(value), [value]);
  const isMultiline = formatted.includes('\n') || formatted.length > 80;
  const sizeBytes = new Blob([value]).size;

  return (
    <Collapsible onOpenChange={setExpanded} open={expanded}>
      <div className="flex items-start gap-2 px-3 py-1.5">
        <CollapsibleTrigger
          aria-label={expanded ? 'Collapse value' : 'Expand value'}
          className="mt-0.5 shrink-0"
          render={<Button size="icon-xs" variant="ghost" />}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </CollapsibleTrigger>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <ElementTooltip content={storageKey}>
              <code className="min-w-0 flex-1 truncate font-mono text-body-sm font-medium">{storageKey}</code>
            </ElementTooltip>
            <Badge className="shrink-0" size="sm" tone="default" variant="outline">
              {formatBytes(sizeBytes)}
            </Badge>
          </div>
          {expanded ? null : (
            <div className="min-w-0 truncate font-mono text-body-sm text-muted-foreground">
              {formatted.split('\n')[0]}
            </div>
          )}
          <CollapsibleContent>
            <SimpleCodeBlock
              allowCopy={false}
              className="mt-1 mb-0"
              code={formatted}
              language="json"
              maxHeight="sm"
              size="sm"
              width="full"
            />
          </CollapsibleContent>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            icon={<Clipboard />}
            onClick={() => copyToClipboard(value, `Copied ${storageKey}`)}
            size="xs"
            variant="ghost"
          >
            Copy
          </Button>
          {isMultiline && !expanded ? (
            <Button icon={<Eye />} onClick={() => setExpanded(true)} size="xs" variant="ghost" />
          ) : null}
        </div>
      </div>
    </Collapsible>
  );
}

function StorageSection({
  title,
  storage,
  onClear,
  confirming,
  onConfirmClear,
  filter,
}: {
  title: string;
  storage: Storage;
  onClear: () => void;
  confirming: boolean;
  onConfirmClear: () => void;
  filter: string;
}) {
  // Computed on every render (no memo): the Storage object is a stable reference,
  // so memoizing on it would keep serving deleted entries after a Clear.
  const q = filter.trim().toLowerCase();
  const entries = readStorageEntries(storage)
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((e) => !q || e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-body-sm font-medium">{title}</div>
          <Badge className="shrink-0" size="sm" tone="default" variant="outline">
            {storage.length} keys
          </Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            icon={<Clipboard />}
            onClick={() => copyToClipboard(JSON.stringify(dumpStorage(storage), null, 2), `Copied ${title} JSON`)}
            size="xs"
            variant="ghost"
          >
            Copy all
          </Button>
          {confirming ? (
            <Button icon={<Check />} onClick={onClear} size="xs" variant="destructive">
              Confirm
            </Button>
          ) : (
            <Button icon={<Trash2 />} onClick={onConfirmClear} size="xs" variant="destructive-ghost">
              Clear
            </Button>
          )}
        </div>
      </div>
      {entries.length === 0 ? (
        <EmptyState>{storage.length === 0 ? 'Empty' : `No matches for “${filter}”`}</EmptyState>
      ) : (
        <div className="max-h-80 overflow-auto">
          {entries.map((entry) => (
            <StorageEntryRow key={entry.key} storageKey={entry.key} value={entry.value} />
          ))}
        </div>
      )}
    </div>
  );
}

function StoragePanel() {
  const [confirmingClear, setConfirmingClear] = useState<null | 'local' | 'session'>(null);
  const [filter, setFilter] = useState('');
  const forceUpdate = useForceUpdate();

  const clearStorage = (kind: 'local' | 'session') => {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const before = storage.length;
    storage.clear();
    toast.success(`Cleared ${before} ${kind}Storage entries — reload to apply state`);
    setConfirmingClear(null);
    forceUpdate();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Input onChange={(e) => setFilter(e.target.value)} placeholder="Filter by key or value…" value={filter} />
      <StorageSection
        confirming={confirmingClear === 'local'}
        filter={filter}
        onClear={() => clearStorage('local')}
        onConfirmClear={() => setConfirmingClear('local')}
        storage={window.localStorage}
        title="localStorage"
      />
      <StorageSection
        confirming={confirmingClear === 'session'}
        filter={filter}
        onClear={() => clearStorage('session')}
        onConfirmClear={() => setConfirmingClear('session')}
        storage={window.sessionStorage}
        title="sessionStorage"
      />
    </div>
  );
}

function EnvironmentPanel() {
  const router = useRouterState();
  const info = {
    nodeEnv: process.env.NODE_ENV ?? '(unset)',
    isDev: IsDev,
    gitSha: env.REACT_APP_CONSOLE_GIT_SHA || '(unset)',
    gitRef: env.REACT_APP_CONSOLE_GIT_REF || '(unset)',
    platformVersion: env.REACT_APP_CONSOLE_PLATFORM_VERSION || '(unset)',
    buildTimestamp: env.REACT_APP_BUILD_TIMESTAMP || '(unset)',
    enabledFeatures: env.REACT_APP_ENABLED_FEATURES || '(unset)',
    currentRoute: router.location.pathname,
    currentSearch: router.location.searchStr,
    userAgent: navigator.userAgent,
  };
  return (
    <div className="flex flex-col gap-2.5">
      <Table size="sm">
        <TableBody>
          {Object.entries(info).map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="align-top" weight="medium">
                {k}
              </TableCell>
              <TableCell className="break-all whitespace-normal">
                <InlineCode>{String(v)}</InlineCode>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        className="self-start"
        icon={<Clipboard />}
        onClick={() => copyToClipboard(JSON.stringify(info, null, 2), 'Copied environment snapshot')}
        size="xs"
        variant="primary"
      >
        Copy environment snapshot
      </Button>
    </div>
  );
}

// Control + status in one pill, mirroring the RPCN pipeline run toggle.
function FlagToggle({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-body-sm font-medium transition-colors',
        checked
          ? 'border-success-line bg-success-wash text-success'
          : 'border-border bg-background text-muted-foreground'
      )}
    >
      <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
      <Label className="cursor-pointer" htmlFor={id}>
        {checked ? 'On' : 'Off'}
      </Label>
    </div>
  );
}

function FeatureFlagsPanel({ onMutate }: { onMutate: () => void }) {
  const [filter, setFilter] = useState('');

  const overrides = getFlagOverrides();
  const effective = getEffectiveFlags();
  const allKeys = useMemo(() => getAllFlagKeys(), []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return allKeys;
    }
    return allKeys.filter((k) => k.toLowerCase().includes(q));
  }, [allKeys, filter]);

  const hasAnyOverride = Object.keys(overrides).length > 0;
  const enabledCount = allKeys.filter((key) => effective[key]).length;

  return (
    <div className="flex flex-col gap-2.5">
      <Input onChange={(e) => setFilter(e.target.value)} placeholder="Filter by flag name…" value={filter} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button icon={<RotateCw />} onClick={() => window.location.reload()} size="xs" variant="primary">
          Reload to apply
        </Button>
        <Button
          disabled={!hasAnyOverride}
          icon={<Trash2 />}
          onClick={() => {
            clearFlagOverrides();
            toast.success('Cleared all feature-flag overrides');
            onMutate();
          }}
          size="xs"
          variant="destructive-ghost"
        >
          Clear all overrides ({Object.keys(overrides).length})
        </Button>
        <div className="ml-auto text-body-sm text-muted-foreground">
          {enabledCount} of {allKeys.length} on
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-md border">
          <EmptyState>No flags match “{filter}”.</EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((key) => {
            const isOverridden = key in overrides;
            const defaultValue = FEATURE_FLAGS[key];
            const effectiveValue = effective[key];
            return (
              <Item className="flex-col items-stretch" key={key} size="xs" variant="outline">
                {/* h-5 matches the badge so the row doesn't grow when it appears */}
                <div className="flex h-5 min-w-0 items-center gap-1.5">
                  <ElementTooltip content={key}>
                    <code
                      className={cn(
                        'min-w-0 flex-1 truncate font-mono text-body-sm font-medium',
                        !effectiveValue && 'text-muted-foreground'
                      )}
                    >
                      {key}
                    </code>
                  </ElementTooltip>
                  <AnimatePresence initial={false}>
                    {isOverridden ? (
                      <PopIn className="shrink-0" key="overridden">
                        <Badge size="sm" tone="warning" variant="subtle">
                          overridden
                        </Badge>
                      </PopIn>
                    ) : null}
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-1.5">
                  <FlagToggle
                    checked={effectiveValue}
                    id={`flag-toggle-${key}`}
                    onCheckedChange={(checked) => {
                      setFlagOverride(key, checked);
                      onMutate();
                    }}
                  />
                  <AnimatePresence initial={false}>
                    {isOverridden ? (
                      <PopIn key="reset">
                        <Button
                          onClick={() => {
                            setFlagOverride(key, null);
                            onMutate();
                          }}
                          size="xs"
                          variant="ghost"
                        >
                          Reset
                        </Button>
                      </PopIn>
                    ) : null}
                  </AnimatePresence>
                  <span className="ml-auto shrink-0 text-body-sm text-muted-foreground">
                    default {defaultValue ? 'on' : 'off'}
                  </span>
                </div>
              </Item>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PanelId = 'overview' | 'simulate' | 'visual' | 'flags' | 'storage' | 'env' | 'configs';

const PANEL_META: Record<PanelId, { title: string; description: string }> = {
  overview: {
    title: 'Overview',
    description: 'Live status of every debug subsystem. Select a row to open it.',
  },
  simulate: {
    title: 'Simulate',
    description: 'Trigger app-level side effects to verify toasts, error boundaries, and console output.',
  },
  visual: {
    title: 'Visual debuggers',
    description:
      'CSS-only overlays on the whole document, this dialog included. They persist for this browser tab and re-apply on reload.',
  },
  flags: {
    title: 'Feature flags',
    description:
      'Override config.featureFlags locally. Overrides persist to localStorage; reload after toggling — most components read flags during render.',
  },
  storage: {
    title: 'Storage',
    description: 'Inspect or clear localStorage and sessionStorage. Clearing resets preferences and feature toggles.',
  },
  env: {
    title: 'Environment',
    description: 'Build, route, and runtime snapshot. Copy it into bug reports.',
  },
  configs: {
    title: 'Connect configs',
    description:
      'Pipeline YAMLs for exercising the editor, lint and stop conditions. Paste one into the YAML tab of a create or edit page; Cloud saves it once the secrets it lists exist.',
  },
};

const NAV_GROUPS: { label: string; items: { id: PanelId; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'General',
    items: [
      { id: 'overview', label: 'Overview', icon: <Info className="h-3.5 w-3.5 shrink-0" /> },
      { id: 'simulate', label: 'Simulate', icon: <Zap className="h-3.5 w-3.5 shrink-0" /> },
    ],
  },
  {
    label: 'Toggles',
    items: [
      { id: 'visual', label: 'Visual', icon: <Eye className="h-3.5 w-3.5 shrink-0" /> },
      { id: 'flags', label: 'Feature flags', icon: <Flag className="h-3.5 w-3.5 shrink-0" /> },
    ],
  },
  {
    label: 'Inspect',
    items: [
      { id: 'storage', label: 'Storage', icon: <Database className="h-3.5 w-3.5 shrink-0" /> },
      { id: 'env', label: 'Environment', icon: <Cog className="h-3.5 w-3.5 shrink-0" /> },
    ],
  },
  {
    label: 'Connect',
    items: [{ id: 'configs', label: 'Configs', icon: <FileCode className="h-3.5 w-3.5 shrink-0" /> }],
  },
];

function OverviewPanel({ onNavigate }: { onNavigate: (panel: PanelId) => void }) {
  const overlayCount = getEnabledVisualDebuggers().length;
  const overrideCount = Object.keys(getFlagOverrides()).length;
  const sha = env.REACT_APP_CONSOLE_GIT_SHA ? env.REACT_APP_CONSOLE_GIT_SHA.slice(0, 7) : 'local dev build';

  const rows: { panel: PanelId; icon: React.ReactNode; label: string; value: string; active: boolean }[] = [
    {
      panel: 'visual',
      icon: <Eye className="h-4 w-4" />,
      label: 'Visual debuggers',
      value: overlayCount > 0 ? `${overlayCount} overlay${overlayCount === 1 ? '' : 's'} enabled` : 'None enabled',
      active: overlayCount > 0,
    },
    {
      panel: 'flags',
      icon: <Flag className="h-4 w-4" />,
      label: 'Feature flags',
      value: overrideCount > 0 ? `${overrideCount} overridden` : 'All defaults',
      active: overrideCount > 0,
    },
    {
      panel: 'storage',
      icon: <Database className="h-4 w-4" />,
      label: 'Browser storage',
      value: `${window.localStorage.length} local · ${window.sessionStorage.length} session keys`,
      active: false,
    },
    {
      panel: 'env',
      icon: <Cog className="h-4 w-4" />,
      label: 'Build',
      value: sha,
      active: false,
    },
  ];

  return (
    <ItemGroup className="overflow-hidden">
      {rows.map(({ panel, icon, label, value, active }, index) => (
        <Fragment key={panel}>
          {/* Bare border-b (not the divider token) so it matches the container's border color in both themes */}
          {index > 0 ? <ItemSeparator /> : null}
          <Item
            className="cursor-pointer text-left"
            render={<button onClick={() => onNavigate(panel)} type="button" />}
            size="sm"
          >
            <ItemMedia variant="icon">{icon}</ItemMedia>
            <ItemContent>
              <ItemTitle>{label}</ItemTitle>
              <ItemDescription>{value}</ItemDescription>
            </ItemContent>
            <AnimatePresence initial={false}>
              {active ? (
                <PopIn key="active">
                  <Badge size="sm" tone="warning" variant="subtle">
                    active
                  </Badge>
                </PopIn>
              ) : null}
            </AnimatePresence>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" color="var(--color-muted-foreground)" />
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}

export function DebugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [panel, setPanel] = useState<PanelId>('overview');
  const forceUpdate = useForceUpdate();

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const railCounts: Partial<Record<PanelId, number>> = {
    visual: getEnabledVisualDebuggers().length,
    flags: Object.keys(getFlagOverrides()).length,
  };

  const renderPanel = () => {
    switch (panel) {
      case 'overview':
        return <OverviewPanel onNavigate={setPanel} />;
      case 'simulate':
        return <SimulatePanel onClose={close} />;
      case 'visual':
        return <VisualPanel onMutate={forceUpdate} />;
      case 'flags':
        return <FeatureFlagsPanel onMutate={forceUpdate} />;
      case 'storage':
        return <StoragePanel />;
      case 'env':
        return <EnvironmentPanel />;
      case 'configs':
        return <ConnectConfigsPanel />;
      default:
        return null;
    }
  };

  const { title, description } = PANEL_META[panel];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-5xl" height="xl" size="xl">
        <DialogHeader align="left" spacing="tight">
          <DialogTitle>
            <span className="flex items-center gap-2">
              <DebugPanda className="h-5 w-5" />
              Debug helpers
              <Badge size="sm" tone="default" variant="outline">
                dev only
              </Badge>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 border-t">
          <nav aria-label="Debug sections" className="flex w-44 shrink-0 flex-col border-r bg-muted/30">
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
              {NAV_GROUPS.map(({ label, items }) => (
                <div key={label}>
                  <div className="px-2 pb-1 text-caption font-semibold tracking-wider text-muted-foreground/70 uppercase">
                    {label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(({ id, label: itemLabel, icon }) => {
                      const count = railCounts[id] ?? 0;
                      const active = panel === id;
                      return (
                        <button
                          className={cn(
                            'flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-body-sm transition-colors',
                            active
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                          )}
                          key={id}
                          onClick={() => setPanel(id)}
                          type="button"
                        >
                          {icon}
                          <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
                          <AnimatePresence initial={false}>
                            {count > 0 ? (
                              <PopIn key="count">
                                <CountDot count={count} size="sm" variant="warning" />
                              </PopIn>
                            ) : null}
                          </AnimatePresence>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 border-t px-3 py-2 text-body-sm text-muted-foreground">
              <KbdGroup>
                <Kbd size="xs">⌃/⌘</Kbd>
                <Kbd size="xs">⇧</Kbd>
                <Kbd size="xs">D</Kbd>
              </KbdGroup>
              toggles
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b px-5 pt-4 pb-3">
              <div className="text-body font-semibold">{title}</div>
              <div className="text-body-sm text-muted-foreground">{description}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  initial={{ opacity: 0, y: 4 }}
                  key={panel}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                >
                  {renderPanel()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Floating launcher, portaled to document.body: in embedded mode this component
// mounts inside a hidden host container (the dialog escapes via its own portal).
function DebugLauncher({ onClick }: { onClick: () => void }) {
  const activeCount = getEnabledVisualDebuggers().length + Object.keys(getFlagOverrides()).length;

  return createPortal(
    <ElementTooltip content="Debug helpers — ⌃/⌘⇧D">
      <button
        aria-label="Open debug helpers (Ctrl/Cmd+Shift+D)"
        className="fixed right-[56px] bottom-[64px] z-40 flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-full border bg-linear-to-b from-background to-muted text-muted-foreground opacity-85 shadow-md transition-all hover:text-foreground hover:opacity-100 hover:shadow-lg"
        onClick={onClick}
        type="button"
      >
        <DebugPanda className="h-[22px] w-[22px]" />
        <AnimatePresence initial={false}>
          {activeCount > 0 ? (
            <PopIn className="absolute -top-1 -right-1" key="count">
              <CountDot count={activeCount} size="sm" variant="warning" />
            </PopIn>
          ) : null}
        </AnimatePresence>
      </button>
    </ElementTooltip>,
    document.body
  );
}

export function DebugHelperRoot() {
  const [open, setOpen] = useState(false);

  useHotKey({
    key: 'd',
    modifiers: ['meta', 'shift'],
    enabled: Boolean(IsDev),
    onTrigger: () => setOpen((v) => !v),
  });

  if (!IsDev) {
    return null;
  }

  return (
    <MotionConfig reducedMotion="user">
      {!open && <DebugLauncher onClick={() => setOpen(true)} />}
      <DebugDialog onOpenChange={setOpen} open={open} />
    </MotionConfig>
  );
}
