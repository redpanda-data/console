/**
 * Bun test setup file
 * Must be preloaded before tests run
 */

// IMPORTANT: Register happy-dom FIRST before any imports that need DOM globals
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Now we can import testing-library (it needs document.body to exist)
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

import { beforeEach, expect, mock } from 'bun:test';

expect.extend(matchers);

// Store cleanup reference
const cleanupFn = cleanup;

// Import array extensions
import './src/utils/array-extensions';

// Mock document.getAnimations (not available in happy-dom)
Object.defineProperty(window.document, 'getAnimations', {
  writable: false,
  value: () => [],
});

// Mock ResizeObserver - not available in happy-dom but required by RadixUI components
class ResizeObserverMock {
  observe = mock(() => {});
  unobserve = mock(() => {});
  disconnect = mock(() => {});
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// @ts-expect-error - scrollTo not in happy-dom
window.scrollTo = mock(() => {});

// Mock localStorage - use Object.defineProperty since happy-dom makes it readonly
const localStorageMock = {
  getItem: mock(() => null),
  setItem: mock(() => {}),
  removeItem: mock(() => {}),
  clear: mock(() => {}),
  length: 0,
  key: mock(() => null),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock matchMedia - not available in happy-dom
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mock((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: mock(() => {}),
      removeListener: mock(() => {}),
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
      dispatchEvent: mock(() => {}),
    })),
  });
});

// Note: Cleanup is handled by individual test files that import cleanup from @testing-library/react
// Don't add global cleanup here as it can cause double-cleanup issues

// ============================================
// Module mocks - must be called before imports
// ============================================

// Mock lottie-web
mock.module('lottie-web', () => ({
  default: {
    loadAnimation: mock(() => ({
      destroy: mock(() => {}),
      play: mock(() => {}),
      stop: mock(() => {}),
      pause: mock(() => {}),
      setSpeed: mock(() => {}),
      goToAndStop: mock(() => {}),
      goToAndPlay: mock(() => {}),
      setDirection: mock(() => {}),
      playSegments: mock(() => {}),
      setSubframe: mock(() => {}),
      getDuration: mock(() => 0),
    })),
  },
}));

// Mock lottie-react
mock.module('lottie-react', () => ({
  useLottie: () => ({
    View: null,
    play: mock(() => {}),
    stop: mock(() => {}),
    pause: mock(() => {}),
    setSpeed: mock(() => {}),
    goToAndStop: mock(() => {}),
    goToAndPlay: mock(() => {}),
    setDirection: mock(() => {}),
    playSegments: mock(() => {}),
    setSubframe: mock(() => {}),
    destroy: mock(() => {}),
    getDuration: mock(() => 0),
    animationItem: null,
    animationContainerRef: { current: null },
    animationLoaded: false,
  }),
}));

// Mock config module
mock.module('config', () => ({
  config: {
    featureFlags: {},
    jwt: null,
    clusterId: '',
    clusterName: '',
    serverVersion: '',
    gitRef: '',
    gitSha: '',
    isBusinessPlatform: false,
    isServerless: false,
    serverBuild: null,
  },
  isFeatureFlagEnabled: () => false,
  isEmbedded: () => false,
  isServerless: () => false,
  getGrpcBasePath: (overrideUrl?: string) => overrideUrl ?? '',
  getControlplaneBasePath: (overrideUrl?: string) => overrideUrl ?? '',
  addBearerTokenInterceptor: (next: any) => async (request: any) => next(request),
  checkExpiredLicenseInterceptor: (next: any) => async (request: any) => next(request),
  setMonacoTheme: () => {},
  embeddedAvailableRoutesObservable: {
    value: [],
  },
  setup: () => {},
}));

// Mock react-select for simpler testing
mock.module('react-select', () => {
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
