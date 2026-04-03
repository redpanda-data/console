import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockCreateConnectTransport, mockCreateRouter, mockFetch, mockSetup } = vi.hoisted(() => ({
  mockCreateConnectTransport: vi.fn((options) => options),
  mockCreateRouter: vi.fn(() => ({
    invalidate: vi.fn().mockResolvedValue(undefined),
  })),
  mockFetch: vi.fn(),
  mockSetup: vi.fn(),
}));

vi.mock('@connectrpc/connect-query', () => ({
  TransportProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: mockCreateConnectTransport,
}));

vi.mock('@redpanda-data/ui', () => ({
  ChakraProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  redpandaTheme: {},
  redpandaToastOptions: {},
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

vi.mock('@tanstack/react-router', () => ({
  createRouter: mockCreateRouter,
  RouterProvider: () => <div data-testid="router-provider" />,
}));

vi.mock('custom-feature-flag-provider', () => ({
  CustomFeatureFlagProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

vi.mock('./components/misc/not-found-page', () => ({
  NotFoundPage: () => <div>Not Found</div>,
}));

vi.mock('./config', () => ({
  addBearerTokenInterceptor: vi.fn((next) => next),
  checkExpiredLicenseInterceptor: vi.fn((next) => next),
  getGrpcBasePath: vi.fn(() => 'http://localhost:9090'),
  setup: mockSetup,
}));

vi.mock('./routeTree.gen', () => ({
  routeTree: {},
}));

vi.mock('./state/app-global', () => ({
  appGlobal: {
    historyLocation: vi.fn(() => ({ pathname: '/topics' })),
    historyPush: vi.fn(),
  },
}));

vi.mock('./state/backend-api', () => ({
  api: {
    refreshUserData: vi.fn().mockResolvedValue(undefined),
  },
}));

import EmbeddedApp from './embedded-app';

describe('EmbeddedApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uses the host-provided fetch for the root dataplane transport', () => {
    render(<EmbeddedApp fetch={mockFetch} isConsoleReadyToMount={true} />);

    expect(mockSetup).toHaveBeenCalled();
    expect(mockCreateConnectTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://localhost:9090',
        fetch: mockFetch,
      })
    );
  });
});
