import { useLocation } from '@tanstack/react-router';
import { type UseQueryStateReturn, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * `useQueryState`, plus an `onUpdate` callback on every change and a `getDefaultValue` fallback for
 * when the parameter is absent from the URL — for keeping URL state and an external store in sync.
 */
export function useQueryStateWithCallback<T, U = null>(
  params: {
    onUpdate: (val: T) => void;
    getDefaultValue: () => T;
  },
  ...options: Parameters<typeof useQueryState<T>>
): UseQueryStateReturn<T, U> {
  const [key, ...otherOptions] = options;
  const [value, setValue] = useQueryState<T>(key, ...otherOptions);
  const location = useLocation();

  // Memoize searchParams to avoid creating a new URLSearchParams object on every render
  const searchStr = location.searchStr ?? '';
  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);

  // Use ref to store params to avoid dependency issues with unstable config objects
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
        // The setValue function can accept T or a function that returns T
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
