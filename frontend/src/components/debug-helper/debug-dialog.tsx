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
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Empty, EmptyDescription } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from 'components/redpanda-ui/components/item';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Label } from 'components/redpanda-ui/components/label';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableRow } from 'components/redpanda-ui/components/table';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCopy,
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
import { Fragment, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { CONNECT_CONFIG_FIXTURES, type ConnectConfigFixture } from './connect-config-fixtures';
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

const TAG_VARIANT: Record<ConnectConfigFixture['tags'][number], React.ComponentProps<typeof Badge>['variant']> = {
  simple: 'success-inverted',
  medium: 'info-inverted',
  complex: 'warning-inverted',
  'edge-case': 'accent-inverted',
  invalid: 'destructive-inverted',
};

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
    if (key != null) {
      entries.push({ key, value: storage.getItem(key) ?? '' });
    }
  }
  return entries;
}

function useForceUpdate(): () => void {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((n) => n + 1), []);
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Empty className="gap-2 md:p-6">
      <EmptyDescription className="text-body-sm">{children}</EmptyDescription>
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
    <Card className="w-full max-w-full gap-0 overflow-hidden rounded-md p-0" variant="standard">
      <CardHeader className="bg-muted/30 px-3 py-2" spacing="tight">
        <CardTitle>
          <span className="font-medium text-body-sm">{title}</span>
        </CardTitle>
        {description ? (
          <CardDescription>
            <span className="text-body-sm">{description}</span>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="border-t p-3">{children}</CardContent>
    </Card>
  );
}

function ConfigFixtureRow({ fixture }: { fixture: ConnectConfigFixture }) {
  const [previewing, setPreviewing] = useState(false);
  const lineCount = useMemo(() => fixture.yaml.split('\n').length, [fixture.yaml]);

  return (
    <Item className="flex-col items-stretch" size="sm" variant="outline">
      <ItemHeader>
        <ItemContent>
          <ItemTitle className="flex-wrap">
            {fixture.name}
            {fixture.tags.map((tag) => (
              <Badge key={tag} size="sm" variant={TAG_VARIANT[tag]}>
                {tag}
              </Badge>
            ))}
            <Badge size="sm" variant="simple-outline">
              {lineCount} lines
            </Badge>
          </ItemTitle>
          <ItemDescription>{fixture.description}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button icon={<Eye />} onClick={() => setPreviewing((v) => !v)} size="xs" variant="secondary-ghost">
            {previewing ? 'Hide' : 'Preview'}
          </Button>
          <Button
            icon={<ClipboardCopy />}
            onClick={() => copyToClipboard(fixture.yaml, `Copied “${fixture.name}”`)}
            size="xs"
            variant="primary"
          >
            Copy YAML
          </Button>
        </ItemActions>
      </ItemHeader>
      {previewing && (
        <SimpleCodeBlock className="my-0" code={fixture.yaml} language="yaml" maxHeight="sm" size="sm" width="full" />
      )}
    </Item>
  );
}

function ConnectConfigsPanel() {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return CONNECT_CONFIG_FIXTURES;
    }
    return CONNECT_CONFIG_FIXTURES.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q))
    );
  }, [filter]);

  return (
    <div className="flex flex-col gap-2.5">
      <Input
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, tag, or description…"
        value={filter}
      />
      {filtered.length === 0 ? (
        <EmptyState>No fixtures match “{filter}”.</EmptyState>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((fixture) => (
            <ConfigFixtureRow fixture={fixture} key={fixture.id} />
          ))}
        </div>
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

      {renderThrow && <ErrorThrower />}
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
              <div className="font-medium text-body-sm">{label}</div>
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
    <Collapsible className="border-b last:border-0" onOpenChange={setExpanded} open={expanded}>
      <div className="flex items-start gap-2 px-3 py-1.5">
        <CollapsibleTrigger
          aria-label={expanded ? 'Collapse value' : 'Expand value'}
          className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </CollapsibleTrigger>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate font-medium font-mono text-body-sm" title={storageKey}>
              {storageKey}
            </code>
            <Badge className="shrink-0" size="sm" variant="simple-outline">
              {formatBytes(sizeBytes)}
            </Badge>
          </div>
          {!expanded && (
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
            variant="secondary-ghost"
          >
            Copy
          </Button>
          {isMultiline && !expanded && (
            <Button icon={<Eye />} onClick={() => setExpanded(true)} size="xs" variant="secondary-ghost" />
          )}
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
  const entries = useMemo(() => {
    const all = readStorageEntries(storage).sort((a, b) => a.key.localeCompare(b.key));
    const q = filter.trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [storage, filter]);

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate font-medium text-body-sm">{title}</div>
          <Badge className="shrink-0" size="sm" variant="simple-outline">
            {storage.length} keys
          </Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            icon={<Clipboard />}
            onClick={() => copyToClipboard(JSON.stringify(dumpStorage(storage), null, 2), `Copied ${title} JSON`)}
            size="xs"
            variant="secondary-ghost"
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
              <TableCell className="px-3 py-1.5 align-top" weight="medium">
                {k}
              </TableCell>
              <TableCell className="whitespace-normal break-all px-3 py-1.5">
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
        variant="secondary"
      >
        Copy environment snapshot
      </Button>
    </div>
  );
}

// Combined control + status in one element, mirroring the RPCN pipeline run toggle:
// a pill whose chrome, switch, and label all read the on/off state together.
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
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2 font-medium text-body-sm transition-colors',
        checked
          ? 'border-outline-success bg-background-success-subtle text-success'
          : 'border-border bg-background text-muted-foreground'
      )}
    >
      <Switch
        checked={checked}
        className={cn(checked && 'data-[checked]:bg-success')}
        id={id}
        onCheckedChange={onCheckedChange}
      />
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
              <Item
                className={cn(
                  'flex-col items-stretch gap-2 transition-colors',
                  effectiveValue ? 'border-outline-success bg-background-success-subtle/50' : 'bg-muted/40'
                )}
                key={key}
                size="xs"
                variant="outline"
              >
                {/* Fixed h-5 so the row height doesn't jump when the badge (h-5) appears. */}
                <div className="flex h-5 min-w-0 items-center gap-1.5">
                  <code
                    className={cn(
                      'min-w-0 flex-1 truncate font-medium font-mono text-body-sm',
                      !effectiveValue && 'text-muted-foreground'
                    )}
                    title={key}
                  >
                    {key}
                  </code>
                  {isOverridden && (
                    <Badge className="shrink-0" size="sm" variant="warning-inverted">
                      overridden
                    </Badge>
                  )}
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
                  {isOverridden && (
                    <Button
                      onClick={() => {
                        setFlagOverride(key, null);
                        onMutate();
                      }}
                      size="xs"
                      variant="secondary-ghost"
                    >
                      Reset
                    </Button>
                  )}
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
      'Pre-built pipeline YAMLs for stress-testing the editor and validation. Copy one, then paste it into the editor on the create or edit page.',
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
    <ItemGroup className="overflow-hidden rounded-md border">
      {rows.map(({ panel, icon, label, value, active }, index) => (
        <Fragment key={panel}>
          {/* Rendered as a bare bottom border (not the divider token) so it picks up the same
              default border-color as the surrounding `border` container in both themes. */}
          {index > 0 ? <ItemSeparator className="border-b bg-transparent" /> : null}
          <Item
            className="cursor-pointer rounded-none border-0 text-left hover:bg-muted/50"
            render={<button onClick={() => onNavigate(panel)} type="button" />}
            size="sm"
          >
            <ItemMedia variant="icon">{icon}</ItemMedia>
            <ItemContent className="gap-0.5">
              <ItemTitle>{label}</ItemTitle>
              <ItemDescription>{value}</ItemDescription>
            </ItemContent>
            {active ? (
              <Badge size="sm" variant="warning-inverted">
                active
              </Badge>
            ) : null}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

  // Live counts surface in the nav rail so active subsystems are visible from anywhere.
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

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-5xl" height="xl" size="xl">
        <DialogHeader align="left" spacing="tight">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug helpers
            <Badge size="sm" variant="simple-outline">
              dev only
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 border-t">
          <nav aria-label="Debug sections" className="flex w-44 shrink-0 flex-col border-r bg-muted/30">
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
              {NAV_GROUPS.map(({ label, items }) => (
                <div key={label}>
                  <div className="px-2 pb-1 font-semibold text-caption text-muted-foreground/70 uppercase tracking-wider">
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
                          <CountDot count={count} size="sm" variant="warning" />
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
              <div className="font-semibold text-body">{PANEL_META[panel].title}</div>
              <div className="text-body-sm text-muted-foreground">{PANEL_META[panel].description}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{renderPanel()}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small floating launcher (TanStack-devtools style) so the dialog stays reachable
// without remembering the hotkey. Sits above the TanStack corner buttons and shows
// an amber count when any visual debugger or flag override is active. Portaled to
// document.body — in embedded mode the DebugHelper mount lives in a hidden host
// container, which the dialog already escapes via its own portal.
function DebugLauncher({ onClick }: { onClick: () => void }) {
  const activeCount = getEnabledVisualDebuggers().length + Object.keys(getFlagOverrides()).length;

  return createPortal(
    <button
      aria-label="Open debug helpers (Ctrl/Cmd+Shift+D)"
      className="fixed right-[52px] bottom-[68px] z-40 flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground opacity-70 shadow-md transition-all hover:text-foreground hover:opacity-100 hover:shadow-lg"
      onClick={onClick}
      title="Debug helpers — ⌃/⌘⇧D"
      type="button"
    >
      <Bug className="h-[16px] w-[16px]" />
      {activeCount > 0 && (
        <CountDot className="absolute -top-1 -right-1" count={activeCount} size="sm" variant="warning" />
      )}
    </button>,
    document.body
  );
}

export function DebugHelper() {
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
    <>
      {!open && <DebugLauncher onClick={() => setOpen(true)} />}
      <DebugDialog onOpenChange={setOpen} open={open} />
    </>
  );
}
