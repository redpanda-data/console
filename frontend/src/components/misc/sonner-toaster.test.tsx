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

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { toast } from 'sonner';

import { SonnerToaster } from './sonner-toaster';

describe('the Sonner toaster', () => {
  // The embedded and federated roots mount it with no ThemeProvider, where the registry's useTheme throws.
  test('renders toasts without a ThemeProvider', async () => {
    render(<SonnerToaster theme="light" />);
    act(() => {
      toast('Saved');
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
