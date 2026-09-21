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
import { render, screen } from '@testing-library/react';

import { SchemaContextSelect, schemaContextOptions } from './schema-context-select';

describe('schemaContextOptions', () => {
  test('lists automatic, default and the named contexts sorted', () => {
    expect(schemaContextOptions(['.staging', '.', '.outgo'], '').map((o) => o.label)).toEqual([
      'Automatic (topic config)',
      'Default',
      '.outgo',
      '.staging',
    ]);
  });

  test('keeps a value that is not in the list selectable', () => {
    const options = schemaContextOptions(['.'], '.gone');
    expect(options.at(-1)).toEqual({ value: '.gone', label: '.gone' });
  });
});

describe('SchemaContextSelect', () => {
  test('shows the automatic option for an empty value', () => {
    render(<SchemaContextSelect contexts={['.', '.outgo']} id="schema-context" onChange={rs.fn()} value="" />);
    expect(screen.getByTestId('schema-context')).toHaveTextContent('Automatic (topic config)');
  });

  test('shows the selected context', () => {
    render(<SchemaContextSelect contexts={['.', '.outgo']} id="schema-context" onChange={rs.fn()} value=".outgo" />);
    expect(screen.getByTestId('schema-context')).toHaveTextContent('.outgo');
  });
});
