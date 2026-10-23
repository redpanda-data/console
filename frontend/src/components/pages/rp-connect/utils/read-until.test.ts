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

import { parseDocument, parse as parseYaml } from 'yaml';

import type { InputEndBehavior } from './input-end-behavior';
import type { StopSlot } from './pipeline-flow-parser';
import {
  describeDuration,
  describeStopCondition,
  idleTimeoutFires,
  isIdleTimeoutParseable,
  isValidIdleTimeout,
  messageLimitCheck,
  parseGoDuration,
  parseMessageLimit,
  resolveStopCondition,
  sameStopCondition,
  setStopCondition,
  stopRowText,
  stopShortLabel,
  stopSlotLock,
} from './read-until';
import { readStopCondition, unwrapReadUntil } from './yaml';
import { describe, expect, test } from 'bun:test';

describe('message limits', () => {
  test('reads counter() limits and legacy count("name") limits', () => {
    expect(parseMessageLimit('counter() >= 1000')).toEqual({ limit: 1000 });
    expect(parseMessageLimit('  counter( ) > 99 ')).toEqual({ limit: 100 });
    expect(parseMessageLimit('count("messages") >= 100')).toEqual({ limit: 100, counter: 'messages' });
  });

  test('anything else is not a limit', () => {
    expect(parseMessageLimit(undefined)).toBeUndefined();
    expect(parseMessageLimit('this.done')).toBeUndefined();
    expect(parseMessageLimit('counter() >= 0')).toBeUndefined();
    expect(parseMessageLimit('counter() >= 10 && this.done')).toBeUndefined();
  });

  test('writes counter(), or the legacy form it was given', () => {
    expect(messageLimitCheck({ limit: 5 })).toBe('counter() >= 5');
    expect(messageLimitCheck({ limit: 5, counter: 'msgs' })).toBe('count("msgs") >= 5');
  });
});

describe('resolveStopCondition', () => {
  test('a new limit counts with counter(), so sibling inputs never share a count', () => {
    expect(resolveStopCondition(undefined, { messageLimit: 250 })).toEqual({ check: 'counter() >= 250' });
  });

  test('editing a legacy count("name") limit keeps its counter', () => {
    expect(resolveStopCondition({ check: 'count("orders") >= 10' }, { messageLimit: 20 })).toEqual({
      check: 'count("orders") >= 20',
    });
  });

  test('restart_input is kept with any condition, never alone, and values are trimmed', () => {
    expect(resolveStopCondition(undefined, { idleTimeout: ' 30s ', restartInput: true })).toEqual({
      idleTimeout: '30s',
      restartInput: true,
    });
    expect(resolveStopCondition(undefined, { restartInput: true })).toEqual({});
    expect(resolveStopCondition(undefined, { check: ' this.done ', restartInput: true })).toEqual({
      check: 'this.done',
      restartInput: true,
    });
  });
});

describe('sameStopCondition', () => {
  test('compares the written settings', () => {
    expect(sameStopCondition({ check: 'a ', idleTimeout: '5s' }, { check: 'a', idleTimeout: '5s' })).toBe(true);
    expect(sameStopCondition({ idleTimeout: '5s' }, { idleTimeout: '5s', restartInput: true })).toBe(false);
    expect(sameStopCondition(undefined, {})).toBe(true);
  });
});

describe('durations', () => {
  test('parse as Go’s time.ParseDuration does', () => {
    const cases: [string, number | undefined][] = [
      ['1h30m', 5400e9],
      ['.5s', 0.5e9],
      ['1.s', 1e9],
      ['+1s', 1e9],
      ['-1s', -1e9],
      ['0', 0],
      ['1µs', 1e3],
      ['1μs', 1e3],
      // Go truncates a fraction below a nanosecond.
      ['0.0000000001s', 0],
      ['30', undefined],
      ['1d', undefined],
      ['.s', undefined],
      ['5 m', undefined],
      ['', undefined],
      ['99999999999h', undefined],
    ];
    for (const [text, ns] of cases) {
      expect([text, parseGoDuration(text)]).toEqual([text, ns]);
    }
  });

  test('the editor accepts durations that fire, and env var references', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Connect env var references, not JS templates
    for (const ok of ['30s', '5m', '1h30m', '500ms', '1.5h', '.5s', '${IDLE}', '${IDLE:30s}']) {
      expect([ok, isValidIdleTimeout(ok)]).toEqual([ok, true]);
    }
    for (const bad of ['', '30', 'soon', '0s', '0', '-5s', '5 m', '0.0000000001s']) {
      expect([bad, isValidIdleTimeout(bad)]).toEqual([bad, false]);
    }
  });

  test('a zero timeout parses but never fires', () => {
    expect(isIdleTimeoutParseable('0s')).toBe(true);
    expect(idleTimeoutFires('0s')).toBe(false);
    expect(idleTimeoutFires('-1s')).toBe(false);
    expect(idleTimeoutFires('1ms')).toBe(true);
  });

  test('describes them in words', () => {
    expect(describeDuration('1m')).toBe('1 minute');
    expect(describeDuration('1h30m')).toBe('1 hour 30 minutes');
    expect(describeDuration('.5s')).toBe('0.5 seconds');
    expect(describeDuration('0')).toBe('0 seconds');
    expect(describeDuration('weird')).toBe('weird');
  });
});

describe('describeStopCondition', () => {
  test('summarizes a limit, a check and an idle timeout', () => {
    expect(describeStopCondition({ check: 'counter() >= 1500' })).toEqual({
      short: '1.5K msgs',
      compact: 'after 1.5K msgs',
      long: 'after 1,500 messages',
    });
    expect(describeStopCondition({ check: 'this.last', idleTimeout: '30s' })).toEqual({
      short: 'on match · idle 30s',
      compact: 'on match or 30s idle',
      long: 'when `this.last` is true, or after 30 seconds without new messages',
    });
    expect(describeStopCondition({ check: 'counter() >= 1000', idleTimeout: '1m' }).compact).toBe(
      'after 1K msgs or 1m idle'
    );
    expect(describeStopCondition({ idleTimeout: '30s' }).compact).toBe('after 30s idle');
  });

  test('a check holding a backtick is described without quoting it', () => {
    expect(describeStopCondition({ check: 'this.name == "`x`"' }).long).toBe('when its check is true');
  });
});

describe('stopShortLabel', () => {
  const slot = (condition: { check?: string; idleTimeout?: string }) => ({
    path: ['input'],
    condition,
    ownEnd: { kind: 'continuous' as const, reason: '' },
  });

  test('names only the parts of the condition that act', () => {
    // Re-read with restart_input, the input never goes idle, so only the limit ends it.
    const effective = { kind: 'condition' as const, reason: '', stopsOn: { check: 'counter() >= 1000' } };
    expect(stopShortLabel(slot({ check: 'counter() >= 1000', idleTimeout: '30s' }), effective)).toBe('1K msgs');
  });

  test('names the condition only while it is what ends the input', () => {
    expect(stopShortLabel(slot({ idleTimeout: '30s' }), { kind: 'condition', reason: '' })).toBe('Idle 30s');
    expect(stopShortLabel(slot({ idleTimeout: 'soon' }), { kind: 'invalid', reason: '' })).toBe('Needs fixing');
    expect(stopShortLabel(slot({ idleTimeout: '0s' }), { kind: 'continuous', reason: '' })).toBe('Continuous');
    expect(
      stopShortLabel({ path: ['input'], ownEnd: { kind: 'unknown', reason: '' } }, { kind: 'unknown', reason: '' })
    ).toBe('May not stop');
  });
});

describe('stopRowText', () => {
  const continuous: InputEndBehavior = {
    kind: 'continuous',
    reason: 'Keeps consuming new messages until the pipeline is stopped.',
  };
  const natural: InputEndBehavior = { kind: 'natural', reason: 'Reads every object in the bucket, then stops.' };
  const openSlot: StopSlot = { path: ['input'], ownEnd: continuous };

  test('a broker row counts the members that keep it running', () => {
    const members = { total: 3, continuous: 1, unknown: 0, invalid: 0 };
    const group = { isGroup: true };
    expect(stopRowText('broker', openSlot, { ...continuous, members }, group)).toEqual({
      eyebrow: 'Continuous',
      text: '1 of 3 inputs never stops',
    });
    expect(stopRowText('broker', openSlot, { ...continuous, members: { ...members, continuous: 3 } }, group).text).toBe(
      'none of its 3 inputs stop'
    );
    expect(stopRowText('sequence', openSlot, { ...natural, members }, group).text).toBe('after its last input stops');
    const stopped = { kind: 'condition' as const, reason: 'Stops after 5 seconds without new messages.' };
    expect(
      stopRowText('broker', { path: ['input'], condition: { idleTimeout: '5s' }, ownEnd: natural }, stopped, group)
    ).toEqual({ eyebrow: 'Stops', text: 'after 5s idle' });
  });

  test('a broker whose own batching may not stop says so, not its members', () => {
    const members = { total: 2, continuous: 0, unknown: 0, invalid: 0 };
    const batching: InputEndBehavior = { kind: 'unknown', reason: 'Its `batching` has no `period`.', members };
    expect(stopRowText('broker', openSlot, batching, { isGroup: true })).toEqual({
      eyebrow: 'Stops?',
      text: 'Its batching has no period.',
    });
  });

  test('an input card’s row is short enough for the card', () => {
    const stopped = { kind: 'condition' as const, reason: '' };
    const limited: StopSlot = {
      path: ['input'],
      condition: { check: 'counter() >= 1000', idleTimeout: '1m' },
      ownEnd: continuous,
    };
    expect(stopRowText('kafka', limited, stopped)).toEqual({ eyebrow: 'Stops', text: 'after 1K msgs or 1m idle' });
    expect(stopRowText('aws_s3', { path: ['input'], ownEnd: natural }, natural).text).toBe('when its data runs out');
  });

  test('an input card’s row invites a condition when it can take one, and says why one doesn’t act', () => {
    expect(stopRowText('kafka', openSlot, continuous, { editable: true }).text).toBe('set a stop condition');
    expect(stopRowText('kafka', openSlot, continuous).text).toBe('no stop condition');
    const zero: StopSlot = { path: ['input'], condition: { idleTimeout: '0s' }, ownEnd: continuous };
    expect(stopRowText('kafka', zero, continuous).text).toBe('condition never fires');
    const empty: StopSlot = { path: ['input'], condition: {}, ownEnd: continuous };
    expect(stopRowText('kafka', empty, { kind: 'invalid', reason: 'x' })).toEqual({
      eyebrow: 'Fix',
      text: 'condition incomplete',
    });
    expect(stopRowText('plugin', openSlot, { kind: 'unknown', reason: 'x' }).text).toBe('may not stop on its own');
  });
});

describe('unwrapReadUntil', () => {
  test('sees through a wrapper to the input it reads', () => {
    const slot = parseYaml(`
read_until:
  check: counter() >= 3
  idle_timeout: 10s
  restart_input: true
  input:
    kafka: { topics: [a] }
`);
    expect(unwrapReadUntil(slot)).toEqual({
      component: { kafka: { topics: ['a'] } },
      innerPath: ['read_until', 'input'],
      stop: { check: 'counter() >= 3', idleTimeout: '10s', restartInput: true },
    });
  });

  test('a wrapper with no input yet is left as the component', () => {
    const slot = { read_until: { check: 'true' } };
    expect(unwrapReadUntil(slot)).toEqual({ component: slot, innerPath: [] });
  });

  test('an unquoted numeric idle timeout stays visible', () => {
    expect(readStopCondition({ idle_timeout: 30 })).toEqual({ idleTimeout: '30' });
  });

  test('a scalar check is the query Connect reads, and restart_input takes YAML 1.1 words', () => {
    expect(readStopCondition({ check: true, restart_input: 'yes' })).toEqual({ check: 'true', restartInput: true });
    expect(readStopCondition({ check: 'true', restart_input: 'off' })).toEqual({ check: 'true' });
  });

  test('looks past a slot’s processors to find the wrapper', () => {
    const slot = { processors: [], read_until: { idle_timeout: '5s', input: { kafka: {} } } };
    expect(unwrapReadUntil(slot)).toMatchObject({ innerPath: ['read_until', 'input'], stop: { idleTimeout: '5s' } });
  });
});

const plain = `# Orders from Redpanda
input:
  label: orders_in
  redpanda:
    topics: [orders] # the main topic
  processors:
    - mapping: root = this

output:
  drop: {}
`;

describe('setStopCondition wrapping', () => {
  test('wraps the input with its label and processors, comments included', () => {
    const next = setStopCondition(plain, ['input'], { idleTimeout: '30s' });
    expect(next).toBe(`# Orders from Redpanda
input:
  read_until:
    idle_timeout: 30s
    input:
      label: orders_in
      redpanda:
        topics: [ orders ] # the main topic
      processors:
        - mapping: root = this

output:
  drop: {}
`);
  });

  test('edits an existing wrapper in place', () => {
    const wrapped = `input:
  read_until:
    check: counter() >= 10 # cap
    idle_timeout: 5s
    input:
      generate: { mapping: root = 1 }
`;
    const next = setStopCondition(wrapped, ['input'], { check: 'counter() >= 20' });
    expect(next).toBe(`input:
  read_until:
    check: counter() >= 20 # cap
    input:
      generate: { mapping: root = 1 }
`);
  });

  test('new settings land ahead of the wrapped input', () => {
    const wrapped = `input:
  read_until:
    input:
      generate: { mapping: root = 1 }
    check: counter() >= 1
`;
    const next = setStopCondition(wrapped, ['input'], { check: 'counter() >= 1', idleTimeout: '1m' }) as string;
    expect(next.indexOf('idle_timeout')).toBeLessThan(next.indexOf('input:\n      generate'));
  });

  test('wraps one broker member, leaving its siblings alone', () => {
    const broker = `input:
  broker:
    inputs:
      - kafka: { topics: [a] }
      - aws_s3: { bucket: b }
`;
    const next = setStopCondition(broker, ['input', 'broker', 'inputs', 0], { idleTimeout: '10s' }) as string;
    expect(parseYaml(next)).toEqual({
      input: {
        broker: {
          inputs: [
            { read_until: { idle_timeout: '10s', input: { kafka: { topics: ['a'] } } } },
            { aws_s3: { bucket: 'b' } },
          ],
        },
      },
    });
  });

  test('a one-line member is wrapped in block style', () => {
    const broker = 'input:\n  broker:\n    inputs:\n      - { kafka: { topics: [a] } }\n';
    expect(setStopCondition(broker, ['input', 'broker', 'inputs', 0], { idleTimeout: '10s' })).toBe(
      'input:\n  broker:\n    inputs:\n      - read_until:\n          idle_timeout: 10s\n          input:\n            kafka: { topics: [ a ] }\n'
    );
  });

  test('an anchored member keeps meaning the bare input for its aliases, wrapped or not', () => {
    const anchored =
      'input:\n  broker:\n    inputs:\n      - &m\n        generate: { mapping: root = 1 }\n      - *m\n';
    const wrapped = setStopCondition(anchored, ['input', 'broker', 'inputs', 0], { idleTimeout: '5s' }) as string;
    expect(parseYaml(wrapped)).toEqual({
      input: {
        broker: {
          inputs: [
            { read_until: { idle_timeout: '5s', input: { generate: { mapping: 'root = 1' } } } },
            { generate: { mapping: 'root = 1' } },
          ],
        },
      },
    });
    const unwrapped = setStopCondition(wrapped, ['input', 'broker', 'inputs', 0], null) as string;
    expect(parseYaml(unwrapped)).toEqual(parseYaml(anchored));
  });

  test('a multi-line check round-trips', () => {
    const check = 'let n = this.n\n$n > 3';
    const wrapped = setStopCondition(plain, ['input'], { check }) as string;
    expect(readStopCondition(parseYaml(wrapped).input.read_until)).toEqual({ check });
    const edited = setStopCondition(wrapped, ['input'], { check: `${check}\n# done` }) as string;
    expect(readStopCondition(parseYaml(edited).input.read_until)).toEqual({ check: `${check}\n# done` });
  });
});

describe('setStopCondition unwrapping', () => {
  test('unwrapping keeps the input’s own label over one on the wrapper', () => {
    const both =
      'input:\n  label: outer\n  read_until:\n    idle_timeout: 5s\n    input:\n      label: inner\n      kafka: {}\n';
    expect(parseYaml(setStopCondition(both, ['input'], null) as string)).toEqual({
      input: { label: 'inner', kafka: {} },
    });
  });

  test('unwrapping keeps a comment heading the wrapped input', () => {
    const commented =
      'input:\n  read_until:\n    idle_timeout: 5s\n    input:\n      # reads the orders topic\n      kafka: {}\n';
    expect(setStopCondition(commented, ['input'], null)).toContain('# reads the orders topic');
  });

  test('clearing the condition restores the original input', () => {
    const wrapped = setStopCondition(plain, ['input'], { check: 'counter() >= 10' }) as string;
    const unwrapped = setStopCondition(wrapped, ['input'], null) as string;
    expect(parseYaml(unwrapped)).toEqual(parseYaml(plain));
    expect(unwrapped).toContain('# the main topic');
  });

  test('unwrapping merges slot processors after the input’s own', () => {
    const wrapped = `input:
  read_until:
    idle_timeout: 5s
    input:
      generate: { mapping: root = 1 }
      processors: [{ log: { message: inner } }]
  processors: [{ log: { message: outer } }]
`;
    expect(parseYaml(setStopCondition(wrapped, ['input'], null) as string)).toEqual({
      input: {
        generate: { mapping: 'root = 1' },
        processors: [{ log: { message: 'inner' } }, { log: { message: 'outer' } }],
      },
    });
  });

  test('comments on the wrapper’s own keys survive unwrapping', () => {
    const commented =
      'input:\n  # stops the backfill\n  read_until:\n    idle_timeout: 5s\n    # the source\n    input:\n      kafka: {}\n';
    const out = setStopCondition(commented, ['input'], null) as string;
    expect(out).toContain('# stops the backfill');
    expect(out).toContain('# the source');
  });

  test('comments around a hand-written wrapper survive unwrapping', () => {
    const yaml = `input:
  read_until: # stop when idle
    idle_timeout: 5s
    input:
      kafka:
        topics:
          - a
      # processors: Optional
  # label: Optional
`;
    expect(setStopCondition(yaml, ['input'], null)).toBe(`input:
  # stop when idle
  kafka:
    topics:
      - a
  # processors: Optional
  # label: Optional
`);
  });

  test('a condition with nothing to stop on clears instead of writing an invalid wrapper', () => {
    const wrapped = setStopCondition(plain, ['input'], { idleTimeout: '5s' }) as string;
    expect(parseYaml(setStopCondition(wrapped, ['input'], { restartInput: true }) as string)).toEqual(parseYaml(plain));
  });
});

describe('setStopCondition no-ops and refusals', () => {
  test('refuses an unwrap that would change behaviour', () => {
    const clash = `input:
  read_until:
    idle_timeout: 5s
    input:
      generate: { mapping: root = 1 }
      foo: inner
  foo: outer
`;
    expect(setStopCondition(clash, ['input'], null)).toBeNull();
  });

  test('refuses an unwrap beside a merge key, whose keys the moved ones could shadow', () => {
    const merged = `base: &base
  processors: [{ log: { message: shared } }]
input:
  <<: *base
  read_until:
    idle_timeout: 5s
    input:
      generate: { mapping: root = 1 }
      processors: [{ log: { message: inner } }]
`;
    expect(setStopCondition(merged, ['input'], null)).toBeNull();
  });

  test('a no-op clear returns the YAML untouched; a missing slot or bad YAML refuses', () => {
    expect(setStopCondition(plain, ['input'], null)).toBe(plain);
    expect(setStopCondition(plain, ['input', 'broker', 'inputs', 3], { idleTimeout: '5s' })).toBeNull();
    expect(setStopCondition('input: [unclosed', ['input'], { idleTimeout: '5s' })).toBeNull();
  });

  test('refuses an unwrap that would merge processors into or out of an anchored list', () => {
    const shared = `input:
  read_until:
    check: this.done
    input:
      generate: { mapping: root = 1 }
      processors: [{ mapping: root = "inner" }]
  processors: &p [{ mapping: root = "shared" }]
output:
  drop: {}
  processors: *p
`;
    expect(setStopCondition(shared, ['input'], null)).toBeNull();
    const anchoredInner = `input:
  read_until:
    check: this.done
    input:
      generate: { mapping: root = 1 }
      processors: &q [{ mapping: root = "inner" }]
  processors: [{ mapping: root = "outer" }]
output:
  drop: {}
  processors: *q
`;
    expect(setStopCondition(anchoredInner, ['input'], null)).toBeNull();
  });

  test('refuses to wrap again a read_until a merge key brings in', () => {
    const merged = 'x: &ru\n  read_until:\n    check: counter() >= 5\n    input: { generate: {} }\ninput:\n  <<: *ru\n';
    expect(setStopCondition(merged, ['input'], { check: 'counter() >= 10' })).toBeNull();
  });
});

describe('stopSlotLock', () => {
  const lockOf = (yaml: string, path: (string | number)[] = ['input']) => stopSlotLock(parseDocument(yaml), path);

  test('a plain or wrapped input can be rewritten', () => {
    expect(lockOf('input:\n  kafka: {}\n')).toBeUndefined();
    expect(lockOf('input:\n  read_until:\n    idle_timeout: 5s\n    input: { kafka: {} }\n')).toBeUndefined();
    // A component merged in moves inside the wrapper as is.
    expect(lockOf('x: &k { kafka: {} }\ninput:\n  <<: *k\n')).toBeUndefined();
  });

  test('an input reached through an alias is locked', () => {
    const member = 'x: &k { kafka: {} }\ninput:\n  broker:\n    inputs:\n      - *k\n';
    expect(lockOf(member, ['input', 'broker', 'inputs', 0])).toContain('alias');
    expect(lockOf('x: &in { generate: {} }\ninput:\n  read_until:\n    check: this.done\n    input: *in\n')).toContain(
      'alias'
    );
  });

  test('a read_until from a merge key is locked, under either merge setting', () => {
    const merged = 'x: &ru\n  read_until:\n    check: this.done\n    input: { generate: {} }\ninput:\n  <<: *ru\n';
    expect(lockOf(merged)).toContain('merge key');
    expect(stopSlotLock(parseDocument(merged, { merge: true }), ['input'])).toContain('merge key');
  });

  test('stop settings a merge key brings into the wrapper are locked, since rewriting would leave them', () => {
    const merged = 'x: &stop { idle_timeout: 30s }\ninput:\n  read_until:\n    <<: *stop\n    input: { kafka: {} }\n';
    expect(lockOf(merged)).toBe('Its stop settings come from a YAML merge key. Change its stop condition in the YAML.');
    expect(setStopCondition(merged, ['input'], { check: 'counter() >= 5' })).toBeNull();
  });

  test('a restart_input from an env var is locked, since the editor would drop it', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    const env = 'input:\n  read_until:\n    idle_timeout: 5s\n    restart_input: ${R}\n    input: { kafka: {} }\n';
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(lockOf(env)).toBe('Its `restart_input` is set from `${R}`. Change its stop condition in the YAML.');
  });
});
