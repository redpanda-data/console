import type { Message, MethodInfoServerStreaming, PartialMessage, ServiceType } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import type { CallOptions, StreamResponse, Transport } from '@connectrpc/connect';
import type { ConnectQueryKey } from '@connectrpc/connect-query';
import { createConnectQueryKey, useTransport } from '@connectrpc/connect-query';
import type { CreateQueryOptions } from '@connectrpc/connect-query/dist/cjs/create-use-query-options';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import type { Query } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const MAX_PAGE_SIZE = 500;

export interface QueryOptions<I extends Message<I>, O extends Message<O>, P extends Message<P>>
  extends Omit<CreateQueryOptions<I, O, P>, 'transport'> {
  /**
   * Set this to `false` to disable automatic refetching when the query mounts or changes query keys.
   * To refetch the query, use the `refetch` method returned from the `useQuery` instance.
   * Defaults to `true`.
   */
  enabled?: boolean;
  /**
   * Optional
   * If set to a number, all queries will continuously refetch at this frequency in milliseconds
   * If set to a function, the function will be executed with the query to compute a frequency
   */
  refetchInterval?:
    | number
    | false
    | ((query: Query<O, ConnectError, O, ConnectQueryKey<I>>) => number | false | undefined);
  /**
   * If set to true, queries that are set to continuously refetch with a refetchInterval will continue to refetch while their tab/window is in the background
   */
  refetchIntervalInBackground?: boolean;
}

export type MethodServerStreamingDescriptor<I extends Message<I>, O extends Message<O>> = MethodInfoServerStreaming<
  I,
  O
> & {
  readonly service: Omit<ServiceType, 'methods'>;
};

export interface StreamResponseMessage<O> {
  /** List of responses in chronological order */
  responses: O[];
  /** Indicates if the stream is completed or not. */
  done: boolean;
}

function handleStreamResponse<I extends Message<I>, O extends Message<O>>(
  stream: Promise<StreamResponse<I, O>>,
  options?: CallOptions,
): AsyncIterable<O> {
  const it = (async function* () {
    const response = await stream;
    options?.onHeader?.(response.header);
    yield* response.message;
    options?.onTrailer?.(response.trailer);
  })()[Symbol.asyncIterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => it.next(),
    }),
  };
}

type CreateServerStreamingQueryOptions<
  I extends Message<I>,
  O extends Message<O>,
  SelectOutData = StreamResponseMessage<O>,
> = {
  transport: Transport;
  callOptions?: Omit<CallOptions, 'signal'> | undefined;
} & Omit<
  UseQueryOptions<StreamResponseMessage<O>, ConnectError, SelectOutData, ConnectQueryKey<I>>,
  'queryFn' | 'queryKey'
>;

/**
 * @see https://github.com/connectrpc/connect-query-es/issues/225#issuecomment-1852256622
 * @see https://github.com/valorem-labs-inc/react-hooks/blob/main/src/hooks/useStream.ts
 * for inspiration
 */
export function useServerStreamingQuery<
  I extends Message<I>,
  O extends Message<O>,
  SelectOutData = StreamResponseMessage<O>,
>(
  methodSig: MethodServerStreamingDescriptor<I, O>,
  input: PartialMessage<I> | undefined,
  {
    transport,
    callOptions,
    ...queryOptions
  }: Omit<CreateServerStreamingQueryOptions<I, O, SelectOutData>, 'transport'> & {
    transport?: Transport;
  } = {},
) {
  const ctxTransport = useTransport();
  const finalTransport = transport ?? ctxTransport;
  const queryClient = useQueryClient();
  const queryKey = createConnectQueryKey(methodSig, input);
  return useQuery({
    ...queryOptions,
    queryKey,
    queryFn: async ({ signal }) => {
      let responses: O[] = [];
      for await (const response of handleStreamResponse(
        finalTransport.stream<I, O>(
          {
            typeName: methodSig.service.typeName,
            methods: {},
          },
          methodSig,
          signal,
          callOptions?.timeoutMs,
          callOptions?.headers,
          createAsyncIterable([input ?? {}]),
        ),
      )) {
        // Spreading results to keep referential integrity for changes
        responses = [...responses, response];
        const newData: StreamResponseMessage<O> = {
          done: false,
          responses,
        };
        queryClient.setQueriesData({ queryKey }, newData);
      }
      return {
        done: true,
        responses,
      } satisfies StreamResponseMessage<O>;
    },
  });
}
