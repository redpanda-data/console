import { afterEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { withSource } from '@ui-sdk/core/observe';
import { createInputController } from '@ui-sdk/react/input';
import { type ReactNode, useState } from 'react';

import { Button } from '../components/redpanda-ui/components/button';
import { InlineInput, Input } from '../components/redpanda-ui/components/input';
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
  await act(async () => {
    await session.restore('undo-agent');
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Human choice');
});
test('stage applies a draft preview and revert restores it through the same callbacks', async () => {
  const session = mountSession();
  await act(async () => {
    await session.stage([{ ref: refFor(session), value: 'Preview' }]);
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Preview');
  expect(session.getState().staged).toBe(1);
  await act(async () => {
    await session.restore('revert');
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Original');
  expect(session.getState().staged).toBe(0);
});
test('a canceled agent callback creates neither an applied preview nor a history entry', async () => {
  const session = mountSession(undefined, { cancelAgent: true });
  await act(async () => {
    await session.stage([{ ref: refFor(session), value: 'Rejected' }]);
  });
  expect(screen.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Original');
  expect(session.getState().entries).toHaveLength(0);
  expect(session.getState().staged).toBe(0);
});
test('discarding a preview never overwrites a newer person edit', async () => {
  const session = mountSession();
  await act(async () => {
    await session.stage([{ ref: refFor(session), value: 'Preview' }]);
  });
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
  await act(async () => {
    await session.act({ steps: [{ ref: 'Host private field', action: 'setValue', args: ['Stolen'] }] });
  });
  expect(screen.getByRole('textbox', { name: 'Host private field' })).toHaveValue('host-private-value');
});
test('removing the local draft forgets its history and preview', async () => {
  const session = mountSession();
  await act(async () => {
    await session.stage([{ ref: refFor(session), value: 'Preview' }]);
  });
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
  await act(async () => {
    await session.act({ steps: [{ ref: 'Async suggestion', action: 'press' }] });
  });
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
