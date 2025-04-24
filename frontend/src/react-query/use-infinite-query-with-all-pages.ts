import type { DescMessage, DescMethodUnary, MessageInitShape, MessageShape } from '@bufbuild/protobuf';
import type { ConnectError, Transport } from '@connectrpc/connect';
import { useTransport } from '@connectrpc/connect-query';
import type { ConnectInfiniteQueryOptions, ConnectQueryKey } from '@connectrpc/connect-query-core';
import { createInfiniteQueryOptions } from '@connectrpc/connect-query-core';
import type {
  InfiniteData,
  SkipToken,
  UseInfiniteQueryOptions as TanStackUseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryOptions as TanStackUseSuspenseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryResult,
} from '@tanstack/react-query';
import {
  useInfiniteQuery as tsUseInfiniteQuery,
  useSuspenseInfiniteQuery as tsUseSuspenseInfiniteQuery,
} from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Options for useInfiniteQuery
 */
export type UseInfiniteQueryOptions<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
> = Omit<
  TanStackUseInfiniteQueryOptions<
    MessageShape<O>,
    ConnectError,
    InfiniteData<MessageShape<O>>,
    MessageShape<O>,
    ConnectQueryKey,
    MessageInitShape<I>[ParamKey]
  >,
  'getNextPageParam' | 'initialPageParam' | 'queryFn' | 'queryKey'
> &
  ConnectInfiniteQueryOptions<I, O, ParamKey> & {
    /** The transport to be used for the fetching. */
    transport?: Transport;
  };

/**
 * Query the method provided. Maps to useInfiniteQuery on tanstack/react-query
 * Retrieves all pages of the query.
 */
export function useInfiniteQueryWithAllPages<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | (MessageInitShape<I> & Required<Pick<MessageInitShape<I>, ParamKey>>),
  { transport, pageParamKey, getNextPageParam, ...queryOptions }: UseInfiniteQueryOptions<I, O, ParamKey>,
): UseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError> {
  const transportFromCtx = useTransport();
  const baseOptions = createInfiniteQueryOptions(schema, input, {
    transport: transport ?? transportFromCtx,
    getNextPageParam,
    pageParamKey,
  });

  const enabled = queryOptions.enabled ?? true;

  const infiniteQueryResult = tsUseInfiniteQuery({
    ...baseOptions,
    ...queryOptions,
    enabled,
  });

  useEffect(() => {
    if (!infiniteQueryResult.isFetching && !infiniteQueryResult.isFetchingNextPage && infiniteQueryResult.hasNextPage) {
      infiniteQueryResult.fetchNextPage();
    }
  }, [
    infiniteQueryResult.hasNextPage,
    infiniteQueryResult.isFetching,
    infiniteQueryResult.isFetchingNextPage,
    infiniteQueryResult.fetchNextPage,
  ]);

  console.log('infiniteQueryResult: ', infiniteQueryResult);

  return {
    ...infiniteQueryResult,
    isLoading: infiniteQueryResult?.isLoading || infiniteQueryResult?.hasNextPage,
    isFetching: infiniteQueryResult?.isFetching || infiniteQueryResult?.isFetchingNextPage,
    isError: infiniteQueryResult?.isError || infiniteQueryResult?.isFetchNextPageError,
  } as UseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError>;
  // Need to cast to type because Connect query provides different interfaces depending on the fetch status
}

/**
 * Options for useSuspenseInfiniteQuery
 */
export type UseSuspenseInfiniteQueryOptions<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
> = Omit<
  TanStackUseSuspenseInfiniteQueryOptions<
    MessageShape<O>,
    ConnectError,
    InfiniteData<MessageShape<O>>,
    MessageShape<O>,
    ConnectQueryKey,
    MessageInitShape<I>[ParamKey]
  >,
  'getNextPageParam' | 'initialPageParam' | 'queryFn' | 'queryKey'
> &
  ConnectInfiniteQueryOptions<I, O, ParamKey> & {
    /** The transport to be used for the fetching. */
    transport?: Transport;
  };

/**
 * Query the method provided. Maps to useSuspenseInfiniteQuery on tanstack/react-query
 * Retrieves all pages of the query.
 */
export function useSuspenseInfiniteQueryWithAllPages<
  I extends DescMessage,
  O extends DescMessage,
  ParamKey extends keyof MessageInitShape<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: MessageInitShape<I> & Required<Pick<MessageInitShape<I>, ParamKey>>,
  { transport, pageParamKey, getNextPageParam, ...queryOptions }: UseSuspenseInfiniteQueryOptions<I, O, ParamKey>,
): UseSuspenseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError> {
  const transportFromCtx = useTransport();
  const baseOptions = createInfiniteQueryOptions(schema, input, {
    transport: transport ?? transportFromCtx,
    getNextPageParam,
    pageParamKey,
  });

  const suspenseInfiniteQueryResult = tsUseSuspenseInfiniteQuery({
    ...baseOptions,
    ...queryOptions,
  });

  useEffect(() => {
    if (
      !suspenseInfiniteQueryResult.isFetching &&
      !suspenseInfiniteQueryResult.isFetchingNextPage &&
      suspenseInfiniteQueryResult.hasNextPage
    ) {
      suspenseInfiniteQueryResult.fetchNextPage();
    }
  }, [
    suspenseInfiniteQueryResult.hasNextPage,
    suspenseInfiniteQueryResult.isFetching,
    suspenseInfiniteQueryResult.isFetchingNextPage,
    suspenseInfiniteQueryResult.fetchNextPage,
  ]);

  return {
    ...suspenseInfiniteQueryResult,
    isLoading: suspenseInfiniteQueryResult?.isLoading || suspenseInfiniteQueryResult?.hasNextPage,
    isFetching: suspenseInfiniteQueryResult?.isFetching || suspenseInfiniteQueryResult?.isFetchingNextPage,
    isError: suspenseInfiniteQueryResult?.isError || suspenseInfiniteQueryResult?.isFetchNextPageError,
  } as UseSuspenseInfiniteQueryResult<InfiniteData<MessageShape<O>>, ConnectError>;
  // Need to cast to type because Connect query provides different interfaces depending on the fetch status
}
