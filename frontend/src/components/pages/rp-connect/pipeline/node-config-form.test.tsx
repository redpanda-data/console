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

import { describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from 'test-utils';

import { NodeConfigForm } from './node-config-form';
import type { ConnectComponentSpec } from '../types/schema';
import { mockKafkaOutput } from '../utils/__fixtures__/component-schemas';

rs.mock('react-query/api/topic', () => ({
  useListTopicsQuery: () => ({ data: { topics: [{ name: 'orders' }, { name: 'events' }] }, isLoading: false }),
}));

const spec = mockKafkaOutput as unknown as ConnectComponentSpec;

function renderForm(value: Record<string, unknown>, onConfigChange = rs.fn()) {
  render(<NodeConfigForm componentName="kafka" onConfigChange={onConfigChange} spec={spec} value={value} />);
  return onConfigChange;
}

const CREATE_NEW_TOPIC_RE = /create new topic/iu;
const TOPIC_FIELD_RE = /^topic/iu;
const KAFKA_OUTPUT_DOCS = 'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/outputs/kafka/';
const TOPIC_DOCS_RE = /topic documentation/iu;
const BATCHING_COUNT_DOCS_RE = /count documentation/iu;
const NOT_VALID_INTEGER_RE = /Not a valid integer/u;
const NOT_SAVED_UNTIL_FIXED_RE = /won't be saved until fixed/u;
const REFERENCE_SECRET_RE = /reference a secret/iu;
const RESOURCE_NEEDS_LABEL_RE = /A resource needs a label/u;
const EDITED_ON_CANVAS_RE = /edited on the canvas/iu;
const TOPIC_NAME_RE = /topic/iu;

function fieldLabelRow(name: string) {
  const row = screen.getByText(name).closest('div');
  if (!row) {
    throw new Error(`No label row for field "${name}"`);
  }
  return row;
}

function lastReported(onConfigChange: ReturnType<typeof rs.fn>) {
  return onConfigChange.mock.calls.at(-1)?.[0];
}

function renderWithFieldCommit(value: Record<string, unknown>, commitLands = true) {
  const onConfigChange = rs.fn();
  const onCommitField = rs.fn(() => commitLands);
  render(
    <NodeConfigForm
      componentName="kafka"
      onCommitField={onCommitField}
      onConfigChange={onConfigChange}
      spec={spec}
      value={value}
    />
  );
  return { onCommitField, onConfigChange };
}

async function editMalformedCountAlongsideKey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('batching'));
  const count = screen.getByDisplayValue('5');
  await user.clear(count);
  await user.type(count, '10x');
  await user.type(screen.getByDisplayValue('orig'), '-2');
}

describe('the NodeConfigForm — full schema', () => {
  describe('field rendering', () => {
    test('renders required scalar fields, a scalar-array field, and nested object groups', async () => {
      const user = userEvent.setup();
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

      expect(screen.getByText('topic')).toBeInTheDocument();
      expect(screen.getByText('addresses')).toBeInTheDocument();
      expect(screen.getByText('batching')).toBeInTheDocument();
      expect(screen.getByText('Optional')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();

      await user.click(screen.getByText('Advanced'));
      expect(screen.getByText('sasl')).toBeInTheDocument();
      expect(screen.getByText('tls')).toBeInTheDocument();
    });

    test('marks only no-default fields required; a defaulted field (sasl.mechanism) is not', async () => {
      const user = userEvent.setup();
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

      expect(within(fieldLabelRow('topic')).getByText('*')).toBeInTheDocument();

      await user.click(screen.getByText('Advanced'));
      await user.click(screen.getByText('sasl'));
      expect(within(fieldLabelRow('mechanism')).queryByText('*')).toBeNull();
    });

    test('deep-links every field to its own heading on the connector docs page', async () => {
      const user = userEvent.setup();
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

      expect(screen.getByRole('link', { name: TOPIC_DOCS_RE })).toHaveAttribute('href', `${KAFKA_OUTPUT_DOCS}#topic`);

      await user.click(screen.getByText('batching'));
      expect(screen.getByRole('link', { name: BATCHING_COUNT_DOCS_RE })).toHaveAttribute(
        'href',
        `${KAFKA_OUTPUT_DOCS}#batching-count`
      );
    });

    test('shows the schema default as a hint for optional fields', () => {
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });
      expect(screen.getByText('fnv1a_hash')).toBeInTheDocument();
    });
  });

  describe('change reporting', () => {
    test('reports a config only once something changes', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], key: 'orig' } });
      expect(lastReported(onConfigChange)).toBeNull();

      await user.type(screen.getByDisplayValue('orig'), 'X');
      expect(lastReported(onConfigChange)).not.toBeNull();
    });

    test('reports a changed scalar and keeps the YAML minimal (no empty optionals)', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], key: 'orig' } });

      const key = screen.getByDisplayValue('orig');
      await user.clear(key);
      await user.type(key, 'new-key');

      const next = lastReported(onConfigChange) as { kafka: Record<string, unknown> };
      expect(next.kafka.key).toBe('new-key');
      expect(next.kafka.addresses).toEqual(['a:9092']);
      expect(next.kafka).not.toHaveProperty('partitioner');
    });

    test('preserves complex/untouched settings when reporting an unrelated edit', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({
        kafka: {
          topic: 't',
          addresses: ['a:9092'],
          key: 'orig',
          metadata: { include_patterns: ['.*'] },
          batching: { count: '1000$' },
        },
      });

      await user.type(screen.getByDisplayValue('orig'), '-2');

      const next = lastReported(onConfigChange) as { kafka: { metadata: unknown; batching: { count: unknown } } };
      expect(next.kafka.metadata).toEqual({ include_patterns: ['.*'] });
      expect(next.kafka.batching.count).toBe('1000$');
    });

    test('shows a malformed numeric value instead of blanking it (text input, not type=number)', async () => {
      const user = userEvent.setup();
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '1000$' } } });
      await user.click(screen.getByText('batching'));
      expect(screen.getByDisplayValue('1000$')).toBeInTheDocument();
      expect(screen.getByText(NOT_VALID_INTEGER_RE)).toBeInTheDocument();
    });

    test('does not commit a malformed numeric value (the saved value is kept)', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: 5 } } });
      await user.click(screen.getByText('batching'));
      const countInput = screen.getByDisplayValue('5');
      await user.clear(countInput);
      await user.type(countInput, '10x');

      expect(screen.getByText(NOT_SAVED_UNTIL_FIXED_RE)).toBeInTheDocument();
      const next = lastReported(onConfigChange) as { kafka: { batching: { count: unknown } } };
      expect(next.kafka.batching.count).toBe(5);
    });
  });

  describe('secret fields', () => {
    test('masks credential-named fields and offers a secret-reference tip', async () => {
      const user = userEvent.setup();
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'], sasl: { password: 'hunter2' } } });
      await user.click(screen.getByText('Advanced'));
      await user.click(screen.getByText('sasl'));

      const password = screen.getByDisplayValue('hunter2');
      expect(password).toHaveAttribute('type', 'password');
      expect(screen.getAllByRole('button', { name: 'Show password' }).length).toBeGreaterThan(0);
      expect(screen.getAllByText(REFERENCE_SECRET_RE).length).toBeGreaterThan(0);
    });

    test('masks fields flagged secret by the schema even when the name heuristic misses them', () => {
      const secretSpec = {
        ...spec,
        config: {
          ...spec.config,
          children: [
            { name: 'credentials_json', type: 'string', kind: 'scalar', secret: true },
            { name: 'project', type: 'string', kind: 'scalar' },
          ],
        },
      } as unknown as ConnectComponentSpec;
      render(
        <NodeConfigForm
          componentName="gcp_pubsub"
          onConfigChange={rs.fn()}
          spec={secretSpec}
          value={{ gcp_pubsub: { credentials_json: 'top-secret', project: 'p1' } }}
        />
      );

      expect(screen.getByDisplayValue('top-secret')).toHaveAttribute('type', 'password');
      expect(screen.getByDisplayValue('p1')).toHaveAttribute('type', 'text');
    });
  });

  describe('value preservation', () => {
    test('deprecated fields are not rendered as form fields; existing values fall to raw YAML', () => {
      const deprecatedSpec = {
        ...spec,
        config: {
          ...spec.config,
          children: [
            { name: 'topic', type: 'string', kind: 'scalar' },
            { name: 'round_robin_partitions', type: 'string', kind: 'scalar', deprecated: true },
          ],
        },
      } as unknown as ConnectComponentSpec;
      render(
        <NodeConfigForm
          componentName="kafka"
          onConfigChange={rs.fn()}
          spec={deprecatedSpec}
          value={{ kafka: { topic: 't', round_robin_partitions: 'legacy' } }}
        />
      );

      expect(screen.queryByLabelText('round_robin_partitions')).not.toBeInTheDocument();
      expect(screen.getByText('Other settings (YAML)')).toBeInTheDocument();
    });

    test('keeps the saved label when a resource label field is cleared (references depend on it)', async () => {
      const user = userEvent.setup();
      const onConfigChange = rs.fn();
      render(
        <NodeConfigForm
          componentName="kafka"
          onConfigChange={onConfigChange}
          requireLabel
          spec={spec}
          value={{ label: 'shared', kafka: { topic: 't', addresses: ['a:9092'] } }}
        />
      );

      await user.clear(screen.getByDisplayValue('shared'));
      expect(screen.getByText(RESOURCE_NEEDS_LABEL_RE)).toBeInTheDocument();
      const next = lastReported(onConfigChange) as { label?: string };
      expect(next.label).toBe('shared');
    });

    test('does not flag secret/env interpolations in numeric fields', async () => {
      const user = userEvent.setup();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
      renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '${secrets.BATCH_COUNT}' } } });
      await user.click(screen.getByText('batching'));
      expect(screen.queryByText(NOT_VALID_INTEGER_RE)).not.toBeInTheDocument();
    });

    test('keeps an interpolation typed into a numeric field (not coerced to NaN and dropped)', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: 5 } } });
      await user.click(screen.getByText('batching'));
      const countInput = screen.getByDisplayValue('5');
      await user.clear(countInput);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
      await user.type(countInput, '${{env.COUNT}');

      const next = lastReported(onConfigChange) as { kafka: { batching: { count: unknown } } };
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
      expect(next.kafka.batching.count).toBe('${env.COUNT}');
    });

    test('does not render nested-component fields and preserves them on edit', async () => {
      const user = userEvent.setup();
      const branchSpec = {
        config: {
          children: [
            { name: 'request_map', type: 'string', kind: 'scalar', optional: false },
            { name: 'processors', type: 'processor', kind: 'array', optional: false },
          ],
        },
      } as unknown as ConnectComponentSpec;
      const onConfigChange = rs.fn();
      render(
        <NodeConfigForm
          componentName="branch"
          onConfigChange={onConfigChange}
          spec={branchSpec}
          value={{ branch: { request_map: 'root = this', processors: [{ http: { url: 'http://x' } }] } }}
        />
      );

      expect(screen.getByText('request_map')).toBeInTheDocument();
      expect(screen.queryByText('processors')).not.toBeInTheDocument();

      await user.type(screen.getByDisplayValue('root = this'), '!');

      const next = lastReported(onConfigChange) as { branch: Record<string, unknown> };
      expect(next.branch.processors).toEqual([{ http: { url: 'http://x' } }]);
      expect(next.branch.request_map).toBe('root = this!');
    });

    test('round-trips a scalar array edited as one-per-line text', async () => {
      const user = userEvent.setup();
      const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

      const addresses = screen.getByPlaceholderText('One value per line');
      await user.clear(addresses);
      await user.type(addresses, 'b:9092\nc:9092');

      const next = lastReported(onConfigChange) as { kafka: Record<string, unknown> };
      expect(next.kafka.addresses).toEqual(['b:9092', 'c:9092']);
    });
  });
});

describe('the NodeConfigForm — list-valued components (switch/try/…)', () => {
  const switchSpec = {
    name: 'switch',
    type: 'processor',
    config: {
      name: 'root',
      type: 'object',
      kind: 'scalar',
      children: [
        { name: 'check', type: 'string', kind: 'scalar', optional: false },
        { name: 'processors', type: 'processor', kind: 'array' },
      ],
    },
  } as unknown as ConnectComponentSpec;

  const switchValue = () => ({
    switch: [
      { check: 'this.region == "us"', processors: [{ mapping: 'root = this' }] },
      { processors: [{ log: { message: 'default' } }] },
    ],
  });

  test('editing the label preserves the array of cases (no data loss)', async () => {
    const user = userEvent.setup();
    const onConfigChange = rs.fn();
    const value = switchValue();
    render(<NodeConfigForm componentName="switch" onConfigChange={onConfigChange} spec={switchSpec} value={value} />);

    await user.type(screen.getByPlaceholderText('Optional identifier for this component'), 'router');

    expect(lastReported(onConfigChange)).toEqual({ label: 'router', switch: value.switch });
  });

  test('hides the (misleading) per-case fields and shows a canvas hint instead', () => {
    render(<NodeConfigForm componentName="switch" spec={switchSpec} value={switchValue()} />);
    expect(screen.queryByText('check')).toBeNull();
    expect(screen.getByText(EDITED_ON_CANVAS_RE)).toBeInTheDocument();
  });
});

describe('the NodeConfigForm — all-optional components', () => {
  const allOptionalSpec = {
    name: 'redpanda',
    type: 'input',
    config: {
      name: '',
      type: 'object',
      kind: 'scalar',
      children: [
        { name: 'topics', type: 'string', kind: 'array', optional: true },
        { name: 'consumer_group', type: 'string', kind: 'scalar', optional: true },
      ],
    },
  } as unknown as ConnectComponentSpec;

  test('renders fields plainly instead of burying everything under an "Optional" group', () => {
    render(<NodeConfigForm componentName="redpanda" spec={allOptionalSpec} value={{ redpanda: {} }} />);
    expect(screen.getByText('topics')).toBeInTheDocument();
    expect(screen.getByText('consumer_group')).toBeInTheDocument();
    expect(screen.queryByText('Optional')).toBeNull();
  });
});

describe('the NodeConfigForm — field-anchored lint errors', () => {
  test('renders the message under its field and hides it while the field is being edited', async () => {
    const user = userEvent.setup();
    render(
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={new Map([['key', ['key must not be empty']]])}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'], key: 'k' } }}
      />
    );

    expect(screen.getByText('key must not be empty')).toBeInTheDocument();

    await user.type(screen.getByDisplayValue('k'), 'ey-name');
    expect(screen.queryByText('key must not be empty')).not.toBeInTheDocument();
  });

  test('renders a group-anchored error inside its (auto-opened) section', () => {
    render(
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={new Map([['batching', ['expected object value, got !!null']]])}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'], batching: null } }}
      />
    );
    expect(screen.getByText('expected object value, got !!null')).toBeInTheDocument();
  });

  test('a group stays open (state intact, no remount) after its error clears', () => {
    const renderProps = (fieldErrors?: Map<string, string[]>) => (
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={fieldErrors}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: 5 } } }}
      />
    );
    const { rerender } = render(renderProps(new Map([['batching/count', ['expected number value']]])));
    expect(screen.getByText('expected number value')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();

    rerender(renderProps(undefined));
    expect(screen.queryByText('expected number value')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  test('renders an error anchored to the label field', () => {
    render(
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={new Map([['label', ['label collides with a previously defined label']]])}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'], label: 'dup' } }}
      />
    );
    expect(screen.getByText('label collides with a previously defined label')).toBeInTheDocument();
  });

  test('opens the Advanced group when it hides an errored field', () => {
    render(
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={new Map([['client_id', ['invalid client id']]])}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'] } }}
      />
    );
    expect(screen.getByText('invalid client id')).toBeInTheDocument();
    expect(screen.getByText('client_id')).toBeInTheDocument();
  });
});

describe('the NodeConfigForm — field-level commit', () => {
  test('commits on field blur and marks the form clean on success', async () => {
    const user = userEvent.setup();
    const { onCommitField, onConfigChange } = renderWithFieldCommit({
      kafka: { topic: 't', addresses: ['a:9092'], key: 'orig' },
    });

    await user.type(screen.getByDisplayValue('orig'), '-2');
    expect(lastReported(onConfigChange)).not.toBeNull();

    await user.tab();
    expect(onCommitField).toHaveBeenCalled();
    expect(lastReported(onConfigChange)).toBeNull();
    expect(screen.getByDisplayValue('orig-2')).toBeInTheDocument();
  });

  test('a blur commit does not silently revert an uncommitted malformed edit', async () => {
    const user = userEvent.setup();
    const { onCommitField, onConfigChange } = renderWithFieldCommit({
      kafka: { topic: 't', addresses: ['a:9092'], key: 'orig', batching: { count: 5 } },
    });

    await editMalformedCountAlongsideKey(user);

    await user.tab();
    expect(onCommitField).toHaveBeenCalled();
    expect(screen.getByDisplayValue('10x')).toBeInTheDocument();
    expect(lastReported(onConfigChange)).not.toBeNull();
  });

  test('keeps the draft pending when the commit fails', async () => {
    const user = userEvent.setup();
    const { onCommitField, onConfigChange } = renderWithFieldCommit(
      { kafka: { topic: 't', addresses: ['a:9092'], key: 'orig' } },
      false
    );

    await user.type(screen.getByDisplayValue('orig'), '-2');
    await user.tab();
    expect(onCommitField).toHaveBeenCalled();
    expect(lastReported(onConfigChange)).not.toBeNull();
  });

  test('shows an Apply affordance while dirty and commits through it', async () => {
    const user = userEvent.setup();
    const onCommitField = rs.fn(() => true);
    render(
      <NodeConfigForm
        componentName="kafka"
        onCommitField={onCommitField}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'], key: 'orig' } }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    await user.type(screen.getByDisplayValue('orig'), '-2');
    const apply = screen.getByRole('button', { name: 'Apply' });
    await user.click(apply);
    expect(onCommitField).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  test('re-syncs a clean form in place when the saved value changes externally', () => {
    const { rerender } = render(
      <NodeConfigForm componentName="kafka" spec={spec} value={{ kafka: { topic: 'orig', addresses: ['a:9092'] } }} />
    );
    expect(screen.getByRole('combobox', { name: TOPIC_NAME_RE })).toHaveValue('orig');

    rerender(
      <NodeConfigForm
        componentName="kafka"
        spec={spec}
        value={{ kafka: { topic: 'from-dialog', addresses: ['a:9092'] } }}
      />
    );
    expect(screen.getByRole('combobox', { name: TOPIC_NAME_RE })).toHaveValue('from-dialog');
  });
});

describe('the NodeConfigForm — topic fields', () => {
  test('marks the topic picker invalid for a backend lint error until the user edits it', async () => {
    const user = userEvent.setup();
    render(
      <NodeConfigForm
        componentName="kafka"
        fieldErrors={new Map([['topic', ['topic does not exist']]])}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'] } }}
      />
    );

    const topic = screen.getByRole('combobox', { name: TOPIC_FIELD_RE });
    expect(topic).toHaveAttribute('aria-invalid', 'true');
    expect(topic).toHaveAccessibleDescription('topic does not exist');

    await user.type(topic, 'opic');
    await waitFor(() => expect(topic).not.toHaveAttribute('aria-invalid'));
    expect(topic).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('topic does not exist')).not.toBeInTheDocument();
  });

  test('a topic scalar offers existing cluster topics; selecting one reports it', async () => {
    const user = userEvent.setup();
    const onConfigChange = rs.fn();
    render(
      <NodeConfigForm
        componentName="kafka"
        onConfigChange={onConfigChange}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'] } }}
      />
    );

    await user.click(screen.getByPlaceholderText('Select or enter a topic…'));
    await user.click(await screen.findByText('orders'));

    const next = lastReported(onConfigChange) as { kafka: Record<string, unknown> };
    expect(next.kafka.topic).toBe('orders');
  });

  test('the create-topic affordance opens the Add-topic flow', async () => {
    const user = userEvent.setup();
    const onCreateTopic = rs.fn();
    render(
      <NodeConfigForm
        componentName="kafka"
        onCreateTopic={onCreateTopic}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'] } }}
      />
    );

    await user.click(screen.getByRole('button', { name: CREATE_NEW_TOPIC_RE }));
    expect(onCreateTopic).toHaveBeenCalled();
  });

  test('typing a custom topic reports it without needing Enter or a selection', async () => {
    const user = userEvent.setup();
    const onConfigChange = rs.fn();
    render(
      <NodeConfigForm
        componentName="kafka"
        onConfigChange={onConfigChange}
        spec={spec}
        value={{ kafka: { topic: 't', addresses: ['a:9092'] } }}
      />
    );

    const input = screen.getByPlaceholderText('Select or enter a topic…');
    await user.clear(input);
    await user.type(input, 'custom:0');

    await waitFor(() => {
      const next = lastReported(onConfigChange) as { kafka: Record<string, unknown> };
      expect(next.kafka.topic).toBe('custom:0');
    });
  });

  test('topic fields on non-Redpanda connectors stay plain inputs', () => {
    const onCreateTopic = rs.fn();
    const mqttSpec = {
      name: 'mqtt',
      type: 'output',
      config: {
        name: '',
        type: 'object',
        kind: 'scalar',
        children: [{ name: 'topic', type: 'string', kind: 'scalar', optional: false }],
      },
    } as unknown as ConnectComponentSpec;
    render(
      <NodeConfigForm
        componentName="mqtt"
        onCreateTopic={onCreateTopic}
        spec={mqttSpec}
        value={{ mqtt: { topic: 'sensors/temp' } }}
      />
    );

    expect(screen.queryByPlaceholderText('Select or enter a topic…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CREATE_NEW_TOPIC_RE })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('sensors/temp')).toBeInTheDocument();
  });

  test('a topics list keeps free text but can append an existing cluster topic', async () => {
    const user = userEvent.setup();
    const onConfigChange = rs.fn();
    const topicsSpec = {
      name: 'redpanda',
      type: 'input',
      config: {
        name: '',
        type: 'object',
        kind: 'scalar',
        children: [{ name: 'topics', type: 'string', kind: 'array', optional: true }],
      },
    } as unknown as ConnectComponentSpec;
    render(
      <NodeConfigForm
        componentName="redpanda"
        onConfigChange={onConfigChange}
        spec={topicsSpec}
        value={{ redpanda: { topics: ['my-topic:0'] } }}
      />
    );

    await user.click(screen.getByPlaceholderText('Add existing topic…'));
    await user.click(await screen.findByText('events'));

    const next = lastReported(onConfigChange) as { redpanda: { topics: string[] } };
    expect(next.redpanda.topics).toEqual(['my-topic:0', 'events']);
  });
});

describe('the NodeConfigForm — enum (select) fields', () => {
  const enumSpec = {
    name: 'redpanda',
    type: 'input',
    config: {
      name: '',
      type: 'object',
      kind: 'scalar',
      children: [
        {
          name: 'transaction_isolation_level',
          type: 'string',
          kind: 'scalar',
          optional: false,
          defaultValue: 'read_uncommitted',
          annotatedOptions: [{ value: 'read_uncommitted' }, { value: 'read_committed' }],
        },
      ],
    },
  } as unknown as ConnectComponentSpec;

  test('a set enum value can be unset, removing the key from the config', async () => {
    const user = userEvent.setup();
    const onConfigChange = rs.fn();
    render(
      <NodeConfigForm
        componentName="redpanda"
        onConfigChange={onConfigChange}
        spec={enumSpec}
        value={{ redpanda: { transaction_isolation_level: 'read_committed' } }}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'transaction_isolation_level' }));
    await user.click(await screen.findByText('Default (read_uncommitted)'));

    const next = lastReported(onConfigChange) as { redpanda: Record<string, unknown> };
    expect(next.redpanda).not.toHaveProperty('transaction_isolation_level');
  });
});
