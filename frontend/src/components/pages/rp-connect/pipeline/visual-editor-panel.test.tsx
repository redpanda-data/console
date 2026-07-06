import userEvent from '@testing-library/user-event';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';
import { render, screen, waitForElementToBeRemoved } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PipelineEditorProvider, usePipelineEditorStore } from './use-pipeline-editor-store';
import { VisualEditorPanel } from './visual-editor-panel';
import { mockComponents } from '../utils/__fixtures__/component-schemas';

// Surface the visual-editor callbacks as buttons so we can drive the panel
// without React Flow's DOM measurement (which doesn't run under jsdom).
vi.mock('./pipeline-flow-canvas', () => ({
  PipelineFlowCanvas: (props: {
    configYaml: string;
    onSelectNode?: (id: string, t: unknown) => void;
    onClearSelection?: () => void;
    onInsert?: (index: number) => void;
  }) => (
    <div data-configyaml={props.configYaml} data-testid="flow-canvas">
      <button onClick={() => props.onSelectNode?.('input-0', { kind: 'input' })} type="button">
        select-input
      </button>
      {/* Deselecting (clicking the empty canvas) — now also commits the selected node's edits. */}
      <button onClick={() => props.onClearSelection?.()} type="button">
        deselect
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

// Controllable secrets-store contents for the missing-secrets banner tests.
let mockSecretsData: { secrets: { id: string }[] } | undefined;
vi.mock('react-query/api/secret', () => ({
  useListSecretsQuery: () => ({ data: mockSecretsData }),
}));

vi.mock('../onboarding/add-secrets-dialog', () => ({
  AddSecretsDialog: (props: { isOpen: boolean; missingSecrets: string[] }) =>
    props.isOpen ? <div data-testid="add-secrets-dialog">{props.missingSecrets.join(',')}</div> : null,
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
  const utils = render(
    <PipelineEditorProvider>
      <VisualEditorPanel
        componentList={{} as ComponentList}
        components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
        mode="edit"
        onYamlChange={onYamlChange}
        yamlContent={sampleYaml}
        {...overrides}
      />
    </PipelineEditorProvider>
  );
  return { onYamlChange, ...utils };
};

describe('VisualEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretsData = undefined;
  });

  test('passes the pipeline YAML to the canvas', () => {
    renderPanel();
    expect(screen.getByTestId('flow-canvas').getAttribute('data-configyaml')).toBe(sampleYaml);
  });

  test('the inspector is closed until a node is selected', () => {
    renderPanel();
    // The rail is unmounted (no empty-state placeholder) until something is selected.
    expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-yaml')).not.toBeInTheDocument();
  });

  test('selecting a node shows its config, and leaving the node auto-commits the edit', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('select-input'));

    const editor = (await screen.findByTestId('node-yaml')) as HTMLTextAreaElement;
    expect(editor.value).toContain('generate');

    await user.clear(editor);
    await user.type(editor, 'generate:\n  mapping: root = 1');
    // No Apply button — leaving the node (deselect) commits the edit.
    await user.click(screen.getByRole('button', { name: 'deselect' }));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange.mock.calls[0][0]).toContain('root = 1');
  });

  test('removing the selected node from the inspector mutates the YAML to drop it', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    await user.click(screen.getByText('select-proc0'));
    // Delete lives in the header's 3-dot menu now, then a confirm dialog.
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

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

  test('auto-selects the newly added node so its inspector opens', async () => {
    const user = userEvent.setup();
    // Stateful host so the inserted YAML flows back and the new node can be found + selected.
    function Harness() {
      const [yaml, setYaml] = useState(sampleYaml);
      return (
        <PipelineEditorProvider>
          <VisualEditorPanel
            componentList={{} as ComponentList}
            components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
            mode="edit"
            onYamlChange={setYaml}
            yamlContent={yaml}
          />
        </PipelineEditorProvider>
      );
    }
    render(<Harness />);

    // Nothing selected yet — no inspector.
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    await user.click(screen.getByText('insert-end'));
    await user.click(await screen.findByTestId('select-cache'));

    // The new resource is selected automatically → its inspector opens.
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  // Stateful host so a committed edit flows back into the panel (re-keying the form).
  function CacheHarness() {
    const [yaml, setYaml] = useState('cache_resources:\n  - label: c\n    memory:\n      ttl: 5m\n');
    return (
      <PipelineEditorProvider>
        <VisualEditorPanel
          componentList={{} as ComponentList}
          components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
          mode="edit"
          onYamlChange={setYaml}
          yamlContent={yaml}
        />
      </PipelineEditorProvider>
    );
  }

  test('a schema-form change auto-commits when the node is left', async () => {
    const user = userEvent.setup();
    render(<CacheHarness />);

    await user.click(screen.getByText('select-cache-resource'));
    const ttl = await screen.findByDisplayValue('5m');
    await user.clear(ttl);
    await user.type(ttl, '10m');
    // No Apply button — leaving the node commits the edit.
    await user.click(screen.getByRole('button', { name: 'deselect' }));

    // Reselecting reads from the YAML: the committed value is now 10m.
    await user.click(screen.getByText('select-cache-resource'));
    expect(await screen.findByDisplayValue('10m')).toBeInTheDocument();
  });

  test('undo reverts an auto-committed change and redo re-applies it', async () => {
    const user = userEvent.setup();
    render(<CacheHarness />);
    // The canvas mock reflects the live YAML on its container — assert against that (rather than
    // reselecting the inspector, which accumulates exiting rails under jsdom's AnimatePresence).
    const yamlOnCanvas = () => screen.getByTestId('flow-canvas').getAttribute('data-configyaml') ?? '';

    // Nothing to undo yet.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await user.click(screen.getByText('select-cache-resource'));
    const ttl = await screen.findByDisplayValue('5m');
    await user.clear(ttl);
    await user.type(ttl, '10m');
    await user.click(screen.getByRole('button', { name: 'deselect' }));
    expect(yamlOnCanvas()).toContain('10m');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    // Undo restores the previous value; redo re-applies the edit.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(yamlOnCanvas()).toContain('5m');
    expect(yamlOnCanvas()).not.toContain('10m');

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(yamlOnCanvas()).toContain('10m');
  });

  test('edits made after a save-flush still auto-commit (the flush must not disarm the hook)', async () => {
    const user = userEvent.setup();
    // The pipeline Save flushes the pending inspector edit via the store's `pendingEditCommit`
    // without changing the selection — a regression here silently dropped every edit made after it.
    function SaveFlushButton() {
      const flush = usePipelineEditorStore((s) => s.pendingEditCommit);
      return (
        <button onClick={() => flush?.()} type="button">
          save-flush
        </button>
      );
    }
    function Harness() {
      const [yaml, setYaml] = useState('cache_resources:\n  - label: c\n    memory:\n      ttl: 5m\n');
      return (
        <PipelineEditorProvider>
          <VisualEditorPanel
            componentList={{} as ComponentList}
            components={mockComponents.memoryCache ? [mockComponents.memoryCache] : []}
            mode="edit"
            onYamlChange={setYaml}
            yamlContent={yaml}
          />
          <SaveFlushButton />
        </PipelineEditorProvider>
      );
    }
    render(<Harness />);
    const yamlOnCanvas = () => screen.getByTestId('flow-canvas').getAttribute('data-configyaml') ?? '';

    await user.click(screen.getByText('select-cache-resource'));
    const ttl = await screen.findByDisplayValue('5m');
    await user.clear(ttl);
    await user.type(ttl, '10m');
    // Simulate the pipeline Save flushing the pending edit (selection unchanged).
    await user.click(screen.getByRole('button', { name: 'save-flush' }));
    expect(yamlOnCanvas()).toContain('10m');

    // Edit the (still-selected, re-keyed) node again; leaving it must commit this edit too.
    const ttl2 = await screen.findByDisplayValue('10m');
    await user.clear(ttl2);
    await user.type(ttl2, '15m');
    await user.click(screen.getByRole('button', { name: 'deselect' }));
    expect(yamlOnCanvas()).toContain('15m');
  });

  test('surfaces a lint problem for the selected node in the inspector', async () => {
    const user = userEvent.setup();
    // Line 2 (`generate:`) is inside the input node's YAML range.
    renderPanel({ lintHints: [{ line: 2, column: 1, hint: 'invalid input config', lintType: 'config' }] as never });

    await user.click(screen.getByText('select-input'));

    expect(await screen.findByText('invalid input config')).toBeInTheDocument();
    // Shown in the inspector's error panel (and counted in the floating problems chip).
    expect(screen.getAllByText('1 problem').length).toBeGreaterThan(0);
  });

  test('the problems chip lists lint hints and clicking one selects the offending node', async () => {
    const user = userEvent.setup();
    // Line 2 (`generate:`) maps to the input node.
    renderPanel({ lintHints: [{ line: 2, column: 1, hint: 'invalid input config', lintType: 'config' }] as never });

    await user.click(screen.getByTestId('pipeline-problems-chip'));
    const list = screen.getByTestId('pipeline-problems-list');
    expect(list).toHaveTextContent('invalid input config');

    // Clicking the problem selects the node — its config opens in the inspector.
    await user.click(screen.getByText('invalid input config'));
    expect(((await screen.findByTestId('node-yaml')) as HTMLTextAreaElement).value).toContain('generate');
    expect(screen.queryByTestId('pipeline-problems-list')).not.toBeInTheDocument();
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect secret reference, not a JS template
  const yamlWithSecretRef = 'input:\n  redpanda:\n    sasl:\n      - password: ${secrets.KAFKA_PASSWORD}\n';

  test('surfaces a missing secret in the problems panel and opens the add-secrets flow', async () => {
    const user = userEvent.setup();
    mockSecretsData = { secrets: [{ id: 'EXISTS' }] };
    renderPanel({ yamlContent: yamlWithSecretRef });

    // The missing secret is folded into the unified problems chip (no separate banner).
    const chip = await screen.findByTestId('pipeline-problems-chip');
    expect(chip).toHaveTextContent('1 missing secret');

    await user.click(chip);
    expect(screen.getByTestId('pipeline-problems-secrets')).toHaveTextContent('KAFKA_PASSWORD');

    await user.click(screen.getByTestId('missing-secrets-add'));
    expect(screen.getByTestId('add-secrets-dialog')).toHaveTextContent('KAFKA_PASSWORD');
  });

  test('does not surface missing secrets when they exist, or in view mode', () => {
    mockSecretsData = { secrets: [{ id: 'KAFKA_PASSWORD' }] };
    const { unmount } = renderPanel({ yamlContent: yamlWithSecretRef });
    expect(screen.queryByTestId('pipeline-problems-chip')).not.toBeInTheDocument();
    unmount();

    // View mode never runs the missing-secrets check, so nothing surfaces.
    mockSecretsData = { secrets: [{ id: 'EXISTS' }] };
    renderPanel({ yamlContent: yamlWithSecretRef, mode: 'view' });
    expect(screen.queryByTestId('pipeline-problems-chip')).not.toBeInTheDocument();
  });

  test('Escape clears the selection and Delete removes the selected node', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel();

    // Escape → the rail slides out and unmounts.
    await user.click(screen.getByText('select-input'));
    await screen.findByTestId('node-yaml');
    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => screen.queryByTestId('node-yaml'));

    // Delete → asks to confirm, then removes the selected processor from the YAML.
    await user.click(screen.getByText('select-proc0'));
    await screen.findByTestId('node-yaml');
    await user.keyboard('{Delete}');
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange.mock.calls[0][0]).not.toContain('message: hi');
  });

  test('view mode inspector is read-only — no apply or remove actions', async () => {
    const user = userEvent.setup();
    const { onYamlChange } = renderPanel({ mode: 'view' });

    await user.click(screen.getByText('select-input'));
    // The component is shown (read-only), but there's no way to apply or remove it.
    await screen.findByTestId('node-yaml');
    expect(screen.queryByRole('button', { name: 'Apply changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(onYamlChange).not.toHaveBeenCalled();
  });
});
