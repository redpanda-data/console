import type { PersistStorage } from 'zustand/middleware';

/**
 * Persists only the state under the session key so consumers can read it without the Zustand wrapper.
 */
export const createFlatStorage = <T>(): PersistStorage<T> => ({
  getItem: (name) => {
    const str = sessionStorage.getItem(name);
    if (!str) {
      return null;
    }
    return { state: JSON.parse(str) as T, version: 0 };
  },
  setItem: (name, value) => {
    sessionStorage.setItem(name, JSON.stringify(value.state));
  },
  removeItem: (name) => {
    sessionStorage.removeItem(name);
  },
});
