import type { QueryObserverBaseResult, QueryObserverSuccessResult } from '@tanstack/react-query';

type BooleanKeys<T> = {
  [K in keyof T]: T[K] extends boolean ? K : never;
}[keyof T];

export const queryPendingStates: BooleanKeys<QueryObserverBaseResult>[] = [
  'isError',
  'isFetchedAfterMount',
  'isFetching',
  'isInitialLoading',
  'isLoading',
  'isLoadingError',
  'isPaused',
  'isPending',
  'isPlaceholderData',
  'isRefetchError',
  'isRefetching',
  'isStale',
];

export const queryCompletedStates: BooleanKeys<QueryObserverBaseResult>[] = ['isFetched', 'isSuccess'];

export const getInfiniteQueryStates = (results: QueryObserverBaseResult[]): QueryObserverBaseResult => {
  const resultWithError = results.find((result) => result.isError);
  if (resultWithError) {
    return resultWithError;
  }

  const pendingStates = queryPendingStates.reduce(
    (accumulatedStates, currentPendingState) => ({
      // biome-ignore lint/performance/noAccumulatingSpread: not a performance problem
      ...accumulatedStates,
      [currentPendingState]: results.some((result) => result[currentPendingState]),
    }),
    {},
  );

  const completedStates = queryCompletedStates.reduce(
    (accumulatedStates, currentCompletedState) => ({
      // biome-ignore lint/performance/noAccumulatingSpread: not a performance problem
      ...accumulatedStates,
      [currentCompletedState]: results.every((result) => result[currentCompletedState]),
    }),
    {},
  );

  return {
    ...pendingStates,
    ...completedStates,
  } as QueryObserverSuccessResult;
};
