import type { PersistStorage } from 'zustand/middleware';

export const createFlatStorage = <T>(): PersistStorage<T> => {
  return {
    getItem: (name) => {
      const str = sessionStorage.getItem(name);
      if (!str) {
        return null;
      }
      return { state: JSON.parse(str) as T, version: 0 };
    },
    setItem: (name, value) => {
      // Write only the state data, not the Zustand wrapper
      sessionStorage.setItem(name, JSON.stringify(value.state));
    },
    removeItem: (name) => {
      sessionStorage.removeItem(name);
    },
  };
};
