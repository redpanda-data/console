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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import {
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCopy,
  Cog,
  Eye,
  Flag,
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

function copyToClipboard(text: string, successMsg = 'Copied to clipboard') {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(successMsg))
    .catch(() => toast.error('Failed to copy to clipboard'));
}

function ConfigFixtureRow({ fixture }: { fixture: ConnectConfigFixture }) {
  const [previewing, setPreviewing] = useState(false);
  const lineCount = useMemo(() => fixture.yaml.split('\n').length, [fixture.yaml]);

  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Text className="font-medium" variant="bodyStrongSmall">
              {fixture.name}
            </Text>
            {fixture.tags.map((tag) => (
              <Badge key={tag} size="sm" variant={TAG_VARIANT[tag]}>
                {tag}
              </Badge>
            ))}
            <Badge size="sm" variant="simple-outline">
              {lineCount} lines
            </Badge>
          </div>
          <Text className="text-muted-foreground" variant="bodySmall">
            {fixture.description}
          </Text>
        </div>
        <div className="flex shrink-0 gap-1.5">
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
        </div>
      </div>
      {previewing && (
        <pre className="mt-2.5 max-h-64 overflow-auto rounded border bg-muted p-2.5 font-mono text-xs">{fixture.yaml}</pre>
      )}
    </div>
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
        <Text className="py-6 text-center text-muted-foreground" variant="bodySmall">
          No fixtures match “{filter}”.
        </Text>
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

function SimulateTab({ onClose }: { onClose: () => void }) {
  const [renderThrow, setRenderThrow] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Text className="text-muted-foreground" variant="bodySmall">
        Trigger app-level side effects to verify toasts, error boundaries, and console output.
      </Text>

      <section className="flex flex-col gap-2">
        <Text className="font-medium" variant="bodyStrongSmall">
          Toasts
        </Text>
        <Text className="text-muted-foreground" variant="bodySmall">
          Fire each toast variant to verify rendering, stacking, and rich colors.
        </Text>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => toast.success('Looking good — operation succeeded.')} size="sm" variant="primary">
            Success
          </Button>
          <Button onClick={() => toast.info('Heads up — informational toast.')} size="sm" variant="secondary">
            Info
          </Button>
          <Button onClick={() => toast.warning('Be careful — this might be slow.')} size="sm" variant="secondary">
            Warning
          </Button>
          <Button onClick={() => toast.error('Something broke. Check the console.')} size="sm" variant="destructive">
            Error
          </Button>
          <Button
            onClick={() =>
              toast.message('Action required', {
                description: 'A toast with a description and an action button.',
                action: { label: 'Undo', onClick: () => toast('Undone') },
              })
            }
            size="sm"
            variant="secondary"
          >
            With action
          </Button>
          <Button
            onClick={() => {
              const id = toast.loading('Processing… (5s)');
              setTimeout(() => toast.success('Done', { id }), 5000);
            }}
            size="sm"
            variant="secondary"
          >
            Loading → success
          </Button>
          <Button
            onClick={() => {
              for (let i = 0; i < 6; i++) {
                toast(`Stacked toast #${i + 1}`);
              }
            }}
            size="sm"
            variant="secondary-ghost"
          >
            Stack 6
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Text className="font-medium" variant="bodyStrongSmall">
          Errors & console
        </Text>
        <Text className="text-muted-foreground" variant="bodySmall">
          Force errors to verify ErrorBoundary, error toasts, and unhandled-rejection paths.
        </Text>
        <div className="flex flex-wrap gap-1.5">
          <Button
            onClick={() => {
              onClose();
              // Defer so the dialog can finish unmounting before the boundary trips.
              setTimeout(() => setRenderThrow(true), 50);
            }}
            size="sm"
            variant="destructive"
          >
            Throw in render (ErrorBoundary)
          </Button>
          <Button
            onClick={() => {
              // biome-ignore lint/suspicious/noConsole: intentional debug helper
              console.error('DebugDialog: synthetic console.error');
              throw new Error('DebugDialog: uncaught synthetic error from event handler');
            }}
            size="sm"
            variant="destructive"
          >
            Throw in event handler
          </Button>
          <Button
            onClick={() => {
              void Promise.reject(new Error('DebugDialog: synthetic unhandled rejection'));
            }}
            size="sm"
            variant="destructive"
          >
            Unhandled promise rejection
          </Button>
          <Button
            onClick={() => {
              // biome-ignore lint/suspicious/noConsole: intentional debug helper
              console.warn('DebugDialog: synthetic console.warn');
              // biome-ignore lint/suspicious/noConsole: intentional debug helper
              console.error('DebugDialog: synthetic console.error');
              // biome-ignore lint/suspicious/noConsole: intentional debug helper
              console.info('DebugDialog: synthetic console.info');
              toast.success('Wrote 3 messages to the console');
            }}
            size="sm"
            variant="secondary"
          >
            Console noise
          </Button>
        </div>
      </section>

      {renderThrow && <ErrorThrower />}
    </div>
  );
}

function dumpStorage(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k != null) {
      out[k] = storage.getItem(k) ?? '';
    }
  }
  return out;
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
    <div className="border-b last:border-0">
      <div className="flex items-start gap-2 px-3 py-1.5">
        <button
          aria-label={expanded ? 'Collapse value' : 'Expand value'}
          className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate font-medium font-mono text-xs" title={storageKey}>
              {storageKey}
            </code>
            <Badge className="shrink-0" size="sm" variant="simple-outline">
              {sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`}
            </Badge>
          </div>
          {!expanded && (
            <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              {formatted.split('\n')[0]}
            </div>
          )}
          {expanded && (
            <pre className="mt-1 max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-2 font-mono text-xs">
              {formatted}
            </pre>
          )}
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
    </div>
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
    const out: { key: string; value: string }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k != null) {
        out.push({ key: k, value: storage.getItem(k) ?? '' });
      }
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    const q = filter.trim().toLowerCase();
    if (!q) {
      return out;
    }
    return out.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
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
        <Text className="px-3 py-3 text-center text-muted-foreground" variant="bodySmall">
          {storage.length === 0 ? 'Empty' : `No matches for “${filter}”`}
        </Text>
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
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  const clearStorage = (kind: 'local' | 'session') => {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const before = storage.length;
    storage.clear();
    toast.success(`Cleared ${before} ${kind}Storage entries — reload to apply state`);
    setConfirmingClear(null);
    bump();
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
      <div className="overflow-hidden rounded-md border bg-muted/40">
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(info).map(([k, v]) => (
              <tr className="border-b last:border-0" key={k}>
                <td className="px-3 py-1.5 align-top font-medium">{k}</td>
                <td className="break-all px-3 py-1.5 font-mono text-[11px]">
                  <InlineCode>{String(v)}</InlineCode>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

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
            bump();
          }}
          size="xs"
          variant="destructive-ghost"
        >
          Clear all overrides ({Object.keys(overrides).length})
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        {filtered.length === 0 ? (
          <Text className="px-3 py-3 text-center text-muted-foreground" variant="bodySmall">
            No flags match “{filter}”.
          </Text>
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
                    bump();
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
                  <Text className="text-[11px] text-muted-foreground">
                    default: <InlineCode>{String(defaultValue)}</InlineCode> · effective:{' '}
                    <InlineCode>{String(effectiveValue)}</InlineCode>
                  </Text>
                </div>
                {isOverridden && (
                  <Button
                    onClick={() => {
                      setFlagOverride(key, null);
                      bump();
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

type Tab = 'configs' | 'simulate' | 'storage' | 'env' | 'flags';

export function DebugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('configs');

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent height="xl" size="xl">
        <DialogHeader align="left" spacing="tight">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug helpers
          </DialogTitle>
          <DialogDescription>
            Connect-app debugging tools — configs, simulators, storage, flags.
          </DialogDescription>
        </DialogHeader>

        <DialogBody padding="none" scrollShadow={false}>
          <Tabs onValueChange={(v) => setTab(v as Tab)} value={tab}>
            <div className="sticky top-0 z-10 bg-background">
              <TabsList variant="underline">
                <TabsTrigger value="configs" variant="underline">
                  <Wrench className="mr-1 h-3 w-3" /> Configs
                </TabsTrigger>
                <TabsTrigger value="simulate" variant="underline">
                  <Zap className="mr-1 h-3 w-3" /> Simulate
                </TabsTrigger>
                <TabsTrigger value="storage" variant="underline">
                  <Trash2 className="mr-1 h-3 w-3" /> Storage
                </TabsTrigger>
                <TabsTrigger value="flags" variant="underline">
                  <Flag className="mr-1 h-3 w-3" /> Flags
                </TabsTrigger>
                <TabsTrigger value="env" variant="underline">
                  <Cog className="mr-1 h-3 w-3" /> Env
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="px-4 py-4">
              <TabsContent value="configs">
                <ConnectConfigsTab />
              </TabsContent>
              <TabsContent value="simulate">
                <SimulateTab onClose={close} />
              </TabsContent>
              <TabsContent value="storage">
                <StorageTab />
              </TabsContent>
              <TabsContent value="flags">
                <FeatureFlagsTab />
              </TabsContent>
              <TabsContent value="env">
                <EnvironmentTab />
              </TabsContent>
            </div>
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
              <Kbd size="xs">D</Kbd>
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

  if (!IsDev) {
    return null;
  }

  return <DebugDialog onOpenChange={setOpen} open={open} />;
}
