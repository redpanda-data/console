'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './sheet';
import { Switch } from './switch';
import {
  createConsoleAgentSession,
  type Approval,
  type ConsoleAgentSession,
  type HistoryCommand,
} from '../lib/agent-session';
import { registerConsoleTools } from '../lib/agent-webmcp';
import { PortalContainerProvider } from '../lib/use-portal-container';
import { useBooleanFlagValue } from '../../../custom-feature-flag-provider';

type PendingApproval = Approval & { resolve: (accepted: boolean) => void };

function AgentActivity({
  session,
  toolsEnabled,
  setToolsEnabled,
  status,
}: {
  session: ConsoleAgentSession;
  toolsEnabled: boolean;
  setToolsEnabled: (enabled: boolean) => void;
  status: string;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const run = async (command: HistoryCommand, position?: number) => {
    try {
      await session.restore(command, position);
    } catch {
      /* The session exposes a safe error in the activity panel. */
    }
  };
  return (
    <Sheet modal={false}>
      <SheetTrigger
        render={<Button className="fixed right-4 bottom-4 z-40" data-agent-hidden="true" size="sm" variant="outline" />}
      >
        Agent activity
      </SheetTrigger>
      <SheetContent
        showOverlay={false}
        aria-modal="false"
        data-agent-hidden="true"
        className="overflow-y-auto"
        size="lg"
      >
        <SheetHeader>
          <SheetTitle>Agent activity</SheetTitle>
          <SheetDescription>
            In-memory activity only. Draft undo does not reverse saved changes or network requests.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <span>Agent tools</span>
            <Switch checked={toolsEnabled} onCheckedChange={setToolsEnabled} aria-label="Enable agent tools" />
          </div>
          <p className="text-body-sm text-muted-foreground">
            WebMCP: {status}. Tools use the console_ prefix. Latest 100 changes; field values are not logged here.
          </p>
          {state.error ? <p role="alert">{state.error}</p> : null}
          <section aria-label="Local draft history" className="flex flex-col gap-2">
            <h3 className="text-heading-sm">Local draft history</h3>
            <p>
              {state.position} / {state.entries.length} changes applied; {state.staged} staged.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  state.busy ||
                  state.nativeBusy ||
                  !state.entries.some((entry) => entry.source === 'agent' && !entry.reverted)
                }
                onClick={() => run('undo-agent')}
                variant="outline"
              >
                Undo agent edits
              </Button>
              <Button
                disabled={state.busy || state.nativeBusy || state.position === 0}
                onClick={() => run('seek', state.position - 1)}
                variant="outline"
              >
                Step back
              </Button>
              <Button
                disabled={state.busy || state.nativeBusy || state.position >= state.entries.length}
                onClick={() => run('seek', state.position + 1)}
                variant="outline"
              >
                Step forward
              </Button>
              <Button
                disabled={state.busy || state.nativeBusy || !state.staged}
                onClick={() => run('revert')}
                variant="outline"
              >
                Discard suggestion
              </Button>
              <Button
                disabled={state.busy || state.nativeBusy || !state.staged}
                onClick={() => run('accept')}
                variant="outline"
              >
                Keep suggestion
              </Button>
              <Button
                disabled={state.busy || state.nativeBusy || !state.entries.length}
                onClick={() => run('clear')}
                variant="ghost"
              >
                Forget draft history
              </Button>
            </div>
          </section>
          <section aria-label="UI changes" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-heading-sm">UI changes</h3>
              <Button onClick={session.clearActivity} variant="ghost" size="sm">
                Clear activity
              </Button>
            </div>
            <ol className="flex flex-col gap-2">
              {state.activity.toReversed().map((entry) => (
                <li key={entry.sequence} className="rounded-md border p-2 text-body-sm">
                  <span className="font-medium">{entry.source}</span>: {entry.component} · “{entry.label}” · {entry.key}{' '}
                  · {entry.reason}
                  {entry.secret ? ' · value redacted' : ''}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActiveConsoleAgent({ enabled, children }: { enabled: boolean; children?: ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const pending = useRef<PendingApproval | null>(null);
  const closed = useRef<(() => void) | null>(null);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [status, setStatus] = useState('registering');
  const [session] = useState(() =>
    createConsoleAgentSession({
      root: () => root.current,
      approve: (request, signal) =>
        new Promise<boolean>((resolve) => {
          if (signal.aborted || pending.current) {
            resolve(false);
            return;
          }
          let settled = false;
          let decision = false;
          const complete = () => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', abort);
            pending.current = null;
            closed.current = null;
            resolve(decision && !signal.aborted);
          };
          const finish = (accepted: boolean) => {
            if (settled) return;
            decision = accepted;
            closed.current = complete;
            setApproval(null);
          };
          const abort = () => {
            finish(false);
            complete();
          };
          const next = { ...request, resolve: finish };
          pending.current = next;
          setApproval(next);
          signal.addEventListener('abort', abort, { once: true });
        }),
    })
  );
  useEffect(() => {
    if (enabled) return session.start();
  }, [enabled, session]);
  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }
    session.setToolsEnabled(toolsEnabled);
    if (!toolsEnabled) {
      setStatus('paused');
      return;
    }
    const registration = new AbortController();
    setStatus('registering');
    // The registration promise owns errors; cleanup aborts partially registered tools too.
    registerConsoleTools(session, {
      document,
      signal: registration.signal,
      cancelApproval: () => pending.current?.resolve(false),
    })
      .then((next) => {
        if (!registration.signal.aborted) setStatus(next);
      })
      .catch(() => {
        if (!registration.signal.aborted) {
          registration.abort();
          setStatus('unavailable — another owner or browser registration failure');
        }
      });
    return () => {
      registration.abort();
      pending.current?.resolve(false);
      closed.current?.();
    };
  }, [enabled, session, toolsEnabled]);
  const attachRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    setContainer(node);
  }, []);
  return (
    <div className="contents" data-console-agent-root="true" ref={attachRoot}>
      <PortalContainerProvider value={container ?? undefined}>
        {children}
        {enabled ? (
          <>
            <AgentActivity
              session={session}
              toolsEnabled={toolsEnabled}
              setToolsEnabled={setToolsEnabled}
              status={status}
            />
            {/* Wait for modal teardown/focus restoration before an approved action opens another popup. */}
            <Dialog
              onOpenChangeComplete={(open) => {
                if (!open) closed.current?.();
              }}
              open={approval !== null}
              onOpenChange={(open) => {
                if (!open) approval?.resolve(false);
              }}
            >
              <DialogContent data-agent-hidden="true" showCloseButton={false} size="sm">
                <DialogHeader>
                  <DialogTitle>Agent action request</DialogTitle>
                  <DialogDescription>Only approve an action you asked the agent to perform.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <dl className="grid gap-2 wrap-break-word">
                    <div>
                      <dt className="font-semibold">Action</dt>
                      <dd>
                        {approval?.action} · {approval?.component}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Control label (page data)</dt>
                      <dd>
                        “<bdi>{approval?.label}</bdi>”
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Page</dt>
                      <dd>{approval?.route}</dd>
                    </div>
                    {approval?.requested ? (
                      <div>
                        <dt className="font-semibold">Requested arguments (agent data)</dt>
                        <dd>
                          <bdi>{approval.requested}</bdi>
                        </dd>
                      </div>
                    ) : null}
                    {approval?.confirmation ? (
                      <div>
                        <dt className="font-semibold">Application warning</dt>
                        <dd>{approval.confirmation}</dd>
                      </div>
                    ) : null}
                  </dl>
                </DialogBody>
                <DialogFooter>
                  <Button onClick={() => approval?.resolve(false)} variant="outline">
                    Deny
                  </Button>
                  <Button onClick={() => approval?.resolve(true)} variant="primary">
                    Allow once
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </PortalContainerProvider>
    </div>
  );
}
export function ConsoleWebMcp({ enabled = true, children }: { enabled?: boolean; children?: ReactNode }) {
  const allowed = useBooleanFlagValue('enableUiAgentTools', true);
  return <ActiveConsoleAgent enabled={enabled && allowed}>{children}</ActiveConsoleAgent>;
}
