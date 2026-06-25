import { describe, expect, it } from 'vitest';

import { summarizeComponent } from './pipeline-flow-meta';
import {
  computeFlowLayout,
  computeTreeLayout,
  mainFlowSequence,
  parsePipelineFlowTree,
  subFlowConnections,
} from './pipeline-flow-parser';

describe('parsePipelineFlowTree', () => {
  it('returns placeholder input/output sections with placeholder leaves for empty string', () => {
    const { nodes } = parsePipelineFlowTree('');
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ id: 'section-input', kind: 'section', label: 'input', section: 'input' });
    expect(nodes[1]).toMatchObject({
      id: 'input-placeholder',
      kind: 'leaf',
      label: 'none',
      section: 'input',
      parentId: 'section-input',
    });
    expect(nodes[2]).toMatchObject({ id: 'section-output', kind: 'section', label: 'output', section: 'output' });
    expect(nodes[3]).toMatchObject({
      id: 'output-placeholder',
      kind: 'leaf',
      label: 'none',
      section: 'output',
      parentId: 'section-output',
    });
  });

  it('returns empty nodes with error for invalid YAML', () => {
    const result = parsePipelineFlowTree('{{{');
    expect(result.nodes).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('returns placeholder sections with placeholder leaves for YAML with no input/output/processors', () => {
    const { nodes } = parsePipelineFlowTree('some_unknown_key: true');
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ id: 'section-input', kind: 'section', label: 'input' });
    expect(nodes[1]).toMatchObject({ id: 'input-placeholder', kind: 'leaf', label: 'none' });
    expect(nodes[2]).toMatchObject({ id: 'section-output', kind: 'section', label: 'output' });
    expect(nodes[3]).toMatchObject({ id: 'output-placeholder', kind: 'leaf', label: 'none' });
  });

  it('parses resource-only YAML into resource section with input/output placeholders', () => {
    const { nodes } = parsePipelineFlowTree('metrics:\n  prometheus: {}');
    expect(nodes).toHaveLength(6);
    expect(nodes[0]).toMatchObject({ id: 'section-input', kind: 'section' });
    expect(nodes[1]).toMatchObject({ id: 'input-placeholder', kind: 'leaf', label: 'none' });
    expect(nodes[2]).toMatchObject({ id: 'section-resources', kind: 'section', label: 'resources' });
    expect(nodes[3]).toMatchObject({ id: 'resource-metrics', kind: 'leaf', label: 'metrics', section: 'resource' });
    expect(nodes[4]).toMatchObject({ id: 'section-output', kind: 'section' });
    expect(nodes[5]).toMatchObject({ id: 'output-placeholder', kind: 'leaf', label: 'none' });
  });

  it('emits section and leaf nodes for simple input with output placeholder', () => {
    const yaml = 'input:\n  kafka_franz:\n    seed_brokers: ["localhost:9092"]';
    const { nodes } = parsePipelineFlowTree(yaml);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ id: 'section-input', kind: 'section', label: 'input' });
    expect(nodes[1]).toMatchObject({
      id: 'input-0',
      kind: 'leaf',
      label: 'kafka_franz',
      section: 'input',
      parentId: 'section-input',
    });
    expect(nodes[2]).toMatchObject({ id: 'section-output', kind: 'section' });
    expect(nodes[3]).toMatchObject({ id: 'output-placeholder', kind: 'leaf', label: 'none' });
  });

  it('emits section and leaf nodes for simple output with input placeholder', () => {
    const yaml = 'output:\n  http_client:\n    url: http://example.com';
    const { nodes } = parsePipelineFlowTree(yaml);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ id: 'section-input', kind: 'section' });
    expect(nodes[1]).toMatchObject({ id: 'input-placeholder', kind: 'leaf', label: 'none' });
    expect(nodes[2]).toMatchObject({ id: 'section-output', kind: 'section', label: 'output' });
    expect(nodes[3]).toMatchObject({
      id: 'output-0',
      kind: 'leaf',
      label: 'http_client',
      parentId: 'section-output',
    });
  });

  it('parses processor chain with section node and input/output placeholders', () => {
    const yaml = `
pipeline:
  processors:
    - mapping: "root = this"
    - jmespath:
        query: foo
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const procNodes = nodes.filter((n) => n.section === 'processor');
    expect(procNodes).toHaveLength(3);
    expect(procNodes[0]).toMatchObject({
      id: 'section-processors',
      kind: 'section',
      label: 'processors',
    });
    expect(procNodes[1]).toMatchObject({
      id: 'proc-0',
      kind: 'leaf',
      label: 'mapping',
      parentId: 'section-processors',
    });
    expect(procNodes[2]).toMatchObject({
      id: 'proc-1',
      kind: 'leaf',
      label: 'jmespath',
      parentId: 'section-processors',
    });
    // Also has input/output placeholder sections
    expect(nodes.find((n) => n.id === 'input-placeholder')).toBeDefined();
    expect(nodes.find((n) => n.id === 'output-placeholder')).toBeDefined();
  });

  it('parses broker input with collapsible group', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka_franz:
          seed_brokers: ["localhost:9092"]
      - amqp_1:
          url: amqp://localhost
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const inputNodes = nodes.filter((n) => n.section === 'input');
    expect(inputNodes).toHaveLength(4);
    expect(inputNodes[1]).toMatchObject({
      id: 'input-broker',
      kind: 'group',
      label: 'broker',
      section: 'input',
      parentId: 'section-input',
      collapsible: true,
    });
    expect(inputNodes[2]).toMatchObject({
      id: 'input-broker-0',
      kind: 'leaf',
      label: 'kafka_franz',
      parentId: 'input-broker',
    });
    expect(inputNodes[3]).toMatchObject({
      id: 'input-broker-1',
      kind: 'leaf',
      label: 'amqp_1',
      parentId: 'input-broker',
    });
  });

  it('parses sequence input with children', () => {
    const yaml = `
input:
  sequence:
    inputs:
      - file:
          paths: ["/tmp/a.txt"]
      - csv:
          paths: ["/tmp/b.csv"]
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const inputNodes = nodes.filter((n) => n.section === 'input');
    expect(inputNodes).toHaveLength(4);
    expect(inputNodes[1]).toMatchObject({ id: 'input-sequence', kind: 'group', label: 'sequence', collapsible: true });
    expect(inputNodes[2]).toMatchObject({
      id: 'input-sequence-0',
      kind: 'leaf',
      label: 'file',
      parentId: 'input-sequence',
    });
    expect(inputNodes[3]).toMatchObject({
      id: 'input-sequence-1',
      kind: 'leaf',
      label: 'csv',
      parentId: 'input-sequence',
    });
  });

  it('parses broker output with children', () => {
    const yaml = `
output:
  broker:
    outputs:
      - kafka_franz:
          seed_brokers: ["localhost:9092"]
      - s3:
          bucket: my-bucket
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const outputNodes = nodes.filter((n) => n.section === 'output');
    expect(outputNodes).toHaveLength(4);
    expect(outputNodes[1]).toMatchObject({
      id: 'output-broker',
      kind: 'group',
      label: 'broker',
      section: 'output',
      collapsible: true,
    });
    expect(outputNodes[2]).toMatchObject({
      id: 'output-broker-0',
      kind: 'leaf',
      label: 'kafka_franz',
      parentId: 'output-broker',
    });
    expect(outputNodes[3]).toMatchObject({
      id: 'output-broker-1',
      kind: 'leaf',
      label: 's3',
      parentId: 'output-broker',
    });
  });

  it('parses switch output with children', () => {
    const yaml = `
output:
  switch:
    cases:
      - output:
          kafka_franz:
            seed_brokers: ["localhost:9092"]
      - output:
          http_client:
            url: http://example.com
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const outputNodes = nodes.filter((n) => n.section === 'output');
    expect(outputNodes).toHaveLength(4);
    expect(outputNodes[1]).toMatchObject({ id: 'output-switch', kind: 'group', label: 'switch', collapsible: true });
    expect(outputNodes[2]).toMatchObject({
      id: 'output-switch-0',
      kind: 'leaf',
      label: 'kafka_franz',
      parentId: 'output-switch',
    });
    expect(outputNodes[3]).toMatchObject({
      id: 'output-switch-1',
      kind: 'leaf',
      label: 'http_client',
      parentId: 'output-switch',
    });
  });

  it('parses fallback output with children', () => {
    const yaml = `
output:
  fallback:
    - kafka_franz:
        seed_brokers: ["localhost:9092"]
    - http_client:
        url: http://example.com
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const outputNodes = nodes.filter((n) => n.section === 'output');
    expect(outputNodes).toHaveLength(4);
    expect(outputNodes[1]).toMatchObject({
      id: 'output-fallback',
      kind: 'group',
      label: 'fallback',
      collapsible: true,
    });
    expect(outputNodes[2]).toMatchObject({
      id: 'output-fallback-0',
      kind: 'leaf',
      label: 'kafka_franz',
      parentId: 'output-fallback',
    });
    expect(outputNodes[3]).toMatchObject({
      id: 'output-fallback-1',
      kind: 'leaf',
      label: 'http_client',
      parentId: 'output-fallback',
    });
  });

  it('only produces section, group, and leaf node kinds', () => {
    const yaml = 'input:\n  kafka: {}\noutput:\n  http: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const validKinds = new Set(['section', 'group', 'leaf']);
    expect(nodes.every((n) => validKinds.has(n.kind))).toBe(true);
  });

  it('parses switch processor with nested cases', () => {
    const yaml = `
pipeline:
  processors:
    - switch:
        - check: 'this.type == "a"'
          processors:
            - mapping: 'root = this.a'
        - check: 'this.type == "b"'
          processors:
            - mapping: 'root = this.b'
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const procNodes = nodes.filter((n) => n.section === 'processor' && n.kind !== 'section');
    // switch(group) -> case0(group) -> mapping(leaf), case1(group) -> mapping(leaf)
    expect(procNodes.find((n) => n.id === 'proc-0')?.kind).toBe('group');
    expect(procNodes.find((n) => n.id === 'proc-0')?.label).toBe('switch');
    expect(procNodes.filter((n) => n.kind === 'group' && n.parentId === 'proc-0')).toHaveLength(2);
    expect(procNodes.filter((n) => n.kind === 'leaf')).toHaveLength(2);
  });

  it('parses while processor with nested processors', () => {
    const yaml = `
pipeline:
  processors:
    - while:
        check: 'this.count < 10'
        processors:
          - mapping: 'root.count = this.count + 1'
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const whileNode = nodes.find((n) => n.id === 'proc-0');
    expect(whileNode?.kind).toBe('group');
    expect(whileNode?.label).toBe('while');
    const children = nodes.filter((n) => n.parentId === 'proc-0');
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('mapping');
  });

  it('parses branch processor with nested processors', () => {
    const yaml = `
pipeline:
  processors:
    - branch:
        request_map: 'root = this.doc'
        processors:
          - http:
              url: http://example.com
          - mapping: 'root = this'
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const branchNode = nodes.find((n) => n.id === 'proc-0');
    expect(branchNode?.kind).toBe('group');
    expect(branchNode?.label).toBe('branch');
    const children = nodes.filter((n) => n.parentId === 'proc-0');
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('http');
    expect(children[1].label).toBe('mapping');
  });

  it('caps recursive branching at depth 3', () => {
    const yaml = `
pipeline:
  processors:
    - try:
        - try:
            - try:
                - try:
                    - mapping: 'root = this'
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    // depth 0: try(group), depth 1: try(group), depth 2: try(group), depth 3: try(leaf) — capped
    const groups = nodes.filter((n) => n.kind === 'group');
    const procLeaves = nodes.filter((n) => n.kind === 'leaf' && n.section === 'processor');
    expect(groups).toHaveLength(3);
    expect(procLeaves).toHaveLength(1);
    // The innermost try is a leaf because depth >= 3
    expect(procLeaves[0].label).toBe('try');
  });

  it('parses workflow processor as leaf (stages not in branching fields)', () => {
    const yaml = `
pipeline:
  processors:
    - workflow:
        meta_path: meta.workflow
        stages:
          enrich:
            processors:
              - http:
                  url: http://enrich.example.com
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const workflowNode = nodes.find((n) => n.id === 'proc-0');
    expect(workflowNode?.kind).toBe('leaf');
    expect(workflowNode?.label).toBe('workflow');
  });

  it('parses cached processor as leaf when top-level', () => {
    const yaml = `
pipeline:
  processors:
    - cached:
        key: '\${! this.id }'
        http:
          url: http://example.com
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    // Top-level cached is treated as a leaf (wrapped processor unwrapping
    // only triggers via parseBranchingKeys path)
    const procNode = nodes.find((n) => n.id === 'proc-0');
    expect(procNode?.kind).toBe('leaf');
    expect(procNode?.label).toBe('cached');
  });

  it('parses retry processor as leaf when top-level', () => {
    const yaml = `
pipeline:
  processors:
    - retry:
        backoff:
          initial_interval: 1s
        http:
          url: http://example.com
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const procNode = nodes.find((n) => n.id === 'proc-0');
    expect(procNode?.kind).toBe('leaf');
    expect(procNode?.label).toBe('retry');
  });

  it('parses array branching processors (try, catch, for_each, parallel) as groups', () => {
    for (const procType of ['try', 'catch', 'for_each', 'parallel']) {
      const yaml = `
pipeline:
  processors:
    - ${procType}:
        - mapping: 'root = this'
        - log:
            message: done
`;
      const { nodes } = parsePipelineFlowTree(yaml);
      const groupNode = nodes.find((n) => n.id === 'proc-0');
      expect(groupNode?.kind).toBe('group');
      expect(groupNode?.label).toBe(procType);
      // Children are created by pushProcessorChildren
      const leafNodes = nodes.filter((n) => n.kind === 'leaf' && n.section === 'processor');
      expect(leafNodes).toHaveLength(2);
      expect(leafNodes.map((n) => n.label)).toEqual(['mapping', 'log']);
    }
  });

  it('extracts topics in leaf nodes', () => {
    const yaml = `
input:
  kafka_franz:
    topics:
      - orders
      - events
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const leaf = nodes.find((n) => n.kind === 'leaf' && n.section === 'input' && n.label !== 'none');
    expect(leaf?.topics).toEqual(['orders', 'events']);
    // …and the topics reach the laid-out card data, where they render as chips.
    const card = computeFlowLayout(nodes).rfNodes.find((n) => n.id === leaf?.id);
    expect((card?.data as { topics?: string[] }).topics).toEqual(['orders', 'events']);
  });

  it('summarizes nested leaves too (a processor inside a container shows its config)', () => {
    const yaml = `pipeline:
  processors:
    - try:
        - http: { url: 'http://api/enrich', verb: POST }
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const http = nodes.find((n) => n.label === 'http');
    expect(http?.meta).toEqual([
      { label: 'url', value: 'http://api/enrich' },
      { label: 'verb', value: 'POST' },
    ]);
  });

  it('extracts labels in leaf nodes', () => {
    const yaml = `
input:
  kafka_franz:
    seed_brokers: ["localhost:9092"]
  label: my-input
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const leaf = nodes.find((n) => n.kind === 'leaf' && n.section === 'input' && n.label !== 'none');
    expect(leaf?.labelText).toBe('my-input');
  });

  it('handles empty broker inputs gracefully', () => {
    const yaml = `
input:
  broker:
    inputs: []
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    // broker with empty inputs has no children to expand, produces a leaf
    const inputNodes = nodes.filter((n) => n.section === 'input' && n.kind !== 'section');
    expect(inputNodes).toHaveLength(1);
    expect(inputNodes[0].label).toBe('broker');
  });

  it('handles empty broker outputs gracefully', () => {
    const yaml = `
output:
  broker:
    outputs: []
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const outputNodes = nodes.filter((n) => n.section === 'output' && n.kind !== 'section');
    expect(outputNodes).toHaveLength(1);
    expect(outputNodes[0].label).toBe('broker');
  });

  it('prefixes all node IDs when idPrefix is provided', () => {
    const yaml = 'input:\n  kafka: {}\noutput:\n  http: {}';
    const { nodes } = parsePipelineFlowTree(yaml, { idPrefix: 'inst1' });

    // All IDs should be prefixed
    for (const node of nodes) {
      expect(node.id).toMatch(/^inst1-/);
      if (node.parentId) {
        expect(node.parentId).toMatch(/^inst1-/);
      }
    }

    // Two instances produce non-overlapping IDs
    const { nodes: nodes2 } = parsePipelineFlowTree(yaml, { idPrefix: 'inst2' });
    const ids1 = new Set(nodes.map((n) => n.id));
    const ids2 = new Set(nodes2.map((n) => n.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });

  it('parses full pipeline with all sections', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka_franz:
          seed_brokers: ["localhost:9092"]
      - amqp_1:
          url: amqp://localhost

pipeline:
  processors:
    - mapping: "root = this"
    - jmespath:
        query: foo

output:
  switch:
    cases:
      - output:
          kafka_franz:
            seed_brokers: ["localhost:9093"]
      - output:
          s3:
            bucket: my-bucket
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    expect(nodes).toHaveLength(11);
    expect(nodes.filter((n) => n.kind === 'section')).toHaveLength(3);
    expect(nodes.filter((n) => n.kind === 'group')).toHaveLength(2);
    expect(nodes.filter((n) => n.kind === 'leaf')).toHaveLength(6);
  });

  describe('redpanda missing config flags', () => {
    it('sets missingTopic on redpanda_common input with empty topics', () => {
      const yaml = 'input:\n  redpanda_common:\n    topics: []';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input).toMatchObject({ label: 'redpanda_common', missingTopic: true });
    });

    it('sets missingSasl on kafka_franz input without sasl config', () => {
      const yaml = 'input:\n  kafka_franz:\n    seed_brokers: ["localhost:9092"]\n    topics: ["test"]';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input).toMatchObject({ label: 'kafka_franz', missingSasl: true });
      expect(input?.missingTopic).toBeUndefined();
    });

    it('does not set missingSasl when component-level sasl is configured', () => {
      const yaml =
        'input:\n  kafka_franz:\n    seed_brokers: ["localhost:9092"]\n    topics: ["test"]\n    sasl:\n      - mechanism: SCRAM-SHA-256';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input?.missingSasl).toBeUndefined();
    });

    it('does not set missingSasl when root-level redpanda.sasl is configured', () => {
      const yaml =
        'redpanda:\n  sasl:\n    - mechanism: SCRAM-SHA-256\ninput:\n  redpanda_common:\n    topics: ["test"]';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input?.missingSasl).toBeUndefined();
    });

    it('does not set flags on non-redpanda components', () => {
      const yaml = 'input:\n  http_client:\n    url: http://example.com';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input?.missingTopic).toBeUndefined();
      expect(input?.missingSasl).toBeUndefined();
    });

    it('sets flags on redpanda output nodes', () => {
      const yaml = 'output:\n  kafka_franz:\n    seed_brokers: ["localhost:9092"]';
      const { nodes } = parsePipelineFlowTree(yaml);
      const output = nodes.find((n) => n.id === 'output-0');
      expect(output).toMatchObject({ missingTopic: true, missingSasl: true });
    });

    it('sets both flags when topic and sasl are both missing', () => {
      const yaml = 'input:\n  redpanda_common: {}';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input).toMatchObject({ missingTopic: true, missingSasl: true });
    });

    it('clears missingTopic when topics are present', () => {
      const yaml = 'input:\n  kafka_franz:\n    topics: ["my-topic"]';
      const { nodes } = parsePipelineFlowTree(yaml);
      const input = nodes.find((n) => n.id === 'input-0');
      expect(input?.missingTopic).toBeUndefined();
      expect(input?.topics).toEqual(['my-topic']);
    });

    it('passes missingTopic/missingSasl through to layout rfNode data', () => {
      const yaml = 'input:\n  redpanda_common: {}';
      const { nodes } = parsePipelineFlowTree(yaml);
      const { rfNodes } = computeTreeLayout(nodes);
      const inputRfNode = rfNodes.find((n) => n.id === 'input-0');
      expect(inputRfNode?.data.missingTopic).toBe(true);
      expect(inputRfNode?.data.missingSasl).toBe(true);
    });
  });
});

describe('computeTreeLayout', () => {
  it('returns empty for empty nodes', () => {
    const { rfNodes, rfEdges, height } = computeTreeLayout([]);
    expect(rfNodes).toEqual([]);
    expect(rfEdges).toEqual([]);
    expect(height).toBe(200);
  });

  it('positions nodes in DFS order with correct indentation', () => {
    const yaml = 'input:\n  kafka: {}\noutput:\n  http: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfNodes } = computeTreeLayout(nodes);

    // section-input(depth 0), input-0(depth 1), section-output(depth 0), output-0(depth 1)
    expect(rfNodes).toHaveLength(4);

    // Verify DFS order by y positions for visible nodes
    const visibleNodes = rfNodes.filter((n) => (n.style as Record<string, unknown>)?.opacity !== 0);
    for (let i = 1; i < visibleNodes.length; i++) {
      expect(visibleNodes[i].position.y).toBeGreaterThan(visibleNodes[i - 1].position.y);
    }

    // Verify indentation: sections at depth 0, leaves at depth 1
    const sectionX = rfNodes[0].position.x;
    const leafX = rfNodes[1].position.x;
    expect(leafX).toBeGreaterThan(sectionX);
  });

  it('connects components along the data flow (not section containment)', () => {
    const yaml = 'input:\n  kafka: {}\npipeline:\n  processors:\n    - log: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfEdges } = computeTreeLayout(nodes);

    // The main path flows input → processor → output(placeholder) as primary edges.
    const main = rfEdges.filter((e) => e.type === 'sectionEdge');
    expect(main.find((e) => e.source === 'input-0' && e.target === 'proc-0')).toBeDefined();
    expect(main.find((e) => e.source === 'proc-0' && e.target === 'output-placeholder')).toBeDefined();
    // No containment edges from a section header to its components.
    expect(rfEdges.find((e) => e.source.startsWith('section-'))).toBeUndefined();
  });

  it('threads a group sub-pipeline with branch edges', () => {
    const yaml = `input:
  generate: {}
pipeline:
  processors:
    - branch:
        processors:
          - mapping: 'root = this'
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfEdges } = computeTreeLayout(nodes);
    // The branch group feeds its inner processor via a branch (treeEdge) connection.
    expect(
      rfEdges.find((e) => e.type === 'treeEdge' && e.source === 'proc-0' && e.target === 'proc-0-processors-p0')
    ).toBeDefined();
    // And the main path still flows generate → branch → drop.
    const main = rfEdges.filter((e) => e.type === 'sectionEdge');
    expect(main.find((e) => e.source === 'input-0' && e.target === 'proc-0')).toBeDefined();
    expect(main.find((e) => e.source === 'proc-0' && e.target === 'output-0')).toBeDefined();
  });

  it('adds arrow markers to all edges', () => {
    const yaml = 'input:\n  kafka: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfEdges } = computeTreeLayout(nodes);

    for (const edge of rfEdges) {
      expect(edge.markerEnd).toMatchObject({ type: 'arrow' });
    }
  });

  it('hides descendants of collapsed groups with opacity animation', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka: {}
      - amqp: {}
`;
    const { nodes } = parsePipelineFlowTree(yaml);

    const expanded = computeTreeLayout(nodes, new Set());
    const collapsed = computeTreeLayout(nodes, new Set(['input-broker']));

    // Expanded: input section + group + 2 children + output section + output placeholder = 6, all visible
    const expandedVisible = expanded.rfNodes.filter((n) => (n.style as Record<string, unknown>)?.opacity !== 0);
    expect(expandedVisible).toHaveLength(6);

    // Collapsed: all 6 nodes still in array, but broker children hidden via opacity
    expect(collapsed.rfNodes).toHaveLength(6);
    const collapsedVisible = collapsed.rfNodes.filter((n) => (n.style as Record<string, unknown>)?.opacity !== 0);
    expect(collapsedVisible).toHaveLength(4); // input section + group + output section + output placeholder

    // Group itself is still visible
    const groupNode = collapsed.rfNodes.find((n) => n.id === 'input-broker');
    expect((groupNode?.style as Record<string, unknown>)?.opacity).toBe(1);

    // Children are hidden via opacity
    const child0 = collapsed.rfNodes.find((n) => n.id === 'input-broker-0');
    expect((child0?.style as Record<string, unknown>)?.opacity).toBe(0);

    // Edges to hidden children are hidden
    const hiddenEdges = collapsed.rfEdges.filter((e) => e.hidden);
    expect(hiddenEdges).toHaveLength(2);
  });

  it('collapsed group node has collapsed data flag', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka: {}
      - amqp: {}
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfNodes } = computeTreeLayout(nodes, new Set(['input-broker']));
    const groupNode = rfNodes.find((n) => n.id === 'input-broker');
    expect(groupNode?.data.collapsed).toBe(true);
    expect(groupNode?.data.collapsible).toBe(true);
  });

  it('uses correct node types', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka: {}
      - amqp: {}
pipeline:
  processors:
    - mapping: "root = this"
output:
  http: {}
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfNodes } = computeTreeLayout(nodes);

    expect(rfNodes.find((n) => n.id === 'section-input')?.type).toBe('treeSection');
    expect(rfNodes.find((n) => n.id === 'input-broker')?.type).toBe('treeGroup');
    expect(rfNodes.find((n) => n.id === 'input-broker-0')?.type).toBe('treeLeaf');
    expect(rfNodes.find((n) => n.id === 'proc-0')?.type).toBe('treeLeaf');
  });

  it('returns height at least MIN_HEIGHT', () => {
    const yaml = 'input:\n  kafka: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { height } = computeTreeLayout(nodes);
    expect(height).toBeGreaterThanOrEqual(200);
  });

  it('height decreases when groups are collapsed', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka: {}
      - amqp: {}
pipeline:
  processors:
    - mapping: "root = this"
    - jmespath: {}
    - bloblang: {}
    - compress: {}
    - decompress: {}
    - split: {}
    - dedupe: {}
output:
  http: {}
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const expandedHeight = computeTreeLayout(nodes, new Set()).height;
    const collapsedHeight = computeTreeLayout(nodes, new Set(['input-broker'])).height;
    expect(collapsedHeight).toBeLessThan(expandedHeight);
  });

  it('does not inject mode into node data', () => {
    const yaml = 'input:\n  kafka: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfNodes } = computeTreeLayout(nodes);
    for (const node of rfNodes) {
      expect(node.data.mode).toBeUndefined();
    }
  });

  it('auto-collapses groups beyond MAX_NESTING_DEPTH with descendant count', () => {
    // Triple-nested switch: depth 0=section, 1=switch, 2=case, 3=switch, 4=case, 5=switch (>=5 → auto-collapsed)
    const yaml = [
      'pipeline:',
      '  processors:',
      '    - switch:',
      "        - check: 'this.a > 1'",
      '          processors:',
      '            - switch:',
      "                - check: 'this.b > 2'",
      '                  processors:',
      '                    - switch:',
      "                        - check: 'this.c > 3'",
      '                          processors:',
      '                            - mapping: root = this',
    ].join('\n');
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfNodes } = computeTreeLayout(nodes);

    // The innermost switch group (at depth >= 5) should be auto-collapsed
    const visibleNodes = rfNodes.filter((n) => (n.style as Record<string, unknown>)?.opacity !== 0);
    // The deeply nested mapping leaf should be hidden (opacity 0)
    const mappingNode = rfNodes.find((n) => n.data.label === 'mapping');
    expect(mappingNode).toBeDefined();
    expect((mappingNode?.style as Record<string, unknown>)?.opacity).toBe(0);

    // An auto-collapsed group should have collapsed=true and childCount > 0
    const autoCollapsedGroups = visibleNodes.filter((n) => n.data.collapsed === true && n.data.childCount > 0);
    expect(autoCollapsedGroups.length).toBeGreaterThan(0);
  });

  it('returns maxDepth tracking the deepest visual nesting level', () => {
    const yaml = [
      'pipeline:',
      '  processors:',
      '    - switch:',
      "        - check: 'this.a > 1'",
      '          processors:',
      '            - mapping: root = this',
    ].join('\n');
    const { nodes } = parsePipelineFlowTree(yaml);
    const { maxDepth } = computeTreeLayout(nodes);

    // processors section (0) → switch group (1) → case group (2) → mapping leaf (3)
    expect(maxDepth).toBe(3);
  });
});

const BRANCHING_PIPELINE = `input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - log:
        message: hi
    - branch:
        processors:
          - mapping: 'root = this'
output:
  drop: {}`;

describe('computeFlowLayout', () => {
  const { nodes } = parsePipelineFlowTree(BRANCHING_PIPELINE);
  const { rfNodes, rfEdges } = computeFlowLayout(nodes);
  const byId = (id: string) => rfNodes.find((n) => n.id === id);

  it('lays the input → processors → output spine left-to-right on the main row', () => {
    const input = byId('input-0');
    const log = byId('proc-0');
    const branch = byId('proc-1');
    const output = byId('output-0');
    // Dagre lays the DAG out left→right: top-level steps are absolutely positioned (no
    // parent) at strictly increasing x along the flow (the branch is now a compact split).
    for (const node of [input, log, branch, output]) {
      expect(node?.parentId).toBeUndefined();
    }
    expect((input?.position.x ?? 0) < (log?.position.x ?? 0)).toBe(true);
    expect((log?.position.x ?? 0) < (branch?.position.x ?? 0)).toBe(true);
    expect((branch?.position.x ?? 0) < (output?.position.x ?? 0)).toBe(true);
  });

  it('renders a branch as a compact marker with its body flowing inline (no merge node)', () => {
    const branch = byId('proc-1');
    const child = byId('proc-1-processors-p0');
    // The branch is a compact split/marker card; its body processor flows inline to its
    // right (absolute, not nested). It does NOT get a separate merge node — the branch
    // node itself conveys the copy/merge, keeping the graph clean.
    expect(branch?.type).toBe('flowSplit');
    expect(child?.parentId).toBeUndefined();
    expect((child?.position.x ?? 0) > (branch?.position.x ?? 0)).toBe(true);
    expect(rfNodes.some((n) => n.id === 'proc-1-merge')).toBe(false);
  });

  it('annotates each top-level flow edge with the processor index an insertion there would use', () => {
    const spineIndices = rfEdges
      .map((e) => (e.data as { insertIndex?: number } | undefined)?.insertIndex)
      .filter((i): i is number => typeof i === 'number')
      .sort((a, b) => a - b);
    expect(spineIndices).toEqual([0, 1, 2]);
  });

  it('carries edit targets and metadata onto the flow nodes', () => {
    expect(byId('proc-0')?.data.editTarget).toEqual({ kind: 'processor', index: 0 });
    expect(byId('proc-0')?.data.meta).toEqual([{ label: 'message', value: 'hi' }]);
  });

  it('surfaces the `label:` on nested and container nodes, not just top-level leaves', () => {
    const labelled = `pipeline:
  processors:
    - label: top_branch
      branch:
        processors:
          - label: enrich_http
            http: { url: http://x }
output:
  drop: {}`;
    const laidOut = computeFlowLayout(parsePipelineFlowTree(labelled).nodes).rfNodes;
    const nodeData = (id: string) => laidOut.find((n) => n.id === id)?.data as { labelText?: string } | undefined;
    expect(nodeData('proc-0')?.labelText).toBe('top_branch'); // container
    expect(nodeData('proc-0-processors-p0')?.labelText).toBe('enrich_http'); // nested leaf
  });

  it('adds INPUT/PROCESSORS/OUTPUT section labels in the compact vertical lane only', () => {
    const verticalLabels = computeFlowLayout(
      parsePipelineFlowTree(BRANCHING_PIPELINE).nodes,
      new Set(),
      'vertical',
      true
    )
      .rfNodes.filter((n) => n.type === 'flowSectionLabel')
      .map((n) => (n.data as { label?: string }).label);
    expect(verticalLabels).toEqual(['INPUT', 'PROCESSORS', 'OUTPUT']);

    // The full horizontal canvas relies on per-card kind badges, not section labels.
    const horizontal = computeFlowLayout(parsePipelineFlowTree(BRANCHING_PIPELINE).nodes);
    expect(horizontal.rfNodes.some((n) => n.type === 'flowSectionLabel')).toBe(false);
  });

  it('stacks compact cards vertically on a straight axis in compact vertical mode', () => {
    const layout = computeFlowLayout(parsePipelineFlowTree(BRANCHING_PIPELINE).nodes, new Set(), 'vertical', true);
    const input = layout.rfNodes.find((n) => n.id === 'input-0');
    const output = layout.rfNodes.find((n) => n.id === 'output-0');
    // Compact rendering is flagged on the node data…
    expect(input?.data.compact).toBe(true);
    // …and top-level steps share the same x (vertical stack → straight connectors).
    expect(input?.position.x).toBe(0);
    expect(output?.position.x).toBe(0);
    // Vertically ordered: input above output.
    expect((input?.position.y ?? 0) < (output?.position.y ?? 0)).toBe(true);
  });

  it('gives a labeled compact card its own row for the label (reserves the extra height)', () => {
    const compactHeight = (yaml: string) =>
      computeFlowLayout(parsePipelineFlowTree(yaml).nodes, new Set(), 'vertical', true).height;
    const withLabel = compactHeight('input:\n  kafka_franz:\n    topics: [t]\n  label: my_in');
    const without = compactHeight('input:\n  kafka_franz:\n    topics: [t]');
    // The label sits on its own row beneath the name rather than being truncated
    // against it — so the compact card is exactly one row taller.
    expect(withLabel).toBe(without + 22);
  });

  it('always shows the full graph — collapse is not applied on the Dagre canvas', () => {
    // Collapse was dropped for the graph canvas: passing collapsedIds has no effect, so a
    // control-flow construct always renders its marker and body.
    const layout = computeFlowLayout(parsePipelineFlowTree(BRANCHING_PIPELINE).nodes, new Set(['proc-1']));
    expect(layout.rfNodes.find((n) => n.id === 'proc-1')?.type).toBe('flowSplit');
    expect(layout.rfNodes.some((n) => n.id === 'proc-1-processors-p0')).toBe(true);
  });

  it('places array resources in a lane below the flow', () => {
    const withCache = `${BRANCHING_PIPELINE}\ncache_resources:\n  - label: c\n    memory: {}`;
    const layout = computeFlowLayout(parsePipelineFlowTree(withCache).nodes);
    const resource = layout.rfNodes.find((n) => n.id === 'resource-cache_resources-0');
    expect(resource?.parentId).toBeUndefined();
    expect((resource?.position.y ?? 0) > 0).toBe(true);
  });

  it('keeps the resource lane near the main row in horizontal layout (cross-axis, not main-axis, offset)', () => {
    const withCache = `${BRANCHING_PIPELINE}\ncache_resources:\n  - label: c\n    memory: {}`;
    const layout = computeFlowLayout(parsePipelineFlowTree(withCache).nodes);
    const resource = layout.rfNodes.find((n) => n.id === 'resource-cache_resources-0');
    // The lane must drop by the cross-axis (height) extent, not the much larger
    // main-axis (width) extent — otherwise fitView zooms the whole graph out of view.
    expect(resource?.position.y ?? 0).toBeLessThan(layout.width);
    expect(layout.height).toBeLessThan(layout.width);
  });
});

describe('enhanced flow semantics', () => {
  const ENRICHMENT = `pipeline:
  processors:
    - cache: { resource: dedupe_cache, operator: add, key: x }
    - branch:
        request_map: 'root = this.user_id'
        processors:
          - http: { url: http://x }
        result_map: 'root.p = this'
    - try:
        - mapping: 'root = this'
    - catch:
        - log: { message: oops }
output:
  switch:
    cases:
      - check: 'errored()'
        output: { redpanda: { topic: dlq } }
      - output: { aws_s3: { bucket: b } }
cache_resources:
  - label: dedupe_cache
    redis: { url: x }`;

  const edges = () => computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes).rfEdges;
  const edge = (id: string) => edges().find((e) => e.id === id);
  const data = (id: string) => edge(id)?.data as { tone?: string; dashed?: boolean; label?: string } | undefined;

  it('renders a branch inline as a marker → body, with no copy/merge edges or merge node', () => {
    const layout = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    expect(layout.rfNodes.find((n) => n.id === 'proc-1')?.type).toBe('flowSplit');
    // No dashed copy/merge edges and no separate merge node — the branch flows inline.
    expect(layout.rfEdges.some((e) => e.id.startsWith('copy-') || e.id.startsWith('merge-'))).toBe(false);
    expect(layout.rfNodes.some((n) => n.id === 'proc-1-merge')).toBe(false);
    // Its body flows from the branch marker via a solid flow edge.
    const bodyEdge = layout.rfEdges.find((e) => e.source === 'proc-1' && e.target === 'proc-1-processors-p0');
    expect((bodyEdge?.data as { dashed?: boolean } | undefined)?.dashed).toBeFalsy();
  });

  it('labels switch fan-out edges with their routing condition, styled by branch (error vs normal)', () => {
    // The condition rides the fan-out edge (pure DAG, labels on edges); the error case is red.
    expect(data('fanout-output-switch-0')).toMatchObject({ tone: 'error', label: 'errored()' });
    expect(data('fanout-output-switch-1')).toMatchObject({ tone: 'primary', label: 'default' });

    const nodes = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes).rfNodes;
    const nodeData = (id: string) => nodes.find((n) => n.id === id)?.data as Record<string, unknown> | undefined;
    expect(nodeData('output-switch-0')).toMatchObject({ condition: 'errored()', isErrorPath: true });
    expect(nodeData('output-switch-1')).toMatchObject({ isDefault: true });
  });

  it('makes case conditions editable: fan-out edges carry a switchCase select target (processor AND output)', () => {
    const yaml = `pipeline:
  processors:
    - switch:
        - check: a == 1
          processors: [{ mapping: 'root = this' }]
output:
  switch:
    cases:
      - check: errored()
        output: { drop: {} }
      - output: { drop: {} }`;
    const layout = computeFlowLayout(parsePipelineFlowTree(yaml).nodes);
    const selectTarget = (id: string) =>
      (layout.rfEdges.find((e) => e.id === id)?.data as { selectTarget?: unknown }).selectTarget;
    // Processor switch case: clicking the condition edits the case.
    expect(selectTarget('fanout-proc-0-case-1')).toEqual({
      kind: 'switchCase',
      path: ['pipeline', 'processors', 0, 'switch', 0],
    });
    // Output switch cases — previously NOT editable; now the condition selects the case.
    expect(selectTarget('fanout-output-switch-0')).toEqual({
      kind: 'switchCase',
      path: ['output', 'switch', 'cases', 0],
    });
    expect(selectTarget('fanout-output-switch-1')).toEqual({
      kind: 'switchCase',
      path: ['output', 'switch', 'cases', 1],
    });
    // The output card itself still edits its output component.
    expect(
      (layout.rfNodes.find((n) => n.id === 'output-switch-0')?.data as { editTarget?: unknown }).editTarget
    ).toEqual({
      kind: 'path',
      path: ['output', 'switch', 'cases', 0, 'output'],
      componentType: 'output',
    });
  });

  it('renders an input broker as a labeled hub the inputs fan into, with an "Add input"', () => {
    const yaml = `input:
  broker:
    inputs:
      - generate: { mapping: 'root = {}' }
      - kafka_franz: { topics: [t] }
output:
  drop: {}`;
    const layout = computeFlowLayout(parsePipelineFlowTree(yaml).nodes, new Set(), 'horizontal', false, true);
    // The broker is a labeled hub node (not a generic merge dot); inputs fan into it.
    const hub = layout.rfNodes.find((n) => n.id === 'input-broker');
    expect(hub?.type).toBe('flowSplit');
    expect(layout.rfEdges.some((e) => e.id === 'fanin-input-broker-0' && e.target === 'input-broker')).toBe(true);
    // "Add input" is an affordance anchored to (just below) the broker hub, edit mode only.
    expect(layout.rfNodes.some((n) => n.id === 'input-broker-add' && n.type === 'flowInsert')).toBe(true);
  });

  it('pairs try→catch: the catch marker is an error path reached by a red "on error" edge', () => {
    const layout = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    // proc-2 = try, proc-3 = catch; they fuse into a success/error structure at a merge.
    expect(layout.rfNodes.find((n) => n.id === 'proc-3')?.data.isErrorPath).toBe(true);
    const onError = layout.rfEdges.find((e) => e.id === 'error-proc-2-proc-3');
    expect(onError).toMatchObject({ source: 'proc-2', target: 'proc-3' });
    expect((onError?.data as { tone?: string }).tone).toBe('error');
    expect(layout.rfNodes.some((n) => n.id === 'proc-2-merge' && n.type === 'flowMerge')).toBe(true);
  });

  it('draws no entry edges for sequential containers — containment shows the flow', () => {
    // The spine enters the box itself; an inner entry edge would render as an
    // unreadable stub in the narrow sequential inset.
    expect(edges().some((e) => e.id.startsWith('entry-'))).toBe(false);
  });

  it('gives nested components a path-based editTarget addressing their exact YAML location', () => {
    const { nodes } = parsePipelineFlowTree(ENRICHMENT);
    const byId = (id: string) => nodes.find((n) => n.id === id);
    // http inside the first branch.
    expect(byId('proc-1-processors-p0')?.editTarget).toEqual({
      kind: 'path',
      path: ['pipeline', 'processors', 1, 'branch', 'processors', 0],
      componentType: 'processor',
    });
    // An output inside the switch is editable as an output at its case path.
    expect(byId('output-switch-0')?.editTarget).toEqual({
      kind: 'path',
      path: ['output', 'switch', 'cases', 0, 'output'],
      componentType: 'output',
    });
    // Top-level processors keep the convenience index target.
    expect(byId('proc-0')?.editTarget).toEqual({ kind: 'processor', index: 0 });
  });

  it('renders a branch inline and fans an output switch from a split (no terminal merge)', () => {
    const layout = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    const find = (id: string) => layout.rfNodes.find((n) => n.id === id);
    // The branch is a compact marker with no merge node (it flows inline).
    expect(find('proc-1')?.type).toBe('flowSplit');
    expect(find('proc-1-merge')).toBeUndefined();
    // The output switch fans out from a split; its sinks terminate, so it has no merge.
    expect(find('output-switch')?.type).toBe('flowSplit');
    expect(find('output-switch-merge')).toBeUndefined();
  });

  it('draws dashed reference edges from a component to the resource it uses', () => {
    // Unlabeled — the legend documents the muted dashed line as "uses resource".
    expect(data('ref-proc-0-resource-cache_resources-0')).toMatchObject({ tone: 'muted', dashed: true });
    expect(data('ref-proc-0-resource-cache_resources-0')?.label).toBeUndefined();
  });

  it('connects an input to a cache referenced via a non-`resource` field (checkpoint_cache)', () => {
    // CDC inputs reference their checkpoint cache by a field named `checkpoint_cache`,
    // not `resource` — the edge must still be drawn from the input to the cache.
    const yaml = `input:
  mongodb_cdc:
    url: mongodb://x
    checkpoint_cache: cdc_checkpoint
output:
  drop: {}
cache_resources:
  - label: cdc_checkpoint
    memory: {}`;
    const layout = computeFlowLayout(parsePipelineFlowTree(yaml).nodes);
    const refEdge = layout.rfEdges.find((e) => e.id.startsWith('ref-') && e.source === 'input-0');
    expect(refEdge?.target).toBe('resource-cache_resources-0');
  });

  it('renders *_resources definitions and links resource: indirection to them', () => {
    // A fully resource-indirected pipeline (valid in Cloud): input/output/processor are
    // `resource:` references; the real components live in *_resources arrays.
    const yaml = `input:
  resource: my_input
pipeline:
  processors:
    - resource: my_proc
output:
  resource: my_output
input_resources:
  - label: my_input
    generate:
      mapping: 'root = {}'
processor_resources:
  - label: my_proc
    mapping: 'root = this'
output_resources:
  - label: my_output
    drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);

    // The three resource definitions render in the resource lane, inspectable via a
    // path edit target whose schema follows the matching component type.
    const inputRes = nodes.find((n) => n.id === 'resource-input_resources-0');
    expect(inputRes).toMatchObject({ section: 'resource', label: 'generate', labelText: 'my_input' });
    expect(inputRes?.editTarget).toEqual({ kind: 'path', path: ['input_resources', 0], componentType: 'input' });
    expect(nodes.find((n) => n.id === 'resource-processor_resources-0')?.editTarget).toEqual({
      kind: 'path',
      path: ['processor_resources', 0],
      componentType: 'processor',
    });
    expect(nodes.find((n) => n.id === 'resource-output_resources-0')?.editTarget).toEqual({
      kind: 'path',
      path: ['output_resources', 0],
      componentType: 'output',
    });

    // The references resolve (not dangling) and link to their definitions.
    const input = nodes.find((n) => n.id === 'input-0');
    expect(input?.resourceRef).toBe('my_input');
    expect(input?.danglingRef).toBeUndefined();
    expect(nodes.find((n) => n.id === 'proc-0')?.resourceRef).toBe('my_proc');
    expect(nodes.find((n) => n.id === 'output-0')?.resourceRef).toBe('my_output');

    const layout = computeFlowLayout(nodes);
    const refFromInput = layout.rfEdges.find((e) => e.id.startsWith('ref-') && e.source === 'input-0');
    expect(refFromInput?.target).toBe('resource-input_resources-0');
  });

  it('flags a resource: indirection with no matching *_resources entry as dangling', () => {
    const { nodes } = parsePipelineFlowTree(`input:
  resource: ghost
output:
  drop: {}`);
    expect(nodes.find((n) => n.id === 'input-0')).toMatchObject({ resourceRef: 'ghost', danglingRef: true });
  });

  it('marks switch cases as selectable wrappers that edit their routing condition', () => {
    const withSwitch = `pipeline:
  processors:
    - switch:
        - check: 'this.region == "eu"'
          processors: [{ mapping: 'root = this' }]
        - processors: [{ mapping: 'root = this' }]
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(withSwitch);
    const case1 = nodes.find((n) => n.id === 'proc-0-case-1');
    // The case is a wrapper flagged isCase, carrying its condition, and selectable via a
    // switchCase editTarget so the inspector can edit its `check`.
    expect(case1).toMatchObject({ isCase: true, condition: 'this.region == "eu"', parentId: 'proc-0' });
    expect(case1?.editTarget).toEqual({ kind: 'switchCase', path: ['pipeline', 'processors', 0, 'switch', 0] });
    // The default case carries no condition.
    expect(nodes.find((n) => n.id === 'proc-0-case-2')).toMatchObject({ isCase: true, isDefault: true });
    // The parent switch IS selectable.
    expect(nodes.find((n) => n.id === 'proc-0')?.editTarget).toBeDefined();
  });

  it('reconverges processor fans (fan-in per case) but not output fans (sinks terminate)', () => {
    const withProcessorSwitch = `pipeline:
  processors:
    - switch:
        - check: a == 1
          processors: [{ mapping: 'root = this' }]
        - processors: [{ log: { message: hi } }]
output:
  switch:
    cases:
      - check: errored()
        output: { redpanda: { topic: dlq } }
      - output: { drop: {} }`;
    const layout = computeFlowLayout(parsePipelineFlowTree(withProcessorSwitch).nodes);
    // Each processor case fans out AND back in to the merge — the data continues onward.
    expect(layout.rfEdges.filter((e) => e.id.startsWith('fanin-proc-0-case-'))).toHaveLength(2);
    expect(layout.rfNodes.some((n) => n.id === 'proc-0-merge' && n.type === 'flowMerge')).toBe(true);
    // Output cases terminate at their sinks — no fan-in, no merge node.
    expect(layout.rfEdges.some((e) => e.id.startsWith('fanin-output-switch'))).toBe(false);
    expect(layout.rfNodes.some((n) => n.id === 'output-switch-merge')).toBe(false);
  });

  it('gives each reference edge its own bus lane so cables never overlap', () => {
    const twoResources = `pipeline:
  processors:
    - rate_limit: { resource: lim }
    - cache: { resource: c, operator: get }
output:
  drop: {}
rate_limit_resources:
  - label: lim
    local: { count: 1, interval: 1s }
cache_resources:
  - label: c
    memcached: { addresses: ['m:11211'] }`;
    const refEdges = computeFlowLayout(parsePipelineFlowTree(twoResources).nodes).rfEdges.filter((e) =>
      e.id.startsWith('ref-')
    );
    // One dashed/muted reference edge per resource, to distinct targets.
    expect(refEdges).toHaveLength(2);
    expect(new Set(refEdges.map((e) => e.target)).size).toBe(2);
    for (const e of refEdges) {
      expect(e.data).toMatchObject({ tone: 'muted', dashed: true });
    }
  });

  it('draws a reference edge from each resource user to its resource', () => {
    // A branch holding two resource users: the cables attach to the actual inner nodes.
    const shared = `pipeline:
  processors:
    - branch:
        processors:
          - cache: { resource: c, operator: get }
          - rate_limit: { resource: lim }
output:
  drop: {}
cache_resources:
  - label: c
    memcached: { addresses: ['m:11211'] }
rate_limit_resources:
  - label: lim
    local: { count: 1, interval: 1s }`;
    const refEdges = computeFlowLayout(parsePipelineFlowTree(shared).nodes).rfEdges.filter((e) =>
      e.id.startsWith('ref-')
    );
    expect(refEdges).toHaveLength(2);
    // Distinct sources (the two inner processors) and distinct targets.
    expect(new Set(refEdges.map((e) => e.source)).size).toBe(2);
    expect(new Set(refEdges.map((e) => e.target)).size).toBe(2);
  });

  it('fans every switch case out to its own labelled edge and back to the merge', () => {
    const fourCases = `pipeline:
  processors:
    - switch:
        - check: a == 1
          processors: [{ mapping: 'root = this' }]
        - check: a == 2
          processors: [{ mapping: 'root = this' }]
        - check: a == 3
          processors: [{ mapping: 'root = this' }]
        - processors: [{ mapping: 'root = this' }]
output:
  drop: {}`;
    const layout = computeFlowLayout(parsePipelineFlowTree(fourCases).nodes);
    // Four fan-out edges (each labelled with its routing condition / default) and four
    // fan-in edges back to the switch's merge node.
    for (const i of [1, 2, 3, 4]) {
      const out = layout.rfEdges.find((e) => e.id === `fanout-proc-0-case-${i}`);
      expect(out).toBeDefined();
      expect((out?.data as { label?: string }).label).toBeTruthy();
      expect(layout.rfEdges.some((e) => e.id === `fanin-proc-0-case-${i}`)).toBe(true);
    }
    expect(layout.rfNodes.some((n) => n.id === 'proc-0-merge' && n.type === 'flowMerge')).toBe(true);
  });

  it('routes the reference cable as a dashed dependency from the user bottom into the resource top', () => {
    const refEdge = edge('ref-proc-0-resource-cache_resources-0');
    // A dependency cable, not flow output: it leaves the user's BOTTOM and enters the
    // resource's TOP, styled as a muted dashed context line.
    expect(refEdge?.sourceHandle).toBe('b');
    expect(refEdge?.targetHandle).toBe('t');
    expect(refEdge?.type).toBe('flowGraphEdge');
    expect(refEdge?.data).toMatchObject({ tone: 'muted', dashed: true });
  });

  it('places a referenced resource below its user, near its x', () => {
    // Resources are dependencies laid out below the flow, near their user's x (not a far
    // bottom-left row, and not out to the right in the flow).
    const layout = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    const resource = layout.rfNodes.find((n) => n.id === 'resource-cache_resources-0');
    const user = layout.rfNodes.find((n) => n.id === 'proc-0');
    expect(resource).toBeDefined();
    // Below the user (its dependency hangs underneath), at roughly the same x.
    expect((resource?.position.y ?? 0) > (user?.position.y ?? 0)).toBe(true);
    expect(Math.abs((resource?.position.x ?? 0) - (user?.position.x ?? 0))).toBeLessThan(40);
  });

  it('connects a reference to the exact nested node that uses the resource', () => {
    const nested = `pipeline:
  processors:
    - branch:
        processors:
          - cache: { resource: dedupe_cache, operator: add }
output:
  drop: {}
cache_resources:
  - label: dedupe_cache
    redis: { url: x }`;
    const layout = computeFlowLayout(parsePipelineFlowTree(nested).nodes);
    // The cable attaches to the actual nested cache that uses the resource (not the branch).
    expect(layout.rfEdges.find((e) => e.id.startsWith('ref-'))?.source).toBe('proc-0-processors-p0');
  });

  it('gives nested containers insert slots and switches an add-case slot', () => {
    const yaml = `pipeline:
  processors:
    - switch:
        - check: a == 1
          processors:
            - mapping: 'root = this'
        - processors: []
    - branch:
        processors:
          - mapping: 'root = that'
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const byId = (id: string) => nodes.find((n) => n.id === id);

    // The switch node can append a structural case.
    expect(byId('proc-0')?.addChildSlot).toEqual({
      containerPath: ['pipeline', 'processors', 0, 'switch'],
      section: 'processor',
    });
    // Each case (including the empty second one) accepts processor inserts.
    expect(byId('proc-0-case-1')?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 0, 'switch', 0, 'processors'],
      accepts: 'processor',
    });
    expect(byId('proc-0-case-2')?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 0, 'switch', 1, 'processors'],
      accepts: 'processor',
    });
    // The branch container (derived in the post-pass) accepts processor inserts.
    const branch = nodes.find((n) => n.kind === 'group' && n.label === 'branch');
    expect(branch?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 1, 'branch', 'processors'],
      accepts: 'processor',
    });
  });

  it('derives an input broker insert slot that accepts inputs', () => {
    const yaml = `input:
  broker:
    inputs:
      - generate: { mapping: 'root = {}' }
      - kafka: { topics: [t] }
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const broker = nodes.find((n) => n.kind === 'group' && n.label === 'broker');
    expect(broker?.insertSlot).toEqual({ containerPath: ['input', 'broker', 'inputs'], accepts: 'input' });
  });

  it('renders an empty broker output as a fillable group, not a dead-end leaf', () => {
    const yaml = `output:
  broker:
    pattern: fan_out
    outputs: []`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const broker = nodes.find((n) => n.section === 'output' && n.label === 'broker');
    expect(broker).toMatchObject({ id: 'output-broker', kind: 'group', editTarget: { kind: 'output' } });
    expect(broker?.insertSlot).toEqual({ containerPath: ['output', 'broker', 'outputs'], accepts: 'output' });
    // No phantom child nodes for the empty array.
    expect(nodes.filter((n) => n.parentId === 'output-broker')).toHaveLength(0);
  });

  it('gives an empty output switch an add-case slot accepting outputs', () => {
    const yaml = `output:
  switch:
    cases: []`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const sw = nodes.find((n) => n.section === 'output' && n.label === 'switch');
    expect(sw).toMatchObject({ id: 'output-switch', kind: 'group' });
    expect(sw?.addChildSlot).toEqual({ containerPath: ['output', 'switch', 'cases'], section: 'output' });
  });

  it('gives an empty input broker (no inputs key yet) an insert slot', () => {
    const yaml = `input:
  broker: {}
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const broker = nodes.find((n) => n.section === 'input' && n.label === 'broker');
    expect(broker).toMatchObject({ id: 'input-broker', kind: 'group' });
    expect(broker?.insertSlot).toEqual({ containerPath: ['input', 'broker', 'inputs'], accepts: 'input' });
  });

  it('gives empty processor containers (try, branch) insert slots', () => {
    const yaml = `pipeline:
  processors:
    - try: []
    - branch:
        request_map: 'root = this'
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const tryNode = nodes.find((n) => n.kind === 'group' && n.label === 'try');
    expect(tryNode?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 0, 'try'],
      accepts: 'processor',
    });
    const branch = nodes.find((n) => n.kind === 'group' && n.label === 'branch');
    expect(branch?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 1, 'branch', 'processors'],
      accepts: 'processor',
    });
  });

  it('flags dangling resource references and counts resource usage', () => {
    const yaml = `pipeline:
  processors:
    - cache: { resource: dedupe, operator: get }
    - cache: { resource: dedupe, operator: add }
    - rate_limit: { resource: ghost }
output:
  drop: {}
cache_resources:
  - label: dedupe
    memory: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    // `ghost` has no matching resource → dangling.
    const ghost = nodes.find((n) => n.resourceRef === 'ghost');
    expect(ghost?.danglingRef).toBe(true);
    // `dedupe` resolves → not dangling, and used by 2 components.
    const dedupeUser = nodes.find((n) => n.resourceRef === 'dedupe');
    expect(dedupeUser?.danglingRef).toBeUndefined();
    const resource = nodes.find((n) => n.section === 'resource' && n.labelText === 'dedupe');
    expect(resource?.usedByCount).toBe(2);
  });

  it('keeps the compact lane minimal: no reference, fan-out, or branch copy/merge edges', () => {
    const compact = computeFlowLayout(parsePipelineFlowTree(ENRICHMENT).nodes, new Set(), 'vertical', true).rfEdges;
    // The minimal sidebar overview draws only the spine + nested sequential chains.
    expect(compact.some((e) => e.id.startsWith('ref-'))).toBe(false);
    expect(compact.some((e) => e.id.startsWith('fanout-'))).toBe(false);
    expect(compact.some((e) => e.id.startsWith('copy-') || e.id.startsWith('merge-'))).toBe(false);
    expect(compact.some((e) => e.id.startsWith('fanin-'))).toBe(false);
    // Only the vertical spine connecting top-level steps remains.
    expect(compact.some((e) => e.type === 'flowSpine')).toBe(true);
  });
});

describe('data-flow model', () => {
  it('orders the main path input → processors → output', () => {
    const yaml = `input:
  generate: {}
pipeline:
  processors:
    - log: {}
    - mapping: 'root = this'
output:
  drop: {}`;
    const seq = mainFlowSequence(parsePipelineFlowTree(yaml).nodes).map((n) => n.id);
    expect(seq).toEqual(['input-0', 'proc-0', 'proc-1', 'output-0']);
  });

  it('resolves the main sequence even when node IDs are prefixed (mini lane)', () => {
    const yaml = `input:
  kafka: {}
pipeline:
  processors:
    - log: {}
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml, { idPrefix: 'm1' });
    const seq = mainFlowSequence(nodes).map((n) => n.id);
    expect(seq).toEqual(['m1-input-0', 'm1-proc-0', 'm1-output-0']);
  });

  it('chains a sequential sub-pipeline (branch processors)', () => {
    const yaml = `pipeline:
  processors:
    - branch:
        processors:
          - mapping: 'root = 1'
          - log: {}`;
    const conns = subFlowConnections(parsePipelineFlowTree(yaml).nodes);
    expect(conns).toContainEqual({ from: 'proc-0', to: 'proc-0-processors-p0' });
    expect(conns).toContainEqual({ from: 'proc-0-processors-p0', to: 'proc-0-processors-p1' });
  });

  it('feeds multiple inputs into their broker (fan-in)', () => {
    const yaml = `input:
  broker:
    inputs:
      - generate: {}
      - kafka: {}`;
    const conns = subFlowConnections(parsePipelineFlowTree(yaml).nodes);
    // Each child input flows INTO the broker, not the other way around.
    expect(conns).toContainEqual({ from: 'input-broker-0', to: 'input-broker' });
    expect(conns).toContainEqual({ from: 'input-broker-1', to: 'input-broker' });
    expect(conns).not.toContainEqual({ from: 'input-broker', to: 'input-broker-0' });
  });

  it('fans out parallel branches (switch cases) instead of chaining them', () => {
    const yaml = `pipeline:
  processors:
    - switch:
        - check: 'a'
          processors:
            - mapping: 'root = 1'
        - check: 'b'
          processors:
            - mapping: 'root = 2'`;
    const conns = subFlowConnections(parsePipelineFlowTree(yaml).nodes);
    // The switch fans out to each case…
    expect(conns).toContainEqual({ from: 'proc-0', to: 'proc-0-case-1' });
    expect(conns).toContainEqual({ from: 'proc-0', to: 'proc-0-case-2' });
    // …and the cases are NOT chained to one another.
    expect(conns).not.toContainEqual({ from: 'proc-0-case-1', to: 'proc-0-case-2' });
    // Each case still chains its own processors.
    expect(conns).toContainEqual({ from: 'proc-0-case-1', to: 'proc-0-case-1-p0' });
  });
});

describe('summarizeComponent', () => {
  it('surfaces preferred fields for known components', () => {
    expect(summarizeComponent('log', { level: 'INFO', message: 'hi' })).toEqual([
      { label: 'level', value: 'INFO' },
      { label: 'message', value: 'hi' },
    ]);
  });

  it('handles bare-string configs like mappings', () => {
    expect(summarizeComponent('mapping', 'root = this.foo')).toEqual([{ label: 'expr', value: 'root = this.foo' }]);
  });

  it('falls back to the first scalar fields for unknown components', () => {
    const meta = summarizeComponent('mystery', { label: 'x', alpha: 1, beta: 'two', nested: {} });
    expect(meta).toEqual([
      { label: 'alpha', value: '1' },
      { label: 'beta', value: 'two' },
    ]);
  });

  it('omits topic(s) from meta — they render as chips instead', () => {
    expect(summarizeComponent('redpanda', { topics: ['orders'], consumer_group: 'g1' })).toEqual([
      { label: 'group', value: 'g1' },
    ]);
    expect(summarizeComponent('redpanda', { topic: 'orders' })).toEqual([]);
  });

  it('surfaces role-appropriate fields across input/processor/output/resource', () => {
    expect(summarizeComponent('aws_s3', { bucket: 'b', prefix: 'p/', region: 'us' })).toEqual([
      { label: 'bucket', value: 'b' },
      { label: 'prefix', value: 'p/' },
    ]);
    expect(summarizeComponent('sql_insert', { driver: 'postgres', table: 'events' })).toEqual([
      { label: 'driver', value: 'postgres' },
      { label: 'table', value: 'events' },
    ]);
    // rate_limit `local` engine — count is the key fact.
    expect(summarizeComponent('local', { count: 1000, interval: '1s' })).toEqual([
      { label: 'count', value: '1000' },
      { label: 'interval', value: '1s' },
    ]);
  });

  it('shortens verbose keys and prefers identifying fields in the fallback', () => {
    expect(summarizeComponent('kafka_franz', { consumer_group: 'g' })).toEqual([{ label: 'group', value: 'g' }]);
    // Unknown component: salient-named fields win over a leading boolean.
    expect(summarizeComponent('mystery_conn', { enabled: true, host: 'h1', retries: 3 })).toEqual([
      { label: 'host', value: 'h1' },
    ]);
  });

  it('surfaces the model for AI components and the key field for vector / cloud sinks', () => {
    expect(summarizeComponent('openai_chat_completion', { model: 'gpt-4o', api_key: 'sk-xyz' })).toEqual([
      { label: 'model', value: 'gpt-4o' },
    ]);
    expect(summarizeComponent('qdrant', { collection_name: 'docs', grpc_host: 'x' })).toEqual([
      { label: 'collection', value: 'docs' },
    ]);
    expect(summarizeComponent('gcp_bigquery', { dataset: 'analytics', table: 'events' })).toEqual([
      { label: 'dataset', value: 'analytics' },
      { label: 'table', value: 'events' },
    ]);
  });

  it('never surfaces credentials or generic infra knobs as fallback meta', () => {
    // An unmapped component: `model` (salient) wins; api_key / region are skipped.
    expect(summarizeComponent('mystery_ai', { model: 'foo', api_key: 'secret', region: 'us' })).toEqual([
      { label: 'model', value: 'foo' },
    ]);
    // All-noise config yields nothing rather than leaking a secret-ish field name.
    expect(summarizeComponent('mystery_creds', { api_key: 'x', region: 'us', tls: true })).toEqual([]);
  });
});
