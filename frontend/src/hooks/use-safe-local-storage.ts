import { useCallback, useState } from 'react';

/**
 * Custom hook for managing localStorage state with safety against:
 * - Incognito/private browsing mode
 * - Storage quota exceeded errors
 * - SSR environments
 *
 * Uses lazy initialization to avoid hydration mismatches.
 */
export const useSafeLocalStorage = <T>(key: string, initialValue: T) => {
  // Lazy initialization to avoid hydration mismatches and handle SSR
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') {
        return initialValue;
      }
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch {
        // Silently fail - storage may be unavailable or quota exceeded
      }
    },
    [key, storedValue]
  );

  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Silently fail
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue] as const;
};

/**
 * Check if a key exists in localStorage (for boolean flags like banner dismissal)
 * Returns false if storage is unavailable.
 */
export function getLocalStorageFlag(key: string): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set a boolean flag in localStorage.
 * Silently fails if storage is unavailable.
 */
export function setLocalStorageFlag(key: string, value: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, String(value));
    }
  } catch {
    // Silently fail
  }
}
