// Stub for @redpanda-data/ui in Node unit tests
// The package includes CSS that can't be parsed in Node environment

export const createStandaloneToast = () => ({
  toast: () => {},
  ToastContainer: null,
});

export const redpandaTheme = {};
export const redpandaToastOptions = {};

// Lightweight component stubs. Unit tests never render JSX, but modules
// imported by the unit-test graph (e.g. src/utils/tsx-utils.tsx) evaluate
// React.createElement at import time for const expressions like
// `const innerSkeleton = <Skeleton ... />`. Without these stubs, React
// emits "type is invalid -- expected a string ... but got: undefined"
// warnings. Return a minimal function component (null output) so the
// createElement call is valid.
const stubComponent = () => null;

export const Box = stubComponent;
export const Flex = stubComponent;
export const Progress = stubComponent;
export const RadioGroup = stubComponent;
export const Button = stubComponent;
export const Skeleton = stubComponent;
export const Text = stubComponent;
export const Tooltip = stubComponent;

// Type exports don't need runtime values
export type SortingState = Array<{ id: string; desc: boolean }>;
export type PlacementWithLogical = string;
export type ButtonProps = Record<string, unknown>;
export type ToastId = string;
