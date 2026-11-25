import type { PersistStorage } from 'zustand/middleware';

export const createFlatStorage = <T>(decode: (value: unknown) => T): PersistStorage<T> => {
  return {
    getItem: (name) => {
      const str = sessionStorage.getItem(name);
      if (!(str !== null && str !== undefined && str !== '')) {
        return null;
      }
      // Read flat data from storage, wrap it for Zustand's internal use
      const parsed: unknown = JSON.parse(str);
      return { state: decode(parsed), version: 0 };
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
