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

import { render, screen } from '@testing-library/react';

import { highlightControlChars } from './highlight-control-chars';

describe('highlightControlChars', () => {
  test('spells out control characters between the printable text', () => {
    render(<code data-testid="payload">{highlightControlChars('id\tvalue')}</code>);

    expect(screen.getByTestId('payload')).toHaveTextContent('idHTvalue');
    expect(screen.getByText('HT')).toHaveClass('controlChar');
  });

  test('breaks the line after a line feed', () => {
    render(<code data-testid="payload">{highlightControlChars('first\nsecond')}</code>);

    const payload = screen.getByTestId('payload');
    expect(payload).toHaveTextContent('firstLFsecond');
    expect(payload.querySelectorAll('br')).toHaveLength(1);
  });

  test('leaves text without control characters unchanged', () => {
    render(<code data-testid="payload">{highlightControlChars('plain text')}</code>);

    expect(screen.getByTestId('payload')).toHaveTextContent('plain text');
    expect(screen.getByTestId('payload').querySelector('.controlChar')).toBeNull();
  });
});
