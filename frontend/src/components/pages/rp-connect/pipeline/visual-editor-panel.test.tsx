import userEvent from '@testing-library/user-event';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
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
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
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
