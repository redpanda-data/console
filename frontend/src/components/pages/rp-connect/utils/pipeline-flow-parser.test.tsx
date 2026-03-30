import { describe, expect, it } from 'vitest';

import { computeTreeLayout, parsePipelineFlowTree } from './pipeline-flow-parser';

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

  it('creates parent-child edges', () => {
    const yaml = 'input:\n  kafka: {}';
    const { nodes } = parsePipelineFlowTree(yaml);
    const { rfEdges } = computeTreeLayout(nodes);

    // section-input→input-0 + section-output→output-placeholder + section-to-section edge
    const treeEdges = rfEdges.filter((e) => e.type === 'treeEdge');
    expect(treeEdges.find((e) => e.source === 'section-input' && e.target === 'input-0')).toBeDefined();
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

  it('caps visual indent depth so deeply nested nodes do not overflow', () => {
    // Triple-nested switch produces ~7 visual depth levels
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

    // MAX_INDENT_DEPTH=5, INDENT_X=40, ROOT_X=8 → max X = 8 + 5*40 = 208
    const maxX = Math.max(...rfNodes.map((n) => n.position.x));
    expect(maxX).toBeLessThanOrEqual(208);
    // Verify the deeply nested mapping leaf is present (parsing not truncated)
    expect(rfNodes.some((n) => n.data.label === 'mapping')).toBe(true);
  });
});
