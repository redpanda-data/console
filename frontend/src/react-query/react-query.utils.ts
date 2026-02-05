import type { DescMessage, Message, MessageShape } from '@bufbuild/protobuf';
import type { ScalarValue } from '@bufbuild/protobuf/reflect';
import { ConnectError } from '@connectrpc/connect';
import type { ConnectQueryKey, UseQueryOptions } from '@connectrpc/connect-query';
import type { Query } from '@tanstack/react-query';

export const ONE_SECOND = 1000; // ms
export const ONE_MINUTE = 60 * ONE_SECOND;

export const LONG_LIVED_CACHE_STALE_TIME = 5 * ONE_MINUTE;
export const MEDIUM_LIVED_CACHE_STALE_TIME = 2 * ONE_MINUTE;
export const SHORT_LIVED_CACHE_STALE_TIME = 1 * ONE_MINUTE;
export const NO_LIVED_CACHE_STALE_TIME = 0;
export const MAX_PAGE_SIZE = 500;
export const SHORT_POLLING_INTERVAL = 2 * ONE_SECOND;

/**
 * A fast-fail retry function that provides quick feedback to users.
 * Only retries transient network errors, not deterministic gRPC errors.
 *
 * Use cases:
 * - Queries that should fail fast on permission/auth errors
 * - Queries where server errors (500) are unlikely to succeed on retry
 * - Queries where you want to show errors to users immediately
 *
 * @example
 * ```typescript
 * export const useMyQuery = (request: MyRequest) => {
 *   return useQuery(myRpc, request, { retry: fastFailRetry });
 * };
 * ```
 *
 * @param failureCount - Number of times the query has already failed
 * @param error - The error from the failed query attempt
 * @returns true to retry, false to fail immediately
 */
export const fastFailRetry = (failureCount: number, error: Error): boolean => {
  // Max 1 retry attempt (initial + 1 retry = 2 total attempts)
  if (failureCount >= 1) {
    return false;
  }

  // Don't retry on ConnectError - these are deterministic gRPC errors:
  // - Code.PermissionDenied (user lacks permission)
  // - Code.Unauthenticated (auth failure)
  // - Code.InvalidArgument (bad request)
  // - Code.NotFound (resource doesn't exist)
  // - Code.Internal (server error - unlikely to succeed on retry)
  // - Code.Unimplemented (feature not available)
  // etc.
  if (error instanceof ConnectError) {
    return false;
  }

  // Retry once for unknown errors (network issues, timeouts, etc.)
  return true;
};

/**
 * This is a type that comes from bufbuild package.
 * It extracts the init type from a message descriptor.
 * It is needed to initialize custom query hooks and is accepted by the function create().
 */
export type MessageInit<T extends Message> =
  | T
  | {
      [P in keyof T as P extends '$unknown' ? never : P]?: P extends '$typeName' ? never : FieldInit<T[P]>;
    };
type FieldInit<F> = F extends Date | Uint8Array | bigint | boolean | string | number
  ? F
  : F extends Array<infer U>
    ? FieldInit<U>[]
    : F extends ReadonlyArray<infer U>
      ? readonly FieldInit<U>[]
      : F extends Message
        ? MessageInit<F>
        : F extends OneofSelectedMessage<infer C, infer V>
          ? {
              case: C;
              value: MessageInit<V>;
            }
          : F extends OneofADT
            ? F
            : F extends MapWithMessage<infer V>
              ? {
                  [key: string | number]: MessageInit<V>;
                }
              : F;
type MapWithMessage<V extends Message> = {
  [key: string | number]: V;
};
type OneofSelectedMessage<K extends string, M extends Message> = {
  case: K;
  value: M;
};
type OneofADT =
  | {
      case: undefined;
      value?: undefined;
    }
  | {
      case: string;
      value: Message | ScalarValue;
    };

/**
 * Need to create a custom QueryOptions type in order to control enabled flag/refetch mechanism, including infinite queries that fetch all pages.
 */
export interface QueryOptions<O extends DescMessage, SelectOutData = MessageShape<O>>
  extends Omit<UseQueryOptions<O, SelectOutData>, 'transport'> {
  enabled?: boolean;
  refetchInterval?:
    | number
    | false
    | ((
        query: Query<MessageShape<O>, ConnectError, MessageShape<O>, ConnectQueryKey<O>>
      ) => number | false | undefined);
  refetchIntervalInBackground?: boolean;
}

// export interface QueryObserverOptions<O extends DescMessage, SelectOutData = MessageShape<O>>
//   extends Omit<UseQueryOptions<O, SelectOutData>, 'transport'> {
//   enabled?: boolean;
//   refetchInterval?:
//     | number
//     | false
//     | ((query: Query<MessageShape<O>, ConnectError, MessageShape<O>, ConnectQueryKey>) => number | false | undefined);
//   refetchIntervalInBackground?: boolean;
// }
