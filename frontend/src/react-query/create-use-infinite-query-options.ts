import type { Message, PartialMessage } from '@bufbuild/protobuf';
import type { CallOptions, ConnectError, Transport } from '@connectrpc/connect';
import {
  type ConnectInfiniteQueryKey,
  type DisableQuery,
  type MethodUnaryDescriptor,
  callUnaryMethod,
  createConnectInfiniteQueryKey,
  disableQuery,
} from '@connectrpc/connect-query';
import type {
  GetNextPageParamFunction,
  InfiniteData,
  QueryFunction,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';

export interface LastPageResponse<I extends Message<I>, ParamKey extends keyof PartialMessage<I>> {
  nextPageToken?: PartialMessage<I>[ParamKey];
}

/**
 * Options specific to connect-query
 */
export interface ConnectInfiniteQueryOptions<
  I extends Message<I>,
  O extends Message<O>,
  ParamKey extends keyof PartialMessage<I>,
> {
  /** Defines which part of the input should be considered the page param */
  pageParamKey: ParamKey;
  /** Transport can be overridden here.*/
  transport: Transport;
  /** Additional call options */
  callOptions?: Omit<CallOptions, 'signal'> | undefined;
}

/**
 * Options for useInfiniteQuery
 */
export type CreateInfiniteQueryOptions<
  I extends Message<I>,
  O extends Message<O>,
  ParamKey extends keyof PartialMessage<I>,
> = ConnectInfiniteQueryOptions<I, O, ParamKey> &
  Omit<
    UseInfiniteQueryOptions<
      O,
      ConnectError,
      InfiniteData<O>,
      O,
      ConnectInfiniteQueryKey<I>,
      PartialMessage<I>[ParamKey]
    >,
    'getNextPageParam' | 'initialPageParam' | 'queryFn' | 'queryKey'
  >;

/**
 * Throws an error with the provided message when the condition is `false`
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid assertion: ${message}`);
  }
}

function createUnaryInfiniteQueryFn<
  I extends Message<I>,
  O extends Message<O>,
  ParamKey extends keyof PartialMessage<I>,
>(
  methodType: MethodUnaryDescriptor<I, O>,
  input: DisableQuery | PartialMessage<I>,
  {
    callOptions,
    transport,
  }: {
    transport: Transport;
    callOptions?: CallOptions | undefined;
  },
): QueryFunction<O, ConnectInfiniteQueryKey<I>, PartialMessage<I>[ParamKey]> {
  return async (context) => {
    assert(input !== disableQuery, 'Disabled query cannot be fetched');
    assert('pageParam' in context, 'pageParam must be part of context');

    const inputCombinedWithPageParam = {
      ...input,
      pageToken: context.pageParam,
    };
    return callUnaryMethod(methodType, inputCombinedWithPageParam, {
      callOptions: {
        ...callOptions,
        signal: callOptions?.signal ?? context.signal,
      },
      transport,
    });
  };
}

/**
 * Query the method provided. Maps to useInfiniteQuery on tanstack/react-query
 *
 * @param methodSig
 * @returns
 */
export function createUseInfiniteQueryOptions<
  I extends Message<I>,
  O extends Message<O>,
  ParamKey extends keyof PartialMessage<I>,
>(
  methodSig: MethodUnaryDescriptor<I, O>,
  input: DisableQuery | (PartialMessage<I> & { pageToken?: string }),
  { transport, callOptions }: ConnectInfiniteQueryOptions<I, O, ParamKey>,
): {
  getNextPageParam: GetNextPageParamFunction<PartialMessage<I>[ParamKey], O>;
  queryKey: ConnectInfiniteQueryKey<I>;
  queryFn: QueryFunction<O, ConnectInfiniteQueryKey<I>, PartialMessage<I>[ParamKey]>;
  initialPageParam: PartialMessage<I>[ParamKey];
  enabled: boolean;
} {
  const queryKey = createConnectInfiniteQueryKey(
    methodSig,
    input === disableQuery
      ? undefined
      : {
          ...input,
          pageToken: undefined,
        },
  );
  return {
    getNextPageParam: (lastPage, _allPages) =>
      (lastPage as LastPageResponse<I, ParamKey>)?.nextPageToken !== ''
        ? (lastPage as LastPageResponse<I, ParamKey>)?.nextPageToken
        : undefined,
    initialPageParam: input === disableQuery ? undefined : (input.pageToken as PartialMessage<I>[ParamKey]),
    queryKey,
    queryFn: createUnaryInfiniteQueryFn(methodSig, input, {
      transport,
      callOptions,
    }),
    enabled: input !== disableQuery,
  };
}
