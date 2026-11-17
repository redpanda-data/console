import { afterEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAgent } from '@ui-sdk/react/agent';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';

import { Dialog, DialogContent, DialogTitle } from '../components/redpanda-ui/components/dialog';
import { EditorSurface } from '../components/redpanda-ui/components/editor-surface';
import { Field, FieldDescription, FieldError, FieldLabel } from '../components/redpanda-ui/components/field';
import { Input } from '../components/redpanda-ui/components/input';
import { SidebarProvider, SidebarTrigger, useSidebar } from '../components/redpanda-ui/components/sidebar';
import { ToggleGroup, ToggleGroupItem } from '../components/redpanda-ui/components/toggle-group';

const APPLE_PLATFORM = /Mac|iPhone|iPad/;
const SHORTCUT_KEYS = /(?:Meta|Control)\+B/i;

function SidebarState() {
  const { state } = useSidebar();
  return <output aria-label="Sidebar state">{state}</output>;
}
function ShortcutFixture({ modal = false }: { modal?: boolean }) {
  return (
    <SidebarProvider>
      <SidebarTrigger />
      <SidebarState />
      {modal ? (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Focused task</DialogTitle>
          </DialogContent>
        </Dialog>
      ) : null}
    </SidebarProvider>
  );
}
const sidebarKeys = () => ({
  key: 'b',
  bubbles: true,
  cancelable: true,
  ...(APPLE_PLATFORM.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }),
});
const agent = createAgent();
function pressSidebar(extra: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { ...sidebarKeys(), ...extra }));
  });
}
afterEach(cleanup);

test('sidebar shortcut stays inactive behind a modal task', async () => {
  render(<ShortcutFixture modal />);
  await screen.findByRole('dialog');
  pressSidebar();
  expect(screen.getByLabelText('Sidebar state')).toHaveTextContent('expanded');
});

test('sidebar shortcut advertises its keys and ignores extra modifiers', async () => {
  const user = userEvent.setup();
  render(<ShortcutFixture />);
  const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' });
  expect(trigger.getAttribute('aria-keyshortcuts')).toMatch(SHORTCUT_KEYS);
  pressSidebar({ altKey: true });
  expect(screen.getByLabelText('Sidebar state')).toHaveTextContent('expanded');
  pressSidebar();
  await user.click(trigger);
  expect(screen.getByLabelText('Sidebar state')).toHaveTextContent('expanded');
});

test('custom editor joins its field label, description, validation and disabled state', async () => {
  const onValueChange = rs.fn();
  render(
    <Field data-invalid disabled>
      <FieldLabel>Draft source</FieldLabel>
      <EditorSurface onValueChange={onValueChange} value="" />
      <FieldDescription>Use valid YAML.</FieldDescription>
      <FieldError>Source is required.</FieldError>
    </Field>
  );
  const editor = screen.getByRole('group', { name: 'Draft source' });
  await waitFor(() => expect(editor).toHaveAccessibleDescription('Use valid YAML. Source is required.'));
  expect(editor).toHaveAttribute('aria-invalid', 'true');
  expect(editor).toHaveAttribute('aria-disabled', 'true');
  const source = agent.snapshot().find((component) => component.component === 'code-editor');
  expect(source).toBeDefined();
  await act(() => agent.act({ steps: [{ ref: source?.ref ?? '', action: 'setValue', args: ['test: value'] }] }));
  expect(onValueChange).not.toHaveBeenCalled();
});

test('sdk fields associate controls without manual IDs and retain caller-provided IDs', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Field>
        <FieldLabel aria-label="Cluster name">Name</FieldLabel>
        <Input />
        <FieldDescription>Shown in the header.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="explicit-name">Explicit name</FieldLabel>
        <Input id="explicit-name" />
      </Field>
    </>
  );
  const input = screen.getByRole('textbox', { name: 'Cluster name' });
  expect(input).toHaveAccessibleDescription('Shown in the header.');
  await user.click(screen.getByText('Name'));
  expect(input).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Explicit name' })).toHaveAttribute('id', 'explicit-name');
});

test('sidebar shortcuts unregister on unmount', () => {
  const { unmount } = render(<ShortcutFixture />);
  unmount();
  const event = new KeyboardEvent('keydown', sidebarKeys());
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

test('custom toggle groups inherit field names, errors and disabled state', async () => {
  const onValueChange = rs.fn();
  render(
    <Field data-invalid disabled>
      <FieldLabel>Layout</FieldLabel>
      <ToggleGroup onValueChange={onValueChange} value={['list']}>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
        <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
      </ToggleGroup>
      <FieldError>Choose an available layout.</FieldError>
    </Field>
  );
  const group = screen.getByRole('group', { name: 'Layout' });
  await waitFor(() => expect(group).toHaveAccessibleDescription('Choose an available layout.'));
  const grid = screen.getByRole('button', { name: 'Grid' });
  expect(grid).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(grid);
  expect(onValueChange).not.toHaveBeenCalled();
});

function ControlledSource({
  onWrite,
  readOnly = false,
  cancel = false,
}: {
  onWrite: (value: string) => void;
  readOnly?: boolean;
  cancel?: boolean;
}) {
  const [value, setValue] = useState('initial');
  return (
    <>
      <EditorSurface
        aria-label="Source editor"
        onValueChange={(next, details) => {
          if (cancel) {
            details.cancel();
            return;
          }
          setValue(next);
          onWrite(next);
        }}
        readOnly={readOnly}
        value={value}
      />
      <output aria-label="Current source">{value}</output>
    </>
  );
}
async function writeSource(value: string) {
  await act(() => agent.act({ steps: [{ ref: 'Source editor', action: 'setValue', args: [value] }] }));
}

test('manual editor parts keep controlled state and callbacks current across renders', async () => {
  const first = rs.fn();
  const second = rs.fn();
  const view = render(<ControlledSource onWrite={first} />);
  await writeSource('first update');
  expect(screen.getByLabelText('Current source')).toHaveTextContent('first update');
  view.rerender(<ControlledSource onWrite={second} />);
  await writeSource('latest update');
  expect(screen.getByLabelText('Current source')).toHaveTextContent('latest update');
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledWith('latest update');
});

test('manual editor parts honor cancellation and readonly updates, then unregister on unmount', async () => {
  const onWrite = rs.fn();
  const view = render(<ControlledSource cancel onWrite={onWrite} />);
  await writeSource('rejected');
  view.rerender(<ControlledSource onWrite={onWrite} readOnly />);
  await writeSource('also rejected');
  expect(screen.getByLabelText('Current source')).toHaveTextContent('initial');
  expect(onWrite).not.toHaveBeenCalled();
  view.unmount();
  expect(agent.snapshot().filter((component) => component.component === 'code-editor')).toEqual([]);
});

test('manual editor parts render secret-safe server HTML', () => {
  const html = renderToString(
    <EditorSurface aria-label="Source editor" onValueChange={rs.fn()} value="fixture-sensitive-value" />
  );
  expect(html).toContain('data-agent-secret="true"');
  expect(html).not.toContain('fixture-sensitive-value');
});
