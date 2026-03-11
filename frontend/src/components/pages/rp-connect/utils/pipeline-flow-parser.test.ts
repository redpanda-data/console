import { describe, expect, test } from 'vitest';

import {
  computeTreeLayout,
  extractAllTopics,
  parsePipelineFlowTree,
  type TreeGroup,
  type TreeLeaf,
} from './pipeline-flow-parser';

// ---------------------------------------------------------------------------
// parsePipelineFlowTree
// ---------------------------------------------------------------------------

describe('parsePipelineFlowTree', () => {
  test('returns empty sections for empty string', () => {
    expect(parsePipelineFlowTree('')).toEqual({ sections: [] });
  });

  test('returns empty sections for invalid YAML', () => {
    expect(parsePipelineFlowTree('{{not valid')).toEqual({ sections: [] });
  });

  test('parses simple input → processor → output', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - mapping: 'root = this'

output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    expect(tree.sections).toHaveLength(3);

    const [input, processor, output] = tree.sections;
    expect(input?.section).toBe('input');
    expect(input?.label).toBe('Input');
    expect(input?.children).toHaveLength(1);
    expect((input?.children[0] as TreeLeaf).name).toBe('generate');

    expect(processor?.section).toBe('processor');
    expect(processor?.children).toHaveLength(1);
    expect((processor?.children[0] as TreeLeaf).name).toBe('mapping');

    expect(output?.section).toBe('output');
    expect(output?.children).toHaveLength(1);
    expect((output?.children[0] as TreeLeaf).name).toBe('drop');
  });

  test('parses broker input with child inputs', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka:
          addresses: [localhost:9092]
          topics: [events]
      - amqp_0_9:
          urls: [amqp://localhost:5672/]
          queue: orders

output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const inputSection = tree.sections[0];
    expect(inputSection?.children).toHaveLength(1);

    const group = inputSection?.children[0] as TreeGroup;
    expect(group.kind).toBe('group');
    expect(group.name).toBe('broker');
    expect(group.children).toHaveLength(2);
    expect((group.children[0] as TreeLeaf).name).toBe('kafka');
    expect((group.children[1] as TreeLeaf).name).toBe('amqp_0_9');
  });

  test('parses sequence input with child inputs', () => {
    const yaml = `
input:
  sequence:
    inputs:
      - file:
          paths: [./data.csv]
      - generate:
          count: 1
          mapping: 'root = {}'

output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.kind).toBe('group');
    expect(group.name).toBe('sequence');
    expect(group.children).toHaveLength(2);
  });

  test('parses broker output with child outputs', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  broker:
    pattern: fan_out
    outputs:
      - kafka:
          addresses: [localhost:9092]
          topic: topic_a
      - http_client:
          url: http://example.com
`;
    const tree = parsePipelineFlowTree(yaml);
    const outputSection = tree.sections.find((s) => s.section === 'output');
    const group = outputSection?.children[0] as TreeGroup;
    expect(group.kind).toBe('group');
    expect(group.name).toBe('broker');
    expect(group.children).toHaveLength(2);
    expect((group.children[0] as TreeLeaf).name).toBe('kafka');
    expect((group.children[1] as TreeLeaf).name).toBe('http_client');
  });

  test('parses switch output with case outputs', () => {
    const yaml = `
output:
  switch:
    cases:
      - check: this.type == "foo"
        output:
          amqp_1:
            urls: [amqps://localhost:5672/]
      - output:
          redis_streams:
            url: tcp://localhost:6379
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('switch');
    expect(group.children).toHaveLength(2);
  });

  test('parses fallback output', () => {
    const yaml = `
output:
  fallback:
    - http_client:
        url: http://foo:4195/post
    - file:
        path: /tmp/failed.jsonl
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('fallback');
    expect(group.children).toHaveLength(2);
  });

  test('parses nested processors (branch)', () => {
    const yaml = `
pipeline:
  processors:
    - branch:
        request_map: 'root = this.id'
        processors:
          - http:
              url: http://example.com
        result_map: 'root.enriched = this'
`;
    const tree = parsePipelineFlowTree(yaml);
    const procSection = tree.sections[0];
    const group = procSection?.children[0] as TreeGroup;
    expect(group.kind).toBe('group');
    expect(group.name).toBe('branch');
    expect(group.children).toHaveLength(1);
    expect((group.children[0] as TreeLeaf).name).toBe('http');
  });

  test('parses nested processors (catch)', () => {
    const yaml = `
pipeline:
  processors:
    - catch:
        - log:
            level: ERROR
            message: 'failed'
        - mapping: 'root = deleted()'
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('catch');
    expect(group.children).toHaveLength(2);
  });

  test('parses nested processors (switch)', () => {
    const yaml = `
pipeline:
  processors:
    - switch:
        - check: this.type == "foo"
          processors:
            - mapping: 'root = "foo"'
        - check: this.type == "bar"
          processors:
            - mapping: 'root = "bar"'
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('switch');
    expect(group.children).toHaveLength(2);
  });

  test('parses nested processors (try)', () => {
    const yaml = `
pipeline:
  processors:
    - try:
        - mapping: 'root = this.uppercase()'
        - resource: foo_processor
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('try');
    expect(group.children).toHaveLength(2);
  });

  test('parses nested processors (while)', () => {
    const yaml = `
pipeline:
  processors:
    - while:
        check: 'this.count < 10'
        processors:
          - mapping: 'root.count = this.count + 1'
`;
    const tree = parsePipelineFlowTree(yaml);
    const group = tree.sections[0]?.children[0] as TreeGroup;
    expect(group.name).toBe('while');
    expect(group.children).toHaveLength(1);
  });

  test('parses multiple processors', () => {
    const yaml = `
pipeline:
  processors:
    - mapping: 'root = this'
    - log:
        level: INFO
        message: processed
    - catch:
        - log:
            level: ERROR
            message: failed
`;
    const tree = parsePipelineFlowTree(yaml);
    const procSection = tree.sections[0];
    expect(procSection?.children).toHaveLength(3);
    expect((procSection?.children[0] as TreeLeaf).kind).toBe('leaf');
    expect((procSection?.children[0] as TreeLeaf).name).toBe('mapping');
    expect((procSection?.children[1] as TreeLeaf).name).toBe('log');
    expect((procSection?.children[2] as TreeGroup).kind).toBe('group');
  });

  test('handles config with only input and output (no processors)', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    expect(tree.sections).toHaveLength(2);
    expect(tree.sections[0]?.section).toBe('input');
    expect(tree.sections[1]?.section).toBe('output');
  });

  test('handles config with only output', () => {
    const yaml = `
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    expect(tree.sections).toHaveLength(1);
    expect(tree.sections[0]?.section).toBe('output');
  });

  test('handles labels on components', () => {
    const yaml = `
input:
  label: "my_input"
  kafka:
    addresses: [localhost:9092]
    topics: [events]

output:
  label: "my_output"
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const inputLeaf = tree.sections[0]?.children[0] as TreeLeaf;
    expect(inputLeaf.name).toBe('kafka');
    const outputLeaf = tree.sections[1]?.children[0] as TreeLeaf;
    expect(outputLeaf.name).toBe('drop');
  });
});

// ---------------------------------------------------------------------------
// computeTreeLayout
// ---------------------------------------------------------------------------

describe('computeTreeLayout', () => {
  test('returns empty for empty tree', () => {
    const result = computeTreeLayout({ sections: [] });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  test('produces nodes and edges for simple pipeline', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - mapping: 'root = this'
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const { nodes, edges } = computeTreeLayout(tree);

    // 3 sections + 3 leaves = 6 nodes
    expect(nodes).toHaveLength(6);

    // Section-to-section edges (input→processor, processor→output)
    const sectionEdges = edges.filter((e) => e.type === 'sectionEdge');
    expect(sectionEdges).toHaveLength(2);
  });

  test('produces group nodes for broker input', () => {
    const yaml = `
input:
  broker:
    inputs:
      - kafka:
          addresses: [localhost:9092]
      - amqp_0_9:
          urls: [amqp://localhost:5672/]
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const { nodes } = computeTreeLayout(tree);

    const groupNodes = nodes.filter((n) => n.type === 'treeGroup');
    expect(groupNodes).toHaveLength(1);

    const leafNodes = nodes.filter((n) => n.type === 'treeLeaf');
    expect(leafNodes).toHaveLength(3); // kafka, amqp_0_9, drop
  });

  test('all nodes have positions', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const { nodes } = computeTreeLayout(tree);

    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  test('sections are laid out horizontally', () => {
    const yaml = `
input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - mapping: 'root = this'
output:
  drop: {}
`;
    const tree = parsePipelineFlowTree(yaml);
    const { nodes } = computeTreeLayout(tree);

    const sectionNodes = nodes.filter((n) => n.type === 'treeSection');
    expect(sectionNodes).toHaveLength(3);

    // Each section should have a greater x than the previous
    for (let i = 1; i < sectionNodes.length; i++) {
      expect(sectionNodes[i]!.position.x).toBeGreaterThan(sectionNodes[i - 1]!.position.x);
    }
  });
});

// ---------------------------------------------------------------------------
// extractAllTopics
// ---------------------------------------------------------------------------

describe('extractAllTopics', () => {
  test('returns empty for empty string', () => {
    expect(extractAllTopics('')).toEqual([]);
  });

  test('returns empty for invalid YAML', () => {
    expect(extractAllTopics('{{not valid')).toEqual([]);
  });

  test('extracts topic from kafka input', () => {
    const yaml = `
input:
  kafka:
    addresses: [localhost:9092]
    topics:
      - events
      - orders
`;
    expect(extractAllTopics(yaml)).toEqual(['events', 'orders']);
  });

  test('extracts topic from kafka output', () => {
    const yaml = `
output:
  kafka:
    addresses: [localhost:9092]
    topic: processed_events
`;
    expect(extractAllTopics(yaml)).toEqual(['processed_events']);
  });

  test('extracts topics from multiple components', () => {
    const yaml = `
input:
  kafka:
    topics:
      - input_topic
output:
  kafka:
    topic: output_topic
`;
    const topics = extractAllTopics(yaml);
    expect(topics).toContain('input_topic');
    expect(topics).toContain('output_topic');
  });

  test('deduplicates topics', () => {
    const yaml = `
input:
  kafka:
    topics:
      - shared_topic
output:
  kafka:
    topic: shared_topic
`;
    expect(extractAllTopics(yaml)).toEqual(['shared_topic']);
  });
});
