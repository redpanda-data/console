import { type AgentAction, type AgentComponent, type AgentStep, createAgent } from '@ui-sdk/react/agent';
import { createHistory, stageChanges, type StagedChange } from '@ui-sdk/react/history';
import { elementOf, observe, type ObservedChange } from '@ui-sdk/core/observe';

export class ConsoleAgentError extends Error {}

type Approval = {
  action: string;
  component: string;
  label: string;
  confirmation?: string;
  requested?: string;
  route: string;
};
type Activity = { sequence: number } & Pick<ObservedChange, 'ref' | 'component' | 'key' | 'source' | 'reason'> & {
    label: string;
    secret: boolean;
  };
type History = ReturnType<typeof createHistory>;
type Staged = Awaited<ReturnType<typeof stageChanges>>;
type HistoryCommand = 'undo-agent' | 'seek' | 'revert' | 'accept' | 'clear';
type SessionState = {
  activity: readonly Activity[];
  entries: readonly Omit<ReturnType<History['entries']>[number], 'value' | 'previous'>[];
  position: number;
  staged: number;
  busy: boolean;
  nativeBusy: boolean;
  error: string | null;
};
const valueKeys = new Set(['value', 'checked', 'pressed']);
const sensitiveAutocomplete = /(?:cc-|one-time-code)/;
function describeArguments(step: AgentAction, before: AgentComponent | undefined, target: HTMLElement | null) {
  if (!step.args.length) return undefined;
  if (
    target?.closest('[data-agent-secret]') ||
    target?.getAttribute('type') === 'password' ||
    before?.value === '[redacted]' ||
    sensitiveAutocomplete.test(target?.getAttribute('autocomplete') ?? '')
  )
    return '[redacted]';
  const [first, ...rest] = step.args;
  const label = before?.items?.find((item) => item.value === first)?.label;
  try {
    return JSON.stringify([label ?? first, ...rest]).slice(0, 240);
  } catch {
    return 'Arguments could not be summarized.';
  }
}
const navigationActions = new Set(['focus', 'open', 'close', 'setOpen']);

export function createConsoleAgentSession({
  root,
  approve,
}: {
  root: () => HTMLElement | null;
  approve: (request: Approval, signal: AbortSignal) => Promise<boolean>;
}) {
  let sequence = 0;
  let active = false;
  let toolsEnabled = true;
  let callSignal: AbortSignal | undefined;
  let nativeLease: symbol | undefined;
  let operationInFlight = false;
  let history: History | undefined;
  let staged: Staged | undefined;
  let draft: Element | null = null;
  let state: SessionState = {
    activity: [],
    entries: [],
    position: 0,
    staged: 0,
    busy: false,
    nativeBusy: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  const revisions = new Map<string, number>();
  let stagedRevisions = new Map<string, number>();
  let revertingExpected: Map<string, number> | undefined;
  let lifetime = new AbortController();
  const emptyScope = () => root()?.ownerDocument.createElement('div') ?? null;
  let absent: Element | null = null;
  const findDraft = () =>
    [...(root()?.querySelectorAll('[data-agent-history="draft"]') ?? [])].find(
      (node) => node.closest('[data-console-agent-root]') === root()
    ) ?? null;
  const draftScope = () => findDraft() ?? absent;
  const element = (ref: string) => {
    const found = elementOf(ref);
    return found && root()?.contains(found) && found.closest('[data-console-agent-root]') === root() ? found : null;
  };
  const visible = (component: AgentComponent) => !component.offPage && !!element(component.ref);
  const publish = (patch: Partial<SessionState> = {}) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const syncHistory = () => {
    if ((history?.entries().length ?? 0) > 100) {
      history?.clear();
      staged = undefined;
      stagedRevisions.clear();
    }
    publish({
      entries: (history?.entries() ?? []).map(({ value: _value, previous: _previous, ...entry }) => entry),
      position: history?.position() ?? 0,
      staged: staged?.applied.length ?? 0,
    });
  };
  const refreshDraft = () => {
    const next = findDraft();
    if (next === draft) return;
    draft = next;
    staged = undefined;
    stagedRevisions.clear();
    history?.clear();
    syncHistory();
  };
  const agent = createAgent({
    allow: async (step, { signal }) => {
      if (!active || !toolsEnabled || callSignal?.aborted || !element(step.ref)) return false;
      if (!step.confirm && navigationActions.has(step.action)) return true;
      if (revertingExpected?.has(step.ref) && revertingExpected.get(step.ref) !== revisions.get(step.ref)) return false;
      const revision = revisions.get(step.ref);
      const target = element(step.ref);
      const route = root()?.ownerDocument.location.pathname;
      const before = agent.snapshot().find((item) => item.ref === step.ref);
      const signature = (entry: AgentComponent | undefined) =>
        JSON.stringify([entry?.label, entry?.value, entry?.checked]);
      const approvalSignal = AbortSignal.any([signal, lifetime.signal, ...(callSignal ? [callSignal] : [])]);
      const accepted = await approve(
        {
          action: step.action,
          component: step.component,
          label: (step.label ?? step.component).slice(0, 160),
          confirmation: step.confirm?.slice(0, 240),
          requested: describeArguments(step, before, target),
          route: root()?.ownerDocument.location.pathname ?? '/',
        },
        approvalSignal
      );
      // Never apply an approval to a control a person changed while the prompt was open.
      return (
        accepted &&
        !approvalSignal.aborted &&
        active &&
        toolsEnabled &&
        element(step.ref) === target &&
        root()?.ownerDocument.location.pathname === route &&
        revisions.get(step.ref) === revision &&
        signature(agent.snapshot().find((item) => item.ref === step.ref)) === signature(before)
      );
    },
  });
  const snapshot = () => agent.snapshot().filter(visible);
  const scopedValues = () =>
    Object.fromEntries(
      snapshot()
        .filter((entry) => 'value' in entry || 'checked' in entry)
        .map((entry) => [
          `${entry.ref} ${entry.label ?? entry.component}`,
          'value' in entry ? entry.value : entry.checked,
        ])
    );
  const record = (change: ObservedChange) => {
    if (!element(change.ref)) return;
    revisions.set(change.ref, (revisions.get(change.ref) ?? 0) + 1);
    if (change.source === 'agent' && revertingExpected?.has(change.ref))
      revertingExpected.set(change.ref, revisions.get(change.ref)!);
    refreshDraft();
    if (element(change.ref)?.closest('[data-agent-hidden]')) return;
    const { ref, component, key, source, reason } = change;
    publish({
      activity: [
        ...state.activity.slice(-99),
        {
          ref,
          component,
          key,
          source,
          reason,
          sequence: ++sequence,
          label: (change.label ?? component).slice(0, 160),
          secret: change.value === '[redacted]' || change.previous === '[redacted]',
        },
      ],
    });
  };
  const inDraft = (ref: string) => {
    const target = element(ref);
    return !!target && !!draft && draft.contains(target);
  };
  const run = async <Result>(work: (current: () => boolean) => Promise<Result>) => {
    if (!active) throw new ConsoleAgentError('Agent session is unavailable.');
    if (operationInFlight) throw new ConsoleAgentError('Another agent operation is in progress.');
    const generation = lifetime;
    const signal = callSignal ?? generation.signal;
    const current = () => active && lifetime === generation && !signal.aborted;
    operationInFlight = true;
    if (!nativeLease) callSignal = signal;
    publish({ busy: true, error: null });
    try {
      const result = await work(current);
      if (!current()) throw new ConsoleAgentError('Operation cancelled. Check current state before retrying.');
      return result;
    } catch (error) {
      if (current())
        publish({
          error: error instanceof ConsoleAgentError ? error.message : 'Operation failed. Check current values.',
        });
      throw error;
    } finally {
      operationInFlight = false;
      if (!nativeLease) callSignal = undefined;
      publish({ busy: false });
    }
  };
  const restore = async (command: HistoryCommand, position?: number, fromAgent = false) =>
    run(async (current) => {
      refreshDraft();
      if (!history || !draft) throw new ConsoleAgentError('This page has no reversible local draft.');
      if (command === 'accept' || command === 'clear') {
        const currentDraft = draft;
        if (
          fromAgent &&
          !(await approve(
            {
              action: command,
              component: 'local-draft-history',
              label: 'Keep values and forget draft restoration data',
              route: root()?.ownerDocument.location.pathname ?? '/',
            },
            AbortSignal.any([lifetime.signal, ...(callSignal ? [callSignal] : [])])
          ))
        )
          return { ok: false };
        if (!current() || draftScope() !== currentDraft) return { ok: false };
        staged = undefined;
        stagedRevisions.clear();
        if (command === 'clear') history.clear();
        syncHistory();
        return { ok: true };
      }
      let failed: readonly unknown[];
      if (command === 'revert') {
        if (!staged) throw new ConsoleAgentError('There is no staged suggestion.');
        if (
          staged.applied.some(
            (entry) => !inDraft(entry.ref) || revisions.get(entry.ref) !== stagedRevisions.get(entry.ref)
          )
        ) {
          throw new ConsoleAgentError(
            'The draft changed after staging. Your newer edits were kept; keep or clear this suggestion.'
          );
        }
        revertingExpected = new Map(stagedRevisions);
        try {
          failed = await staged.revert();
        } finally {
          revertingExpected = undefined;
        }
      } else if (command === 'undo-agent') {
        failed = await history.undoSource('agent');
      } else {
        if (
          typeof position !== 'number' ||
          !Number.isInteger(position) ||
          position < 0 ||
          position > history.entries().length
        ) {
          throw new ConsoleAgentError('Choose an existing history position.');
        }
        failed = await history.seek(position);
      }
      if (!current()) throw new ConsoleAgentError('Operation cancelled. Check current state before retrying.');
      if (command === 'revert') {
        staged = undefined;
        stagedRevisions.clear();
      }
      syncHistory();
      if (failed.length)
        publish({
          error: `${failed.length} change(s) could not be restored. Secret, unavailable, refused or newer values were kept.`,
        });
      return { ok: failed.length === 0, skipped: failed.length };
    });
  return {
    getState: () => state,
    acquireNativeCall: (signal: AbortSignal) => {
      if (!active || !toolsEnabled || signal.aborted) throw new ConsoleAgentError('Agent session is unavailable.');
      if (nativeLease || operationInFlight) throw new ConsoleAgentError('Another agent operation is in progress.');
      // Ownership survives pause/re-enable until the original asynchronous call settles.
      const lease = Symbol();
      nativeLease = lease;
      callSignal = AbortSignal.any([signal, lifetime.signal]);
      publish({ nativeBusy: true });
      return () => {
        if (nativeLease !== lease) return;
        nativeLease = undefined;
        callSignal = undefined;
        publish({ nativeBusy: false });
      };
    },
    setToolsEnabled: (enabled: boolean) => {
      toolsEnabled = enabled;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      active = true;
      lifetime = new AbortController();
      absent = emptyScope();
      draft = findDraft();
      const stop = observe(record, { within: root });
      // Keep the SDK's original act method: history installs restoration/concurrency guards on it.
      history = createHistory(agent, { within: draftScope });
      const unlisten = history.subscribe(syncHistory);
      const observer = new MutationObserver(refreshDraft);
      const container = root();
      if (container) observer.observe(container, { childList: true, subtree: true });
      syncHistory();
      return () => {
        active = false;
        lifetime.abort();
        observer.disconnect();
        stop();
        unlisten();
        history?.destroy();
        history = undefined;
        staged = undefined;
        revisions.clear();
        stagedRevisions.clear();
        state = {
          activity: [],
          entries: [],
          position: 0,
          staged: 0,
          busy: operationInFlight,
          nativeBusy: !!nativeLease,
          error: null,
        };
      };
    },
    snapshot,
    async query(input: { text?: string; within?: string; kind?: string }) {
      if (input.within && !snapshot().some((entry) => entry.ref === input.within || entry.label === input.within)) {
        return { error: 'Choose a current Console component ref from console_snapshot.' };
      }
      const match = input.within
        ? snapshot().filter((entry) => entry.ref === input.within || entry.label === input.within)
        : [];
      if (input.within && match.length !== 1) return { error: 'Use an unambiguous Console component ref.' };
      const result = await agent.query({ ...input, within: match[0]?.ref });
      return Array.isArray(result)
        ? result.filter(visible)
        : { error: 'Console control unavailable. Refresh the Console snapshot.' };
    },
    act: (input: { steps: AgentStep[] }) =>
      run(async (current) => {
        if (!Array.isArray(input.steps) || input.steps.length > 20)
          throw new ConsoleAgentError('Use at most 20 steps.');
        const result = await agent.act(input);
        if (!current()) throw new ConsoleAgentError('Operation cancelled. Check current state before retrying.');
        // SDK act summarizes the whole document; return only this Console boundary's current state.
        return {
          ok: result.ok,
          steps: result.steps.filter((step) => !!element(step.ref)).map(({ step, ref }) => ({ step, ref })),
          values: scopedValues(),
          appeared: result.appeared.filter(visible),
          error: result.error
            ? {
                step: result.error.step,
                message: 'Action was refused or unavailable. Check Console state before retrying.',
              }
            : undefined,
        };
      }),
    stage: (changes: StagedChange[]) =>
      run(async (current) => {
        refreshDraft();
        if (!draft) throw new ConsoleAgentError('This page has no reversible local draft.');
        if (staged) throw new ConsoleAgentError('Keep or discard the current suggestion first.');
        if (!Array.isArray(changes) || !changes.length || changes.length > 20)
          throw new ConsoleAgentError('Stage 1 to 20 changes.');
        const components = snapshot();
        const refs = new Set<string>();
        for (const change of changes) {
          const entry = components.find((item) => item.ref === change.ref);
          const key = change.key ?? 'value';
          const target = element(change.ref);
          if (
            !entry ||
            !inDraft(change.ref) ||
            !valueKeys.has(key) ||
            !entry.actions.includes(`set${key[0].toUpperCase()}${key.slice(1)}`) ||
            target?.closest('[data-agent-secret]') ||
            entry[key] === '[redacted]' ||
            refs.has(`${change.ref}:${key}`)
          ) {
            throw new ConsoleAgentError(
              'Stage unique, non-secret, editable fields in the current local draft using component refs.'
            );
          }
          refs.add(`${change.ref}:${key}`);
        }
        const currentDraft = draft;
        const previews: Staged[] = [];
        for (const change of changes) {
          const preview = await stageChanges(agent, [change]);
          if (!current() || draftScope() !== currentDraft)
            throw new ConsoleAgentError('The draft changed during staging. Inspect the current page before retrying.');
          const accepted = preview.applied.every((entry) => {
            const actual = JSON.stringify(snapshot().find((item) => item.ref === entry.ref)?.[entry.key]);
            return actual === JSON.stringify(entry.value) || actual !== JSON.stringify(entry.before);
          });
          if (preview.applied.length && accepted) previews.push(preview);
        }
        staged = previews.length
          ? {
              applied: previews.flatMap((preview) => [...preview.applied]),
              revert: async () => {
                const skipped = [];
                for (const preview of previews.toReversed()) skipped.push(...(await preview.revert()));
                return skipped;
              },
            }
          : undefined;
        stagedRevisions = new Map((staged?.applied ?? []).map((entry) => [entry.ref, revisions.get(entry.ref) ?? 0]));
        syncHistory();
        return { applied: staged?.applied.length ?? 0, requested: changes.length, values: scopedValues() };
      }),
    restore,
    clearActivity: () => publish({ activity: [], error: null }),
  };
}
export type ConsoleAgentSession = ReturnType<typeof createConsoleAgentSession>;
export type { Approval, HistoryCommand };
