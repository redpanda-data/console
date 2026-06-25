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

import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';
import { describe, expect, test, vi } from 'vitest';

import { NodeConfigForm } from './node-config-form';
import type { ConnectComponentSpec } from '../types/schema';
import { mockKafkaOutput } from '../utils/__fixtures__/component-schemas';

const spec = mockKafkaOutput as unknown as ConnectComponentSpec;

function renderForm(value: Record<string, unknown>, onApply = vi.fn()) {
  render(<NodeConfigForm componentName="kafka" onApply={onApply} spec={spec} value={value} />);
  return onApply;
}

const applyButton = () => screen.getByRole('button', { name: 'Apply changes' });
const NESTED_COMPONENT_HINT = /processors is a nested component/i;

describe('NodeConfigForm — full schema', () => {
  test('renders required scalar fields, a scalar-array field, and nested object groups', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

    // Required scalars + the scalar array.
    expect(screen.getByText('topic')).toBeInTheDocument();
    expect(screen.getByText('addresses')).toBeInTheDocument();
    // A non-advanced nested object is exposed as its own sub-section (not raw YAML).
    expect(screen.getByText('batching')).toBeInTheDocument();
    // Optional/advanced groupings exist.
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();

    // Advanced nested objects appear once the Advanced section is expanded.
    await user.click(screen.getByText('Advanced'));
    expect(screen.getByText('sasl')).toBeInTheDocument();
    expect(screen.getByText('tls')).toBeInTheDocument();
  });

  test('marks only no-default fields required; a defaulted field (sasl.mechanism) is not', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

    // A scalar with no default is genuinely required.
    expect(screen.getByText('topic').closest('div')?.querySelector('[title="Required"]')).not.toBeNull();

    // `mechanism` has a default (`none`), so even though the backend left `optional`
    // unset it must NOT be flagged required.
    await user.click(screen.getByText('Advanced'));
    await user.click(screen.getByText('sasl'));
    const mechRow = screen.getByText('mechanism').closest('div');
    expect(mechRow).not.toBeNull();
    expect(mechRow?.querySelector('[title="Required"]')).toBeNull();
  });

  test('shows the schema default as a hint for optional fields', () => {
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });
    // partitioner defaults to fnv1a_hash.
    expect(screen.getByText('fnv1a_hash')).toBeInTheDocument();
  });

  test('the save bar appears only once something changes', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 'orig', addresses: ['a:9092'] } });
    expect(screen.queryByRole('button', { name: 'Apply changes' })).not.toBeInTheDocument();

    await user.type(screen.getByDisplayValue('orig'), 'X');
    expect(applyButton()).toBeEnabled();
  });

  test('writes a changed scalar and keeps the YAML minimal (no empty optionals)', async () => {
    const user = userEvent.setup();
    const onApply = renderForm({ kafka: { topic: 'orig', addresses: ['a:9092'] } });

    const topic = screen.getByDisplayValue('orig');
    await user.clear(topic);
    await user.type(topic, 'new-topic');
    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0] as { kafka: Record<string, unknown> };
    expect(next.kafka.topic).toBe('new-topic');
    expect(next.kafka.addresses).toEqual(['a:9092']);
    // Untouched optional fields are not written out.
    expect(next.kafka).not.toHaveProperty('key');
    expect(next.kafka).not.toHaveProperty('partitioner');
  });

  test('preserves complex/untouched settings when applying an unrelated edit', async () => {
    const user = userEvent.setup();
    // `metadata` is not in the schema; `count: 1000$` is a malformed int — both must survive.
    const onApply = renderForm({
      kafka: {
        topic: 'orig',
        addresses: ['a:9092'],
        metadata: { include_patterns: ['.*'] },
        batching: { count: '1000$' },
      },
    });

    await user.type(screen.getByDisplayValue('orig'), '-2');
    await user.click(applyButton());

    const next = onApply.mock.calls[0][0] as { kafka: { metadata: unknown; batching: { count: unknown } } };
    expect(next.kafka.metadata).toEqual({ include_patterns: ['.*'] });
    // Malformed value is preserved exactly — not parseInt-ed to 1000.
    expect(next.kafka.batching.count).toBe('1000$');
  });

  test('shows a malformed numeric value instead of blanking it (text input, not type=number)', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '1000$' } } });
    await user.click(screen.getByText('batching'));
    expect(screen.getByDisplayValue('1000$')).toBeInTheDocument();
    // …and flags it inline as not a valid integer.
    expect(screen.getByText('Not a valid integer')).toBeInTheDocument();
  });

  test('does not flag secret/env interpolations in numeric fields', async () => {
    const user = userEvent.setup();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '${secrets.BATCH_COUNT}' } } });
    await user.click(screen.getByText('batching'));
    expect(screen.queryByText('Not a valid integer')).not.toBeInTheDocument();
  });

  test('does not render nested-component fields; surfaces a hint and preserves them on apply', async () => {
    const user = userEvent.setup();
    // A `branch`-like spec: a scalar (request_map) + a nested processor sub-pipeline.
    const branchSpec = {
      config: {
        children: [
          { name: 'request_map', type: 'string', kind: 'scalar', optional: false },
          { name: 'processors', type: 'processor', kind: 'array', optional: false },
        ],
      },
    } as unknown as ConnectComponentSpec;
    const onApply = vi.fn();
    render(
      <NodeConfigForm
        componentName="branch"
        onApply={onApply}
        spec={branchSpec}
        value={{ branch: { request_map: 'root = this', processors: [{ http: { url: 'http://x' } }] } }}
      />
    );

    // The scalar is a control; the nested component is NOT — it's a hint instead.
    expect(screen.getByText('request_map')).toBeInTheDocument();
    expect(screen.getByText(NESTED_COMPONENT_HINT)).toBeInTheDocument();

    await user.type(screen.getByDisplayValue('root = this'), '!');
    await user.click(applyButton());

    const next = onApply.mock.calls[0][0] as { branch: Record<string, unknown> };
    // The sub-pipeline survives untouched; the scalar edit is written.
    expect(next.branch.processors).toEqual([{ http: { url: 'http://x' } }]);
    expect(next.branch.request_map).toBe('root = this!');
  });

  test('round-trips a scalar array edited as one-per-line text', async () => {
    const user = userEvent.setup();
    const onApply = renderForm({ kafka: { topic: 't', addresses: ['a:9092'] } });

    const addresses = screen.getByPlaceholderText('One value per line');
    await user.clear(addresses);
    await user.type(addresses, 'b:9092\nc:9092');
    await user.click(applyButton());

    const next = onApply.mock.calls[0][0] as { kafka: Record<string, unknown> };
    expect(next.kafka.addresses).toEqual(['b:9092', 'c:9092']);
  });
});

describe('NodeConfigForm — list-valued components (switch/try/…)', () => {
  // A switch's value is an array of cases, not an object of fields. Its schema lists a
  // single case's fields, so the form must NOT render them or rebuild the value.
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
    const onApply = vi.fn();
    const value = switchValue();
    render(<NodeConfigForm componentName="switch" onApply={onApply} spec={switchSpec} value={value} />);

    await user.type(screen.getByPlaceholderText('Optional identifier for this component'), 'router');
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(onApply).toHaveBeenCalledWith({ label: 'router', switch: value.switch });
  });

  test('hides the (misleading) per-case fields and shows a canvas hint instead', () => {
    render(<NodeConfigForm componentName="switch" onApply={vi.fn()} spec={switchSpec} value={switchValue()} />);
    // The case-level `check` field must not appear on the container.
    expect(screen.queryByText('check')).toBeNull();
    expect(screen.getByText(/edited on the canvas/i)).toBeInTheDocument();
  });
});
