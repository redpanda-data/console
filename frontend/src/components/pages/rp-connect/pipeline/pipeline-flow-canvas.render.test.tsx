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

import { render, screen } from 'test-utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MAX_REGION_PIECE_PX, PipelineFlowCanvas } from './pipeline-flow-canvas';

// The merge/join node's tooltip title; matched loosely so wording tweaks don't break the test.
const JOIN_TITLE_RE = /branches reconverge/i;

// React Flow needs ResizeObserver + measurable container dimensions to mount nodes in jsdom.
class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let originalClientWidth: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  }
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  }
});

// Exercises every control-flow construct: broker (fan-in), branch, switch (with a default and an
// errored() error lane), and try/catch.
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

// Valid pipeline with no output — the canvas renders an output placeholder card.
const NO_OUTPUT_YAML = `input:
  generate:
    mapping: 'root = {}'`;
const ADD_OUTPUT_RE = /add output/i;
const YAML_TAB_HINT_RE = /fix the YAML in the YAML tab/i;

describe('PipelineFlowCanvas — placeholder cards', () => {
  it('renders a non-interactive "No output configured" note in read-only mode', async () => {
    // No edit callbacks → viewer mode; a disabled "Add output" would read as broken permissions.
    render(<PipelineFlowCanvas configYaml={NO_OUTPUT_YAML} />);
    expect(await screen.findByText('No output configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADD_OUTPUT_RE })).not.toBeInTheDocument();
  });

  it('renders an enabled "Add output" button in edit mode', async () => {
    render(<PipelineFlowCanvas configYaml={NO_OUTPUT_YAML} onAddConnector={vi.fn()} />);
    expect(await screen.findByRole('button', { name: ADD_OUTPUT_RE })).toBeEnabled();
  });
});

describe('PipelineFlowCanvas — invalid YAML from the start', () => {
  it('shows a persistent (non-dismissible) banner pointing at the YAML tab', async () => {
    // Unparseable from the first render: no last-good graph to fall back to, so the banner must
    // stay up (no close button).
    const { container } = render(<PipelineFlowCanvas configYaml={'input: [unclosed'} />);
    expect(await screen.findByText(YAML_TAB_HINT_RE)).toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('PipelineFlowCanvas — control-flow render', () => {
  it('renders the Dagre split → merge DAG without crashing', async () => {
    render(<PipelineFlowCanvas configYaml={CONTROL_FLOW_YAML} />);

    // A processor inside the branch body renders as a node.
    expect(await screen.findByText('http')).toBeInTheDocument();

    // Control-flow processors render as compact split markers (not growing containers).
    expect(screen.getAllByText('switch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('branch').length).toBeGreaterThan(0);
    // The construct name can also appear as a faint scope-region label, so allow more than one match.
    expect(screen.getAllByText('catch').length).toBeGreaterThan(0);

    // Each marker carries a descriptor of what it encloses: the switch counts its 3 cases; catch
    // labels its error role.
    expect(screen.getByText('3 cases')).toBeInTheDocument();
    expect(screen.getByText('on error')).toBeInTheDocument();

    // Branches reconverge at explicit join nodes (branch + switch + try/catch).
    expect(screen.getAllByTitle(JOIN_TITLE_RE).length).toBeGreaterThan(0);
    // Edge labels (the case conditions) render via EdgeLabelRenderer, which jsdom doesn't lay out;
    // asserted in the parser unit test instead.
  });

  // A switch fanning out to many cases makes its scope region very tall; a single fill div that tall
  // exceeds the browser's max paintable size and silently stops painting. Fix: stacked, size-capped
  // pieces so the background always renders.
  it('caps every scope-region fill piece so a tall area still renders its background', async () => {
    const cases = Array.from(
      { length: 60 },
      (_, i) => `      - check: this.x == ${i}\n        processors:\n          - mapping: 'root.y = ${i}'`
    ).join('\n');
    const yaml = `input:\n  generate:\n    mapping: 'root = {}'\npipeline:\n  processors:\n    - switch:\n${cases}\noutput:\n  drop: {}`;

    const { container } = render(<PipelineFlowCanvas configYaml={yaml} />);
    // The switch marker also surfaces as a faint scope-region label, so there are several matches.
    await screen.findAllByText('switch');

    // Fill pieces render into React Flow's viewport portal, tagged data-region-fill (the border is a
    // single SVG path, excluded here).
    const portal = container.querySelector('.react-flow__viewport-portal');
    const pieces = portal ? Array.from(portal.querySelectorAll('[data-region-fill]')) : [];
    const heights = pieces.map((el) => Number.parseFloat((el as HTMLElement).style.height));

    expect(pieces.length).toBeGreaterThan(0);
    // No piece exceeds the cap — this is what keeps the fill paintable.
    for (const h of heights) {
      expect(h).toBeLessThanOrEqual(MAX_REGION_PIECE_PX);
    }
    // Split into several stacked pieces — proof the capping engaged (a single giant div would be one).
    expect(pieces.length).toBeGreaterThan(3);
  });
});
