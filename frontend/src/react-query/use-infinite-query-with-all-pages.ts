import type { DescMessage, DescMethodUnary, MessageInitShape, MessageShape } from '@bufbuild/protobuf';
import type { ConnectError, Transport } from '@connectrpc/connect';
import { useInfiniteQuery } from '@connectrpc/connect-query';
import type { ConnectInfiniteQueryOptions, ConnectQueryKey } from '@connectrpc/connect-query-core';
import type {
  InfiniteData,
  SkipToken,
  UseInfiniteQueryOptions as TanStackUseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Options for useInfiniteQueryWithAllPages
 */
export type UseInfiniteQueryWithAllPagesOptions<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
> = Omit<
  TanStackUseInfiniteQueryOptions<
    MessageShape<O>,
    ConnectError,
    InfiniteData<MessageShape<O>>,
    ConnectQueryKey<O>,
    MessageInitShape<I>[ParamKey]
  >,
  'getNextPageParam' | 'initialPageParam' | 'queryFn' | 'queryKey'
> &
  ConnectInfiniteQueryOptions<I, O, ParamKey> & {
    /** The transport to be used for the fetching. */
    transport?: Transport;
  };

/**
 * Enhanced version of useInfiniteQuery that automatically fetches all pages
 * incrementally when the query is executed. This uses the ConnectRPC
 * package's useInfiniteQuery hook but adds automatic pagination by monitoring
 * the hasNextPage property and triggering fetchNextPage when appropriate.
 */
export function useInfiniteQueryWithAllPages<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | (MessageInitShape<I> & Required<Pick<MessageInitShape<I>, ParamKey>>),
  options: UseInfiniteQueryWithAllPagesOptions<I, O, ParamKey>
): UseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError> {
  // Use the standard ConnectRPC useInfiniteQuery hook
  const queryResult = useInfiniteQuery(schema, input, options);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchNextPage intentionally excluded - its reference changes every render but the function is stable. Including it causes infinite loops.
  useEffect(() => {
    if (!(queryResult.isFetching || queryResult.isFetchingNextPage) && queryResult.hasNextPage) {
      queryResult.fetchNextPage();
    }
  }, [queryResult.hasNextPage, queryResult.isFetching, queryResult.isFetchingNextPage]);

  return {
    ...queryResult,
    isLoading: queryResult?.isLoading || queryResult?.hasNextPage,
    isFetching: queryResult?.isFetching || queryResult?.isFetchingNextPage,
    isError: queryResult?.isError || queryResult?.isFetchNextPageError,
  } as UseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError>;

  // If you want the data to stream in, you can return queryResult directly, but it will cause layout shift in the UI as more data is getting retrieved.
}
