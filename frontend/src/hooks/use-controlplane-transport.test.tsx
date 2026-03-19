import type { Interceptor } from '@connectrpc/connect';
import { renderHook } from '@testing-library/react';

const { mockAddBearerTokenInterceptor, mockCreateConnectTransport, mockFetch } = vi.hoisted(() => ({
  mockAddBearerTokenInterceptor: vi.fn((next) => next),
  mockCreateConnectTransport: vi.fn((options) => options),
  mockFetch: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: mockCreateConnectTransport,
}));

vi.mock('config', () => ({
  addBearerTokenInterceptor: mockAddBearerTokenInterceptor,
  config: {
    controlplaneUrl: 'https://controlplane.example',
    fetch: mockFetch,
  },
}));

vi.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

import { useControlplaneTransport } from './use-controlplane-transport';
import { setRegisteredTokenRefreshInterceptor, useTokenRefreshInterceptor } from '../utils/token-refresh-interceptor';

describe('useControlplaneTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRegisteredTokenRefreshInterceptor(undefined);
  });

  afterEach(() => {
    setRegisteredTokenRefreshInterceptor(undefined);
  });

  test('falls back to the registered token refresh interceptor and uses config.fetch', () => {
    const refreshInterceptor = ((next) => next) as unknown as Interceptor;
    setRegisteredTokenRefreshInterceptor(refreshInterceptor);

    renderHook(() => ({
      transport: useControlplaneTransport(),
      interceptor: useTokenRefreshInterceptor(),
    }));

    expect(mockCreateConnectTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://controlplane.example',
        fetch: mockFetch,
        interceptors: [mockAddBearerTokenInterceptor, refreshInterceptor],
      })
    );
  });
});
