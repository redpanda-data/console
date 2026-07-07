import { describe, expect, it } from 'vitest';

import { summarizeComponent } from './pipeline-flow-meta';
import { computeGraphLayout, isConfigTextEmpty, mainFlowSequence, parsePipelineFlowTree } from './pipeline-flow-parser';

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

  it('makes component-shaped singleton resources (buffer/metrics/tracer) editable via a path target', () => {
    const { nodes } = parsePipelineFlowTree('buffer:\n  memory:\n    limit: 1000');
    const buffer = nodes.find((n) => n.id === 'resource-buffer');
    expect(buffer).toMatchObject({
      kind: 'leaf',
      label: 'buffer',
      section: 'resource',
      editTarget: { kind: 'path', path: ['buffer'], componentType: 'buffer' },
    });
    // Surface the impl as meta so the card isn't blank.
    expect(buffer?.meta?.length).toBeGreaterThan(0);
  });

  it('keeps non-component config blocks (logger) display-only', () => {
    const { nodes } = parsePipelineFlowTree('logger:\n  level: INFO');
    const logger = nodes.find((n) => n.id === 'resource-logger');
    expect(logger).toMatchObject({ kind: 'leaf', label: 'logger', section: 'resource' });
    expect(logger?.editTarget).toBeUndefined();
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
    // The fallback grows by appending a tier — an "Add output" affordance on the group.
    expect(outputNodes[1].insertSlot).toEqual({ containerPath: ['output', 'fallback'], accepts: 'output' });
    // Later tiers route "on failure" of the prior; tier 0 is the primary (no condition).
    expect(outputNodes[2]).not.toHaveProperty('isErrorPath', true);
    expect(outputNodes[3]).toMatchObject({ condition: 'on failure', isErrorPath: true });
  });

  it('fans a nested fallback (a switch case output) into its own split with per-tier edges', () => {
    const yaml = `
output:
  switch:
    cases:
      - output:
          fallback:
            - gcp_pubsub:
                project: my-project
            - redpanda:
                topic: orders-fallback
`;
    const layout = computeGraphLayout(parsePipelineFlowTree(yaml).nodes);
    const find = (id: string) => layout.rfNodes.find((n) => n.id === id);
    // The fallback case output becomes its own split marker (not a leaf), fanning to its tiers.
    expect(find('output-switch-0')?.type).toBe('flowSplit');
    expect(find('output-switch-0-0')?.type).toBe('flowCard');
    expect(find('output-switch-0-1')?.type).toBe('flowCard');
    // The second tier's fan-out edge is the red "on failure" route.
    const tier1 = layout.rfEdges.find((e) => e.id === 'fanout-output-switch-0-1');
    expect((tier1?.data as { tone?: string }).tone).toBe('error');
  });

  it('expands a container nested as an output member into its own branching subtree', () => {
    const yaml = `
output:
  switch:
    cases:
      - check: this.region == "us"
        output:
          aws_s3:
            bucket: my-bucket
      - output:
          fallback:
            - gcp_pubsub:
                project: my-project
            - redpanda:
                topic: orders-fallback
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const byId = (id: string) => nodes.find((n) => n.id === id);
    // A plain member keeps its own config summary leaf.
    expect(byId('output-switch-0')).toMatchObject({
      kind: 'leaf',
      label: 'aws_s3',
      meta: [{ label: 'bucket', value: 'my-bucket' }],
    });
    // A container member becomes a fan-out group (not a summary leaf) with editable members.
    expect(byId('output-switch-1')).toMatchObject({
      kind: 'group',
      label: 'fallback',
      childFlow: 'parallel',
      insertSlot: { containerPath: ['output', 'switch', 'cases', 1, 'output', 'fallback'], accepts: 'output' },
    });
    expect(byId('output-switch-1-0')).toMatchObject({
      kind: 'leaf',
      label: 'gcp_pubsub',
      parentId: 'output-switch-1',
      editTarget: {
        kind: 'path',
        path: ['output', 'switch', 'cases', 1, 'output', 'fallback', 0],
        componentType: 'output',
      },
    });
    expect(byId('output-switch-1-1')).toMatchObject({
      kind: 'leaf',
      label: 'redpanda',
      parentId: 'output-switch-1',
      isErrorPath: true,
      condition: 'on failure',
      editTarget: {
        kind: 'path',
        path: ['output', 'switch', 'cases', 1, 'output', 'fallback', 1],
        componentType: 'output',
      },
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

  it('parses group_by processor as case groups (not "check" leaves)', () => {
    const yaml = `
pipeline:
  processors:
    - group_by:
        - check: 'this.type == "a"'
          processors:
            - mapping: 'root = this.a'
        - check: 'this.type == "b"'
          processors:
            - mapping: 'root = this.b'
`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const procNodes = nodes.filter((n) => n.section === 'processor' && n.kind !== 'section');
    // group_by(group) -> case0(group) -> mapping(leaf), case1(group) -> mapping(leaf)
    expect(procNodes.find((n) => n.id === 'proc-0')).toMatchObject({ kind: 'group', label: 'group_by' });
    expect(procNodes.filter((n) => n.kind === 'group' && n.parentId === 'proc-0')).toHaveLength(2);
    // The leaves are the real mapping processors, not the case `check` strings.
    const leaves = procNodes.filter((n) => n.kind === 'leaf');
    expect(leaves).toHaveLength(2);
    expect(leaves.map((n) => n.label)).toEqual(['mapping', 'mapping']);
    // The case carries an editable routing condition, not a broken processor edit target.
    const firstCase = procNodes.find((n) => n.kind === 'group' && n.parentId === 'proc-0');
    expect(firstCase?.caseEditTarget?.kind).toBe('switchCase');
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
    // Top-level cached is a leaf; unwrapping only triggers via the parseBranchingKeys path.
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
    const card = computeGraphLayout(nodes).rfNodes.find((n) => n.id === leaf?.id);
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

describe('computeGraphLayout', () => {
  const { nodes } = parsePipelineFlowTree(BRANCHING_PIPELINE);
  const { rfNodes, rfEdges } = computeGraphLayout(nodes);
  const byId = (id: string) => rfNodes.find((n) => n.id === id);

  it('lays the input → processors → output spine left-to-right on the main row', () => {
    const input = byId('input-0');
    const log = byId('proc-0');
    const branch = byId('proc-1');
    const output = byId('output-0');
    // Dagre lays the DAG left→right: top-level steps are absolutely positioned at increasing x.
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
    // The branch is a compact split; its body flows inline to the right (absolute, not nested)
    // with no separate merge node — the marker itself conveys the copy/merge.
    expect(branch?.type).toBe('flowSplit');
    expect(child?.parentId).toBeUndefined();
    expect((child?.position.x ?? 0) > (branch?.position.x ?? 0)).toBe(true);
    expect(rfNodes.some((n) => n.id === 'proc-1-merge')).toBe(false);
  });

  it('source-aligns fanned cases: a short case hugs the split, not the merge', () => {
    // The short (1-step) case must sit near the split, not packed against the merge with the long case.
    const yaml = `pipeline:
  processors:
    - switch:
        - check: 'this.x == 1'
          processors:
            - log:
                message: short
        - check: 'this.x == 2'
          processors:
            - mapping: 'root.a = 1'
            - mapping: 'root.b = 2'
            - mapping: 'root.c = 3'
output:
  drop: {}`;
    const parsed = parsePipelineFlowTree(yaml);
    const laid = computeGraphLayout(parsed.nodes).rfNodes;
    const labelOf = (n: (typeof laid)[number]) => (n.data as { label?: string }).label;
    const mappingXs = laid.filter((n) => labelOf(n) === 'mapping').map((n) => n.position.x);
    const logX = laid.find((n) => labelOf(n) === 'log')?.position.x ?? 0;
    const minMapX = Math.min(...mappingXs);
    const maxMapX = Math.max(...mappingXs);
    // The short (log) case starts in the left half (by the split), not at the far right by the merge.
    expect(maxMapX).toBeGreaterThan(minMapX);
    expect(logX - minMapX).toBeLessThan((maxMapX - minMapX) / 2);
  });

  it('renders group_by as a routing fan (split → cases → merge) with condition chips on the entries', () => {
    const yaml = `pipeline:
  processors:
    - group_by:
        - check: 'this.type == "a"'
          processors:
            - mapping: 'root = this.a'
        - check: 'this.type == "b"'
          processors:
            - mapping: 'root = this.b'
output:
  drop: {}`;
    const laid = computeGraphLayout(parsePipelineFlowTree(yaml).nodes).rfNodes;
    const at = (id: string) => laid.find((n) => n.id === id);
    // The group_by is a compact split marker and its cases reconverge at a merge (a fan, not a chain).
    expect(at('proc-0')?.type).toBe('flowSplit');
    expect(laid.some((n) => n.id === 'proc-0-merge')).toBe(true);
    // Each case's entry card carries the editable routing condition (chip), like a switch case.
    const entry = at('proc-0-case-1-p0')?.data as
      | { condition?: string; caseEditTarget?: { kind?: string } }
      | undefined;
    expect(entry?.condition).toBe('this.type == "a"');
    expect(entry?.caseEditTarget?.kind).toBe('switchCase');
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
    const laidOut = computeGraphLayout(parsePipelineFlowTree(labelled).nodes).rfNodes;
    const nodeData = (id: string) => laidOut.find((n) => n.id === id)?.data as { labelText?: string } | undefined;
    expect(nodeData('proc-0')?.labelText).toBe('top_branch'); // container
    expect(nodeData('proc-0-processors-p0')?.labelText).toBe('enrich_http'); // nested leaf
  });

  it('places array resources in a lane below the flow', () => {
    const withCache = `${BRANCHING_PIPELINE}\ncache_resources:\n  - label: c\n    memory: {}`;
    const layout = computeGraphLayout(parsePipelineFlowTree(withCache).nodes);
    const resource = layout.rfNodes.find((n) => n.id === 'resource-cache_resources-0');
    expect(resource?.parentId).toBeUndefined();
    expect((resource?.position.y ?? 0) > 0).toBe(true);
  });

  it('keeps the resource lane near the main row in horizontal layout (cross-axis, not main-axis, offset)', () => {
    const withCache = `${BRANCHING_PIPELINE}\ncache_resources:\n  - label: c\n    memory: {}`;
    const layout = computeGraphLayout(parsePipelineFlowTree(withCache).nodes);
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

  const edges = () => computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes).rfEdges;
  const edge = (id: string) => edges().find((e) => e.id === id);
  const data = (id: string) => edge(id)?.data as { tone?: string; dashed?: boolean; label?: string } | undefined;

  it('renders a branch inline as a marker → body, with no copy/merge edges or merge node', () => {
    const layout = computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    expect(layout.rfNodes.find((n) => n.id === 'proc-1')?.type).toBe('flowSplit');
    // No dashed copy/merge edges and no separate merge node — the branch flows inline.
    expect(layout.rfEdges.some((e) => e.id.startsWith('copy-') || e.id.startsWith('merge-'))).toBe(false);
    expect(layout.rfNodes.some((n) => n.id === 'proc-1-merge')).toBe(false);
    // Its body flows from the branch marker via a solid flow edge.
    const bodyEdge = layout.rfEdges.find((e) => e.source === 'proc-1' && e.target === 'proc-1-processors-p0');
    expect((bodyEdge?.data as { dashed?: boolean } | undefined)?.dashed).toBeFalsy();
  });

  it('moves the switch routing condition onto the case node (chip), styling the fan-out edge by branch', () => {
    // The condition lives on the case node; the fan-out edge is styled by branch (error=red), no label.
    expect(data('fanout-output-switch-0')).toMatchObject({ tone: 'error' });
    expect((data('fanout-output-switch-0') as { label?: string }).label).toBeUndefined();
    expect((data('fanout-output-switch-1') as { label?: string }).label).toBeUndefined();

    const nodes = computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes).rfNodes;
    const nodeData = (id: string) => nodes.find((n) => n.id === id)?.data as Record<string, unknown> | undefined;
    expect(nodeData('output-switch-0')).toMatchObject({ condition: 'errored()', isErrorPath: true });
    expect(nodeData('output-switch-1')).toMatchObject({ isDefault: true });
    // The condition is editable from the node — its chip carries the switchCase edit target.
    expect((nodeData('output-switch-0') as { caseEditTarget?: { kind?: string } }).caseEditTarget?.kind).toBe(
      'switchCase'
    );
  });

  it('makes case conditions editable from the case NODE (processor AND output switch carry the switchCase target)', () => {
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
    const layout = computeGraphLayout(parsePipelineFlowTree(yaml).nodes);
    // The condition chip lives on the case's entry node with a switchCase target. Node ids vary, so match by path.
    const caseNode = (path: (string | number)[]) =>
      layout.rfNodes.find((n) => {
        const t = (n.data as { caseEditTarget?: { kind?: string; path?: (string | number)[] } }).caseEditTarget;
        return t?.kind === 'switchCase' && JSON.stringify(t.path) === JSON.stringify(path);
      });
    // Processor switch case body's first node carries the case target.
    expect(caseNode(['pipeline', 'processors', 0, 'switch', 0])).toBeDefined();
    // Output switch cases carry it on their output node.
    expect(caseNode(['output', 'switch', 'cases', 0])).toBeDefined();
    expect(caseNode(['output', 'switch', 'cases', 1])).toBeDefined();
    // The output card itself still edits its output component (a separate target on the same node).
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
    const layout = computeGraphLayout(parsePipelineFlowTree(yaml).nodes, true);
    // The broker is a labeled hub node (not a generic merge dot); inputs fan into it.
    const hub = layout.rfNodes.find((n) => n.id === 'input-broker');
    expect(hub?.type).toBe('flowSplit');
    expect(layout.rfEdges.some((e) => e.id === 'fanin-input-broker-0' && e.target === 'input-broker')).toBe(true);
    // "Add input" is a footer affordance inside the hub (an `addAction`), not a separate flowInsert node.
    expect((hub?.data as { addAction?: { label?: string } }).addAction?.label).toBe('Add input');
    expect(layout.rfNodes.some((n) => n.id === 'input-broker-add')).toBe(false);
  });

  it('pairs try→catch: the catch marker is an error path reached by a red "on error" edge', () => {
    const layout = computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    // proc-2 = try, proc-3 = catch; they fuse into a success/error structure at a merge.
    expect(layout.rfNodes.find((n) => n.id === 'proc-3')?.data.isErrorPath).toBe(true);
    const onError = layout.rfEdges.find((e) => e.id === 'error-proc-2-proc-3');
    expect(onError).toMatchObject({ source: 'proc-2', target: 'proc-3' });
    expect((onError?.data as { tone?: string }).tone).toBe('error');
    expect(layout.rfNodes.some((n) => n.id === 'proc-2-merge' && n.type === 'flowMerge')).toBe(true);
  });

  it('draws no entry edges for sequential containers — containment shows the flow', () => {
    // The spine enters the box itself; an inner entry edge would be an unreadable stub.
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
    const layout = computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
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
    // CDC inputs name their cache via `checkpoint_cache`, not `resource` — the edge must still be drawn.
    const yaml = `input:
  mongodb_cdc:
    url: mongodb://x
    checkpoint_cache: cdc_checkpoint
output:
  drop: {}
cache_resources:
  - label: cdc_checkpoint
    memory: {}`;
    const layout = computeGraphLayout(parsePipelineFlowTree(yaml).nodes);
    const refEdge = layout.rfEdges.find((e) => e.id.startsWith('ref-') && e.source === 'input-0');
    expect(refEdge?.target).toBe('resource-cache_resources-0');
  });

  it('renders *_resources definitions and links resource: indirection to them', () => {
    // Fully resource-indirected pipeline (valid in Cloud): components live in *_resources arrays.
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

    // Resource definitions render in the lane, inspectable via a path target typed by component.
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

    const layout = computeGraphLayout(nodes);
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
    // The case is an isCase wrapper carrying its condition, selectable via a switchCase target.
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
    const layout = computeGraphLayout(parsePipelineFlowTree(withProcessorSwitch).nodes);
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
    const refEdges = computeGraphLayout(parsePipelineFlowTree(twoResources).nodes).rfEdges.filter((e) =>
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
    const refEdges = computeGraphLayout(parsePipelineFlowTree(shared).nodes).rfEdges.filter((e) =>
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
    const layout = computeGraphLayout(parsePipelineFlowTree(fourCases).nodes);
    // Four fan-out edges and four fan-in edges back to the switch's merge node.
    for (const i of [1, 2, 3, 4]) {
      expect(layout.rfEdges.some((e) => e.id === `fanout-proc-0-case-${i}`)).toBe(true);
      expect(layout.rfEdges.some((e) => e.id === `fanin-proc-0-case-${i}`)).toBe(true);
    }
    expect(layout.rfNodes.some((n) => n.id === 'proc-0-merge' && n.type === 'flowMerge')).toBe(true);
    // The routing condition rides each case's entry NODE (a chip), not a floating edge label.
    const conditions = layout.rfNodes
      .map((n) => (n.data as { condition?: string }).condition)
      .filter((c): c is string => Boolean(c));
    expect(conditions).toEqual(expect.arrayContaining(['a == 1', 'a == 2', 'a == 3']));
  });

  it('routes the reference cable as a dashed dependency from the user bottom into the resource top', () => {
    const refEdge = edge('ref-proc-0-resource-cache_resources-0');
    // A dependency cable (not flow output): user BOTTOM → resource TOP, muted dashed.
    expect(refEdge?.sourceHandle).toBe('b');
    expect(refEdge?.targetHandle).toBe('t');
    expect(refEdge?.type).toBe('flowGraphEdge');
    expect(refEdge?.data).toMatchObject({ tone: 'muted', dashed: true });
  });

  it('places a referenced resource below its user, near its x', () => {
    // Resources lay out below the flow, near their user's x.
    const layout = computeGraphLayout(parsePipelineFlowTree(ENRICHMENT).nodes);
    const resource = layout.rfNodes.find((n) => n.id === 'resource-cache_resources-0');
    const user = layout.rfNodes.find((n) => n.id === 'proc-0');
    expect(resource).toBeDefined();
    // Below the user, at roughly the same x.
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
    const layout = computeGraphLayout(parsePipelineFlowTree(nested).nodes);
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
    // The branch container accepts processor inserts.
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

  it('never links a cache reference to a same-labelled rate_limit resource', () => {
    const yaml = `pipeline:
  processors:
    - cache: { resource: shared, operator: add, key: x }
output:
  drop: {}
rate_limit_resources:
  - label: shared
    local: { count: 1 }`;
    const { nodes } = parsePipelineFlowTree(yaml);
    expect(nodes.find((n) => n.id === 'proc-0')).toMatchObject({ resourceRef: 'shared', danglingRef: true });
    expect(nodes.find((n) => n.id === 'resource-rate_limit_resources-0')?.usedByCount).toBe(0);
    const layout = computeGraphLayout(nodes);
    expect(layout.rfEdges.some((e) => e.id.startsWith('ref-'))).toBe(false);
  });

  it('links same-labelled cache and rate_limit references each to their own kind', () => {
    const yaml = `pipeline:
  processors:
    - cache: { resource: shared, operator: add, key: x }
    - rate_limit: { resource: shared }
output:
  drop: {}
cache_resources:
  - label: shared
    memory: {}
rate_limit_resources:
  - label: shared
    local: { count: 1 }`;
    const { nodes } = parsePipelineFlowTree(yaml);
    expect(nodes.find((n) => n.id === 'resource-cache_resources-0')?.usedByCount).toBe(1);
    expect(nodes.find((n) => n.id === 'resource-rate_limit_resources-0')?.usedByCount).toBe(1);
    const layout = computeGraphLayout(nodes);
    expect(layout.rfEdges.some((e) => e.id === 'ref-proc-0-resource-cache_resources-0')).toBe(true);
    expect(layout.rfEdges.some((e) => e.id === 'ref-proc-1-resource-rate_limit_resources-0')).toBe(true);
  });

  it('renders a check-only switch case (no processors key) with its condition and an add slot', () => {
    const yaml = `pipeline:
  processors:
    - switch:
        - check: 'this.x == 1'
        - processors:
            - mapping: 'root = this'
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const case1 = nodes.find((n) => n.id === 'proc-0-case-1');
    expect(case1).toMatchObject({ isCase: true, condition: 'this.x == 1' });
    expect(case1?.insertSlot).toEqual({
      containerPath: ['pipeline', 'processors', 0, 'switch', 0, 'processors'],
      accepts: 'processor',
    });
    expect(nodes.find((n) => n.id === 'proc-0-case-2')).toMatchObject({ isCase: true, isDefault: true });
  });

  it('resolves << merge keys so merged fields render on the component', () => {
    const yaml = `defaults: &d
  topics: [orders]
input:
  kafka:
    <<: *d
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const input = nodes.find((n) => n.id === 'input-0');
    expect(input?.label).toBe('kafka');
    expect(input?.topics).toEqual(['orders']);
    expect(input?.missingTopic).toBeUndefined();
  });

  it('falls back to the placeholder node when input/output are unrenderable arrays', () => {
    const { nodes } = parsePipelineFlowTree('input: []\noutput: [1, 2]');
    expect(nodes.find((n) => n.id === 'input-placeholder')).toMatchObject({ kind: 'leaf', label: 'none' });
    expect(nodes.find((n) => n.id === 'output-placeholder')).toMatchObject({ kind: 'leaf', label: 'none' });
  });

  it('carries YAML indices (not rendered positions) on insert edges when unparseable entries sit in the list', () => {
    const yaml = `input:
  generate: {}
pipeline:
  processors:
    - null
    - mapping: 'root = this'
    - log: { message: hi }
output:
  drop: {}`;
    const layout = computeGraphLayout(parsePipelineFlowTree(yaml).nodes);
    const insertIndex = (source: string, target: string) =>
      (layout.rfEdges.find((e) => e.source === source && e.target === target)?.data as { insertIndex?: number })
        ?.insertIndex;
    expect(insertIndex('input-0', 'proc-1')).toBe(1);
    expect(insertIndex('proc-1', 'proc-2')).toBe(2);
    expect(insertIndex('proc-2', 'output-0')).toBe(3);
  });

  it('keeps original YAML indices in NESTED edit targets when unparseable entries sit in the list', () => {
    const yaml = `pipeline:
  processors:
    - switch:
        - check: 'this.x == 1'
          processors:
            - null
            - mapping: 'root = this'
output:
  drop: {}`;
    const { nodes } = parsePipelineFlowTree(yaml);
    const mapping = nodes.find((n) => n.label === 'mapping');
    // The mapping is index 1; its edit target must not compact past the unparseable `- null`, or edits land wrong.
    expect(mapping?.editTarget).toMatchObject({
      kind: 'path',
      path: ['pipeline', 'processors', 0, 'switch', 0, 'processors', 1],
    });
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
});

describe('isConfigTextEmpty', () => {
  it('treats a blank or whitespace-only config as empty', () => {
    expect(isConfigTextEmpty('')).toBe(true);
    expect(isConfigTextEmpty('   \n\t\n  ')).toBe(true);
  });

  it('treats a comments-only config as empty', () => {
    expect(isConfigTextEmpty('# just a note\n  # indented note\n')).toBe(true);
  });

  it('treats any real content as non-empty', () => {
    expect(isConfigTextEmpty('input:\n  generate: {}')).toBe(false);
    // A trailing comment on a content line does not make the config empty.
    expect(isConfigTextEmpty('foo: bar # note')).toBe(false);
    // Structurally-invalid-but-present text is still non-empty (so no template offer).
    expect(isConfigTextEmpty('not-a-pipeline: true')).toBe(false);
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
