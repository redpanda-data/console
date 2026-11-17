import { afterEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { withSource } from '@ui-sdk/core/observe';
import { createInputController } from '@ui-sdk/react/input';
import { type ReactNode, useState } from 'react';

import { Button } from '../components/redpanda-ui/components/button';
import { InlineInput, Input } from '../components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/redpanda-ui/components/select';
import { type Approval, createConsoleAgentSession } from '../components/redpanda-ui/lib/agent-session';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) {
    dispose();
  }
  cleanup();
});
function Draft({ onSave, cancelAgent = false }: { onSave?: () => void; cancelAgent?: boolean }) {
  const [name, setName] = useState('Original');
  return (
    <form
      data-agent-history="draft"
      onSubmit={(event) => {
        event.preventDefault();
        onSave?.();
      }}
    >
      <Input
        aria-label="Draft name"
        onValueChange={(value, details) => {
          if (cancelAgent && details.source === 'agent') {
            details.cancel();
            return;
          }
          setName(value);
        }}
        value={name}
      />
      <Input aria-label="Private token" defaultValue="private-token-never-log" type="password" />
      <Button type="submit">Save draft</Button>
    </form>
  );
}
function mountSession(
  approve: (request: Approval, signal: AbortSignal) => Promise<boolean> = async () => true,
  props = {},
  fixture?: ReactNode
) {
  const container = document.createElement('section');
  container.setAttribute('data-console-agent-root', 'true');
  document.body.append(container);
  const session = createConsoleAgentSession({ root: () => container, approve });
  const view = render(fixture ?? <Draft {...props} />, { container });
  // The bridge starts before children, the observation subscription after commit, as in React.
  const stop = session.start();
  disposers.push(() => {
    stop();
    container.remove();
  });
  return { ...session, removeDraft: () => view.unmount() };
}
function refFor(session: ReturnType<typeof mountSession>, label = 'Draft name') {
  const entry = session.snapshot().find((item) => item.label === label);
  if (!entry) {
    throw new Error(`Missing ${label}`);
  }
  return entry.ref;
}
async function setAgentValue(session: ReturnType<typeof mountSession>, value: string) {
  let result: Awaited<ReturnType<typeof session.act>> | undefined;
  await act(async () => {
    result = await session.act({ steps: [{ ref: refFor(session), action: 'setValue', args: [value] }] });
  });
  return result;
}
async function restoreAndExpect(
  session: ReturnType<typeof mountSession>,
  command: 'seek' | 'undo-agent',
  position: number | undefined,
  value: string
) {
  await act(async () => {
    expect(await session.restore(command, position)).toEqual({ ok: true, skipped: 0 });
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue(value);
  if (command === 'seek') {
    expect(session.getState().position).toBe(position);
  }
}
test('observes provenance without retaining field values, and reverses only local agent edits', async () => {
  const onSave = rs.fn();
  const session = mountSession(undefined, { onSave });
  await setAgentValue(session, 'Agent suggestion');
  expect(session.getState().activity).toContainEqual(
    expect.objectContaining({ source: 'agent', key: 'value', label: 'Draft name' })
  );
  expect(JSON.stringify(session.getState())).not.toContain('Agent suggestion');
  await restoreAndExpect(session, 'seek', 0, 'Original');
  await restoreAndExpect(session, 'seek', 1, 'Agent suggestion');
  await restoreAndExpect(session, 'undo-agent', undefined, 'Original');
  expect(onSave).not.toHaveBeenCalled();
});
test('undoSource keeps a newer person edit', async () => {
  const session = mountSession();
  await setAgentValue(session, 'Agent suggestion');
  fireEvent.input(screen.getByRole('textbox', { name: 'Draft name' }), { target: { value: 'Human choice' } });
  await act(() => session.restore('undo-agent'));
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Human choice');
});
test('stage applies a draft preview and revert restores it through the same callbacks', async () => {
  const session = mountSession();
  await act(() => session.stage([{ ref: refFor(session), value: 'Preview' }]));
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Preview');
  expect(session.getState().staged).toBe(1);
  await act(() => session.restore('revert'));
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Original');
  expect(session.getState().staged).toBe(0);
});
function mountInterruptiblePreview() {
  const secondApproval = Promise.withResolvers<void>();
  const session = mountSession(
    (request, signal) => {
      if (request.label !== 'Second field') {
        return Promise.resolve(true);
      }
      secondApproval.resolve();
      return new Promise<boolean>((resolve) => {
        signal.addEventListener('abort', () => resolve(false), { once: true });
      });
    },
    {},
    <form data-agent-history="draft">
      <Input aria-label="Draft name" defaultValue="Original" />
      <Input aria-label="Second field" defaultValue="Unchanged" />
    </form>
  );
  return { session, secondApproval };
}

function editFirstPreview(edit: boolean) {
  const name = screen.getByRole('textbox', { name: 'Draft name' });
  expect(name).toHaveValue('First preview');
  if (edit) {
    fireEvent.input(name, { target: { value: 'Newer human edit' } });
  }
}

async function interruptPreview(edit: boolean) {
  const { session, secondApproval } = mountInterruptiblePreview();
  const controller = new AbortController();
  const release = session.acquireNativeCall(controller.signal);
  let staging: Promise<unknown> | undefined;
  try {
    await act(async () => {
      staging = session
        .stage([
          { ref: refFor(session), value: 'First preview' },
          { ref: refFor(session, 'Second field'), value: 'Second preview' },
        ])
        .catch((error: unknown) => error);
      await secondApproval.promise;
    });
    editFirstPreview(edit);
    await act(async () => {
      controller.abort();
      expect(await staging).toBeInstanceOf(Error);
    });
  } finally {
    release();
  }
  return session;
}

test.each([false, true])('keeps an interrupted preview without replacing newer edits (edited: %s)', async (edit) => {
  const session = await interruptPreview(edit);
  expect(screen.getByRole('textbox', { name: 'Second field' })).toHaveValue('Unchanged');
  expect(session.getState().staged).toBe(1);
  await act(async () => {
    if (edit) {
      await expect(session.restore('revert')).rejects.toThrow('newer edits were kept');
    } else {
      await expect(session.restore('revert')).resolves.toEqual({ ok: true, skipped: 0 });
    }
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue(edit ? 'Newer human edit' : 'Original');
});
test('a canceled agent callback creates neither an applied preview nor a history entry', async () => {
  const session = mountSession(undefined, { cancelAgent: true });
  await act(() => session.stage([{ ref: refFor(session), value: 'Rejected' }]));
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Original');
  expect(session.getState().entries).toHaveLength(0);
  expect(session.getState().staged).toBe(0);
});
test('discarding a preview never overwrites a newer person edit', async () => {
  const session = mountSession();
  await act(() => session.stage([{ ref: refFor(session), value: 'Preview' }]));
  fireEvent.input(screen.getByRole('textbox', { name: 'Draft name' }), { target: { value: 'Human choice' } });
  await act(async () => {
    await expect(session.restore('revert')).rejects.toThrow('newer edits were kept');
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Human choice');
});
test('password changes are redacted in observation and cannot be staged', async () => {
  const session = mountSession();
  fireEvent.input(screen.getByLabelText('Private token'), { target: { value: 'replacement-private-token' } });
  expect(JSON.stringify(session.getState())).not.toContain('private-token');
  expect(session.getState().activity).toContainEqual(expect.objectContaining({ secret: true }));
  await expect(session.stage([{ ref: refFor(session, 'Private token'), value: 'Preview' }])).rejects.toThrow(
    'non-secret'
  );
});
test('permission is stale if a person changes the control while approval waits', async () => {
  let allow: ((value: boolean) => void) | undefined;
  const session = mountSession(
    () =>
      new Promise((resolve) => {
        allow = resolve;
      })
  );
  let pending: ReturnType<typeof session.act> | undefined;
  await act(() => {
    pending = session.act({ steps: [{ ref: refFor(session), action: 'setValue', args: ['Stale suggestion'] }] });
    return Promise.resolve();
  });
  fireEvent.input(screen.getByRole('textbox', { name: 'Draft name' }), { target: { value: 'New human value' } });
  await act(async () => {
    allow?.(true);
    await pending;
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('New human value');
});
test('bridge outputs and writes exclude host-owned controls', async () => {
  render(<Input aria-label="Host private field" defaultValue="host-private-value" />);
  const session = mountSession();
  expect(JSON.stringify(session.snapshot())).not.toContain('host-private');
  expect(JSON.stringify(await session.query({ text: 'Host private field' }))).not.toContain('host-private');
  expect(JSON.stringify(await setAgentValue(session, 'Console choice'))).not.toContain('host-private');
  await act(() => session.act({ steps: [{ ref: 'Host private field', action: 'setValue', args: ['Stolen'] }] }));
  expect(screen.getByRole('textbox', { name: 'Host private field' })).toHaveValue('host-private-value');
});
test('removing the local draft forgets its history and preview', async () => {
  const session = mountSession();
  await act(() => session.stage([{ ref: refFor(session), value: 'Preview' }]));
  await act(() => {
    session.removeDraft();
    return Promise.resolve();
  });
  expect(session.getState().entries).toHaveLength(0);
  expect(session.getState().staged).toBe(0);
  await expect(session.restore('undo-agent')).rejects.toThrow('no reversible local draft');
});

function AsyncDraft() {
  const [controller] = useState(createInputController);
  const [name, setName] = useState('Original');
  return (
    <form data-agent-history="draft">
      <InlineInput aria-label="Draft name" controller={controller} onValueChange={setName} value={name} />
      <Button
        onClick={async (_event, { source }) => {
          await Promise.resolve();
          withSource(source, () => controller.setValue('Async suggestion'));
        }}
      >
        Async suggestion
      </Button>
    </form>
  );
}
test('withSource preserves agent provenance after an awaited action, so undo still works', async () => {
  const session = mountSession(undefined, {}, <AsyncDraft />);
  await act(() => session.act({ steps: [{ ref: 'Async suggestion', action: 'press' }] }));
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Async suggestion');
  expect(session.getState().entries).toContainEqual(expect.objectContaining({ source: 'agent', key: 'value' }));
  await restoreAndExpect(session, 'undo-agent', undefined, 'Original');
});

test('a nested Console boundary is not included in another instance tools or activity', () => {
  const session = mountSession(
    undefined,
    {},
    <>
      <Draft />
      <section data-console-agent-root="true">
        <Input aria-label="Nested private field" defaultValue="nested-private-value" />
      </section>
    </>
  );
  expect(JSON.stringify(session.snapshot())).not.toContain('nested-private');
  fireEvent.input(screen.getByRole('textbox', { name: 'Nested private field' }), { target: { value: 'Nested edit' } });
  expect(JSON.stringify(session.getState())).not.toContain('Nested private field');
});
test('hidden record text beside a control cannot leak through its row context', () => {
  const session = mountSession(
    undefined,
    {},
    <>
      <Draft />
      <table>
        <tbody>
          <tr>
            <td data-agent-hidden="true">record-private-value</td>
            <td>
              <Button>Inspect record metadata</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
  expect(JSON.stringify(session.snapshot())).not.toContain('record-private-value');
});

function EmptySchemaDraft() {
  const [schema, setSchema] = useState('');
  return (
    <form data-agent-history="draft">
      <Select onValueChange={setSchema} value={schema}>
        <SelectTrigger aria-label="Schema">
          <SelectValue placeholder="Choose schema" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="orders-value">orders-value</SelectItem>
        </SelectContent>
      </Select>
    </form>
  );
}
test('discard retains and reports a staged selection when restoring an initially empty Select is refused', async () => {
  const session = mountSession(undefined, {}, <EmptySchemaDraft />);
  await act(() => session.stage([{ ref: refFor(session, 'Schema'), value: 'orders-value' }]));
  expect(screen.getByRole('combobox', { name: 'Schema' })).toHaveTextContent('orders-value');
  await act(async () => {
    expect(await session.restore('revert')).toEqual({ ok: false, skipped: 1 });
    expect(await session.restore('revert')).toEqual({ ok: false, skipped: 1 });
  });
  expect(screen.getByRole('combobox', { name: 'Schema' })).toHaveTextContent('orders-value');
  expect(session.getState()).toMatchObject({ staged: 1, error: expect.stringContaining('could not be restored') });
});
