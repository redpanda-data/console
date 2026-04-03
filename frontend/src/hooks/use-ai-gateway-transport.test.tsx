import type { Interceptor } from '@connectrpc/connect';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

const { mockAddBearerTokenInterceptor, mockCreateConnectTransport, mockFetch, mockIsEmbedded } = vi.hoisted(() => ({
  mockAddBearerTokenInterceptor: vi.fn((next) => next),
  mockCreateConnectTransport: vi.fn((options) => options),
  mockFetch: vi.fn(),
  mockIsEmbedded: vi.fn(() => true),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: mockCreateConnectTransport,
}));

vi.mock('config', () => ({
  addBearerTokenInterceptor: mockAddBearerTokenInterceptor,
  config: {
    aiGatewayUrl: 'https://gateway.example',
    fetch: mockFetch,
  },
  isEmbedded: mockIsEmbedded,
}));

vi.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

import { useAIGatewayTransport } from './use-ai-gateway-transport';
import { TokenRefreshInterceptorProvider } from '../utils/token-refresh-interceptor';

describe('useAIGatewayTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uses config.fetch and includes the provided token refresh interceptor', () => {
    const refreshInterceptor = ((next) => next) as unknown as Interceptor;

    const wrapper = ({ children }: PropsWithChildren) => (
      <TokenRefreshInterceptorProvider value={refreshInterceptor}>{children}</TokenRefreshInterceptorProvider>
    );

    renderHook(() => useAIGatewayTransport(), { wrapper });

    expect(mockCreateConnectTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://gateway.example/.redpanda/api',
        fetch: mockFetch,
        interceptors: [mockAddBearerTokenInterceptor, refreshInterceptor],
      })
    );
  });
});
