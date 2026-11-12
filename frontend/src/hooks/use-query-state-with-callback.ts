import { useLocation } from '@tanstack/react-router';
import { type UseQueryStateOptions, type UseQueryStateReturn, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { reportActionError } from 'utils/toast.utils';

function useLocationSearchParams(): URLSearchParams {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.searchStr), [location.searchStr]);
}

type ValueUpdater<T> = (previous: T) => T | null;
type CallbackQueryState<T> = [T, UseQueryStateReturn<T, T>[1]];

/** Nuqs interprets every callable setter argument as an updater, not as a parsed value. */
function isValueUpdater<T>(value: T | null | ValueUpdater<T>): value is ValueUpdater<T> {
  return typeof value === 'function';
}

/** Keep local preferences in sync with resolved values, retaining Nuqs' URL-completion promise. */
export function useQueryStateWithCallback<T extends NonNullable<unknown>>(
  params: { onUpdate: (value: T) => void; getDefaultValue: () => T },
  key: string,
  queryOptions: UseQueryStateOptions<T> & { defaultValue: T }
): CallbackQueryState<T> {
  const [value, setValue] = useQueryState<T>(key, queryOptions);
  const searchParams = useLocationSearchParams();
  const paramsRef = useRef({ ...params, defaultValue: queryOptions.defaultValue });
  paramsRef.current = { ...params, defaultValue: queryOptions.defaultValue };
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!isFirstRender.current) {
      return;
    }
    isFirstRender.current = false;
    const initialValue = searchParams.has(key) ? value : paramsRef.current.getDefaultValue();
    setValue(initialValue).catch(reportActionError);
  }, [key, setValue, value, searchParams]);

  const setValueFinal = useCallback<UseQueryStateReturn<T, T>[1]>(
    (newValue, updateOptions) =>
      setValue((previous) => {
        const next = isValueUpdater(newValue) ? newValue(previous) : newValue;
        paramsRef.current.onUpdate(next ?? paramsRef.current.defaultValue);
        return next;
      }, updateOptions),
    [setValue]
  );

  return [value, setValueFinal];
}
