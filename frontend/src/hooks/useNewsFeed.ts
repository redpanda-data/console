import { useEffect, useState } from 'react';

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

export const useNewsFeed = (segment?: 'redpanda' | 'kafka') => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const url = new URL('https://redpanda-news-feed.netlify.app/news');
        if (segment) {
          url.searchParams.set('segment', segment);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error('Failed to fetch news');
        }
        const data: NewsItem[] = await response.json();
        setNews(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    void fetchNews();
  }, [segment]);

  return { news, loading, error };
};
