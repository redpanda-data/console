/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test, vi } from 'vitest';

import { ShadowLinkMetrics } from './shadow-link-metrics';

// Mock the useGetShadowMetricsQuery hook
vi.mock('react-query/api/shadowlink', () => ({
  useGetShadowMetricsQuery: vi.fn(),
}));

import { useGetShadowMetricsQuery } from 'react-query/api/shadowlink';

const mockShadowLink: ShadowLink = {
  name: 'test-link',
  uid: 'test-uid',
  state: ShadowLinkState.ACTIVE,
  configurations: undefined,
};

describe('ShadowLinkMetrics', () => {
  test('should display metrics when data is loaded', () => {
    vi.mocked(useGetShadowMetricsQuery).mockReturnValue({
      data: {
        totalTopicsReplicated: 100n,
        failedOverTopics: 5n,
        errorTopics: 2n,
      },
      isFetching: false,
      error: null,
    } as any);

    render(<ShadowLinkMetrics shadowLink={mockShadowLink} />);

    expect(screen.getByTestId('metric-value-state')).toHaveTextContent('Active');
    expect(screen.getByTestId('metric-value-replicated')).toHaveTextContent('100');
    expect(screen.getByTestId('metric-value-failedover')).toHaveTextContent('5');
    expect(screen.getByTestId('metric-value-error')).toHaveTextContent('2');
  });

  test('should display error state when metrics fail to load', () => {
    vi.mocked(useGetShadowMetricsQuery).mockReturnValue({
      data: null,
      isFetching: false,
      error: new Error('Failed to fetch metrics'),
    } as any);

    render(<ShadowLinkMetrics shadowLink={mockShadowLink} />);

    expect(screen.getByTestId('shadow-link-metrics-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load metrics: Failed to fetch metrics')).toBeInTheDocument();
  });
});
