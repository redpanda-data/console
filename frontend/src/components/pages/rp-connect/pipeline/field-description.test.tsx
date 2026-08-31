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
import { describe, expect, test } from 'vitest';

import { FieldDescription } from './field-description';
import type { RawFieldSpec } from '../types/schema';

const field = (overrides: Partial<RawFieldSpec>): RawFieldSpec =>
  ({ name: 'topics', type: 'string', kind: 'scalar', ...overrides }) as RawFieldSpec;

// The `input: redpanda` topics field: a one-line short description over a multi-paragraph AsciiDoc one.
const LONG_TOPICS_DESCRIPTION =
  '\nA list of topics to consume from. Multiple comma separated topics can be listed in a single element. ' +
  'When a `consumer_group` is specified partitions are automatically distributed across consumers of a topic, ' +
  'otherwise all partitions are consumed.\n\nAlternatively, it is possible to specify explicit partitions.';

const SHORT_TOPICS_DESCRIPTION =
  'A list of topics to consume from. Multiple comma-separated topics may share one element.';

const SHOW_MORE_RE = /show more/i;
const ALTERNATIVELY_RE = /Alternatively, it is possible/;
const TOPICS_LEAD_RE = /A list of topics to consume from/;
const SHOW_LESS_RE = /show less/i;
const TOPICS_DOCS_RE = /topics documentation/i;
const TOPICS_DOCS_URL =
  'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/inputs/redpanda/#topics';

describe('FieldDescription', () => {
  test('prefers the short description over the long one', () => {
    render(
      <FieldDescription
        spec={field({ description: LONG_TOPICS_DESCRIPTION, shortDescription: SHORT_TOPICS_DESCRIPTION })}
      />
    );

    expect(screen.getByText(SHORT_TOPICS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(ALTERNATIVELY_RE)).not.toBeInTheDocument();
    // A one-liner needs no expander.
    expect(screen.queryByRole('button', { name: SHOW_MORE_RE })).not.toBeInTheDocument();
  });

  test('falls back to the long description when no short one is served', () => {
    render(<FieldDescription spec={field({ description: LONG_TOPICS_DESCRIPTION })} />);

    expect(screen.getByText(TOPICS_LEAD_RE)).toBeInTheDocument();
  });

  test('treats a blank short description as absent', () => {
    render(
      <FieldDescription spec={field({ description: 'An identifier for the client.', shortDescription: '   ' })} />
    );

    expect(screen.getByText('An identifier for the client.')).toBeInTheDocument();
  });

  test('renders nothing when the field carries no prose', () => {
    const { container } = render(<FieldDescription spec={field({})} />);

    // The render wrapper adds a hidden Chakra node, so assert on text rather than an empty DOM.
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('collapses a long fallback description behind an expander', async () => {
    const user = userEvent.setup();
    render(<FieldDescription spec={field({ description: LONG_TOPICS_DESCRIPTION })} />);

    const toggle = screen.getByRole('button', { name: SHOW_MORE_RE });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed is the flattened single-line rendering: no code spans, trailing paragraph clipped by CSS.
    expect(screen.queryByText('consumer_group', { selector: 'code' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: SHOW_LESS_RE })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('consumer_group', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText(ALTERNATIVELY_RE)).toBeInTheDocument();
  });

  test('links URL macros out of the AsciiDoc source, bracketed labels included', () => {
    const { unmount } = render(
      <FieldDescription spec={field({ description: 'Uses https://github.com/twmb/franz-go[franz-go] internally.' })} />
    );

    const link = screen.getByRole('link', { name: 'franz-go' });
    expect(link).toHaveAttribute('href', 'https://github.com/twmb/franz-go');
    expect(link).toHaveAttribute('target', '_blank');
    unmount();

    // A code span binds tighter than the link, so a `]` inside the label doesn't end it.
    render(<FieldDescription spec={field({ description: 'A DSN: https://x.com/dsn[`user[:pass\\]@host`].' })} />);
    expect(screen.getByRole('link', { name: 'user[:pass]@host' })).toHaveAttribute('href', 'https://x.com/dsn');
  });

  test('keeps angle-bracket placeholders that Markdown would otherwise swallow', () => {
    render(<FieldDescription spec={field({ description: 'Defaults to `cdc_metadata_<stream_id>`.' })} />);

    expect(screen.getByText('cdc_metadata_<stream_id>', { selector: 'code' })).toBeInTheDocument();
  });

  test('deep-links the field on the connector docs page, named for the field', () => {
    render(<FieldDescription docsUrl={TOPICS_DOCS_URL} spec={field({ shortDescription: SHORT_TOPICS_DESCRIPTION })} />);

    const link = screen.getByRole('link', { name: TOPICS_DOCS_RE });
    expect(link).toHaveAttribute('href', TOPICS_DOCS_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('trails the link on the sentence when the description is a single paragraph', () => {
    render(
      <FieldDescription docsUrl={TOPICS_DOCS_URL} spec={field({ description: 'Set the `topic` to publish to.' })} />
    );

    // One block, so the link reads as part of the help text instead of claiming a row of its own.
    const link = screen.getByRole('link', { name: TOPICS_DOCS_RE });
    expect(link.parentElement?.textContent).toBe('Set the topic to publish to. Docs');
    expect(screen.getByText('topic', { selector: 'code' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SHOW_MORE_RE })).not.toBeInTheDocument();
  });

  test('keeps the docs link reachable while a long description is collapsed', async () => {
    const user = userEvent.setup();
    render(<FieldDescription docsUrl={TOPICS_DOCS_URL} spec={field({ description: LONG_TOPICS_DESCRIPTION })} />);

    expect(screen.getByRole('link', { name: TOPICS_DOCS_RE })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: SHOW_MORE_RE }));

    expect(screen.getByRole('link', { name: TOPICS_DOCS_RE })).toBeInTheDocument();
  });

  test('offers the docs link with no prose at all, and none when the component has no docs page', () => {
    const { unmount } = render(<FieldDescription docsUrl={TOPICS_DOCS_URL} spec={field({})} />);
    expect(screen.getByRole('link', { name: TOPICS_DOCS_RE })).toBeInTheDocument();
    unmount();

    render(<FieldDescription spec={field({ shortDescription: SHORT_TOPICS_DESCRIPTION })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
