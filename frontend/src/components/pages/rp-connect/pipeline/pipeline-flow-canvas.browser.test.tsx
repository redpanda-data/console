/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, it, rs } from '@rstest/core';
import { render as renderInBrowser, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { type ReactNode, useEffect } from 'react';

import { MAX_REGION_PIECE_PX, PipelineFlowCanvas, PipelineMiniMap } from './pipeline-flow-canvas';

const JOIN_NAME_RE = /branches reconverge/iu;

function CanvasViewport({ children }: { children: ReactNode }) {
  return <div style={{ width: '100%', height: 640 }}>{children}</div>;
}

const render = (content: ReactNode) => renderInBrowser(content, { wrapper: CanvasViewport });

const CONTROL_FLOW_YAML = `input:
  broker:
    inputs:
      - kafka_franz: { topics: [in_a] }
      - kafka_franz: { topics: [in_b] }
pipeline:
  processors:
    - branch:
        request_map: 'root = this.user'
        processors:
          - http: { url: http://enrich }
        result_map: 'root.enriched = this'
    - switch:
        - check: this.region == "us"
          processors: [{ mapping: 'root = this' }]
        - check: errored()
          processors: [{ log: { message: dropped } }]
        - processors: [{ mapping: 'root.region = "other"' }]
    - try:
        - mapping: 'root = this'
    - catch:
        - log: { message: oops }
output:
  drop: {}`;

const NO_OUTPUT_YAML = `input:
  generate:
    mapping: 'root = {}'`;
const ADD_OUTPUT_RE = /add output/iu;
const YAML_TAB_HINT_RE = /fix the YAML in the YAML tab/iu;
const NO_OUTPUT_NOTE_RE = /no output configured/iu;
const STALE_LAYOUT_RE = /showing the last valid layout/iu;

const STOP_BUTTON_RE = /stop condition for generate$/u;

const OVERVIEW_LABEL_RE = /pipeline overview/iu;

const VALID_PIPELINE_YAML = `input:
  generate:
    mapping: 'root = {}'
output:
  drop: {}`;

function tallSwitchYaml(caseCount: number) {
  const cases = Array.from(
    { length: caseCount },
    (_, i) => `      - check: this.x == ${i}\n        processors:\n          - mapping: 'root.y = ${i}'`
  ).join('\n');
  return `input:\n  generate:\n    mapping: 'root = {}'\npipeline:\n  processors:\n    - switch:\n${cases}\noutput:\n  drop: {}`;
}

function regionFillPieces(container: HTMLElement) {
  const portal = container.querySelector('.react-flow__viewport-portal');
  return portal ? Array.from(portal.querySelectorAll<HTMLElement>('[data-region-fill]')) : [];
}

describe('the PipelineFlowCanvas — placeholder cards', () => {
  it('renders a non-interactive "No output configured" note in read-only mode', async () => {
    render(<PipelineFlowCanvas configYaml={NO_OUTPUT_YAML} />);
    expect(await screen.findByText('No output configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADD_OUTPUT_RE })).not.toBeInTheDocument();
  });

  it('renders an enabled "Add output" button in edit mode', async () => {
    render(<PipelineFlowCanvas configYaml={NO_OUTPUT_YAML} onAddConnector={rs.fn()} />);
    expect(await screen.findByRole('button', { name: ADD_OUTPUT_RE })).toBeEnabled();
  });
});

describe('the PipelineFlowCanvas — measured nodes', () => {
  it('keeps its edges when a re-render rebuilds the node objects', async () => {
    const { container, rerender } = render(<PipelineFlowCanvas configYaml={VALID_PIPELINE_YAML} />);
    const edge = await waitFor(() => {
      const current = container.querySelector('.react-flow__edge');
      expect(current).not.toBeNull();
      return current;
    });

    rerender(<PipelineFlowCanvas configYaml={VALID_PIPELINE_YAML} selectedNodeId="input-0" />);
    await waitFor(() => expect(container.querySelector('.ring-primary')).not.toBeNull());
    expect(container.querySelector('.react-flow__edge')).toBe(edge);
  });
});

describe('the PipelineFlowCanvas — deprecated components', () => {
  it('badges a deprecated node, with the warning as its tooltip', async () => {
    const user = userEvent.setup();
    render(
      <PipelineFlowCanvas
        configYaml={VALID_PIPELINE_YAML}
        deprecationsByNode={new Map([['input-0', ['generate is deprecated. Use the redpanda input instead.']]])}
      />
    );

    const badge = await screen.findByText('Deprecated');
    await user.hover(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'generate is deprecated. Use the redpanda input instead.'
    );
  });
});

describe('the PipelineFlowCanvas — invalid YAML from the start', () => {
  it('shows a persistent (non-dismissible) banner pointing at the YAML tab', async () => {
    const { container } = render(<PipelineFlowCanvas configYaml={'input: [unclosed'} />);
    expect(await screen.findByText(YAML_TAB_HINT_RE)).toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('the PipelineFlowCanvas — resilient parse', () => {
  it('holds the last valid layout (flagged stale) when an edit leaves valid YAML that no longer describes a pipeline', async () => {
    const { rerender } = render(<PipelineFlowCanvas configYaml={VALID_PIPELINE_YAML} />);
    expect(await screen.findByText('generate')).toBeInTheDocument();
    expect(screen.queryByText(NO_OUTPUT_NOTE_RE)).not.toBeInTheDocument();

    rerender(<PipelineFlowCanvas configYaml={'renamed_root:\n  generate: {}'} />);
    expect(await screen.findByText(STALE_LAYOUT_RE)).toBeInTheDocument();
    expect(screen.getByText('generate')).toBeInTheDocument();
    expect(screen.queryByText(NO_OUTPUT_NOTE_RE)).not.toBeInTheDocument();
  });

  it('does not flag a valid but still-incomplete pipeline as stale while authoring from blank', async () => {
    const { rerender } = render(<PipelineFlowCanvas configYaml={''} />);
    rerender(<PipelineFlowCanvas configYaml={'input:'} />);
    expect(await screen.findByText(NO_OUTPUT_NOTE_RE)).toBeInTheDocument();
    expect(screen.queryByText(STALE_LAYOUT_RE)).not.toBeInTheDocument();
  });
});

describe('the PipelineFlowCanvas — control-flow render', () => {
  it('renders the Dagre split → merge DAG without crashing', async () => {
    render(<PipelineFlowCanvas configYaml={CONTROL_FLOW_YAML} />);

    expect(await screen.findByText('http')).toBeInTheDocument();

    expect(screen.getAllByText('switch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('branch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('catch').length).toBeGreaterThan(0);

    expect(screen.getByText('3 cases')).toBeInTheDocument();
    expect(screen.getAllByText('on error').length).toBeGreaterThan(0);

    expect(screen.getAllByRole('img', { name: JOIN_NAME_RE }).length).toBeGreaterThan(0);
  });

  // WARNING: A single fill taller than the browser’s paint limit disappears; keep the scope background split into bounded pieces.
  it('caps every scope-region fill piece so a tall area still renders its background', async () => {
    const { container } = render(<PipelineFlowCanvas configYaml={tallSwitchYaml(60)} />);
    await screen.findAllByText('switch');

    const pieces = regionFillPieces(container);
    const heights = pieces.map((el) => Number.parseFloat(el.style.height));

    expect(pieces.length).toBeGreaterThan(0);
    for (const h of heights) {
      expect(h).toBeLessThanOrEqual(MAX_REGION_PIECE_PX);
    }
    expect(pieces.length).toBeGreaterThan(3);
  });
});

function SetFlowState({
  transform,
  width,
  height,
}: {
  transform: [number, number, number];
  width: number;
  height: number;
}) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ transform, width, height });
  }, [store, transform, width, height]);
  return null;
}

type AttrBox = { x: number; y: number; w: number; h: number };

function attrBox(el: Element) {
  return {
    x: Number(el.getAttribute('x')),
    y: Number(el.getAttribute('y')),
    w: Number(el.getAttribute('width')),
    h: Number(el.getAttribute('height')),
  };
}

function expectBoxWithin(box: AttrBox, width: number, height: number) {
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.w).toBeLessThanOrEqual(width);
  expect(box.y + box.h).toBeLessThanOrEqual(height);
}

describe('the PipelineMiniMap — viewport outside the pan extent', () => {
  it('keeps the viewport rect fully inside the svg when the transform sticks out of the extent', () => {
    // WARNING: Changing translateExtent does not re-clamp the live viewport until a pan; insertion must re-clamp it itself.
    render(
      <ReactFlowProvider>
        <SetFlowState height={800} transform={[150, 80, 1]} width={1200} />
        <PipelineMiniMap
          nodes={[]}
          translateExtent={[
            [0, 0],
            [2000, 1500],
          ]}
        />
      </ReactFlowProvider>
    );

    const svg = screen.getByRole('img', { name: OVERVIEW_LABEL_RE });
    const svgWidth = Number(svg.getAttribute('width'));
    const svgHeight = Number(svg.getAttribute('height'));
    const view = svg.querySelector('rect');
    if (!view) {
      throw new Error('viewport rect not rendered');
    }
    expectBoxWithin(attrBox(view), svgWidth, svgHeight);
  });
});

describe('the PipelineFlowCanvas — stop conditions', () => {
  const BROKER_YAML = `input:
  broker:
    inputs:
      - read_until:
          idle_timeout: 30s
          input:
            kafka_franz: { topics: [a] }
      - aws_s3: { bucket: b }
      - redpanda: { topics: [c] }
output:
  drop: {}`;

  const renderEditableCanvas = () => {
    const onSelectNode = rs.fn();
    const onSetStopCondition = rs.fn(() => true);
    render(
      <PipelineFlowCanvas
        configYaml={VALID_PIPELINE_YAML}
        onSelectNode={onSelectNode}
        onSetStopCondition={onSetStopCondition}
        onSlotInsert={rs.fn()}
      />
    );
    return { onSelectNode, onSetStopCondition };
  };

  it('gives every input card a row saying how it stops, and sums them up on the broker', async () => {
    render(<PipelineFlowCanvas configYaml={BROKER_YAML} />);
    const rows = await screen.findAllByTestId('stop-row');
    expect(rows.map((r) => r.textContent).sort()).toEqual(
      [
        'Stopsafter 30s idle',
        'Stopswhen its data runs out',
        'Continuousno stop condition',
        'Continuous1 of 3 inputs never stops',
      ].sort()
    );
  });

  it('opens the editor without selecting the card behind it', async () => {
    const user = userEvent.setup();
    const { onSelectNode, onSetStopCondition } = renderEditableCanvas();
    await user.click(await screen.findByRole('button', { name: STOP_BUTTON_RE }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('When should generate stop?');
    expect(onSelectNode).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'When it goes idle' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSetStopCondition).toHaveBeenCalledWith('input-0', { idleTimeout: '30s' });
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('is read-only in view mode', async () => {
    const user = userEvent.setup();
    render(<PipelineFlowCanvas configYaml={VALID_PIPELINE_YAML} />);
    await user.click(await screen.findByRole('button', { name: STOP_BUTTON_RE }));
    expect(
      await screen.findByText('Generates messages until the pipeline is stopped.', { exact: false })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  const paneCursor = () => document.querySelector<HTMLElement>('.react-flow__pane')?.style.cursor;

  it('leaves Z to the stop editor', async () => {
    const user = userEvent.setup();
    renderEditableCanvas();
    await user.click(await screen.findByRole('button', { name: STOP_BUTTON_RE }));
    screen.getByRole('radio', { name: 'When it goes idle' }).focus();
    await user.keyboard('{z>}');
    expect(paneCursor()).toBe('');
  });

  it('still zooms on Z inside a dialog that hosts the canvas', async () => {
    const user = userEvent.setup();
    render(
      <div role="dialog">
        <PipelineFlowCanvas configYaml={VALID_PIPELINE_YAML} />
      </div>
    );
    (await screen.findByRole('button', { name: STOP_BUTTON_RE })).focus();
    await user.keyboard('{z>}');
    expect(paneCursor()).toBe('zoom-in');
  });
});
