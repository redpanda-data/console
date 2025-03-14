import type {
  Message,
  MethodInfoServerStreaming,
  MethodInfoUnary,
  PartialMessage,
  ServiceType,
} from '@bufbuild/protobuf';
import type { CallOptions, StreamResponse, Transport } from '@connectrpc/connect';
import { ConnectError } from '@connectrpc/connect';
import type { ConnectQueryKey } from '@connectrpc/connect-query';
import { createConnectQueryKey, useTransport } from '@connectrpc/connect-query';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

// /**
//  * Custom hook to use the logging context.
//  *
//  * @returns - The logger instance from the context.
//  * @throws Error if used outside of LoggerProvider context.
//  */
// export function useLogger() {
//   const context = useContext(LoggerContext);
//   if (context === undefined) {
//     throw new Error('useLogger must be used within a LoggerProvider');
//   }
//   return context.logger;
// }

/** Defines a standalone method and associated service  */
// export type MethodUnaryDescriptor<I extends Message<I>, O extends Message<O>> = MethodInfoUnary<I, O> & {
//   readonly service: Omit<ServiceType, 'methods'>;
// };

export type MethodServerStreamingDescriptor<I extends Message<I>, O extends Message<O>> = MethodInfoServerStreaming<
  I,
  O
> & {
  readonly service: Omit<ServiceType, 'methods'>;
};

export interface StreamResponseMessage<T> {
  /** List of responses in chronological order */
  responses: T[];
  /** Indicates if the stream is completed or not. */
  done: boolean;
}

function handleStreamResponse<I extends Message<I>, O extends Message<O>>(
  stream: Promise<StreamResponse<I, O>>,
  options?: CallOptions,
): AsyncIterable<O> {
  const it = (async function* () {
    const response = await stream;
    console.log('it response: ', response);
    options?.onHeader?.(response.header);
    yield* response.message;
    options?.onTrailer?.(response.trailer);
    if (Object.prototype.hasOwnProperty.call(response, 'signal')) {
      console.log('stream aborted');
      return;
    }
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
 * A React hook to manage gRPC streaming within components. It handles opening and closing streams,
 * updating response states, and manages errors. The hook also integrates with react-query for global state management.
 *
 * @param config - Configuration object for the gRPC streaming process.
 * @returns Object containing stream data, response handling functions, and any errors encountered.
 */
export const useStream = <I extends Message<I>, O extends Message<O>, SelectOutData = StreamResponseMessage<O>>(
  methodSig: MethodServerStreamingDescriptor<I, O>,
  input?: PartialMessage<I>,
  {
    transport,
    callOptions,
    onResponse,
    timeoutMs = 15000,
    ...queryOptions
  }: Omit<CreateServerStreamingQueryOptions<I, O, SelectOutData>, 'transport'> & {
    transport?: Transport;
    onResponse?: (response: O) => void;
    timeoutMs?: number;
  } = {},
) => {
  const ctxTransport = useTransport();
  console.log('ctxTransport: ', ctxTransport);
  const finalTransport = transport ?? ctxTransport;

  const queryClient = useQueryClient();
  const queryKey = createConnectQueryKey(methodSig, input);
  console.log('queryKey: ', queryKey);
  const streamIdRef = useRef<number>(0);

  return useQuery({
    ...queryOptions,
    queryKey,
    queryFn: async ({ signal: reactQuerySignal }) => {
      console.log('reactQuerySignal: ', reactQuerySignal);
      let responses: O[] = [];
      const streamId = streamIdRef.current;
      streamIdRef.current += 1;

      const messageSearchAbortController = new AbortController();

      reactQuerySignal?.addEventListener('abort', () => {
        console.debug(`Stream #${streamId} aborted due to react-query abort`);
      });
      const timeoutSignal = createTimeoutSignal(timeoutMs, streamId);
      const signal = mergeAbortSignals([reactQuerySignal, timeoutSignal, messageSearchAbortController.signal]);

      console.debug(`Starting stream #${streamId}.`);

      try {
        for await (const res of handleStreamResponse(
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
          if (reactQuerySignal.aborted) {
            console.log('aborted');
            break;
          }

          console.debug(`Received${Object.keys(res).length === 0 ? ' empty ' : ' '}response for stream #${streamId}`, {
            res,
          });
          onResponse?.(res); // Handle the response.
          responses = [res, ...responses];

          const isDone = responses?.some((response) => {
            return (response as any).controlMessage.case === 'done';
          });

          const newData: StreamResponseMessage<O> = {
            done: isDone,
            responses,
          };
          console.log('newData: ', newData);
          queryClient.setQueriesData({ queryKey }, newData);

          if (isDone) {
            console.log('we are done');
            return {
              done: true,
              responses,
            } satisfies StreamResponseMessage<O>;
          }
        }

        return {
          done: true,
          responses,
        } satisfies StreamResponseMessage<O>;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Stream aborted due to timeout');
        }
        console.debug(ConnectError.from(error));
        throw new Error(JSON.stringify(ConnectError.from(error)));
      } finally {
        console.log(`Stream #${streamId} is closed...`);
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
};

function createTimeoutSignal(timeoutMs: number, streamId: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  timeoutSignal.addEventListener('abort', () => {
    console.debug(`Stream #${streamId} aborted due to timeout`);
  });
  return timeoutSignal;
}

function mergeAbortSignals(signals: (AbortSignal | undefined)[]) {
  const controller = new AbortController();
  const { signal: mergedSignal } = controller;

  const abortListeners = signals.map((signal) => {
    const abortListener = () => {
      controller.abort();
      cleanup();
    };
    signal?.addEventListener('abort', abortListener);
    return abortListener;
  });

  const cleanup = () => {
    abortListeners.forEach((listener, i) => {
      signals[i]?.removeEventListener('abort', listener);
    });
  };

  mergedSignal.addEventListener('abort', cleanup);

  return mergedSignal;
}
