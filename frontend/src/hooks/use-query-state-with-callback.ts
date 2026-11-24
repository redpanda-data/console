import { useLocation } from '@tanstack/react-router';
import { type UseQueryStateReturn, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef } from 'react';

function useLocationSearchParams() {
  const location = useLocation();
  const searchStr = location.searchStr ?? '';
  return useMemo(() => new URLSearchParams(searchStr), [searchStr]);
}

/**
 * `useQueryState`, plus an `onUpdate` callback on every change and a `getDefaultValue` fallback for
 * when the parameter is absent from the URL — for keeping URL state and an external store in sync.
 *
 * Reads the latest callbacks without requiring callers to memoize their options.
 */
export function useQueryStateWithCallback<T, U = null>(
  params: {
    onUpdate: (val: T) => void;
    getDefaultValue: () => T;
  },
  ...options: Parameters<typeof useQueryState<T>>
) {
  const [key, ...otherOptions] = options;
  const [value, setValue] = useQueryState<T>(key, ...otherOptions);
  const searchParams = useLocationSearchParams();

  const paramsRef = useRef(params);
  paramsRef.current = params;

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;

      if (searchParams.has(key)) {
        setValue(value);
      } else if (paramsRef.current.getDefaultValue) {
        const defaultValue = paramsRef.current.getDefaultValue();
        setValue(defaultValue as T & {});
      }
    }
  }, [key, setValue, value, searchParams]);

  const setValueFinal = useCallback(
    (newValue: T & {}) => {
      paramsRef.current.onUpdate(newValue);
      setValue(newValue as T & {});
    },
    [setValue]
  );

  return [value, setValueFinal] as UseQueryStateReturn<T, U>;
}
