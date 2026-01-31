import { afterEach, beforeEach, rstest } from '@rstest/core';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import './src/utils/array-extensions';

// Full setup for integration tests that render React components
// These tests run in jsdom environment and need browser API mocks

// Mock document.getAnimations (not available in jsdom but used by some libraries)
Object.defineProperty(window.document, 'getAnimations', {
  writable: false,
  value: () => [],
});

// Mock ResizeObserver - not available in jsdom but required by RadixUI components
class ResizeObserverMock {
  observe = rstest.fn();
  unobserve = rstest.fn();
  disconnect = rstest.fn();
}

rstest.stubGlobal('ResizeObserver', ResizeObserverMock);

// @ts-expect-error - scrollTo not in jsdom
window.scrollTo = rstest.fn();

// Mock localStorage - jsdom's localStorage can be incomplete
const localStorageMock = {
  getItem: rstest.fn(() => null),
  setItem: rstest.fn(),
  removeItem: rstest.fn(),
  clear: rstest.fn(),
  length: 0,
  key: rstest.fn(() => null),
};
rstest.stubGlobal('localStorage', localStorageMock);

// Mock matchMedia - not available in jsdom
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: rstest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: rstest.fn(),
      removeListener: rstest.fn(),
      addEventListener: rstest.fn(),
      removeEventListener: rstest.fn(),
      dispatchEvent: rstest.fn(),
    })),
  });
});

// Explicit cleanup after each test to prevent memory leaks
afterEach(() => {
  cleanup(); // Unmount all React trees
  rstest.clearAllMocks(); // Clear mock call history

  // Re-stub ResizeObserver to clear any instances from previous test
  rstest.stubGlobal('ResizeObserver', ResizeObserverMock);
});

// Mock lottie-web - it tries to access canvas APIs at module load time
rstest.mock('lottie-web', () => ({
  default: {
    loadAnimation: rstest.fn(() => ({
      destroy: rstest.fn(),
      play: rstest.fn(),
      stop: rstest.fn(),
      pause: rstest.fn(),
      setSpeed: rstest.fn(),
      goToAndStop: rstest.fn(),
      goToAndPlay: rstest.fn(),
      setDirection: rstest.fn(),
      playSegments: rstest.fn(),
      setSubframe: rstest.fn(),
      getDuration: rstest.fn(),
    })),
  },
}));

// Mock lottie-react - lottie-web tries to access canvas APIs not available in jsdom
rstest.mock('lottie-react', () => ({
  useLottie: () => ({
    View: null,
    play: rstest.fn(),
    stop: rstest.fn(),
    pause: rstest.fn(),
    setSpeed: rstest.fn(),
    goToAndStop: rstest.fn(),
    goToAndPlay: rstest.fn(),
    setDirection: rstest.fn(),
    playSegments: rstest.fn(),
    setSubframe: rstest.fn(),
    destroy: rstest.fn(),
    getDuration: rstest.fn(),
    animationItem: null,
    animationContainerRef: { current: null },
    animationLoaded: false,
  }),
}));

// Note: config module is mocked via alias in rstest.config.ts

// Mock react-select for simpler testing
rstest.mock('react-select', () => {
  const MockedReactSelect = ({
    options,
    value,
    onChange,
  }: {
    options: { label: string; value: string }[];
    value: string;
    onChange: (event?: { label: string; value: string }) => void;
  }) => {
    function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
      const matchingOption = options.find((option) => option.value === event.target.value);
      onChange(matchingOption);
    }
    return (
      <>
        <select data-testid="select" onChange={handleChange} value={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div>select is required</div>
      </>
    );
  };
  return { default: MockedReactSelect };
});
