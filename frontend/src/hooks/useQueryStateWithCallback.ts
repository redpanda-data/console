import { useQueryState, UseQueryStateReturn } from 'nuqs';
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';

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
    } else if(params.getDefaultValue) {
      setValue(params.getDefaultValue() as Parameters<typeof setValue>[0]);
    }
  }, []);

  const setValueFinal = (value: Parameters<typeof setValue>[0]) => {
    params.onUpdate(value as T);
    setValue(value);
  };

  return [value, setValueFinal] as UseQueryStateReturn<T, U>;
}
