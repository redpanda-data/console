import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const newsItemsSchema = z.array(
  z.object({
    id: z.string(),
    fieldData: z.object({
      'expiry-date': z.string(),
      'publish-date': z.string(),
      order: z.number(),
      'link-text': z.string(),
      message: z.string(),
      name: z.string(),
      'link-url': z.string(),
      slug: z.string(),
      segment: z.string(),
      'cta-button-text': z.string(),
      // This is a nullable CMS style identifier, not a closed Registry button variant.
      'cta-button-variant': z.string().nullable(),
    }),
  })
);
type NewsItem = z.infer<typeof newsItemsSchema>[number];

const fetchNews = async (segment?: 'redpanda' | 'kafka'): Promise<NewsItem[]> => {
  const url = new URL('https://redpanda-news-feed.netlify.app/news');
  if (segment) {
    url.searchParams.set('segment', segment);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch news');
  }
  const body: unknown = await response.json();
  return newsItemsSchema.parse(body);
};

export const useNewsFeed = (segment?: 'redpanda' | 'kafka') => {
  return useQuery({
    queryKey: ['news', segment],
    queryFn: () => fetchNews(segment),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnReconnect: false, // Don't refetch when network reconnects
  });
};
