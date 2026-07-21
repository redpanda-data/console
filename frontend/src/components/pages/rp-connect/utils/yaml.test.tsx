import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { mockComponents } from './__fixtures__/component-schemas';
import { schemaToConfig } from './schema';
import {
  appendResource,
  buildInsertableComponent,
  configToYaml,
  countResourceReferences,
  createResourceAndReturnLabel,
  type EditTarget,
  extractAllTopics,
  extractConnectorTopics,
  generateYamlFromWizardData,
  getComponentAt,
  getConnectTemplate,
  insertComponentAt,
  listResourceLabels,
  mergeConnectConfigs,
  parseConfigComponents,
  patchRedpandaConfig,
  removeComponentAt,
  renameResourceReferences,
  setComponentAt,
  tryPatchRedpandaYaml,
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
        // For Redpanda components, TLS renders as a parent object — no inline comment on the tls: line.
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

      // metadata children are NOT required (parent metadata is optional) → with no serialized
      // defaults they are omitted entirely rather than placeholder-filled or marked required.
      expect(yaml).not.toContain('include_prefixes');
      expect(yaml).not.toContain('include_patterns');
    });

    test('should preserve existing comments and add comments to merged component', () => {
      const inputYaml = `input:
  generate:
    mapping: "" # Existing comment`;

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

      expect(mergedYaml).toContain('# Existing comment');

      expect(mergedYaml).toContain('output:');
      expect(mergedYaml).toContain('kafka:');

      // Required fields become comment-only lines in merged output
      expect(mergedYaml).toContain('# topic: Required - string, must be manually set');
    });
  });

  describe('appending into existing arrays', () => {
    test('preserves comments on existing processors when appending another', () => {
      const existingYaml = `pipeline:
  processors:
    - mapping: root = this # keep me
`;

      const processorSpec = mockComponents.bloblangProcessor;
      if (!processorSpec) {
        throw new Error('bloblang processor not found');
      }
      const result = schemaToConfig(processorSpec, false);
      if (!result) {
        throw new Error('Failed to generate processor config');
      }

      const mergedDoc = mergeConnectConfigs(existingYaml, result.config);
      const yaml = configToYaml(mergedDoc);

      expect(yaml).toContain('# keep me');
      const parsed = parseYaml(yaml) as { pipeline: { processors: unknown[] } };
      expect(parsed.pipeline.processors).toHaveLength(2);
    });

    test('preserves comments on existing resources when appending another', () => {
      const existingYaml = `cache_resources:
  - label: existing_cache
    memory:
      default_ttl: 60s # keep me
`;

      const cacheSpec = mockComponents.memoryCache;
      if (!cacheSpec) {
        throw new Error('memory cache not found');
      }
      const result = schemaToConfig(cacheSpec, false);
      if (!result) {
        throw new Error('Failed to generate cache config');
      }

      const mergedDoc = mergeConnectConfigs(existingYaml, result.config);
      const yaml = configToYaml(mergedDoc);

      expect(yaml).toContain('# keep me');
      const parsed = parseYaml(yaml) as { cache_resources: { label?: string }[] };
      expect(parsed.cache_resources).toHaveLength(2);
    });
  });

  describe('merging into a blank {} document', () => {
    test('treats {} as a fresh config instead of merging into its flow map', () => {
      const mergedYaml = getConnectTemplate({
        connectionName: 'redpanda',
        connectionType: 'input',
        components: Object.values(mockComponents),
        existingYaml: '{}',
      });

      expect(mergedYaml).toMatch(/^input:$/m);
      expect(mergedYaml).not.toContain('{ input');
    });
  });

  describe('long value folding', () => {
    test('does not fold long single-line values', () => {
      const longValue = 'x'.repeat(200);
      const yaml = configToYaml({ pipeline: { processors: [{ mapping: `root = "${longValue}"` }] } });

      // lineWidth: 0 — the stringifier must not fold a >120-char scalar across lines.
      expect(yaml).toContain(longValue);
    });
  });

  describe('scanner merging', () => {
    test('keeps the scanner name wrapper under input.<type>.scanner', () => {
      const existingYaml = `input:
  file:
    paths:
      - ./data.avro
output:
  drop: {}`;

      const mergedYaml = getConnectTemplate({
        connectionName: 'avro',
        connectionType: 'scanner',
        components: Object.values(mockComponents),
        existingYaml,
      });

      const parsed = parseYaml(mergedYaml as string) as { input: { file: { scanner: Record<string, unknown> } } };
      // The scanner config must stay wrapped in its name — `scanner: { avro: {…} }`, not the bare fields.
      expect(Object.keys(parsed.input.file.scanner)).toEqual(['avro']);
    });

    test('refuses a scanner when the config has no input', () => {
      const existingYaml = `output:
  drop: {}`;

      const mergedYaml = getConnectTemplate({
        connectionName: 'avro',
        connectionType: 'scanner',
        components: Object.values(mockComponents),
        existingYaml,
      });

      expect(mergedYaml).toBe(existingYaml);
    });
  });
});

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

    test('returns without crashing on a circular alias config', () => {
      const yaml = `a: &x
  b: *x
  topic: looped
`;
      expect(extractAllTopics(yaml)).toEqual(['looped']);
    });

    test('resolves merge keys so merged topics are found', () => {
      const yaml = `defaults: &d
  topics: [merged_topic]
input:
  kafka:
    <<: *d
`;
      expect(extractAllTopics(yaml)).toContain('merged_topic');
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

describe('extractConnectorTopics', () => {
  test('extracts topics array from input section', () => {
    const yaml = `input:
  kafka_franz:
    topics:
      - my-topic
      - other-topic
output:
  stdout: {}`;
    const result = extractConnectorTopics(yaml, 'input', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toEqual(['my-topic', 'other-topic']);
  });

  test('extracts singular topic from output section', () => {
    const yaml = `input:
  stdin: {}
output:
  kafka_franz:
    topic: my-output-topic`;
    const result = extractConnectorTopics(yaml, 'output', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toEqual(['my-output-topic']);
  });

  test('returns undefined topics for empty YAML', () => {
    expect(extractConnectorTopics('', 'input', 'kafka_franz')).toEqual({ topics: undefined, parseError: false });
    expect(extractConnectorTopics('   ', 'input', 'kafka_franz')).toEqual({ topics: undefined, parseError: false });
  });

  test('resolves topics pulled in via a YAML merge anchor', () => {
    // The flow parser resolves `<<:` merge keys, so this extractor must too — otherwise a
    // component sharing config via an anchor reads as "missing topic" while the diagram shows it.
    const yaml = `shared: &common
  topics:
    - anchored-topic
input:
  kafka_franz:
    <<: *common
    consumer_group: g
output:
  stdout: {}`;
    const result = extractConnectorTopics(yaml, 'input', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toEqual(['anchored-topic']);
  });

  test('returns undefined topics when component has no topic config', () => {
    const yaml = `input:
  generate:
    mapping: 'root = "hello"'`;
    const result = extractConnectorTopics(yaml, 'input', 'generate');
    expect(result.parseError).toBe(false);
    expect(result.topics).toBeUndefined();
  });

  test('returns undefined topics for structurally invalid YAML with no topic fields', () => {
    // parseDocument collects errors rather than throwing, so parseError stays false; it just finds no topics.
    const yaml = '{{{';
    const result = extractConnectorTopics(yaml, 'input', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toBeUndefined();
  });

  test('filters out empty strings from topics array', () => {
    const yaml = `input:
  kafka_franz:
    topics:
      - ""
      - valid-topic
      - ""`;
    const result = extractConnectorTopics(yaml, 'input', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toEqual(['valid-topic']);
  });

  test('returns undefined topics when all topics are empty strings', () => {
    const yaml = `input:
  kafka_franz:
    topics:
      - ""`;
    const result = extractConnectorTopics(yaml, 'input', 'kafka_franz');
    expect(result.parseError).toBe(false);
    expect(result.topics).toBeUndefined();
  });
});

describe('patchRedpandaConfig comment stripping', () => {
  test('strips commented topic placeholder after patching topic on output', () => {
    const yaml = `output:
  kafka_franz:
    # topic: Required - the topic to write to
    seed_brokers:
      - localhost:9092`;
    const result = patchRedpandaConfig(yaml, 'output', 'kafka_franz', { topicName: 'my-topic' });
    expect(result).toBeDefined();
    expect(result).not.toContain('# topic:');
    expect(result).toContain('topic: my-topic');
  });

  test('strips commented topics placeholder after patching topics on input', () => {
    const yaml = `input:
  kafka_franz:
    # topics: Required - topics to read from
    seed_brokers:
      - localhost:9092`;
    const result = patchRedpandaConfig(yaml, 'input', 'kafka_franz', { topicName: 'my-topic' });
    expect(result).toBeDefined();
    expect(result).not.toContain('# topics:');
    expect(result).toContain('topics:');
  });

  test('does not strip comments in other sections', () => {
    const yaml = `input:
  kafka_franz:
    seed_brokers:
      - localhost:9092
output:
  kafka_franz:
    # topic: this is in the output section
    seed_brokers:
      - localhost:9092`;
    // Patching input should NOT strip comments in output section
    const result = patchRedpandaConfig(yaml, 'input', 'kafka_franz', { topicName: 'my-topic' });
    expect(result).toBeDefined();
    expect(result).toContain('# topic: this is in the output section');
  });

  test('returns undefined for empty YAML', () => {
    expect(patchRedpandaConfig('', 'input', 'kafka_franz', { topicName: 'x' })).toBeUndefined();
  });

  test('returns undefined for invalid YAML', () => {
    expect(patchRedpandaConfig('{{{', 'input', 'kafka_franz', { topicName: 'x' })).toBeUndefined();
  });
});

describe('visual-editor mutations', () => {
  const pipelineYaml = `input:
  generate:
    mapping: 'root = {}'
pipeline:
  processors:
    - log:
        message: hello
    - mapping: 'root = this'
output:
  drop: {}`;

  describe('getComponentAt', () => {
    test('reads the input component', () => {
      expect(getComponentAt(pipelineYaml, { kind: 'input' })).toEqual({ generate: { mapping: 'root = {}' } });
    });

    test('reads a processor by index', () => {
      expect(getComponentAt(pipelineYaml, { kind: 'processor', index: 1 })).toEqual({ mapping: 'root = this' });
    });

    test('returns undefined on parse failure', () => {
      expect(getComponentAt('{{{', { kind: 'input' })).toBeUndefined();
    });
  });

  describe('setComponentAt', () => {
    test('replaces a processor config in place', () => {
      const next = setComponentAt(pipelineYaml, { kind: 'processor', index: 0 }, { log: { message: 'changed' } });
      expect(next).not.toBeNull();
      expect(getComponentAt(next as string, { kind: 'processor', index: 0 })).toEqual({ log: { message: 'changed' } });
      // Sibling processor is untouched.
      expect(getComponentAt(next as string, { kind: 'processor', index: 1 })).toEqual({ mapping: 'root = this' });
    });

    test('returns null on parse failure', () => {
      expect(setComponentAt('{{{', { kind: 'input' }, { generate: {} })).toBeNull();
    });

    test('returns null for a stale numeric index instead of padding the sequence with nulls', () => {
      expect(setComponentAt(pipelineYaml, { kind: 'processor', index: 5 }, { log: { message: 'x' } })).toBeNull();
      expect(
        setComponentAt(
          pipelineYaml,
          { kind: 'path', path: ['pipeline', 'processors', 9], componentType: 'processor' },
          { log: {} }
        )
      ).toBeNull();
    });
  });

  describe('formatting stability', () => {
    const longMapping =
      'root.out = this.first_field.second_field.third_field.fourth_field.fifth_field.sixth_field.seventh_field.eighth_field.ninth_field';

    test('an unrelated insert never folds long lines and keeps flow collections on one line', () => {
      const yaml = `input:
  kafka:
    topics: [ foo, bar ]
pipeline:
  processors:
    - mapping: '${longMapping}'
output:
  drop: {}`;
      const next = insertComponentAt(yaml, ['pipeline', 'processors'], 1, { log: { message: 'hi' } }) as string;
      expect(next).toContain(longMapping);
      expect(next).toContain('topics: [ foo, bar ]');
    });

    test('replacing a component keeps unrelated long lines unfolded', () => {
      const yaml = `pipeline:
  processors:
    - mapping: '${longMapping}'
    - log:
        message: hello
output:
  drop: {}`;
      const next = setComponentAt(yaml, { kind: 'processor', index: 1 }, { log: { message: 'bye' } }) as string;
      expect(next).toContain(longMapping);
    });
  });

  describe('path edit targets (nested components)', () => {
    const nestedYaml = `pipeline:
  processors:
    - branch:
        request_map: 'root = this'
        processors:
          - http:
              url: http://old
        result_map: 'root.x = this'
output:
  drop: {}`;
    const httpTarget: EditTarget = {
      kind: 'path',
      path: ['pipeline', 'processors', 0, 'branch', 'processors', 0],
      componentType: 'processor',
    };

    test('reads a nested component by path', () => {
      expect(getComponentAt(nestedYaml, httpTarget)).toEqual({ http: { url: 'http://old' } });
    });

    test('replaces a nested component in place, leaving siblings intact', () => {
      const next = setComponentAt(nestedYaml, httpTarget, { http: { url: 'http://new', verb: 'POST' } });
      expect(next).not.toBeNull();
      expect(getComponentAt(next as string, httpTarget)).toEqual({ http: { url: 'http://new', verb: 'POST' } });
      // The branch's request_map/result_map are untouched.
      const parsed = parseYaml(next as string) as { pipeline: { processors: { branch: Record<string, unknown> }[] } };
      expect(parsed.pipeline.processors[0].branch.request_map).toBe('root = this');
    });

    test('removing the last nested child keeps an empty fillable processors array', () => {
      const next = removeComponentAt(nestedYaml, httpTarget);
      expect(next).not.toBeNull();
      const parsed = parseYaml(next as string) as { pipeline: { processors: { branch: Record<string, unknown> }[] } };
      expect(parsed.pipeline.processors[0].branch.processors).toEqual([]);
      expect(parsed.pipeline.processors[0].branch.request_map).toBe('root = this');
    });

    test('removing the only step of a try keeps the try as an empty fillable array', () => {
      const tryYaml = `pipeline:
  processors:
    - try:
        - mapping: 'root = this'
output:
  drop: {}`;
      const next = removeComponentAt(tryYaml, {
        kind: 'path',
        path: ['pipeline', 'processors', 0, 'try', 0],
        componentType: 'processor',
      });
      const parsed = parseYaml(next as string) as { pipeline: { processors: { try: unknown[] }[] } };
      expect(parsed.pipeline.processors[0].try).toEqual([]);
    });

    test('removing the only processor of a switch case keeps the case and its check', () => {
      const switchYaml = `pipeline:
  processors:
    - switch:
        - check: 'this.x == 1'
          processors:
            - mapping: 'root = this'
output:
  drop: {}`;
      const next = removeComponentAt(switchYaml, {
        kind: 'path',
        path: ['pipeline', 'processors', 0, 'switch', 0, 'processors', 0],
        componentType: 'processor',
      });
      const parsed = parseYaml(next as string) as {
        pipeline: { processors: { switch: { check: string; processors: unknown[] }[] }[] };
      };
      expect(parsed.pipeline.processors[0].switch[0]).toEqual({ check: 'this.x == 1', processors: [] });
    });

    test('removing the last item of a top-level resource array drops the emptied key', () => {
      const resYaml = `input:
  generate:
    mapping: 'root = {}'
input_resources:
  - label: in_a
    stdin: {}
output:
  drop: {}`;
      const next = removeComponentAt(resYaml, {
        kind: 'path',
        path: ['input_resources', 0],
        componentType: 'input',
      });
      const parsed = parseYaml(next as string) as Record<string, unknown>;
      // A top-level container prunes like `pipeline:` does — no dead `input_resources: []` left behind.
      expect(parsed.input_resources).toBeUndefined();
      expect(parsed.input).toBeDefined();
    });
  });

  describe('appendResource', () => {
    test('appends to a new cache_resources array', () => {
      const next = appendResource(pipelineYaml, 'cache_resources', { label: 'c', memory: {} });
      const parsed = parseYaml(next as string) as { cache_resources: Record<string, unknown>[] };
      expect(parsed.cache_resources).toEqual([{ label: 'c', memory: {} }]);
    });
  });

  describe('insertComponentAt (nested)', () => {
    const switchYaml = `pipeline:
  processors:
    - switch:
        - check: a == 1
          processors:
            - mapping: 'root = this'
        - processors:
            - mapping: 'root = that'
output:
  drop: {}`;

    test('inserts a processor into a specific switch case at an index', () => {
      const casePath = ['pipeline', 'processors', 0, 'switch', 0, 'processors'];
      const next = insertComponentAt(switchYaml, casePath, 0, { log: { message: 'first' } });
      expect(next).not.toBeNull();
      const parsed = parseYaml(next as string) as {
        pipeline: { processors: { switch: { processors: Record<string, unknown>[] }[] }[] };
      };
      const case0 = parsed.pipeline.processors[0].switch[0].processors;
      expect(case0).toEqual([{ log: { message: 'first' } }, { mapping: 'root = this' }]);
      // The other case is untouched.
      expect(parsed.pipeline.processors[0].switch[1].processors).toEqual([{ mapping: 'root = that' }]);
    });

    test('creates a nested processors array when the container has none yet', () => {
      const branchYaml = `pipeline:
  processors:
    - branch:
        request_map: 'root = this'
output:
  drop: {}`;
      const next = insertComponentAt(branchYaml, ['pipeline', 'processors', 0, 'branch', 'processors'], 0, {
        mapping: 'root = x',
      });
      const parsed = parseYaml(next as string) as {
        pipeline: { processors: { branch: { processors: unknown[]; request_map: string } }[] };
      };
      expect(parsed.pipeline.processors[0].branch.processors).toEqual([{ mapping: 'root = x' }]);
      expect(parsed.pipeline.processors[0].branch.request_map).toBe('root = this');
    });

    test('appends a structural switch-case skeleton', () => {
      const next = insertComponentAt(switchYaml, ['pipeline', 'processors', 0, 'switch'], 99, {
        check: '',
        processors: [],
      });
      const parsed = parseYaml(next as string) as { pipeline: { processors: { switch: unknown[] }[] } };
      expect(parsed.pipeline.processors[0].switch).toHaveLength(3);
      expect(parsed.pipeline.processors[0].switch.at(-1)).toEqual({ check: '', processors: [] });
    });

    test('refuses to insert into a container that exists as a non-sequence (no clobbering)', () => {
      // A `fallback` hand-authored as a map, not a list. Inserting must not overwrite it away.
      const malformed = `output:
  fallback:
    stdout: {}`;
      expect(insertComponentAt(malformed, ['output', 'fallback'], 0, { drop: {} })).toBeNull();
    });
  });

  describe('resource references', () => {
    const withResources = `pipeline:
  processors:
    - cache:
        resource: dedupe
        operator: add
        key: x
    - branch:
        processors:
          - cache:
              resource: dedupe
              operator: get
              key: y
    - rate_limit:
        resource: limiter
output:
  drop: {}
cache_resources:
  - label: dedupe
    memory: {}
rate_limit_resources:
  - label: limiter
    local: { count: 1, interval: 1s }`;

    test('listResourceLabels returns labels per kind', () => {
      expect(listResourceLabels(withResources, 'cache')).toEqual(['dedupe']);
      expect(listResourceLabels(withResources, 'rate_limit')).toEqual(['limiter']);
      expect(listResourceLabels('output:\n  drop: {}', 'cache')).toEqual([]);
    });

    test('createResourceAndReturnLabel adds the chosen impl and returns its label', () => {
      const base = 'output:\n  drop: {}';
      const result = createResourceAndReturnLabel(base, 'cache', 'memory', [mockComponents.memoryCache]);
      expect(result).not.toBeNull();
      expect(result?.label).toBeTruthy();
      const parsed = parseYaml((result as { yaml: string }).yaml) as { cache_resources: { label: string }[] };
      expect(parsed.cache_resources).toHaveLength(1);
      expect(parsed.cache_resources[0].label).toBe(result?.label);
      // The label the caller gets back is exactly the one it can link into a node.
      expect(listResourceLabels((result as { yaml: string }).yaml, 'cache')).toContain(result?.label);
    });

    test('createResourceAndReturnLabel makes the label collision-safe', () => {
      const base = 'cache_resources:\n  - label: memory\n    memory: {}\noutput:\n  drop: {}';
      const result = createResourceAndReturnLabel(base, 'cache', 'memory', [mockComponents.memoryCache]);
      expect(result?.label).not.toBe('memory');
      expect(listResourceLabels((result as { yaml: string }).yaml, 'cache')).toHaveLength(2);
    });

    const sharedLabelYaml = `pipeline:
  processors:
    - cache:
        resource: shared
        operator: add
        key: x
    - rate_limit:
        resource: shared
output:
  drop: {}
cache_resources:
  - label: shared
    memory: {}
rate_limit_resources:
  - label: shared
    local: { count: 1, interval: 1s }`;

    type SharedParsed = {
      pipeline: { processors: [{ cache: { resource: string } }, { rate_limit: { resource: string } }] };
    };

    test('renameResourceReferences with a kind leaves same-labelled references of the other kind alone', () => {
      const next = renameResourceReferences(sharedLabelYaml, 'shared', 'renamed', 'cache') as string;
      const parsed = parseYaml(next) as SharedParsed;
      expect(parsed.pipeline.processors[0].cache.resource).toBe('renamed');
      expect(parsed.pipeline.processors[1].rate_limit.resource).toBe('shared');
    });

    test('renameResourceReferences without a kind rewrites every matching reference', () => {
      const next = renameResourceReferences(sharedLabelYaml, 'shared', 'renamed') as string;
      const parsed = parseYaml(next) as SharedParsed;
      expect(parsed.pipeline.processors[0].cache.resource).toBe('renamed');
      expect(parsed.pipeline.processors[1].rate_limit.resource).toBe('renamed');
    });

    test('countResourceReferences scopes to the kind when given', () => {
      expect(countResourceReferences(sharedLabelYaml, 'shared')).toBe(2);
      expect(countResourceReferences(sharedLabelYaml, 'shared', 'cache')).toBe(1);
      expect(countResourceReferences(sharedLabelYaml, 'shared', 'rate_limit')).toBe(1);
    });

    // Refs held in name-referencing fields (dedupe's `cache:`, a CDC input's `checkpoint_cache:`)
    // must follow a rename too — leaving them behind strands the pipeline at deploy time.
    const fieldRefYaml = `input:
  mongodb_cdc:
    url: mongodb://x
    checkpoint_cache: my_cache
pipeline:
  processors:
    - dedupe:
        cache: my_cache
        key: x
output:
  drop: {}
cache_resources:
  - label: my_cache
    memory: {}`;

    test('renameResourceReferences follows refs held in non-`resource` fields', () => {
      const next = renameResourceReferences(fieldRefYaml, 'my_cache', 'renamed', 'cache') as string;
      const parsed = parseYaml(next) as {
        input: { mongodb_cdc: { checkpoint_cache: string; url: string } };
        pipeline: { processors: [{ dedupe: { cache: string; key: string } }] };
      };
      expect(parsed.input.mongodb_cdc.checkpoint_cache).toBe('renamed');
      expect(parsed.pipeline.processors[0].dedupe.cache).toBe('renamed');
      // An unrelated field with a matching value must NOT be rewritten.
      expect(parsed.input.mongodb_cdc.url).toBe('mongodb://x');
    });

    test('countResourceReferences counts refs held in non-`resource` fields', () => {
      expect(countResourceReferences(fieldRefYaml, 'my_cache', 'cache')).toBe(2);
    });

    // `*_resources` items are referenced via `resource:` indirection components; renaming their
    // label must cascade to those references (kind-scoped by section) just like cache/rate_limit.
    const sectionResourceYaml = `input:
  resource: src
pipeline:
  processors:
    - resource: src
output:
  broker:
    outputs:
      - resource: src
input_resources:
  - label: src
    generate:
      mapping: 'root = {}'
processor_resources:
  - label: src
    mapping: 'root = this'
output_resources:
  - label: src
    drop: {}`;

    test('renameResourceReferences scoped to a section kind rewrites only that section', () => {
      const next = renameResourceReferences(sectionResourceYaml, 'src', 'renamed', 'input') as string;
      const parsed = parseYaml(next) as {
        input: { resource: string };
        pipeline: { processors: [{ resource: string }] };
        output: { broker: { outputs: [{ resource: string }] } };
      };
      expect(parsed.input.resource).toBe('renamed');
      expect(parsed.pipeline.processors[0].resource).toBe('src');
      expect(parsed.output.broker.outputs[0].resource).toBe('src');
    });

    test('countResourceReferences scopes to section kinds', () => {
      expect(countResourceReferences(sectionResourceYaml, 'src', 'input')).toBe(1);
      expect(countResourceReferences(sectionResourceYaml, 'src', 'processor')).toBe(1);
      expect(countResourceReferences(sectionResourceYaml, 'src', 'output')).toBe(1);
    });
  });

  describe('removeComponentAt', () => {
    test('removes a processor and keeps the rest', () => {
      const next = removeComponentAt(pipelineYaml, { kind: 'processor', index: 0 });
      const parsed = parseYaml(next as string) as { pipeline: { processors: Record<string, unknown>[] } };
      expect(parsed.pipeline.processors).toEqual([{ mapping: 'root = this' }]);
    });

    test('prunes the pipeline key when the last processor is removed', () => {
      let next = removeComponentAt(pipelineYaml, { kind: 'processor', index: 1 }) as string;
      next = removeComponentAt(next, { kind: 'processor', index: 0 }) as string;
      const parsed = parseYaml(next) as Record<string, unknown>;
      expect(parsed.pipeline).toBeUndefined();
    });

    test('removes the input key', () => {
      const next = removeComponentAt(pipelineYaml, { kind: 'input' });
      const parsed = parseYaml(next as string) as Record<string, unknown>;
      expect(parsed.input).toBeUndefined();
    });

    test('returns a blank config when the only component is deleted', () => {
      const next = removeComponentAt('input:\n  generate:\n    mapping: root = {}\n', { kind: 'input' });
      expect(next).toBe('');
    });

    test('returns a blank config when the last processor of a processor-only pipeline is deleted', () => {
      const next = removeComponentAt('pipeline:\n  processors:\n    - mapping: root = this\n', {
        kind: 'processor',
        index: 0,
      });
      expect(next).toBe('');
    });

    test('returns a blank config when the last resource is deleted', () => {
      const next = removeComponentAt('cache_resources:\n  - label: c\n    memory: {}\n', {
        kind: 'resource',
        resourceKey: 'cache_resources',
        index: 0,
      });
      expect(next).toBe('');
    });
  });

  describe('buildInsertableComponent', () => {
    test('returns undefined when the component spec is unknown', () => {
      const target: EditTarget = { kind: 'processor', index: 0 };
      expect(target.kind).toBe('processor');
      expect(buildInsertableComponent('does_not_exist', 'processor', [])).toBeUndefined();
    });

    test('keeps the component key for a field-less component (drop output)', () => {
      // drop has no config fields; the generated object must still carry `drop: {}` — without it
      // the insert writes an output with only a label, which renders as an empty placeholder.
      const step = buildInsertableComponent('drop', 'output', Object.values(mockComponents));
      expect(step?.drop).toEqual({});
    });
  });

  describe('tryPatchRedpandaYaml', () => {
    test('appends a created topic to an existing topics list instead of replacing it', () => {
      const next = tryPatchRedpandaYaml('input:\n  redpanda:\n    topics:\n      - existing\n', 'input', 'redpanda', {
        topicName: 'new-topic',
      });
      const parsed = parseYaml(next as string) as { input: { redpanda: { topics: string[] } } };
      expect(parsed.input.redpanda.topics).toEqual(['existing', 'new-topic']);
    });

    test('does not duplicate a topic already in the list', () => {
      const next = tryPatchRedpandaYaml('input:\n  redpanda:\n    topics:\n      - existing\n', 'input', 'redpanda', {
        topicName: 'existing',
      });
      const parsed = parseYaml(next as string) as { input: { redpanda: { topics: string[] } } };
      expect(parsed.input.redpanda.topics).toEqual(['existing']);
    });
  });

  describe('field-less component templates', () => {
    test('getConnectTemplate emits the component key for drop', () => {
      const yaml = getConnectTemplate({
        connectionName: 'drop',
        connectionType: 'output',
        components: Object.values(mockComponents),
        existingYaml: '',
      });

      const parsed = parseYaml(yaml as string) as { output?: Record<string, unknown> };
      expect(parsed.output?.drop).toEqual({});
    });
  });
});
