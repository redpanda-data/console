import { useQueries } from '@tanstack/react-query';
import type { ComponentType } from 'components/pages/onboarding-wizard/types/connect';

export const CONNECT_CODE_SNIPPETS_BASE_URL =
  'https://raw.githubusercontent.com/redpanda-data/rp-connect-docs/refs/heads/main/modules/components';

interface ConnectContentRequest {
  connectionName: string;
  connectionType: ComponentType;
}

type ContentType = 'pages' | 'partials/fields';

/**
 * Generic fetch function for connect documentation content
 * @param connectionName - The connection name (e.g. "kafka", "http")
 * @param connectionType - Either "input" or "output"
 * @param contentType - Either "pages" for full docs or "partials/fields" for code snippets
 */
const fetchConnectContent = async (
  connectionName: string,
  connectionType: ComponentType,
  contentType: ContentType,
): Promise<string> => {
  if (!connectionName || !connectionType) {
    return '';
  }

  const url = `${CONNECT_CODE_SNIPPETS_BASE_URL}/${contentType}/${connectionType}s/${connectionName}.adoc`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${contentType} content: ${response.status} ${response.statusText}`);
  }

  return response.text();
};

// Convenience wrappers for specific content types
const fetchPageContent = (connectionName: string, connectionType: ComponentType) =>
  fetchConnectContent(connectionName, connectionType, 'pages');

const fetchCodeSnippet = (connectionName: string, connectionType: ComponentType) =>
  fetchConnectContent(connectionName, connectionType, 'partials/fields');

// Query configuration constants
const STALE_TIME = 15 * 60 * 1000; // 15 minutes

/**
 * Creates a standardized query configuration for connect content
 */
const createContentQuery = (
  queryKeyPrefix: string,
  fetchFn: (connectionName: string, connectionType: ComponentType) => Promise<string>,
  input: ConnectContentRequest,
) => ({
  queryKey: [queryKeyPrefix, input.connectionName, input.connectionType],
  queryFn: () => fetchFn(input.connectionName, input.connectionType),
  staleTime: STALE_TIME,
  enabled: input.connectionName !== '' && input.connectionType !== undefined,
});

export const useGetConnectContentQuery = (input: ConnectContentRequest) => {
  const queries = useQueries({
    queries: [
      createContentQuery('connect-page-content', fetchPageContent, input),
      createContentQuery('connect-code-snippet', fetchCodeSnippet, input),
    ],
  });

  const [pageQuery, partialQuery] = queries;

  return {
    pageContent: pageQuery.data,
    partialContent: partialQuery.data,
    isLoading: pageQuery.isLoading || partialQuery.isLoading,
    error: pageQuery.error || partialQuery.error,
    isError: pageQuery.isError || partialQuery.isError,
    isSuccess: pageQuery.isSuccess && partialQuery.isSuccess,
  };
};
