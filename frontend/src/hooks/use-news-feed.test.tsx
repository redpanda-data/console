// Copyright 2026 Redpanda Data, Inc.

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

import { useNewsFeed } from './use-news-feed';

// One actual CMS card supplies the schema's essential fields; the three observed nullable styles remain wire values.
const actualCard = {
  id: '68d2fc0e27d71c42507b6870',
  fieldData: {
    'expiry-date': '2025-11-06T20:00:00.000Z',
    'publish-date': '2025-09-23T21:50:00.000Z',
    order: 9,
    'link-text':
      'Join us at Redpanda Streamfest, where streaming meets AI. Free online conference November 5 – 6, 2025.',
    message: 'Save your seat for Streamfest 2025!',
    name: 'Streamfest 2025',
    'link-url':
      'https://www.redpanda.com/streamfest?utm_source=console&utm_medium=marketing_referral&utm_campaign=console_segment-redpanda',
    slug: 'streamfest-2025',
    segment: 'redpanda',
    'cta-button-text': 'Register now',
  },
};
const realNewsFeed = [
  {
    ...actualCard,
    id: '68d2fc0e27d71c42507b6870',
    fieldData: { ...actualCard.fieldData, 'cta-button-variant': 'solid-brand' },
  },
  {
    ...actualCard,
    id: '68d2e5cc70aa04dc479c30ec',
    fieldData: { ...actualCard.fieldData, 'cta-button-variant': 'ghost' },
  },
  { ...actualCard, id: '68b9e934b729aee05b3d2777', fieldData: { ...actualCard.fieldData, 'cta-button-variant': null } },
];

let client: QueryClient | undefined;
afterEach(() => {
  client?.clear();
  rs.restoreAllMocks();
});

function renderNewsFeed() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client = queryClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useNewsFeed('redpanda'), { wrapper });
}

describe('news feed wire decoding', () => {
  test('accepts the three observed raw solid-brand, ghost and null CTA styles', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(realNewsFeed));
    const { result } = renderNewsFeed();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((item) => item.id)).toStrictEqual([
      '68d2fc0e27d71c42507b6870',
      '68d2e5cc70aa04dc479c30ec',
      '68b9e934b729aee05b3d2777',
    ]);
    expect(result.current.data?.map((item) => item.fieldData['cta-button-variant'])).toStrictEqual([
      'solid-brand',
      'ghost',
      null,
    ]);
  });

  test('preserves unfamiliar string styles without dropping the card', async () => {
    const futureCard = {
      ...realNewsFeed[0],
      fieldData: { ...realNewsFeed[0].fieldData, 'cta-button-variant': 'future-cms-style' },
    };
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([futureCard]));
    const { result } = renderNewsFeed();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.fieldData['cta-button-variant']).toBe('future-cms-style');
  });

  test('reports malformed CTA field types as a query error', async () => {
    const invalidCard = { ...realNewsFeed[0], fieldData: { ...realNewsFeed[0].fieldData, 'cta-button-variant': 12 } };
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([invalidCard]));
    const { result } = renderNewsFeed();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
