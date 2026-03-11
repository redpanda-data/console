import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PipelineFlowDiagram } from './pipeline-flow-diagram';

// React Flow requires measurement APIs that jsdom doesn't provide.
// Mock ResizeObserver for the test environment.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const SIMPLE_YAML = `
input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - mapping: 'root = this'
output:
  drop: {}
`;

describe('PipelineFlowDiagram', () => {
  test('renders skeleton when yaml is empty', () => {
    const { container } = render(<PipelineFlowDiagram yamlContent="" />);
    // Skeleton has skeleton elements with animate-pulse
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('renders React Flow container with valid yaml', () => {
    const { container } = render(<PipelineFlowDiagram yamlContent={SIMPLE_YAML} />);
    // React Flow renders a div with class "react-flow"
    const reactFlow = container.querySelector('.react-flow');
    expect(reactFlow).toBeTruthy();
  });

  test('renders skeleton for invalid yaml', () => {
    const { container } = render(<PipelineFlowDiagram yamlContent="{{invalid" />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('applies custom className', () => {
    const { container } = render(<PipelineFlowDiagram className="custom-diagram" yamlContent={SIMPLE_YAML} />);
    const wrapper = container.querySelector('.custom-diagram');
    expect(wrapper).toBeTruthy();
  });
});
