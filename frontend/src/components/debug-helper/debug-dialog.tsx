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
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from 'components/redpanda-ui/components/item';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import {
  AppWindow,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCopy,
  Cog,
  Eye,
  FileCode,
  Flag,
  Info,
  RotateCw,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CONNECT_CONFIG_FIXTURES, type ConnectConfigFixture } from './connect-config-fixtures';
import {
  clearOverrides as clearFlagOverrides,
  getAllFlagKeys,
  getEffectiveFlags,
  getOverrides as getFlagOverrides,
  setOverride as setFlagOverride,
} from './feature-flag-overrides';
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
  // biome-ignore lint/suspicious/noConsole: intentional debug helper for the Simulate tab
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
    <Text className="px-3 py-6 text-center text-muted-foreground" variant="bodySmall">
      {children}
    </Text>
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
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="border-b bg-muted/30 px-3 py-2">
        <Text className="font-medium" variant="bodyStrongSmall">
          {title}
        </Text>
        {description ? (
          <Text className="text-muted-foreground" variant="bodySmall">
            {description}
          </Text>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </div>
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

function ConnectConfigsTab() {
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
      <Text className="text-muted-foreground" variant="bodySmall">
        Pre-built Connect pipeline YAMLs for stress-testing the editor and validation. Click <strong>Copy YAML</strong>,
        then paste into the editor on the create or edit page.
      </Text>
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

function SimulateTab({ onClose }: { onClose: () => void }) {
  const [renderThrow, setRenderThrow] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Text className="text-muted-foreground" variant="bodySmall">
        Trigger app-level side effects to verify toasts, error boundaries, and console output.
      </Text>

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
            <code className="min-w-0 flex-1 truncate font-medium font-mono text-xs" title={storageKey}>
              {storageKey}
            </code>
            <Badge className="shrink-0" size="sm" variant="simple-outline">
              {formatBytes(sizeBytes)}
            </Badge>
          </div>
          {!expanded && (
            <div className="min-w-0 truncate font-mono text-muted-foreground text-xs">{formatted.split('\n')[0]}</div>
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
          <Text className="truncate font-medium" variant="bodyStrongSmall">
            {title}
          </Text>
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

function StorageTab() {
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
      <Text className="text-muted-foreground" variant="bodySmall">
        Inspect or clear browser storage. Clearing will sign you out of preferences and reset feature toggles.
      </Text>
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

function EnvironmentTab() {
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
      <Text className="text-muted-foreground" variant="bodySmall">
        Snapshot of build, route, and runtime env. Useful when filing bugs.
      </Text>
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

function FeatureFlagsTab() {
  const [filter, setFilter] = useState('');
  const forceUpdate = useForceUpdate();

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

  return (
    <div className="flex flex-col gap-2.5">
      <Text className="text-muted-foreground" variant="bodySmall">
        Override <InlineCode>config.featureFlags</InlineCode> locally. Persists to <InlineCode>localStorage</InlineCode>{' '}
        and re-applies on reload. Most components only read flags during render, so a reload is recommended after
        toggling.
      </Text>
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
            forceUpdate();
          }}
          size="xs"
          variant="destructive-ghost"
        >
          Clear all overrides ({Object.keys(overrides).length})
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        {filtered.length === 0 ? (
          <EmptyState>No flags match “{filter}”.</EmptyState>
        ) : (
          filtered.map((key) => {
            const isOverridden = key in overrides;
            const defaultValue = FEATURE_FLAGS[key];
            const effectiveValue = effective[key];
            return (
              <div className="flex items-center gap-2.5 border-b px-3 py-1.5 last:border-0" key={key}>
                <Switch
                  checked={effectiveValue}
                  onCheckedChange={(checked) => {
                    setFlagOverride(key, checked);
                    forceUpdate();
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="font-medium font-mono text-xs">{key}</code>
                    {isOverridden && (
                      <Badge size="sm" variant="warning-inverted">
                        overridden
                      </Badge>
                    )}
                  </div>
                  <Text className="text-muted-foreground text-xs">
                    default: <InlineCode>{String(defaultValue)}</InlineCode> · effective:{' '}
                    <InlineCode>{String(effectiveValue)}</InlineCode>
                  </Text>
                </div>
                {isOverridden && (
                  <Button
                    onClick={() => {
                      setFlagOverride(key, null);
                      forceUpdate();
                    }}
                    size="xs"
                    variant="secondary-ghost"
                  >
                    Reset
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

type SubTab = { value: string; label: string; icon: React.ReactNode; content: React.ReactNode };

// Second-level underline tabs, flush against the top-level bar. The inner content gets its own padding.
function SubTabs({ tabs }: { tabs: SubTab[] }) {
  const [active, setActive] = useState(tabs[0]?.value ?? '');

  if (tabs.length <= 1) {
    return <div className="px-4 py-4">{tabs[0]?.content}</div>;
  }

  return (
    <Tabs className="gap-0" onValueChange={setActive} value={active}>
      <div className="sticky top-10 z-10 bg-muted/40 backdrop-blur-sm">
        <TabsList className="bg-transparent" variant="underline">
          {tabs.map(({ value, label, icon }) => (
            <TabsTrigger key={value} value={value} variant="underline">
              {icon}
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="px-4 py-4">
        {tabs.map(({ value, content }) => (
          <TabsContent key={value} value={value}>
            {content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

function OverviewTab() {
  return (
    <div className="flex flex-col gap-4">
      <Text className="text-muted-foreground" variant="bodySmall">
        A development-only toolbox for exercising Console's UI and inspecting local state. It ships in dev builds only
        and is never bundled into production.
      </Text>

      <DebugSection title="What's inside">
        <ul className="flex flex-col gap-1.5">
          <li className="text-muted-foreground text-sm">
            <strong className="text-foreground">General</strong> — simulate toasts and errors, inspect or clear browser
            storage, and snapshot the build and runtime environment.
          </li>
          <li className="text-muted-foreground text-sm">
            <strong className="text-foreground">Flags</strong> — override feature flags locally; changes persist to
            localStorage and re-apply on reload.
          </li>
          <li className="text-muted-foreground text-sm">
            <strong className="text-foreground">Connect</strong> — copy pre-built pipeline YAMLs to stress-test the
            editor and validation.
          </li>
        </ul>
      </DebugSection>

      <DebugSection title="Tips">
        <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
          Toggle this dialog anytime with
          <KbdGroup>
            <Kbd size="xs">⌃/⌘</Kbd>
            <Kbd size="xs">⇧</Kbd>
            <Kbd size="xs">U</Kbd>
          </KbdGroup>
        </span>
      </DebugSection>
    </div>
  );
}

function GeneralTab({ onClose }: { onClose: () => void }) {
  return (
    <SubTabs
      tabs={[
        { value: 'overview', label: 'Overview', icon: <Info className="mr-1 h-3 w-3" />, content: <OverviewTab /> },
        {
          value: 'simulate',
          label: 'Simulate',
          icon: <Zap className="mr-1 h-3 w-3" />,
          content: <SimulateTab onClose={onClose} />,
        },
        { value: 'storage', label: 'Storage', icon: <Trash2 className="mr-1 h-3 w-3" />, content: <StorageTab /> },
        { value: 'env', label: 'Env', icon: <Cog className="mr-1 h-3 w-3" />, content: <EnvironmentTab /> },
      ]}
    />
  );
}

function ConnectTab() {
  return (
    <SubTabs
      tabs={[
        {
          value: 'configs',
          label: 'Configs',
          icon: <FileCode className="mr-1 h-3 w-3" />,
          content: <ConnectConfigsTab />,
        },
      ]}
    />
  );
}

type Tab = 'general' | 'flags' | 'connect';

export function DebugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('general');

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent height="xl" size="xl">
        <DialogHeader align="left" spacing="tight">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug helpers
          </DialogTitle>
        </DialogHeader>

        <DialogBody padding="none" scrollShadow={false}>
          <Tabs className="gap-0" onValueChange={(v) => setTab(v as Tab)} value={tab}>
            <div className="sticky top-0 z-20 bg-background">
              <TabsList variant="underline">
                <TabsTrigger value="general" variant="underline">
                  <Wrench className="mr-1 h-3 w-3" /> General
                </TabsTrigger>
                <TabsTrigger value="flags" variant="underline">
                  <Flag className="mr-1 h-3 w-3" /> Flags
                </TabsTrigger>
                <TabsTrigger value="connect" variant="underline">
                  <AppWindow className="mr-1 h-3 w-3" /> Connect
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="general">
              <GeneralTab onClose={close} />
            </TabsContent>
            <TabsContent value="flags">
              <div className="px-4 py-4">
                <FeatureFlagsTab />
              </div>
            </TabsContent>
            <TabsContent value="connect">
              <ConnectTab />
            </TabsContent>
          </Tabs>
        </DialogBody>

        <DialogFooter direction="row" justify="between">
          <span className="flex items-center gap-2">
            <Text className="text-muted-foreground" variant="small">
              toggle
            </Text>
            <KbdGroup>
              <Kbd size="xs">⌃/⌘</Kbd>
              <Kbd size="xs">⇧</Kbd>
              <Kbd size="xs">U</Kbd>
            </KbdGroup>
          </span>
          <Button onClick={close} size="sm" variant="secondary-ghost">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  console.log('DebugHelper rendered; isDev=%s', IsDev);
  if (!IsDev) {
    console.log('RENDERBUT IS DEV FALSE');
    return null;
  }

  return <DebugDialog onOpenChange={setOpen} open={open} />;
}
