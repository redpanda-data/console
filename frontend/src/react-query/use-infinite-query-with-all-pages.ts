import type { Message, PartialMessage } from '@bufbuild/protobuf';
import type { Transport } from '@connectrpc/connect';
import {
  type DisableQuery,
  type MethodUnaryDescriptor,
  useTransport as connectQueryUseTransport,
} from '@connectrpc/connect-query';
import { useInfiniteQuery as tanStackUseInfiniteQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type CreateInfiniteQueryOptions, createUseInfiniteQueryOptions } from './create-use-infinite-query-options';

/**
 * Query the method provided. Maps to useInfiniteQuery on tanstack/react-query
 *
 * @param methodSig
 * @returns
 */
export function useInfiniteQueryWithAllPages<
  I extends Message<I>,
  O extends Message<O>,
  ParamKey extends keyof PartialMessage<I>,
>(
  methodSig: MethodUnaryDescriptor<I, O>,
  input: DisableQuery | (PartialMessage<I> & Required<Pick<PartialMessage<I>, ParamKey>>),
  {
    transport,
    callOptions,
    pageParamKey,
    ...options
  }: Omit<CreateInfiniteQueryOptions<I, O, ParamKey>, 'transport'> & {
    transport?: Transport;
  },
) {
  const transportFromCtx = connectQueryUseTransport();
  const baseOptions = createUseInfiniteQueryOptions(methodSig, input, {
    transport: transport ?? transportFromCtx,
    pageParamKey,
    callOptions,
  });
  // The query cannot be enabled if the base options are disabled, regardless of
  // incoming query options.
  const enabled = baseOptions.enabled && (options.enabled ?? true);

  const infiniteQueryResult = tanStackUseInfiniteQuery({
    ...options,
    ...baseOptions,
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

  return {
    ...infiniteQueryResult,
    isLoading: infiniteQueryResult?.isLoading || infiniteQueryResult?.hasNextPage,
    isFetching: infiniteQueryResult?.isFetching || infiniteQueryResult?.isFetchingNextPage,
    isError: infiniteQueryResult?.isError || infiniteQueryResult?.isFetchNextPageError,
  };
}
