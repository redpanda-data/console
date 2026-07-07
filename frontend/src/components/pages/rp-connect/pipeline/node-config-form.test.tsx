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

// The form has no Apply button: it REPORTS the assembled config via onConfigChange (null when
// clean) and the inspector auto-commits on leave/save. Tests assert the latest reported config.
function renderForm(value: Record<string, unknown>, onConfigChange = vi.fn()) {
  render(<NodeConfigForm componentName="kafka" onConfigChange={onConfigChange} spec={spec} value={value} />);
  return onConfigChange;
}

// The most recent config reported by the form (undefined if never called, null when clean).
function lastReported(onConfigChange: ReturnType<typeof vi.fn>): unknown {
  return onConfigChange.mock.calls.at(-1)?.[0];
}

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

  test('reports a config only once something changes', async () => {
    const user = userEvent.setup();
    const onConfigChange = renderForm({ kafka: { topic: 'orig', addresses: ['a:9092'] } });
    // Clean on mount → reports null (nothing to commit).
    expect(lastReported(onConfigChange)).toBeNull();

    await user.type(screen.getByDisplayValue('orig'), 'X');
    expect(lastReported(onConfigChange)).not.toBeNull();
  });

  test('reports a changed scalar and keeps the YAML minimal (no empty optionals)', async () => {
    const user = userEvent.setup();
    const onConfigChange = renderForm({ kafka: { topic: 'orig', addresses: ['a:9092'] } });

    const topic = screen.getByDisplayValue('orig');
    await user.clear(topic);
    await user.type(topic, 'new-topic');

    const next = lastReported(onConfigChange) as { kafka: Record<string, unknown> };
    expect(next.kafka.topic).toBe('new-topic');
    expect(next.kafka.addresses).toEqual(['a:9092']);
    // Untouched optional fields are not written out.
    expect(next.kafka).not.toHaveProperty('key');
    expect(next.kafka).not.toHaveProperty('partitioner');
  });

  test('preserves complex/untouched settings when reporting an unrelated edit', async () => {
    const user = userEvent.setup();
    // `metadata` is not in the schema; `count: 1000$` is a malformed int — both must survive.
    const onConfigChange = renderForm({
      kafka: {
        topic: 'orig',
        addresses: ['a:9092'],
        metadata: { include_patterns: ['.*'] },
        batching: { count: '1000$' },
      },
    });

    await user.type(screen.getByDisplayValue('orig'), '-2');

    const next = lastReported(onConfigChange) as { kafka: { metadata: unknown; batching: { count: unknown } } };
    expect(next.kafka.metadata).toEqual({ include_patterns: ['.*'] });
    // Malformed value is preserved exactly — not parseInt-ed to 1000.
    expect(next.kafka.batching.count).toBe('1000$');
  });

  test('shows a malformed numeric value instead of blanking it (text input, not type=number)', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '1000$' } } });
    await user.click(screen.getByText('batching'));
    expect(screen.getByDisplayValue('1000$')).toBeInTheDocument();
    // …and flags it inline as not a valid integer (with the not-saved warning).
    expect(screen.getByText(/Not a valid integer/)).toBeInTheDocument();
  });

  test('does not commit a malformed numeric value (the saved value is kept)', async () => {
    const user = userEvent.setup();
    const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: 5 } } });
    await user.click(screen.getByText('batching'));
    const countInput = screen.getByDisplayValue('5');
    await user.clear(countInput);
    await user.type(countInput, '10x');

    // The field is flagged, and the reported config keeps the saved value — NOT `10` (parseInt
    // truncation) and NOT dropped.
    expect(screen.getByText(/won't be saved until fixed/)).toBeInTheDocument();
    const next = lastReported(onConfigChange) as { kafka: { batching: { count: unknown } } };
    expect(next.kafka.batching.count).toBe(5);
  });

  test('masks credential-named fields and offers a secret-reference tip', async () => {
    const user = userEvent.setup();
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'], sasl: { password: 'hunter2' } } });
    await user.click(screen.getByText('Advanced'));
    await user.click(screen.getByText('sasl'));

    const password = screen.getByDisplayValue('hunter2');
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Show value' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/reference a secret/i).length).toBeGreaterThan(0);
  });

  test('keeps the saved label when a resource label field is cleared (references depend on it)', async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
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
    expect(screen.getByText(/A resource needs a label/)).toBeInTheDocument();
    const next = lastReported(onConfigChange) as { label?: string };
    expect(next.label).toBe('shared');
  });

  test('does not flag secret/env interpolations in numeric fields', async () => {
    const user = userEvent.setup();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
    renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: '${secrets.BATCH_COUNT}' } } });
    await user.click(screen.getByText('batching'));
    expect(screen.queryByText(/Not a valid integer/)).not.toBeInTheDocument();
  });

  test('keeps an interpolation typed into a numeric field (not coerced to NaN and dropped)', async () => {
    const user = userEvent.setup();
    const onConfigChange = renderForm({ kafka: { topic: 't', addresses: ['a:9092'], batching: { count: 5 } } });
    await user.click(screen.getByText('batching'));
    const countInput = screen.getByDisplayValue('5');
    await user.clear(countInput);
    // `{{` is userEvent's escape for a literal `{`; this types `${env.COUNT}`.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
    await user.type(countInput, '${{env.COUNT}');

    const next = lastReported(onConfigChange) as { kafka: { batching: { count: unknown } } };
    // The interpolation is preserved verbatim, not NaN-coerced to '' and deleted.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal interpolation syntax
    expect(next.kafka.batching.count).toBe('${env.COUNT}');
  });

  test('does not render nested-component fields; surfaces a hint and preserves them on edit', async () => {
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
    const onConfigChange = vi.fn();
    render(
      <NodeConfigForm
        componentName="branch"
        onConfigChange={onConfigChange}
        spec={branchSpec}
        value={{ branch: { request_map: 'root = this', processors: [{ http: { url: 'http://x' } }] } }}
      />
    );

    // The scalar is a control; the nested component is NOT — it's a hint instead.
    expect(screen.getByText('request_map')).toBeInTheDocument();
    expect(screen.getByText(NESTED_COMPONENT_HINT)).toBeInTheDocument();

    await user.type(screen.getByDisplayValue('root = this'), '!');

    const next = lastReported(onConfigChange) as { branch: Record<string, unknown> };
    // The sub-pipeline survives untouched; the scalar edit is written.
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
    const onConfigChange = vi.fn();
    const value = switchValue();
    render(<NodeConfigForm componentName="switch" onConfigChange={onConfigChange} spec={switchSpec} value={value} />);

    await user.type(screen.getByPlaceholderText('Optional identifier for this component'), 'router');

    expect(lastReported(onConfigChange)).toEqual({ label: 'router', switch: value.switch });
  });

  test('hides the (misleading) per-case fields and shows a canvas hint instead', () => {
    render(<NodeConfigForm componentName="switch" spec={switchSpec} value={switchValue()} />);
    // The case-level `check` field must not appear on the container.
    expect(screen.queryByText('check')).toBeNull();
    expect(screen.getByText(/edited on the canvas/i)).toBeInTheDocument();
  });
});
