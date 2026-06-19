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

import { PipelineFlowCanvas } from './pipeline-flow-canvas';

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

describe('PipelineFlowCanvas — control-flow render', () => {
  it('renders the Dagre split → merge DAG without crashing', async () => {
    render(<PipelineFlowCanvas configYaml={CONTROL_FLOW_YAML} />);

    // A processor inside the branch body renders as a node.
    expect(await screen.findByText('http')).toBeInTheDocument();

    // Control-flow processors render as compact split markers (not growing containers).
    expect(screen.getAllByText('switch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('branch').length).toBeGreaterThan(0);
    // try + catch are paired; the catch marker renders as an error path.
    expect(screen.getByText('catch')).toBeInTheDocument();

    // Branches reconverge at explicit merge nodes (branch + switch + try/catch).
    expect(screen.getAllByTitle('merge').length).toBeGreaterThan(0);
    // (Edge labels — the case conditions — render via React Flow's EdgeLabelRenderer,
    // which jsdom doesn't lay out; those are asserted in the parser unit test instead.)
  });
});
