import { cleanup } from '@testing-library/react';
import { rs } from '@rstest/core';
import '@testing-library/jest-dom';
import './src/utils/array-extensions';

import type { FeatureFlagKey } from './src/config';

// Full setup for integration tests that render React components
// These tests run in happy-dom environment and need browser API mocks

// Mock document.getAnimations - not available in happy-dom
Object.defineProperty(window.document, 'getAnimations', {
  writable: false,
  value: () => [],
});

// Mock ResizeObserver - not available in happy-dom but required by RadixUI components
class ResizeObserverMock {
  observe = rs.fn();
  unobserve = rs.fn();
  disconnect = rs.fn();
}

rs.stubGlobal('ResizeObserver', ResizeObserverMock);

window.scrollTo = rs.fn() as typeof window.scrollTo;

// Mock monaco-editor - not needed for tests and causes build issues
rs.mock('monaco-editor', () => ({}));
rs.mock('@monaco-editor/react', () => ({
  default: () => null,
  Editor: () => null,
  DiffEditor: () => null,
  useMonaco: () => null,
}));

// Mock lottie-react - lottie-web tries to access canvas APIs not available in happy-dom
rs.mock('lottie-react', () => ({
  useLottie: () => ({
    View: null,
    play: rs.fn(),
    stop: rs.fn(),
    pause: rs.fn(),
    setSpeed: rs.fn(),
    goToAndStop: rs.fn(),
    goToAndPlay: rs.fn(),
    setDirection: rs.fn(),
    playSegments: rs.fn(),
    setSubframe: rs.fn(),
    destroy: rs.fn(),
    getDuration: rs.fn(),
    animationItem: null,
    animationContainerRef: { current: null },
    animationLoaded: false,
  }),
}));

// Mock react-select
rs.mock('react-select', () => {
  const MockedReactSelect = ({
    options,
    value,
    onChange,
  }: {
    options: { label: string; value: string }[];
    value: string;
    onChange: (event?: { label: string; value: string }) => void;
  }) => {
    function handleChange(event: { target: { value: string } }) {
      const matchingOption = options.find((option) => option.value === event.target.value);
      onChange(matchingOption);
    }

    // Return a simple object that represents the element structure
    return {
      type: 'select',
      props: {
        'data-testid': 'select',
        onChange: handleChange,
        value,
        children: options.map((option) => ({
          type: 'option',
          key: option.value,
          props: { value: option.value, children: option.label },
        })),
      },
    };
  };
  return { default: MockedReactSelect };
});

// Explicit cleanup after each test to prevent memory leaks
afterEach(() => {
  cleanup(); // Unmount all React trees
  rs.clearAllMocks(); // Clear mock call history

  // Re-stub ResizeObserver to clear any instances from previous test
  rs.stubGlobal('ResizeObserver', ResizeObserverMock);
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: rs.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: rs.fn(), // Deprecated
      removeListener: rs.fn(), // Deprecated
      addEventListener: rs.fn(),
      removeEventListener: rs.fn(),
      dispatchEvent: rs.fn(),
    })),
  });
});
