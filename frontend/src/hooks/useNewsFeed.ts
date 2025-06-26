import { useQuery } from '@tanstack/react-query';

interface NewsItem {
  id: string;
  fieldData: {
    'expiry-date': string;
    'publish-date': string;
    order: number;
    'link-text': string;
    message: string;
    name: string;
    'link-url': string;
    slug: string;
    segment: string;
  };
}

const fetchNews = async (segment?: 'redpanda' | 'kafka'): Promise<NewsItem[]> => {
  const url = new URL('https://redpanda-news-feed.netlify.app/news');
  if (segment) {
    url.searchParams.set('segment', segment);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch news');
  }
  return response.json();
};

export const useNewsFeed = (segment?: 'redpanda' | 'kafka') => {
  return useQuery({
    queryKey: ['news', segment],
    queryFn: () => fetchNews(segment),
    staleTime: Infinity, 
    gcTime: Infinity,
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnReconnect: false, // Don't refetch when network reconnects
  });
};
