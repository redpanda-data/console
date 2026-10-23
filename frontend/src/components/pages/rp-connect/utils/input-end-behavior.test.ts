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

import { parse as parseYaml } from 'yaml';

import { classifyInputSlot, summarizePipelineEndYaml } from './input-end-behavior';
import type { ParsedYamlConfig } from './yaml';
import { describe, expect, test } from 'bun:test';
import schemaJson from '../../../../assets/rp-connect-schema-full.json' with { type: 'json' };

const kindOf = (yaml: string) => classifyInputSlot(parseYaml(yaml)).kind;

describe('classifyInputSlot plain inputs', () => {
  test('streaming inputs run until stopped', () => {
    expect(kindOf('redpanda: { topics: [a] }')).toBe('continuous');
    expect(kindOf('postgres_cdc: { dsn: x }')).toBe('continuous');
    expect(kindOf('http_server: {}')).toBe('continuous');
  });

  test('batch inputs stop once their data runs out', () => {
    expect(kindOf('sql_select: { table: t }')).toBe('natural');
    expect(kindOf('gcp_cloud_storage: { bucket: b }')).toBe('natural');
  });

  test('config decides for inputs with both modes: aws_s3 and generate', () => {
    expect(kindOf('aws_s3: { bucket: b }')).toBe('natural');
    const sqs = classifyInputSlot(parseYaml('aws_s3: { bucket: b, sqs: { url: https://q } }'));
    expect(sqs.kind).toBe('continuous');
    expect(sqs.finiteHint).toContain('sqs.url');

    expect(kindOf('generate: { mapping: root = 1 }')).toBe('continuous');
    expect(kindOf('generate: { mapping: root = 1, count: 0 }')).toBe('continuous');
    expect(classifyInputSlot(parseYaml('generate: { mapping: root = 1, count: 5 }')).reason).toBe(
      'Generates 5 messages, then stops.'
    );
  });

  test('config decides for inputs with both modes: http_client and sftp', () => {
    expect(kindOf('http_client: { url: x }')).toBe('continuous');
    expect(kindOf('http_client: { url: x, stream: { enabled: true } }')).toBe('continuous');
    expect(kindOf('http_client: { url: x, stream: { enabled: true, reconnect: false } }')).toBe('natural');

    expect(kindOf('sftp: { paths: [a] }')).toBe('natural');
    expect(kindOf('sftp: { paths: [a], watcher: { enabled: true } }')).toBe('continuous');
  });

  test('config decides for inputs with both modes: CDC snapshots', () => {
    expect(kindOf('oracledb_cdc: { snapshot_mode: snapshot_and_stream }')).toBe('continuous');
    expect(kindOf('oracledb_cdc: { snapshot_mode: snapshot_only }')).toBe('natural');
    expect(kindOf('aws_dynamodb_cdc: { tables: [t], snapshot_mode: snapshot_only }')).toBe('natural');
  });

  test('generate: a cron interval waits for its first tick, and count must be a whole number', () => {
    const cron = classifyInputSlot(parseYaml("generate: { mapping: root = 1, interval: '0 9 * * *', count: 1 }"));
    expect(cron.kind).toBe('natural');
    expect(cron.caveat).toBe('Each run waits for the next `0 9 * * *` tick before its first message.');
    expect(kindOf('generate: { mapping: root = 1, interval: 1s, count: 1 }')).toBe('natural');
    expect(kindOf('generate: { mapping: root = 1, count: 0.5 }')).toBe('continuous');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('generate: { mapping: root = 1, count: "${N}" }')).toBe('unknown');
    expect(classifyInputSlot(parseYaml('generate: { mapping: root = deleted(), count: 5 }')).caveat).toContain(
      'deletes'
    );
  });

  test('booleans read as Connect decodes them; an env var is only known at runtime', () => {
    expect(kindOf('sftp: { paths: [a], watcher: { enabled: yes } }')).toBe('continuous');
    expect(kindOf('subprocess: { name: x, restart_on_exit: "on" }')).toBe('continuous');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('sftp: { paths: [a], watcher: { enabled: "${W}" } }')).toBe('unknown');
    expect(kindOf('http_client: { url: x, stream: { enabled: "true", reconnect: "no" } }')).toBe('natural');
  });

  test('a snapshot Connect refuses is invalid', () => {
    expect(kindOf('aws_dynamodb_cdc: { tables: [a, b], snapshot_mode: snapshot_only }')).toBe('invalid');
    expect(kindOf('aws_dynamodb_cdc: { tables: [a, b], snapshot_mode: snapshot_and_cdc }')).toBe('invalid');
    expect(kindOf('aws_dynamodb_cdc: { table_discovery_mode: tag, snapshot_mode: snapshot_and_cdc }')).toBe('invalid');
    expect(kindOf('aws_dynamodb_cdc: { tables: [a, b] }')).toBe('continuous');
    expect(kindOf('aws_dynamodb_cdc: { tables: [a], snapshot_mode: snapshot_and_cdc }')).toBe('continuous');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('aws_dynamodb_cdc: { tables: [a], snapshot_mode: "${MODE}" }')).toBe('unknown');
  });

  test('a slot’s processors are not its component', () => {
    expect(kindOf('{ processors: [], sql_select: {} }')).toBe('natural');
    expect(kindOf('{ processors: [], read_until: { idle_timeout: 5s, input: { kafka: {} } } }')).toBe('condition');
  });

  test('every Cloud input has an end rule', () => {
    const composites = new Set(['broker', 'sequence', 'read_until', 'resource', 'batched']);
    const unknown = (schemaJson as { inputs: { name: string }[] }).inputs
      .map((i) => i.name)
      .filter((name) => !composites.has(name) && classifyInputSlot({ [name]: {} }).kind === 'unknown');
    expect(unknown).toEqual([]);
  });
});

describe('classifyInputSlot brokers, sequences and resources', () => {
  test('a broker ends only when every member does', () => {
    const mixed = classifyInputSlot(
      parseYaml(`
broker:
  inputs:
    - aws_s3: { bucket: b }
    - redpanda: { topics: [a] }
    - read_until: { idle_timeout: 5s, input: { kafka: {} } }
`)
    );
    expect(mixed).toMatchObject({ kind: 'continuous', members: { total: 3, continuous: 1 } });
    expect(mixed.reason).toBe('1 of 3 inputs never stops on its own, so the broker keeps running.');

    const allEnd = classifyInputSlot(
      parseYaml(`
broker:
  inputs:
    - aws_s3: { bucket: b }
    - read_until: { idle_timeout: 5s, input: { kafka: {} } }
`)
    );
    expect(allEnd.kind).toBe('natural');
  });

  test('a sequence never finishes past a member that runs forever', () => {
    const seq = classifyInputSlot(parseYaml('sequence: { inputs: [{ kafka: {} }, { sql_select: {} }] }'));
    expect(seq.reason).toBe('1 of 2 inputs never stops on its own, so the sequence never finishes.');
  });

  test('an unknown component, or a broker member of one, is unknown', () => {
    expect(kindOf('my_plugin: {}')).toBe('unknown');
    expect(kindOf('broker: { inputs: [{ sql_select: {} }, { my_plugin: {} }] }')).toBe('unknown');
  });

  test('a broker or sequence with no inputs is invalid', () => {
    expect(classifyInputSlot(parseYaml('broker: { inputs: [] }'))).toMatchObject({
      kind: 'invalid',
      reason: 'It has no inputs yet, and Connect needs at least one.',
    });
    expect(kindOf('sequence: { inputs: [] }')).toBe('invalid');
  });

  test('a broken member fails a broker at start, and stalls a sequence past its first input', () => {
    const broken = '{ read_until: { input: { kafka: {} } } }';
    expect(classifyInputSlot(parseYaml(`broker: { inputs: [{ sql_select: {} }, ${broken}] }`)).reason).toBe(
      '1 of 2 inputs needs fixing.'
    );
    expect(classifyInputSlot(parseYaml(`sequence: { inputs: [${broken}, { sql_select: {} }] }`)).reason).toBe(
      '1 of 2 inputs needs fixing.'
    );
    expect(classifyInputSlot(parseYaml(`sequence: { inputs: [{ sql_select: {} }, ${broken}] }`))).toMatchObject({
      kind: 'invalid',
      reason: '1 of 2 inputs needs fixing, so the sequence stalls when it gets there.',
    });
  });

  test('resource and batched inputs end as what they run does', () => {
    const config = parseYaml(`
input:
  resource: drain
input_resources:
  - label: drain
    read_until: { idle_timeout: 5s, input: { kafka: {} } }
  - label: forever
    kafka: {}
`) as ParsedYamlConfig;
    const viaResource = classifyInputSlot(config.input, config);
    // The resource's own stop condition makes it end on its own from this input's point of view.
    expect(viaResource.kind).toBe('natural');
    expect(viaResource.reason).toContain('input resource `drain`');
    expect(classifyInputSlot({ resource: 'forever' }, config).kind).toBe('continuous');
    expect(classifyInputSlot({ resource: 'missing' }, config).kind).toBe('unknown');
    expect(kindOf('batched: { child: { sql_select: {} }, policy: { count: 10, period: 1s } }')).toBe('natural');
    expect(kindOf('batched: { child: { sql_select: {} }, policy: { count: 1 } }')).toBe('natural');
  });

  test('resource chains are followed and loops are named', () => {
    const config = parseYaml(`
input_resources:
  - { label: a, resource: b }
  - { label: b, sql_select: {} }
  - { label: x, resource: y }
  - { label: y, resource: x }
`) as ParsedYamlConfig;
    expect(classifyInputSlot({ resource: 'a' }, config).reason).toBe(
      'Runs the input resource `a` (through `b`). Reads every row its query returns, then stops.'
    );
    expect(classifyInputSlot({ resource: 'x' }, config)).toMatchObject({
      kind: 'unknown',
      reason: 'Its input resources refer to each other in a loop (`x` → `y` → `x`).',
    });
    expect(classifyInputSlot({ resource: 'nope' }, config).reason).toBe('There’s no input resource named `nope`.');
  });

  test('an input that contains itself through an alias is invalid, not endless recursion', () => {
    const config = parseYaml('input: &a\n  broker:\n    inputs:\n      - kafka: {}\n      - *a\n') as ParsedYamlConfig;
    expect(classifyInputSlot(config.input, config)).toMatchObject({
      kind: 'invalid',
      reason: '1 of 2 inputs needs fixing.',
    });
  });
});

describe('classifyInputSlot stop conditions', () => {
  test('a read_until stop condition ends any input; an empty one is invalid', () => {
    expect(kindOf('read_until: { idle_timeout: 5s, input: { redpanda: {} } }')).toBe('condition');
    expect(kindOf('read_until: { input: { redpanda: {} } }')).toBe('invalid');
    expect(kindOf('read_until: { check: "true" }')).toBe('invalid');
  });

  test('an idle timeout that is not a duration is invalid', () => {
    expect(kindOf('read_until: { idle_timeout: soon, input: { kafka: {} } }')).toBe('invalid');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('read_until: { idle_timeout: "${IDLE}", input: { kafka: {} } }')).toBe('condition');
  });

  test('a broken input inside a stop condition still makes it invalid', () => {
    const masked = classifyInputSlot(
      parseYaml(`
read_until:
  idle_timeout: 5m
  input:
    broker:
      inputs:
        - read_until: { input: { kafka: {} } }
        - sql_select: {}
`)
    );
    expect(masked.kind).toBe('invalid');
  });

  test('a zero idle timeout never fires; a negative one counts as unset', () => {
    expect(classifyInputSlot(parseYaml('read_until: { idle_timeout: 0s, input: { kafka: {} } }'))).toMatchObject({
      kind: 'continuous',
      finiteHint: 'Use an idle timeout above zero, such as 30s.',
    });
    const drains = classifyInputSlot(parseYaml('read_until: { idle_timeout: 0s, input: { sql_select: {} } }'));
    expect(drains.kind).toBe('natural');
    expect(drains.reason).toContain('`0s` never fires');
    expect(kindOf('read_until: { idle_timeout: -1s, input: { kafka: {} } }')).toBe('invalid');
    const checkOnly = classifyInputSlot(
      parseYaml('read_until: { idle_timeout: -1s, check: "counter() >= 5", input: { sql_select: {} } }')
    );
    expect(checkOnly).toMatchObject({ kind: 'condition', reason: 'Stops after 5 messages.' });
  });

  test('a check that is never true does not stop the input', () => {
    expect(kindOf('read_until: { check: "false", input: { kafka: {} } }')).toBe('continuous');
    expect(kindOf('read_until: { check: "false", idle_timeout: 5s, input: { kafka: {} } }')).toBe('condition');
  });

  test('a stop condition records the parts that act', () => {
    const rereads = classifyInputSlot(
      parseYaml(
        '{ read_until: { check: "counter() >= 1000", idle_timeout: 30s, restart_input: true, input: { generate: { count: 10, mapping: "root = 1" } } } }'
      )
    );
    expect(rereads).toMatchObject({ kind: 'condition', stopsOn: { check: 'counter() >= 1000' } });
    expect(rereads.stopsOn?.idleTimeout).toBeUndefined();
  });

  test('an inert stop condition over one that ends stops when the inner one does', () => {
    const nested = classifyInputSlot(
      parseYaml(
        '{ read_until: { idle_timeout: 0s, input: { read_until: { check: "counter() >= 5", input: { kafka: {} } } } } }'
      )
    );
    expect(nested.kind).toBe('natural');
  });
});

describe('classifyInputSlot restart_input and check-only stop conditions', () => {
  test('restart_input reads a finished input again, so an idle timeout never runs out', () => {
    const rereads = classifyInputSlot(
      parseYaml('read_until: { idle_timeout: 30s, restart_input: true, input: { sql_select: {} } }')
    );
    expect(rereads.kind).toBe('continuous');
    expect(rereads.reason).toContain('never goes idle');
    expect(rereads.finiteHint).toBe('Turn off `restart_input` so it stops when it goes idle.');

    const untilMatch = classifyInputSlot(
      parseYaml('read_until: { check: this.done, restart_input: true, input: { sql_select: {} } }')
    );
    expect(untilMatch).toMatchObject({ kind: 'condition' });
    expect(untilMatch.caveat).toContain('If none does, it never stops.');

    // An input that never finishes is never restarted, so its timeout still ends it.
    expect(kindOf('read_until: { idle_timeout: 30s, restart_input: true, input: { kafka: {} } }')).toBe('condition');
  });

  test('restart_input over an input that may or may not end leaves an idle timeout in doubt', () => {
    const maybe = classifyInputSlot(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
      parseYaml('read_until: { idle_timeout: 30s, restart_input: true, input: { generate: { count: "${N}" } } }')
    );
    expect(maybe).toMatchObject({
      kind: 'unknown',
      finiteHint: 'Turn off `restart_input` so it stops when it goes idle.',
    });
    expect(maybe.reason).toContain('fires only if its input never finishes');

    const withCheck = classifyInputSlot(
      parseYaml('read_until: { check: this.done, idle_timeout: 30s, restart_input: true, input: { my_plugin: {} } }')
    );
    expect(withCheck).toMatchObject({ kind: 'condition', reason: 'Stops when `this.done` is true.' });
    expect(withCheck.caveat).toBe(
      'If no message meets its check, it may keep running: `restart_input` reads its input again whenever it finishes.'
    );
  });

  test('restart_input from an env var is known only when it ends the same way either way', () => {
    const idle = classifyInputSlot(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
      parseYaml('read_until: { idle_timeout: 30s, restart_input: "${R}", input: { sql_select: {} } }')
    );
    expect(idle).toMatchObject({ kind: 'unknown' });
    expect(idle.reason).toContain('`restart_input`');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('read_until: { idle_timeout: 30s, restart_input: "${R}", input: { kafka: {} } }')).toBe('condition');
  });

  test('a check alone over an input that never ends warns it may wait forever', () => {
    const limit = classifyInputSlot(parseYaml('read_until: { check: "counter() >= 1000", input: { kafka: {} } }'));
    expect(limit.kind).toBe('condition');
    expect(limit.caveat).toBe(
      'If fewer than 1000 messages arrive, it keeps running. Add an idle timeout as a backstop.'
    );
    expect(
      classifyInputSlot(
        parseYaml('read_until: { check: "counter() >= 1000", idle_timeout: 30s, input: { kafka: {} } }')
      ).caveat
    ).toBeUndefined();
    const broker = classifyInputSlot(
      parseYaml(`
broker:
  inputs:
    - sql_select: {}
    - read_until: { check: this.last, input: { kafka: {} } }
`)
    );
    expect(broker).toMatchObject({ kind: 'natural', caveat: '1 of 2 inputs might keep running.' });
  });

  test('a check alone over an input that may never end warns it may wait forever', () => {
    expect(
      classifyInputSlot(parseYaml('read_until: { check: "counter() >= 100", input: { my_plugin: {} } }'))
    ).toMatchObject({
      kind: 'condition',
      caveat: 'If fewer than 100 messages arrive, it may keep running. Add an idle timeout as a backstop.',
    });
  });
});

describe('classifyInputSlot batching', () => {
  test('batching without a period waits forever on a last partial batch', () => {
    const batched = classifyInputSlot(parseYaml('batched: { child: { sql_select: {} }, policy: { count: 10 } }'));
    expect(batched).toMatchObject({
      kind: 'unknown',
      finiteHint: 'Set `policy.period` (such as 1s) so the last batch is sent.',
    });
    expect(kindOf('broker: { inputs: [{ sql_select: {} }], batching: { count: 2 } }')).toBe('unknown');
    expect(kindOf('broker: { inputs: [{ sql_select: {} }], batching: { count: 2, period: 1s } }')).toBe('natural');
    // A broker with nothing to batch on doesn't batch at all.
    expect(kindOf('broker: { inputs: [{ sql_select: {} }], batching: { count: 0 } }')).toBe('natural');
  });

  test('a batch policy with nothing to send a batch on is refused', () => {
    expect(classifyInputSlot(parseYaml('batched: { child: { sql_select: {} }, policy: {} }'))).toMatchObject({
      kind: 'invalid',
      reason:
        'Its `policy` has no `count`, `byte_size`, `period` or `check` to send a batch on, so Connect refuses it.',
    });
    expect(kindOf('broker: { inputs: [{ kafka: {} }], batching: { processors: [{ archive: {} }] } }')).toBe('invalid');
    expect(
      kindOf('broker: { inputs: [{ sql_select: {} }], batching: { count: 1, processors: [{ archive: {} }] } }')
    ).toBe('natural');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(kindOf('batched: { child: { sql_select: {} }, policy: { count: "${N}", period: 1s } }')).toBe('natural');
  });

  test('inputs that read in batches say so', () => {
    const batches = (yaml: string) => classifyInputSlot(parseYaml(yaml)).batches ?? false;
    // The ordered Kafka readers pass on each partition fetch as one batch.
    expect(batches('redpanda: { topics: [a] }')).toBe(true);
    expect(batches('redpanda: { topics: [a], unordered_processing: { enabled: true } }')).toBe(false);
    expect(batches('kafka_franz: { topics: [a] }')).toBe(false);
    expect(batches('kafka_franz: { topics: [a], batching: { count: 10 } }')).toBe(true);
    expect(batches('generate: { count: 5, batch_size: 2 }')).toBe(true);
    expect(batches('generate: { count: 5, batch_size: 1 }')).toBe(false);
    expect(batches('broker: { inputs: [ { stdin: {} }, { redpanda: {} } ] }')).toBe(true);
  });

  test('a stop condition over an input that reads in batches counts batches', () => {
    const limited = classifyInputSlot(
      parseYaml('{ read_until: { check: "counter() >= 1000", idle_timeout: 30s, input: { redpanda: {} } } }')
    );
    expect(limited).toMatchObject({ reason: 'Stops after 1,000 batches, or after 30 seconds without new messages.' });
    expect(limited.caveat).toBeUndefined();
    // The check sees only each batch's first message, so a match later in one goes unseen.
    const matched = classifyInputSlot(
      parseYaml('{ read_until: { check: this.last, idle_timeout: 30s, input: { redpanda: {} } } }')
    );
    expect(matched.caveat).toBe('Its input reads in batches, and the check sees only the first message of each.');
  });
});

describe('summarizePipelineEndYaml', () => {
  test('a pipeline is finite when its input is', () => {
    expect(summarizePipelineEndYaml('input: { sql_select: {} }\noutput: { drop: {} }').status).toBe('finite');
    expect(summarizePipelineEndYaml('input: { read_until: { idle_timeout: 1m, input: { kafka: {} } } }').status).toBe(
      'finite'
    );
    expect(summarizePipelineEndYaml('input: { kafka: {} }').status).toBe('continuous');
    expect(summarizePipelineEndYaml('input: { read_until: { input: { kafka: {} } } }').status).toBe('invalid');
  });

  test('no input, or YAML that does not parse, has no answer', () => {
    expect(summarizePipelineEndYaml('output: { drop: {} }').status).toBe('none');
    expect(summarizePipelineEndYaml('input: [').status).toBe('none');
  });
});
