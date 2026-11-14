import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { agentTools, createAgent } from '@ui-sdk/react/agent';
import { useState } from 'react';

import { Button } from '../components/redpanda-ui/components/button';
import { Checkbox } from '../components/redpanda-ui/components/checkbox';
import { Dropzone } from '../components/redpanda-ui/components/dropzone';
import { EditorSurface } from '../components/redpanda-ui/components/editor-surface';
import { Input } from '../components/redpanda-ui/components/input';
import { SimpleMultiSelect } from '../components/redpanda-ui/components/multi-select';
import { SortableHandle, SortableItem, SortableList } from '../components/redpanda-ui/components/sortable';
import { defineStepper } from '../components/redpanda-ui/components/stepper';
import { ConsoleWebMcp } from '../components/redpanda-ui/components/webmcp';
import { DateTimeInput } from '../components/ui/date-time-input';
import { CustomFeatureFlagProvider } from '../custom-feature-flag-provider';

type Tool = {
  name: string;
  execute: (input: object, context?: { signal?: AbortSignal }) => Promise<unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};
const tools = new Map<string, Tool>();
const unavailableWebMcp = /WebMCP: unavailable/;
const agent = createAgent();
function installWebMcp(failAt?: string) {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: rs.fn((tool: Tool, options?: { signal?: AbortSignal }) => {
        if (tool.name === failAt) {
          return Promise.reject(new Error('Test registration failure'));
        }
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) === tool) {
            tools.delete(tool.name);
          }
        });
        return Promise.resolve();
      }),
    },
  });
}
function getTool(action: string) {
  const tool = tools.get(action);
  if (!tool) {
    throw new Error(`Missing ${action} tool`);
  }
  return tool;
}
function Settings({
  onDelete,
  enabled = true,
  flag = true,
}: {
  onDelete: () => void;
  enabled?: boolean;
  flag?: boolean;
}) {
  const [name, setName] = useState('Events');
  return (
    <CustomFeatureFlagProvider initialFlags={{ enableUiAgentTools: flag }}>
      <ConsoleWebMcp enabled={enabled}>
        <Input aria-label="Topic name" onValueChange={setName} value={name} />
        <Input aria-label="Client password" type="password" value="never-return-this-secret" />
        <Button onClick={onDelete}>Delete topic</Button>
        <output aria-label="Current topic">{name}</output>
      </ConsoleWebMcp>
    </CustomFeatureFlagProvider>
  );
}
async function requestAction(ref: string, action = 'press', args: unknown[] = [], signal?: AbortSignal) {
  await waitFor(() => expect(tools.has('console_act')).toBe(true));
  let result = Promise.resolve<unknown>(undefined);
  await act(() => {
    result = getTool('console_act').execute({ steps: [{ ref, action, args }] }, { signal });
    return Promise.resolve();
  });
  await screen.findByRole('dialog', { name: 'Agent action request' });
  return { result };
}
async function finishAction(result: Promise<unknown>, button: string) {
  await userEvent.click(screen.getByRole('button', { name: button }));
  await act(() => result.then(() => undefined));
}
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'modelContext');
  tools.clear();
});
describe('console native WebMCP', () => {
  test('registers SDK tools and unregisters on unmount', async () => {
    installWebMcp();
    const view = render(<Settings onDelete={rs.fn()} />);
    await screen.findByRole('button', { name: 'Agent activity', exact: true });
    await waitFor(() =>
      expect([...tools.keys()]).toEqual([
        ...agentTools.map((tool) => `console_${tool.name}`),
        'console_changes',
        'console_stage',
        'console_history',
      ])
    );
    expect(getTool('console_snapshot').annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true });
    view.unmount();
    expect(tools.size).toBe(0);
  });
  test('redacts a password even after a person reveals it', async () => {
    installWebMcp();
    render(<Settings onDelete={rs.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    const snapshot = JSON.stringify(await getTool('console_snapshot').execute({}));
    expect(snapshot).toContain('Topic name');
    expect(snapshot).toContain('[redacted]');
    expect(snapshot).not.toContain('never-return-this-secret');
  });
  test.each([
    ['Deny', 0],
    ['Allow once', 1],
  ] as const)('gates a destructive press with %s', async (button, calls) => {
    installWebMcp();
    const onDelete = rs.fn();
    render(<Settings onDelete={onDelete} />);
    const { result } = await requestAction('Delete topic');
    expect(onDelete).not.toHaveBeenCalled();
    expect(JSON.stringify(agent.snapshot())).not.toContain('Allow once');
    await finishAction(result, button);
    expect(onDelete).toHaveBeenCalledTimes(calls);
  });
  test('agent edits reach controlled form state after approval', async () => {
    installWebMcp();
    render(<Settings onDelete={rs.fn()} />);
    const { result } = await requestAction('Topic name', 'setValue', ['Archive']);
    expect(screen.getByRole('textbox', { name: 'Topic name' })).toHaveValue('Events');
    await finishAction(result, 'Allow once');
    expect(screen.getByRole('status', { name: 'Current topic' })).toHaveTextContent('Archive');
    await userEvent.click(screen.getByRole('button', { name: 'Agent activity', exact: true }));
    expect(screen.getByRole('dialog', { name: 'Agent activity' })).toHaveTextContent('agent');
  });
  test('unmount denies an outstanding action', async () => {
    installWebMcp();
    const onDelete = rs.fn();
    const view = render(<Settings onDelete={onDelete} />);
    const { result } = await requestAction('Delete topic');
    view.unmount();
    await result;
    expect(onDelete).not.toHaveBeenCalled();
    expect(tools.size).toBe(0);
  });
  test('remains usable without browser WebMCP support', async () => {
    render(<Settings onDelete={rs.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Topic name' }), ' archive');
    expect(screen.getByRole('status', { name: 'Current topic' })).toHaveTextContent('Events archive');
  });
});
function ControlledRoles() {
  const [roles, setRoles] = useState<string[]>([]);
  return (
    <>
      <SimpleMultiSelect
        onValueChange={setRoles}
        options={[
          { value: 'admin', label: 'Administrator' },
          { value: 'reader', label: 'Reader' },
        ].filter((role) => !roles.includes(role.value))}
        placeholder="Choose roles"
        value={roles}
      />
      <output aria-label="Chosen roles">{roles.join(',')}</output>
      <Button>Finish choosing</Button>
    </>
  );
}
test('selected roles survive option removal and leaving the popup', async () => {
  render(<ControlledRoles />);
  await userEvent.click(screen.getByText('Choose roles'));
  await userEvent.click(screen.getByRole('option', { name: 'Administrator' }));
  await userEvent.click(screen.getByRole('button', { name: 'Finish choosing' }));
  expect(screen.getByRole('status', { name: 'Chosen roles' })).toHaveTextContent('admin');
  expect(screen.getByRole('combobox')).toHaveTextContent('Administrator');
});
function Reorderable() {
  const [value, setValue] = useState(['offset', 'timestamp', 'value']);
  return (
    <SortableList aria-label="Message columns" onValueChange={setValue} value={value}>
      {(order) =>
        order.map((item) => (
          <SortableItem key={item} value={item}>
            <SortableHandle value={item}>{item}</SortableHandle>
          </SortableItem>
        ))
      }
    </SortableList>
  );
}
test('sdk keyboard reordering commits the same controlled order', async () => {
  render(<Reorderable />);
  await userEvent.click(screen.getByRole('button', { name: 'offset' }));
  await userEvent.keyboard(' {ArrowDown} ');
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['timestamp', 'offset', 'value']);
});
test('disabled controls reject programmatic agent changes', async () => {
  const onChange = rs.fn();
  render(<Checkbox aria-label="Restricted setting" checked={false} disabled onCheckedChange={onChange} />);
  await agent.act({ steps: [{ ref: 'Restricted setting', action: 'setChecked', args: [true] }] });
  expect(onChange).not.toHaveBeenCalled();
});

function ControlledEditor({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState('original-private-configuration');
  return (
    <EditorSurface aria-label="Pipeline source" onValueChange={setValue} readOnly={readOnly} value={value}>
      <output aria-label="Editor value" data-agent-hidden="true">
        {value}
      </output>
    </EditorSurface>
  );
}
test('rich editors expose guarded SDK writes without disclosing configuration', async () => {
  render(<ControlledEditor />);
  expect(JSON.stringify(agent.snapshot())).not.toContain('original-private-configuration');
  const result = await agent.act({
    steps: [{ ref: 'Pipeline source', action: 'setValue', args: ['replacement-private-configuration'] }],
  });
  expect(result.ok).toBe(true);
  expect(screen.getByRole('status', { name: 'Editor value' })).toHaveTextContent('replacement-private-configuration');
});
test('read-only rich editors cannot be changed by an agent', async () => {
  render(<ControlledEditor readOnly />);
  await agent.act({ steps: [{ ref: 'Pipeline source', action: 'setValue', args: ['should-not-change'] }] });
  expect(screen.getByRole('status', { name: 'Editor value' })).toHaveTextContent('original-private-configuration');
});

const workflow = defineStepper({ id: 'source' }, { id: 'review' });
function Workflow() {
  return (
    <workflow.Stepper.Provider>
      {({ methods }) => (
        <>
          <workflow.Stepper.Navigation>
            <workflow.Stepper.Step of="source">Source</workflow.Stepper.Step>
            <workflow.Stepper.Step of="review">Review</workflow.Stepper.Step>
          </workflow.Stepper.Navigation>
          <workflow.Stepper.Panel>
            <Button onClick={methods.next}>Continue after validation</Button>
          </workflow.Stepper.Panel>
          <output aria-label="Workflow progress">{methods.id}</output>
        </>
      )}
    </workflow.Stepper.Provider>
  );
}
test('an agent cannot skip a workflow step by selecting a future tab', async () => {
  render(<Workflow />);
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  await agent.act({ steps: [{ ref: 'Workflow steps', action: 'setValue', args: ['Review'] }] });
  expect(screen.getByRole('status', { name: 'Workflow progress' })).toHaveTextContent('source');
  await userEvent.click(screen.getByRole('button', { name: 'Continue after validation' }));
  expect(screen.getByRole('status', { name: 'Workflow progress' })).toHaveTextContent('review');
});
test('a partially rejected file batch never reaches the upload callback', () => {
  const onDrop = rs.fn();
  const onError = rs.fn();
  const { container } = render(
    <Dropzone maxFiles={1} onDrop={onDrop} onError={onError}>
      <span>Choose certificate</span>
    </Dropzone>
  );
  const input = container.querySelector('input[type=file]');
  if (!input) {
    throw new Error('Missing file input');
  }
  fireEvent.change(input, { target: { files: [new File(['first'], 'one.pem'), new File(['second'], 'two.pem')] } });
  expect(onDrop).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
});

function TimestampField() {
  const [value, setValue] = useState<number | undefined>(undefined);
  return (
    <>
      <DateTimeInput onChange={setValue} value={value} />
      <output aria-label="Timestamp value">{value}</output>
    </>
  );
}
test('agent timestamp edits commit through the same seconds-to-milliseconds normalization', async () => {
  render(<TimestampField />);
  await agent.act({ steps: [{ ref: 'Unix timestamp', action: 'setValue', args: ['1700000000'] }] });
  expect(screen.getByRole('status', { name: 'Timestamp value' })).toHaveTextContent('1700000000000');
});

test('custom reorder rejects unknown items and out-of-range agent arguments', async () => {
  render(<Reorderable />);
  await agent.act({ steps: [{ ref: 'Message columns', action: 'move', args: ['offset', 99] }] });
  await agent.act({ steps: [{ ref: 'Message columns', action: 'move', args: ['unknown', 0] }] });
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['offset', 'timestamp', 'value']);
});
test.each([{ enabled: false }, { flag: false }])(
  'hosts and feature flags can disable the entire agent surface: %j',
  async (props) => {
    installWebMcp();
    render(<Settings onDelete={rs.fn()} {...props} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Topic name' }), ' local');
    expect(screen.getByRole('status', { name: 'Current topic' })).toHaveTextContent('Events local');
    expect(tools.size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Agent activity', exact: true })).toBeNull();
  }
);

test('partial native registration failure cleans up its tools and leaves ordinary UI usable', async () => {
  installWebMcp('console_query');
  render(<Settings onDelete={rs.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Agent activity', exact: true }));
  expect(await screen.findByText(unavailableWebMcp)).toBeInTheDocument();
  expect(tools.size).toBe(0);
});
test('aborting native execution denies its pending action without unregistering other tools', async () => {
  installWebMcp();
  const onDelete = rs.fn();
  render(<Settings onDelete={onDelete} />);
  const controller = new AbortController();
  const { result } = await requestAction('Delete topic', 'press', [], controller.signal);
  await act(async () => {
    controller.abort();
    expect(await result).toMatchObject({ isError: true });
  });
  expect(onDelete).not.toHaveBeenCalled();
  expect(tools.size).toBe(6);
});

test('disabling the bridge preserves an unsaved form instead of remounting it', async () => {
  const view = render(<Settings onDelete={rs.fn()} />);
  await userEvent.type(screen.getByRole('textbox', { name: 'Topic name' }), ' unsaved');
  view.rerender(<Settings enabled={false} onDelete={rs.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Topic name' })).toHaveValue('Events unsaved');
});

test('approval shows no raw secret arguments, and the agent cannot read its prompt', async () => {
  installWebMcp();
  render(<Settings onDelete={rs.fn()} />);
  const { result } = await requestAction('Client password', 'setValue', ['new-private-token']);
  expect(screen.getByRole('dialog', { name: 'Agent action request' })).toHaveTextContent('[redacted]');
  expect(screen.getByRole('dialog', { name: 'Agent action request' })).not.toHaveTextContent('new-private-token');
  expect(JSON.stringify(await getTool('console_snapshot').execute({}))).not.toContain('Requested arguments');
  await finishAction(result, 'Deny');
});
test('agent arguments cannot spoof the source reported by a shared input callback', async () => {
  const sources: string[] = [];
  render(<Input aria-label="Provenance" onValueChange={(_value, details) => sources.push(details.source)} />);
  await act(async () => {
    await agent.act({ steps: [{ ref: 'Provenance', action: 'setValue', args: ['Changed', { source: 'mouse' }] }] });
  });
  expect(sources).toEqual(['agent']);
});

async function requestDeferredBatch(onDelete: () => Promise<void>) {
  installWebMcp();
  const view = render(<Settings onDelete={onDelete} />);
  await waitFor(() => expect(tools.size).toBe(6));
  let result = Promise.resolve<unknown>(undefined);
  await act(() => {
    result = getTool('console_act').execute({
      steps: [
        { ref: 'Delete topic', action: 'press' },
        { ref: 'Topic name', action: 'setValue', args: ['stale batch value'] },
      ],
    });
    return Promise.resolve();
  });
  await screen.findByRole('dialog', { name: 'Agent action request' });
  await userEvent.click(screen.getByRole('button', { name: 'Allow once' }));
  await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  return { view, result };
}
async function expectNewRegistrationBusy() {
  let response: unknown;
  let pending = Promise.resolve();
  await act(() => {
    pending = getTool('console_act')
      .execute({ steps: [{ ref: 'Topic name', action: 'setValue', args: ['new call'] }] })
      .then((value) => {
        response = value;
      });
    return Promise.resolve();
  });
  await waitFor(() => expect(response).toMatchObject({ isError: true }));
  expect(JSON.stringify(response)).toContain('operation');
  await pending;
}
async function expectCancelledBatch(result: Promise<unknown>) {
  expect(await result).toMatchObject({ isError: true });
  expect(screen.getByRole('textbox', { name: 'Topic name' })).toHaveValue('Events');
  expect(screen.queryByRole('dialog', { name: 'Agent action request' })).toBeNull();
}
test('re-enabled tools cannot replace cancellation ownership of an unfinished batch', async () => {
  const deferred = Promise.withResolvers<void>();
  const onDelete = rs.fn(() => deferred.promise);
  const { view, result } = await requestDeferredBatch(onDelete);
  try {
    view.rerender(<Settings enabled={false} onDelete={onDelete} />);
    view.rerender(<Settings onDelete={onDelete} />);
    await waitFor(() => expect(tools.size).toBe(6));
    await expectNewRegistrationBusy();
  } finally {
    await act(() => {
      deferred.resolve();
      return Promise.resolve();
    });
  }
  await expectCancelledBatch(result);
});

test('custom editor actions also preserve unspoofable agent provenance', async () => {
  const sources: string[] = [];
  render(
    <EditorSurface
      aria-label="Source provenance"
      onValueChange={(_value, details) => sources.push(details.source)}
      value=""
    />
  );
  await act(async () => {
    await agent.act({
      steps: [{ ref: 'Source provenance', action: 'setValue', args: ['Changed', { source: 'mouse' }] }],
    });
  });
  expect(sources).toEqual(['agent']);
});
