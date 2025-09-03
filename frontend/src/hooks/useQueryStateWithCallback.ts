import { type UseQueryStateReturn, useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useQueryStateWithCallback<T, U = null>(
  params: {
    onUpdate: (val: T) => void;
    getDefaultValue: () => T;
  },
  ...options: Parameters<typeof useQueryState<T>>
): UseQueryStateReturn<T, U> {
  const [key, ...otherOptions] = options;
  const [value, setValue] = useQueryState<T>(key, ...otherOptions);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.has(key)) {
      setValue(value);
    } else if (params.getDefaultValue) {
      const defaultValue = params.getDefaultValue();
      // The setValue function can accept T or a function that returns T
      setValue(defaultValue as T & {});
    }
  }, [
    searchParams,
    key,
    value,
    params, // The setValue function can accept T or a function that returns T
    setValue,
  ]);

  const setValueFinal = (value: T & {}) => {
    params.onUpdate(value);
    setValue(value as T & {});
  };

  return [value, setValueFinal] as UseQueryStateReturn<T, U>;
}
