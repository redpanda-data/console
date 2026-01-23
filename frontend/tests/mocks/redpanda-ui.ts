// Stub for @redpanda-data/ui in Node unit tests
// The package includes CSS that can't be parsed in Node environment

export const createStandaloneToast = () => ({
  toast: () => {},
  ToastContainer: null,
});

export const redpandaTheme = {};
export const redpandaToastOptions = {};

// Type exports don't need runtime values
export type SortingState = Array<{ id: string; desc: boolean }>;
