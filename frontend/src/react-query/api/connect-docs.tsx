import { useQueries } from "@tanstack/react-query";

export const CONNECT_CODE_SNIPPETS_BASE_URL =
	"https://raw.githubusercontent.com/redpanda-data/rp-connect-docs/refs/heads/main/modules/components";

interface ConnectContentRequest {
	connection: string;
	connectionType: "input" | "output";
}

type ContentType = "pages" | "partials/fields";

/**
 * Generic fetch function for connect documentation content
 * @param connection - The connection name (e.g. "kafka", "http")
 * @param connectionType - Either "input" or "output"
 * @param contentType - Either "pages" for full docs or "partials/fields" for code snippets
 */
const fetchConnectContent = async (
	connection: string,
	connectionType: "input" | "output",
	contentType: ContentType,
): Promise<string> => {
	if (!connection || !connectionType) {
		return "";
	}

	const url = `${CONNECT_CODE_SNIPPETS_BASE_URL}/${contentType}/${connectionType}s/${connection}.adoc`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${contentType} content: ${response.status} ${response.statusText}`,
		);
	}

	return response.text();
};

// Convenience wrappers for specific content types
const fetchPageContent = (
	connection: string,
	connectionType: "input" | "output",
) => fetchConnectContent(connection, connectionType, "pages");

const fetchCodeSnippet = (
	connection: string,
	connectionType: "input" | "output",
) => fetchConnectContent(connection, connectionType, "partials/fields");

// Query configuration constants
const STALE_TIME = 15 * 60 * 1000; // 15 minutes

/**
 * Creates a standardized query configuration for connect content
 */
const createContentQuery = (
	queryKeyPrefix: string,
	fetchFn: (
		connection: string,
		connectionType: "input" | "output",
	) => Promise<string>,
	input: ConnectContentRequest,
) => ({
	queryKey: [queryKeyPrefix, input.connection, input.connectionType],
	queryFn: () => fetchFn(input.connection, input.connectionType),
	staleTime: STALE_TIME,
	enabled: input.connection !== "" && input.connectionType !== undefined,
});

export const useGetConnectContentQuery = (input: ConnectContentRequest) => {
	const queries = useQueries({
		queries: [
			createContentQuery("connect-page-content", fetchPageContent, input),
			createContentQuery("connect-code-snippet", fetchCodeSnippet, input),
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
