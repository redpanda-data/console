import { useCallback } from "react";
import { useQueryState } from "nuqs";

/**
 * Simple wrapper around nuqs useQueryState that provides a callback when the parameter is set.
 * 
 * @example
 * ```tsx
 * const [showInternalTopics, setShowInternalTopics] = useQueryStateWithCallback(
 *   "showInternal", 
 *   parseAsBoolean.withDefault(false), 
 *   (value) => {
 *     uiSettings.topicList.hideInternalTopics = value;
 *   }
 * );
 * ```
 */
export function useQueryStateWithCallback<T>(
  key: string,
  config: any, // Using any to avoid complex type issues with nuqs
  callback?: (value: T) => void,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Get the base useQueryState hook
  const [value, setValue] = useQueryState(key, config);
  
  // Create a wrapper setter that calls the callback when setting the value
  const setValueWithCallback = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue((prevValue: any) => {
        const resolvedValue = typeof newValue === "function" ? (newValue as (prev: T) => T)(prevValue) : newValue;
        
        // Call the callback when setting the value
        if (callback) {
          callback(resolvedValue as T);
        }
        
        return resolvedValue as any;
      });
    },
    [setValue, callback],
  );

  return [value as T, setValueWithCallback];
} 