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

import { MAX_REGION_SLAB_PX, PipelineFlowCanvas } from './pipeline-flow-canvas';

// The merge/join node's tooltip title; matched loosely so wording tweaks don't break the test.
const JOIN_TITLE_RE = /branches reconverge/i;

// React Flow needs ResizeObserver + measurable container dimensions to mount its nodes
// in jsdom (it guards rendering on a measured size).
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

// Exercises every control-flow construct: an input broker (fan-in), a branch (copy/merge),
// a switch (split → case lanes → merge, with a default and an errored() error lane), and a
// try/catch pair.
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
    // No edit callbacks → viewer mode. A disabled "Add output" button would read as broken
    // permissions; plain text explains the state instead.
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
    // stay up (no close button) or the frozen skeleton behind it is unexplained.
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
    // try + catch are paired; the catch marker renders as an error path. (The construct name
    // can also appear as a faint scope-region label, so allow more than one match.)
    expect(screen.getAllByText('catch').length).toBeGreaterThan(0);

    // Each control-flow marker carries a descriptor of what it encloses (so it reads as a
    // router, not an empty card): the switch counts its 3 cases; catch labels its error role.
    expect(screen.getByText('3 cases')).toBeInTheDocument();
    expect(screen.getByText('on error')).toBeInTheDocument();

    // Branches reconverge at explicit join nodes (branch + switch + try/catch).
    expect(screen.getAllByTitle(JOIN_TITLE_RE).length).toBeGreaterThan(0);
    // (Edge labels — the case conditions — render via React Flow's EdgeLabelRenderer,
    // which jsdom doesn't lay out; those are asserted in the parser unit test instead.)
  });

  // A switch that fans out to many cases makes its scope region very tall. A single div that tall
  // exceeds the browser's max paintable element size and its background/border silently vanish (the
  // "area with too many nodes has no background" bug). The region must be rendered as stacked,
  // size-capped pieces so it always paints.
  it('caps every scope-region piece so a tall area still renders its background', async () => {
    const cases = Array.from(
      { length: 60 },
      (_, i) => `      - check: this.x == ${i}\n        processors:\n          - mapping: 'root.y = ${i}'`
    ).join('\n');
    const yaml = `input:\n  generate:\n    mapping: 'root = {}'\npipeline:\n  processors:\n    - switch:\n${cases}\noutput:\n  drop: {}`;

    const { container } = render(<PipelineFlowCanvas configYaml={yaml} />);
    // The switch marker also surfaces as a faint scope-region label, so there are several matches.
    await screen.findAllByText('switch');

    // Region pieces render into React Flow's viewport portal, behind the nodes.
    const portal = container.querySelector('.react-flow__viewport-portal');
    const pieces = portal ? Array.from(portal.children) : [];
    const heights = pieces.map((el) => Number.parseFloat((el as HTMLElement).style.height));

    expect(pieces.length).toBeGreaterThan(0);
    // No piece exceeds the cap — this is what keeps the fill/border paintable.
    for (const h of heights) {
      expect(h).toBeLessThanOrEqual(MAX_REGION_SLAB_PX);
    }
    // The switch's tall enclosing box had to be split into several stacked pieces — proof the
    // size-capping actually engaged (a single giant div would be one piece).
    expect(pieces.length).toBeGreaterThan(3);
  });
});
