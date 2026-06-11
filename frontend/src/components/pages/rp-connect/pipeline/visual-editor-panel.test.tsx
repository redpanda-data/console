import userEvent from '@testing-library/user-event';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';
import { render, screen } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { VisualEditorPanel } from './visual-editor-panel';
import { mockComponents } from '../utils/__fixtures__/component-schemas';

// Surface the visual-editor callbacks as buttons so we can drive the panel
// without React Flow's DOM measurement (which doesn't run under jsdom).
vi.mock('./pipeline-flow-canvas', () => ({
  PipelineFlowCanvas: (props: {
    configYaml: string;
    onSelectNode?: (id: string, t: unknown) => void;
    onInsert?: (index: number) => void;
  }) => (
    <div data-configyaml={props.configYaml} data-testid="flow-canvas">
      <button onClick={() => props.onSelectNode?.('input-0', { kind: 'input' })} type="button">
        select-input
      </button>
      <button onClick={() => props.onSelectNode?.('proc-0', { kind: 'processor', index: 0 })} type="button">
        select-proc0
      </button>
      <button
        onClick={() =>
          props.onSelectNode?.('resource-0', { kind: 'resource', resourceKey: 'cache_resources', index: 0 })
        }
        type="button"
      >
        select-cache-resource
      </button>
      <button onClick={() => props.onInsert?.(1)} type="button">
        insert-end
      </button>
    </div>
  ),
}));

vi.mock('../onboarding/add-connector-dialog', () => ({
  AddConnectorDialog: (props: { isOpen: boolean; onAddConnector?: (name: string, type: string) => void }) =>
    props.isOpen ? (
      <button data-testid="select-cache" onClick={() => props.onAddConnector?.('memory', 'cache')} type="button">
        select cache
      </button>
    ) : null,
}));

vi.mock('components/ui/yaml/yaml-editor', () => ({
  YamlEditor: (props: { value?: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="node-yaml" onChange={(e) => props.onChange?.(e.target.value)} value={props.value || ''} />
  ),
}));

const sampleYaml = `input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - log:
        message: hi
output:
  drop: {}`;

const EMPTY_STATE_TEXT = /select a node/i;

const renderPanel = (overrides: Partial<Parameters<typeof VisualEditorPanel>[0]> = {}) => {
  const onYamlChange = vi.fn();
  render(
    <VisualEditorPanel
      componentList={{} as ComponentList}
      components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
      mode="edit"
      onYamlChange={onYamlChange}
      yamlContent={sampleYaml}
      {...overrides}
    />
  );
  return { onYamlChange };
};

describe('VisualEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('passes the pipeline YAML to the canvas', () => {
    renderPanel();
    expect(screen.getByTestId('flow-canvas').getAttribute('data-configyaml')).toBe(sampleYaml);
  });

  test('the inspector shows an empty state until a node is selected', () => {
    renderPanel();
    expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('node-yaml')).not.toBeInTheDocument();
  });

  test('selecting a node shows its config in the inspector and applying writes it back', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('select-input'));

    const editor = (await screen.findByTestId('node-yaml')) as HTMLTextAreaElement;
    expect(editor.value).toContain('generate');

    await user.clear(editor);
    await user.type(editor, 'generate:\n  mapping: root = 1');
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange.mock.calls[0][0]).toContain('root = 1');
  });

  test('removing the selected node from the inspector mutates the YAML to drop it', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('select-proc0'));
    await user.click(await screen.findByRole('button', { name: 'Remove node' }));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    // The only processor (`log`) is gone, so `pipeline` is pruned entirely.
    expect(onYamlChange.mock.calls[0][0]).not.toContain('message: hi');
    expect(onYamlChange.mock.calls[0][0]).not.toContain('pipeline:');
  });

  test('inserting from the spine opens the connector picker and appends the chosen resource', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('insert-end'));
    await user.click(await screen.findByTestId('select-cache'));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange.mock.calls[0][0]).toContain('cache_resources');
  });

  test('applying a schema-form change commits it to the YAML and resets the inspector', async () => {
    const user = userEvent.setup();
    // Stateful host so the applied YAML flows back into the panel (re-keying the form).
    function Harness() {
      const [yaml, setYaml] = useState('cache_resources:\n  - label: c\n    memory:\n      ttl: 5m\n');
      return (
        <VisualEditorPanel
          componentList={{} as ComponentList}
          components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
          mode="edit"
          onYamlChange={setYaml}
          yamlContent={yaml}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByText('select-cache-resource'));
    const ttl = await screen.findByDisplayValue('5m');

    await user.clear(ttl);
    await user.type(ttl, '10m');
    const apply = screen.getByRole('button', { name: 'Apply changes' });
    expect(apply).toBeEnabled();

    await user.click(apply);

    // The change is committed (10m now shown) and the form re-initialized, so Apply
    // is disabled again (nothing pending).
    expect(await screen.findByDisplayValue('10m')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });

  test('surfaces a lint problem for the selected node in the inspector', async () => {
    const user = userEvent.setup();
    // Line 2 (`generate:`) is inside the input node's YAML range.
    renderPanel({ lintHints: [{ line: 2, column: 1, hint: 'invalid input config', lintType: 'config' }] as never });

    await user.click(screen.getByText('select-input'));

    expect(await screen.findByText('invalid input config')).toBeInTheDocument();
    expect(screen.getByText('1 problem')).toBeInTheDocument();
  });

  test('view mode inspector is read-only — no apply or remove actions', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel({ mode: 'view' });

    await user.click(screen.getByText('select-input'));
    // The component is shown (read-only), but there's no way to apply or remove it.
    await screen.findByTestId('node-yaml');
    expect(screen.queryByRole('button', { name: 'Apply changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove node' })).not.toBeInTheDocument();
    expect(onYamlChange).not.toHaveBeenCalled();
  });
});
