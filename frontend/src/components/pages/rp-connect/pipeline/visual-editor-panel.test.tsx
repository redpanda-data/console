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
    onEditNode?: (t: unknown) => void;
    onDeleteNode?: (t: unknown) => void;
    onInsert?: (index: number) => void;
  }) => (
    <div data-configyaml={props.configYaml} data-testid="flow-canvas">
      <button onClick={() => props.onEditNode?.({ kind: 'input' })} type="button">
        edit-input
      </button>
      <button onClick={() => props.onDeleteNode?.({ kind: 'processor', index: 0 })} type="button">
        delete-proc0
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

  test('editing a node opens a dialog seeded from that component and writes the change back', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('edit-input'));

    const editor = (await screen.findByTestId('node-yaml')) as HTMLTextAreaElement;
    expect(editor.value).toContain('generate');

    await user.clear(editor);
    await user.type(editor, 'generate:\n  mapping: root = 1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange.mock.calls[0][0]).toContain('root = 1');
  });

  test('removing a node mutates the YAML to drop it', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('delete-proc0'));

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

  test('view mode is read-only — node actions are inert', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel({ mode: 'view' });

    await user.click(screen.getByText('edit-input'));
    await user.click(screen.getByText('delete-proc0'));

    expect(screen.queryByTestId('node-yaml')).not.toBeInTheDocument();
    expect(onYamlChange).not.toHaveBeenCalled();
  });
});
