import type { Message } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import type { ConnectQueryKey } from '@connectrpc/connect-query';
import type { CreateQueryOptions } from '@connectrpc/connect-query/dist/cjs/create-use-query-options';
import type { Query } from '@tanstack/react-query';

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

export interface QueryObserverOptions<I extends Message<I>, O extends Message<O>, P extends Message<P>>
  extends Omit<CreateQueryOptions<I, O, P>, 'transport'> {
  enabled?: boolean;
  refetchInterval?:
    | number
    | false
    | ((query: Query<O, ConnectError, O, ConnectQueryKey<I>>) => number | false | undefined);
  refetchIntervalInBackground?: boolean;
}
