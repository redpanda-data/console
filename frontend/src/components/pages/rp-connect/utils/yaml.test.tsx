import { describe, expect, test } from 'vitest';

import { mockComponents } from './__fixtures__/component-schemas';
import { schemaToConfig } from './schema';
import {
  applyRedpandaSetup,
  configToYaml,
  extractAllTopics,
  generateYamlFromWizardData,
  getConnectTemplate,
  mergeConnectConfigs,
  parseConfigComponents,
  patchRedpandaConfig,
} from './yaml';
import type { ConnectComponentSpec } from '../types/schema';

describe('yaml utils for creating connect configs', () => {
  describe('YAML spacing for merged components', () => {
    test('should add newline between root-level items when adding cache', () => {
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}`;

      const cacheSpec = mockComponents.memoryCache;
      if (!cacheSpec) {
        throw new Error('memory cache not found');
      }

      const result = schemaToConfig(cacheSpec, false);
      if (!result) {
        throw new Error('Failed to generate cache config');
      }

      const { config: newConfig } = result;
      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      expect(yamlString).toContain('output:\n  drop: {}\n\ncache_resources:');
    });

    test('should add newline between root-level items when adding processor', () => {
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'`;

      const processorSpec = mockComponents.bloblangProcessor;
      if (!processorSpec) {
        throw new Error('bloblang processor not found');
      }

      const result = schemaToConfig(processorSpec, false);
      if (!result) {
        throw new Error('Failed to generate processor config');
      }

      const { config: newConfig } = result;
      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      expect(yamlString).toContain("input:\n  generate:\n    mapping: 'root = {}'\n\npipeline:");
    });
  });

  describe('YAML comment generation', () => {
    test('should add comments to required fields', () => {
      const spec = {
        name: 'test_output',
        type: 'output',
        plugin: false,
        config: {
          name: 'root',
          type: 'object',
          kind: 'scalar',
          children: [
            {
              name: 'required_field',
              type: 'string',
              kind: 'scalar',
              optional: false,
            },
          ],
        },
      } as unknown as ConnectComponentSpec;

      const result = schemaToConfig(spec, false);
      if (!result) {
        throw new Error('Failed to generate config');
      }

      const { config } = result;
      const yaml = configToYaml(config, spec);

      // Sentinel is converted to comment-only line (no key-value pair)
      expect(yaml).not.toMatch(/^\s*required_field:/m);
      expect(yaml).toContain('# required_field: Required - string, must be manually set');
    });

    test('should add comments to critical connection fields', () => {
      const kafkaSpec = mockComponents.kafkaOutput;

      if (!kafkaSpec) {
        throw new Error('kafka output not found');
      }

      const result = schemaToConfig(kafkaSpec, false);
      if (!result) {
        throw new Error('Failed to generate kafka config');
      }

      const { config } = result;
      const yaml = configToYaml(config, kafkaSpec);

      // Scalar required fields become comment-only lines
      expect(yaml).toContain('# topic: Required - string, must be manually set');
      // Required array fields with empty-string default also become comment-only lines
      expect(yaml).toContain('# addresses: Required - string list, must be manually set');
      expect(yaml).not.toMatch(/^\s*addresses:/m);
    });

    test('should not add comments to parent objects but should add to arrays', () => {
      const kafkaSpec = mockComponents.kafkaOutput;

      if (!kafkaSpec) {
        throw new Error('kafka output not found');
      }

      const result = schemaToConfig(kafkaSpec, false);
      if (!result) {
        throw new Error('Failed to generate kafka config');
      }

      const { config } = result;
      const yaml = configToYaml(config, kafkaSpec);

      // Parent objects like tls should not have inline comments
      const lines = yaml.split('\n');
      const tlsLineIndex = lines.findIndex((line) => line.trim().startsWith('tls:'));

      if (tlsLineIndex !== -1) {
        const tlsLine = lines[tlsLineIndex];
        // For Redpanda components, TLS now renders as a parent object with enabled: true
        // tls: line should not have an inline comment
        expect(tlsLine.trim()).not.toContain('#');
      }

      // Required array fields with empty-string default also become comment-only lines
      expect(yaml).toContain('# addresses: Required - string list, must be manually set');
      expect(yaml).not.toMatch(/^\s*addresses:/m);
    });

    test('should add comments to redpanda_common component (input type path)', () => {
      const redpandaCommonSpec = mockComponents.redpandaCommonInput;

      if (!redpandaCommonSpec) {
        throw new Error('redpanda_common input not found');
      }

      const result = schemaToConfig(redpandaCommonSpec, false);
      if (!result) {
        throw new Error('Failed to generate redpanda_common config');
      }

      const { config, spec } = result;
      const yaml = configToYaml(config, spec);

      // redpanda_common uses [componentSpec.type, componentName] path
      expect(yaml).toContain('input:');
      expect(yaml).toContain('redpanda_common:');
      // Required array field should become comment-only
      expect(yaml).toContain('# topics: Required - string list, must be manually set');
    });

    test('should not comment out metadata children when parent is optional (ancestor-optional)', () => {
      const redpandaOutputSpec = mockComponents.redpandaOutput;

      const result = schemaToConfig(redpandaOutputSpec, false);
      if (!result) {
        throw new Error('Failed to generate redpanda output config');
      }

      const { config, spec } = result;
      const yaml = configToYaml(config, spec);

      // topic IS required (no optional ancestor) → commented out
      expect(yaml).toContain('# topic: Required - string, must be manually set');

      // metadata children are NOT required (parent metadata is optional)
      // They should appear as normal YAML keys, not as comment-only lines
      expect(yaml).toMatch(/^\s+include_prefixes:/m);
      expect(yaml).toMatch(/^\s+include_patterns:/m);
      expect(yaml).not.toContain('# include_prefixes: Required');
      expect(yaml).not.toContain('# include_patterns: Required');
    });

    test('should preserve existing comments and add comments to merged component', () => {
      // Start with a simple input
      const inputYaml = `input:
  generate:
    mapping: "" # Existing comment`;

      // Now merge in an output component
      const kafkaOutputSpec = mockComponents.kafkaOutput;
      if (!kafkaOutputSpec) {
        throw new Error('kafka output not found');
      }

      const mergedYaml = getConnectTemplate({
        connectionName: 'kafka',
        connectionType: 'output',
        components: Object.values(mockComponents),
        existingYaml: inputYaml,
      });

      // Should preserve existing input comments
      expect(mergedYaml).toContain('# Existing comment');

      // Should have the output section
      expect(mergedYaml).toContain('output:');
      expect(mergedYaml).toContain('kafka:');

      // Required fields become comment-only lines in merged output
      expect(mergedYaml).toContain('# topic: Required - string, must be manually set');
    });
  });
});

// ============================================================================
// parseConfigComponents
// ============================================================================

describe('parseConfigComponents', () => {
  describe('single input', () => {
    test('parses a simple generate input', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['generate']);
    });

    test('parses a kafka input', () => {
      const yaml = `
input:
  kafka:
    addresses:
      - localhost:9092
    topics:
      - my_topic
    consumer_group: my_group

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['kafka']);
    });
  });

  describe('broker input (multiple inputs from docs)', () => {
    test('extracts child inputs from broker with amqp and kafka', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/inputs/broker/
      const yaml = `
input:
  broker:
    copies: 1
    inputs:
      - amqp_0_9:
          urls:
            - amqp://guest:guest@localhost:5672/
          consumer_tag: benthos-consumer
          queue: benthos-queue
        processors:
          - mapping: |
              root.message = this
              root.meta.link_count = this.links.length()
              root.user.age = this.user.age.number()

      - kafka:
          addresses:
            - localhost:9092
          client_id: benthos_kafka_input
          consumer_group: benthos_consumer_group
          topics:
            - "benthos_stream:0"

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['amqp_0_9', 'kafka']);
    });

    test('handles broker with empty inputs array', () => {
      const yaml = `
input:
  broker:
    copies: 1
    inputs: []

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual([]);
    });
  });

  describe('sequence input (multiple inputs from docs)', () => {
    test('extracts child inputs from sequence with file and generate', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/inputs/sequence/
      const yaml = `
input:
  sequence:
    inputs:
      - file:
          paths:
            - ./dataset.csv
          scanner:
            csv: {}
      - generate:
          count: 1
          mapping: 'root = {"status":"finished"}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['file', 'generate']);
    });

    test('extracts child inputs from sequence with sharded join', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/inputs/sequence/
      const yaml = `
input:
  sequence:
    sharded_join:
      type: full-outer
      id_path: uuid
      iterations: 10
      merge_strategy: array
    inputs:
      - file:
          paths:
            - ./main.csv
          scanner:
            csv: {}
      - file:
          paths:
            - ./hobbies.ndjson
          scanner:
            lines: {}
        processors:
          - mapping: |
              root.uuid = this.document.uuid
              root.hobbies = this.document.hobbies.map_each(this.type)

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['file', 'file']);
    });
  });

  describe('single output', () => {
    test('parses a simple kafka output', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  kafka:
    addresses:
      - localhost:9092
    topic: my_topic
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['generate']);
      expect(result.outputs).toEqual(['kafka']);
    });

    test('parses a drop output', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['drop']);
    });
  });

  describe('broker output (fan_out pattern from docs)', () => {
    test('extracts child outputs from broker with resource outputs', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/outputs/broker/
      const yaml = `
output:
  broker:
    pattern: fan_out
    outputs:
      - resource: foo
      - resource: bar
        processors:
          - resource: bar_processor

  processors:
    - resource: general_processor
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['resource', 'resource']);
    });

    test('extracts mixed child outputs from broker', () => {
      const yaml = `
output:
  broker:
    pattern: fan_out
    outputs:
      - kafka:
          addresses:
            - localhost:9092
          topic: topic_a
      - http_client:
          url: http://example.com/post
      - amqp_1:
          urls:
            - amqps://guest:guest@localhost:5672/
          target_address: queue:/my_queue
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['kafka', 'http_client', 'amqp_1']);
    });

    test('handles broker with empty outputs array', () => {
      const yaml = `
output:
  broker:
    pattern: fan_out
    outputs: []
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual([]);
    });

    test('handles broker with batching config', () => {
      const yaml = `
output:
  broker:
    pattern: fan_out
    outputs:
      - kafka:
          addresses:
            - localhost:9092
          topic: topic_a
      - redis_streams:
          url: tcp://localhost:6379
          stream: my_stream
    batching:
      count: 10
      period: 1s
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['kafka', 'redis_streams']);
    });
  });

  describe('switch output', () => {
    test('extracts outputs from switch cases', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/outputs/switch/
      const yaml = `
output:
  switch:
    cases:
      - check: this.type == "foo"
        output:
          amqp_1:
            urls:
              - amqps://guest:guest@localhost:5672/
            target_address: queue:/the_foos

      - check: this.type == "bar"
        output:
          gcp_pubsub:
            project: dealing_with_mike
            topic: mikes_bars

      - output:
          redis_streams:
            url: tcp://localhost:6379
            stream: everything_else
          processors:
            - mapping: |
                root = this
                root.type = this.type | "unknown"
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['amqp_1', 'gcp_pubsub', 'redis_streams']);
    });

    test('handles switch with continue flag', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/outputs/switch/
      const yaml = `
output:
  switch:
    cases:
      - check: 'this.user.interests.contains("walks").catch(false)'
        output:
          amqp_1:
            urls:
              - amqps://guest:guest@localhost:5672/
            target_address: queue:/people_what_think_good
        continue: true

      - check: 'this.user.dislikes.contains("videogames").catch(false)'
        output:
          gcp_pubsub:
            project: people
            topic: that_i_dont_want_to_hang_with
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['amqp_1', 'gcp_pubsub']);
    });
  });

  describe('fallback output', () => {
    test('extracts outputs from fallback with http_client and file', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/outputs/fallback/
      const yaml = `
output:
  fallback:
    - http_client:
        url: http://foo:4195/post/might/become/unreachable
        retries: 3
        retry_period: 1s
    - http_client:
        url: http://bar:4196/somewhere/else
        retries: 3
        retry_period: 1s
      processors:
        - mapping: 'root = "failed to send this message to foo: " + content()'
    - file:
        path: /usr/local/benthos/everything_failed.jsonl
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['http_client', 'http_client', 'file']);
    });

    test('extracts outputs from fallback with dynamodb and file', () => {
      // From https://docs.redpanda.com/redpanda-connect/components/outputs/fallback/
      const yaml = `
output:
  fallback:
    - aws_dynamodb:
        table: foo
        string_columns:
          id: '\${!json("id")}'
          content: '\${!content()}'
        batching:
          count: 10
          period: 1s
    - file:
        path: /usr/local/benthos/failed_stuff.jsonl
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['aws_dynamodb', 'file']);
    });
  });

  describe('processors', () => {
    test('parses mapping processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - mapping: |
        root.doc = this.without("id")
        root.timestamp = now()

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['mapping']);
    });

    test('parses log processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - log:
        level: INFO
        message: 'received message: \${!this}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['log']);
    });

    test('parses switch processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - switch:
        - check: this.type == "foo"
          processors:
            - mapping: 'root = "is foo"'
        - check: this.type == "bar"
          processors:
            - mapping: 'root = "is bar"'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['switch']);
    });

    test('parses resource processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - resource: my_processor

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['resource']);
    });

    test('parses catch processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - catch:
        - log:
            level: ERROR
            message: 'processing failed: \${!error()}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['catch']);
    });

    test('parses try processor', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - try:
        - mapping: 'root = this.uppercase()'
        - resource: foo_processor

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['try']);
    });

    test('parses multiple processors in pipeline', () => {
      const yaml = `
input:
  kafka:
    addresses:
      - localhost:9092
    topics:
      - my_topic

pipeline:
  processors:
    - mapping: |
        root = this
        root.processed = true
    - log:
        level: DEBUG
        message: 'processing message'
    - switch:
        - check: this.type == "important"
          processors:
            - resource: priority_handler
    - catch:
        - log:
            level: ERROR
            message: 'failed: \${!error()}'
    - try:
        - resource: enricher
    - resource: finalizer

output:
  kafka:
    addresses:
      - localhost:9092
    topic: output_topic
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['kafka']);
      expect(result.processors).toEqual(['mapping', 'log', 'switch', 'catch', 'try', 'resource']);
      expect(result.outputs).toEqual(['kafka']);
    });
  });

  describe('label sibling handling', () => {
    test('skips label on single input and returns component name', () => {
      const yaml = `
input:
  label: ""
  generate:
    mapping: ""
    interval: 1s
    count: 0
    batch_size: 0

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['generate']);
    });

    test('skips label on single output and returns component name', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  label: ""
  redpanda:
    topic: test
    key: ""
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['redpanda']);
    });

    test('skips label on both input and output', () => {
      const yaml = `
input:
  label: ""
  generate:
    mapping: ""
    interval: 1s
    count: 0
    batch_size: 0
    auto_replay_nacks: false

output:
  label: ""
  redpanda:
    tls:
      client_certs:
        - key: ""
          password: \${secrets.KAFKA_PASSWORD_USER}
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER_USER}
        password: \${secrets.KAFKA_PASSWORD_USER}
    topic: test
    key: ""
    partition: ""
    max_in_flight: 0
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['generate']);
      expect(result.outputs).toEqual(['redpanda']);
    });

    test('skips label on processor items', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

pipeline:
  processors:
    - label: "enrichment"
      branch:
        request_map: 'root = this.doc.id'
        processors:
          - http:
              url: http://example.com
        result_map: 'root.enriched = this'
    - label: "transform"
      mapping: 'root.processed = true'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual(['branch', 'mapping']);
    });

    test('skips label on broker child inputs', () => {
      const yaml = `
input:
  broker:
    inputs:
      - label: "source_a"
        kafka:
          addresses:
            - localhost:9092
          topics:
            - events
      - label: "source_b"
        amqp_0_9:
          urls:
            - amqp://guest:guest@localhost:5672/
          queue: orders

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['kafka', 'amqp_0_9']);
    });

    test('skips label on broker child outputs', () => {
      const yaml = `
output:
  broker:
    pattern: fan_out
    outputs:
      - label: "primary"
        kafka:
          addresses:
            - localhost:9092
          topic: topic_a
      - label: "secondary"
        http_client:
          url: http://example.com/post
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['kafka', 'http_client']);
    });

    test('skips label on fallback child outputs', () => {
      const yaml = `
output:
  fallback:
    - label: "primary"
      http_client:
        url: http://foo:4195/post
        retries: 3
    - label: "backup"
      file:
        path: /usr/local/benthos/failed.jsonl
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['http_client', 'file']);
    });

    test('skips label on switch case outputs', () => {
      const yaml = `
output:
  switch:
    cases:
      - check: this.type == "foo"
        output:
          label: "foo_output"
          amqp_1:
            urls:
              - amqps://guest:guest@localhost:5672/
            target_address: queue:/the_foos
      - check: this.type == "bar"
        output:
          label: "bar_output"
          gcp_pubsub:
            project: dealing_with_mike
            topic: mikes_bars
`;
      const result = parseConfigComponents(yaml);
      expect(result.outputs).toEqual(['amqp_1', 'gcp_pubsub']);
    });

    test('full pipeline with labels everywhere', () => {
      const yaml = `
input:
  label: "my_input"
  broker:
    inputs:
      - label: "source_1"
        kafka:
          addresses:
            - localhost:9092
          topics:
            - events
      - label: "source_2"
        generate:
          mapping: 'root = {}'

pipeline:
  processors:
    - label: "step_1"
      mapping: 'root.processed = true'
    - label: "step_2"
      branch:
        request_map: 'root = this.id'
        processors:
          - http:
              url: http://example.com
        result_map: 'root.enriched = this'

output:
  label: "my_output"
  broker:
    pattern: fan_out
    outputs:
      - label: "dest_1"
        kafka:
          addresses:
            - localhost:9092
          topic: processed_events
      - label: "dest_2"
        http_client:
          url: http://example.com/webhook
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['kafka', 'generate']);
      expect(result.processors).toEqual(['mapping', 'branch']);
      expect(result.outputs).toEqual(['kafka', 'http_client']);
    });
  });

  describe('edge cases', () => {
    test('returns empty for empty string', () => {
      const result = parseConfigComponents('');
      expect(result).toEqual({ inputs: [], processors: [], outputs: [] });
    });

    test('returns empty for invalid YAML', () => {
      const result = parseConfigComponents('{{{{not valid yaml');
      expect(result).toEqual({ inputs: [], processors: [], outputs: [] });
    });

    test('handles config with no output', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['generate']);
      expect(result.outputs).toEqual([]);
      expect(result.processors).toEqual([]);
    });

    test('handles config with no processors', () => {
      const yaml = `
input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}
`;
      const result = parseConfigComponents(yaml);
      expect(result.processors).toEqual([]);
    });

    test('handles config with no input', () => {
      const yaml = `
output:
  drop: {}

pipeline:
  processors:
    - mapping: 'root = this'
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual([]);
      expect(result.processors).toEqual(['mapping']);
      expect(result.outputs).toEqual(['drop']);
    });

    test('full pipeline with broker input, multiple processors, and broker output', () => {
      const yaml = `
input:
  broker:
    inputs:
      - kafka:
          addresses:
            - localhost:9092
          topics:
            - events
      - amqp_0_9:
          urls:
            - amqp://guest:guest@localhost:5672/
          queue: orders

pipeline:
  processors:
    - mapping: 'root = this'
    - log:
        level: INFO
        message: 'processed'

output:
  broker:
    pattern: fan_out
    outputs:
      - kafka:
          addresses:
            - localhost:9092
          topic: processed_events
      - http_client:
          url: http://example.com/webhook
`;
      const result = parseConfigComponents(yaml);
      expect(result.inputs).toEqual(['kafka', 'amqp_0_9']);
      expect(result.processors).toEqual(['mapping', 'log']);
      expect(result.outputs).toEqual(['kafka', 'http_client']);
    });
  });

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

  describe('patchRedpandaConfig', () => {
    test('patches topic without touching existing SASL config', () => {
      const yaml = `input:
  kafka_franz:
    seed_brokers:
      - localhost:9092
    sasl:
      - mechanism: SCRAM-SHA-256
        username: alice
        password: secret
`;
      const result = patchRedpandaConfig(yaml, 'input', 'kafka_franz', { topicName: 'my-topic' });
      expect(result).toBeDefined();
      expect(result).toContain('my-topic');
      expect(result).toContain('SCRAM-SHA-256');
      expect(result).toContain('alice');
    });

    test('patches SASL without touching existing topics', () => {
      const yaml = `input:
  kafka_franz:
    topics:
      - existing-topic
`;
      const sasl = [{ mechanism: 'SCRAM-SHA-256', username: 'bob', password: 'pw' }];
      const result = patchRedpandaConfig(yaml, 'input', 'kafka_franz', { sasl });
      expect(result).toBeDefined();
      expect(result).toContain('existing-topic');
      expect(result).toContain('SCRAM-SHA-256');
      expect(result).toContain('bob');
    });

    test('patches root-level redpanda.sasl for redpanda_common', () => {
      const yaml = `redpanda: {}
input:
  redpanda_common:
    topics:
      - test-topic
`;
      const sasl = [{ mechanism: 'SCRAM-SHA-256', username: 'user1', password: 'pass1' }];
      const result = patchRedpandaConfig(yaml, 'input', 'redpanda_common', { sasl });
      expect(result).toBeDefined();
      expect(result).toContain('test-topic');
      // SASL should be under redpanda.sasl, not input.redpanda_common.sasl
      expect(result).toContain('redpanda:');
      expect(result).toContain('SCRAM-SHA-256');
    });

    test('patches component-level sasl for kafka_franz output', () => {
      const yaml = `output:
  kafka_franz:
    seed_brokers:
      - localhost:9092
    topics:
      - out-topic
`;
      const sasl = [{ mechanism: 'SCRAM-SHA-512', username: 'admin', password: 'pw' }];
      const result = patchRedpandaConfig(yaml, 'output', 'kafka_franz', { sasl });
      expect(result).toBeDefined();
      expect(result).toContain('out-topic');
      expect(result).toContain('SCRAM-SHA-512');
      expect(result).toContain('admin');
    });

    test('uses singular topic for output section', () => {
      const yaml = `output:
  kafka:
    topic: old-topic
`;
      const result = patchRedpandaConfig(yaml, 'output', 'kafka', { topicName: 'new-topic' });
      expect(result).toBeDefined();
      expect(result).toContain('topic: new-topic');
      expect(result).not.toContain('topics:');
    });

    test('uses topics array for input section', () => {
      const yaml = `input:
  redpanda_common: {}
`;
      const result = patchRedpandaConfig(yaml, 'input', 'redpanda_common', { topicName: 'new-topic' });
      expect(result).toBeDefined();
      expect(result).toContain('topics:');
      expect(result).toContain('new-topic');
    });

    test('uses singular topic for output even when no existing topic field', () => {
      const yaml = `output:
  kafka_franz:
    seed_brokers:
      - localhost:9092
`;
      const result = patchRedpandaConfig(yaml, 'output', 'kafka_franz', { topicName: 'out-topic' });
      expect(result).toBeDefined();
      expect(result).toContain('topic: out-topic');
      expect(result).not.toContain('topics:');
    });

    test('patches both topic and SASL at once', () => {
      const yaml = `input:
  kafka_franz:
    seed_brokers:
      - localhost:9092
`;
      const sasl = [{ mechanism: 'SCRAM-SHA-256', username: 'u', password: 'p' }];
      const result = patchRedpandaConfig(yaml, 'input', 'kafka_franz', { topicName: 'both-topic', sasl });
      expect(result).toBeDefined();
      expect(result).toContain('both-topic');
      expect(result).toContain('SCRAM-SHA-256');
    });

    test('returns undefined for unparseable YAML', () => {
      const result = patchRedpandaConfig('{{{', 'input', 'kafka', { topicName: 'test' });
      expect(result).toBeUndefined();
    });

    test('returns undefined for empty YAML', () => {
      const result = patchRedpandaConfig('', 'input', 'kafka', { topicName: 'test' });
      expect(result).toBeUndefined();
    });
  });

  describe('applyRedpandaSetup', () => {
    const redpandaInputSpec = mockComponents.redpandaInput;

    test('patches topic into existing YAML when component already present', () => {
      const yaml = 'input:\n  kafka_franz:\n    seed_brokers: []\n    topics: []\n';
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'input',
        result: { topicName: 'my-topic' },
        components: [],
      });
      expect(result).toBeDefined();
      expect(result).toContain('my-topic');
    });

    test('patches SASL into existing YAML when component already present', () => {
      const yaml = 'input:\n  kafka_franz:\n    seed_brokers: []\n    topics: []\n';
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'input',
        result: { username: 'admin', saslMechanism: 'SCRAM-SHA-256', authMethod: 'sasl' },
        components: [],
      });
      expect(result).toBeDefined();
      expect(result).toContain('sasl');
    });

    test('falls back to generate+patch when component not in YAML', () => {
      if (!redpandaInputSpec) {
        return;
      }
      const result = applyRedpandaSetup({
        yamlContent: '',
        connectionName: redpandaInputSpec.name,
        connectionType: 'input',
        result: { topicName: 'new-topic' },
        components: [redpandaInputSpec],
      });
      // Should generate a template (non-empty) since the component spec exists
      // Whether the topic gets patched depends on getConnectTemplate producing parseable YAML
      expect(result).toBeDefined();
    });

    test('returns undefined when no result data to patch and component already exists', () => {
      const yaml = 'input:\n  kafka_franz:\n    seed_brokers: []\n';
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'input',
        result: {},
        components: [],
      });
      expect(result).toBeUndefined();
    });

    test('new component generates full template, not just patched fields', () => {
      if (!redpandaInputSpec) {
        return;
      }
      // YAML has a different section — the target component does NOT exist yet
      const yaml = 'output:\n  stdout: {}\n';
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: redpandaInputSpec.name,
        connectionType: 'input',
        result: { topicName: 'my-topic' },
        components: [redpandaInputSpec],
      });
      expect(result).toBeDefined();
      // Should contain the topic we requested
      expect(result).toContain('my-topic');
      // Should also contain template fields from getConnectTemplate (not just the patched topic)
      expect(result).toContain('input');
    });

    test('new component with empty result inserts base template', () => {
      if (!redpandaInputSpec) {
        return;
      }
      const result = applyRedpandaSetup({
        yamlContent: '',
        connectionName: redpandaInputSpec.name,
        connectionType: 'input',
        result: {},
        components: [redpandaInputSpec],
      });
      // Should still generate a base template even with no topic/user
      expect(result).toBeDefined();
      expect(result).toContain('input');
    });

    test('surgical patch on existing component preserves all other fields', () => {
      const yaml = [
        'input:',
        '  kafka_franz:',
        '    seed_brokers:',
        '      - broker:9092',
        '    consumer_group: my-group',
        '    tls:',
        '      enabled: true',
        '    topics: []',
      ].join('\n');
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'input',
        result: { topicName: 'new-topic' },
        components: [],
      });
      expect(result).toBeDefined();
      // Patched field updated
      expect(result).toContain('new-topic');
      // All other fields preserved
      expect(result).toContain('broker:9092');
      expect(result).toContain('my-group');
      expect(result).toContain('enabled: true');
    });

    test('surgical SASL patch preserves existing topic and other fields', () => {
      const yaml = [
        'input:',
        '  kafka_franz:',
        '    seed_brokers:',
        '      - broker:9092',
        '    topics:',
        '      - existing-topic',
        '    tls:',
        '      enabled: true',
      ].join('\n');
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'input',
        result: { username: 'admin', saslMechanism: 'SCRAM-SHA-256', authMethod: 'sasl' },
        components: [],
      });
      expect(result).toBeDefined();
      // SASL added
      expect(result).toContain('sasl');
      // Existing fields preserved
      expect(result).toContain('existing-topic');
      expect(result).toContain('broker:9092');
      expect(result).toContain('enabled: true');
    });

    test('output section uses topic (singular) not topics (array)', () => {
      const yaml = 'output:\n  kafka_franz:\n    seed_brokers: []\n';
      const result = applyRedpandaSetup({
        yamlContent: yaml,
        connectionName: 'kafka_franz',
        connectionType: 'output',
        result: { topicName: 'my-output-topic' },
        components: [],
      });
      expect(result).toBeDefined();
      expect(result).toContain('topic: my-output-topic');
      expect(result).not.toContain('topics:');
    });
  });

  describe('generateYamlFromWizardData', () => {
    const allComponents = Object.values(mockComponents);

    test('returns empty string when input is undefined', () => {
      expect(generateYamlFromWizardData(undefined, undefined, allComponents)).toBe('');
    });

    test('returns empty string when connectionName is empty', () => {
      expect(
        generateYamlFromWizardData({ connectionName: '', connectionType: 'input' }, undefined, allComponents)
      ).toBe('');
    });

    test('generates input-only YAML when no output provided', () => {
      const yaml = generateYamlFromWizardData(
        { connectionName: 'generate', connectionType: 'input' },
        undefined,
        allComponents
      );
      expect(yaml).toContain('input:');
      expect(yaml).toContain('generate:');
      expect(yaml).not.toContain('output:');
    });

    test('generates merged input+output YAML', () => {
      const yaml = generateYamlFromWizardData(
        { connectionName: 'generate', connectionType: 'input' },
        { connectionName: 'kafka', connectionType: 'output' },
        allComponents
      );
      expect(yaml).toContain('input:');
      expect(yaml).toContain('output:');
    });

    test('returns empty string when components list is empty', () => {
      expect(generateYamlFromWizardData({ connectionName: 'generate', connectionType: 'input' }, undefined, [])).toBe(
        ''
      );
    });
  });
});
