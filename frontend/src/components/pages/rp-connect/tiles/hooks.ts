import { useCallback, useState } from 'react';
import { configToYaml, getComponentByCompositeValue, schemaToConfig } from './utils';

/**
 * Custom hook for managing session storage state
 */
export const useSessionStorage = <T>(key: string, initialValue?: T) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading from sessionStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        sessionStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.warn(`Error setting sessionStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  return [storedValue, setValue] as const;
};

/**
 * Custom hook that generates a yaml string for a connect config based on the selected connectionName
 * @returns yaml string of connect config for the selected connectionName
 */
export const useConnectTemplate = (connectionName?: string) => {
  const componentSpec = getComponentByCompositeValue(connectionName);
  const baseConfig = schemaToConfig(componentSpec);

  if (!baseConfig || !componentSpec) {
    return undefined;
  }
  return configToYaml(baseConfig, componentSpec);
};
