import { useQuery as useTanstackQuery } from '@tanstack/react-query';

export const GITHUB_CODE_SNIPPETS_API_BASE_URL =
  'https://raw.githubusercontent.com/redpanda-data/how-to-connect-code-snippets';

type CodeSnippetRequest = {
  language?: string;
};

const fetchHowToConnectSnippet = async (language?: string): Promise<string> => {
  if (!language) {
    return '';
  }
  const response = await fetch(`${GITHUB_CODE_SNIPPETS_API_BASE_URL}/main/${language}/readme.md`);

  if (!response.ok) {
    throw new Error(`Failed to fetch onboarding code snippet: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  return content;
};

export const useGetOnboardingCodeSnippetQuery = (input: CodeSnippetRequest) =>
  useTanstackQuery({
    queryKey: ['onboarding-code-snippet', input.language],
    queryFn: () => fetchHowToConnectSnippet(input.language),
    enabled: input.language !== '',
  });
