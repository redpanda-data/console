import type { DescMessage, Message, MessageShape } from '@bufbuild/protobuf';
import type { ScalarValue } from '@bufbuild/protobuf/reflect';
import type { ConnectError } from '@connectrpc/connect';
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
