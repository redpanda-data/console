import { type UseQueryStateReturn, useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A custom hook that extends `useQueryState` with callback functionality for syncing state changes.
 *
 * This hook provides the same functionality as `useQueryState` but adds:
 * - Automatic callback execution when the query state changes
 * - Default value handling when the query parameter is not present in the URL
 * - Synchronization between URL state and external state management
 *
 * @template T - The type of the query state value
 * @template U - The type for additional options (defaults to null)
 *
 * @param params - Configuration object containing callback functions
 * @param params.onUpdate - Callback function called whenever the query state changes
 * @param params.getDefaultValue - Function that returns the default value when the query parameter is not in the URL
 * @param options - Spread parameters passed directly to `useQueryState`
 *
 * @returns A tuple containing the current value and a setter function, similar to `useQueryState`
 *
 * @example
 * ```tsx
 * const [showInternalTopics, setShowInternalTopics] = useQueryStateWithCallback<boolean>({
 *   onUpdate: (val) => {
 *     // Sync with external state management
 *     uiSettings.topicList.hideInternalTopics = val;
 *   },
 *   getDefaultValue: () => {
 *     // Return default value from external state
 *     return uiSettings.topicList.hideInternalTopics;
 *   }
 * }, "showInternal", parseAsBoolean);
 *
 * // Usage
 * setShowInternalTopics(true); // This will update both URL and call onUpdate
 * ```
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useQueryStateWithCallback<string>({
 *   onUpdate: (val) => {
 *     // Perform search or update search state
 *     performSearch(val);
 *   },
 *   getDefaultValue: () => {
 *     return '';
 *   }
 * }, "q", parseAsString);
 * ```
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
  const [searchParams] = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;

      if (searchParams.has(key)) {
        setValue(value);
      } else if (params.getDefaultValue) {
        const defaultValue = params.getDefaultValue();
        // The setValue function can accept T or a function that returns T
        setValue(defaultValue as T & {});
      }
    }
  }, [searchParams, key, setValue, value, params.getDefaultValue]);

  const setValueFinal = (newValue: T & {}) => {
    params.onUpdate(newValue);
    setValue(newValue as T & {});
  };

  return [value, setValueFinal] as UseQueryStateReturn<T, U>;
}
