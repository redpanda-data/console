/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// This test imports app.tsx to assert its module-level transport wiring, so the
// app's heavy runtime dependencies are mocked below.
vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({ kind: 'transport' })),
}));

vi.mock('./config', () => ({
  setup: vi.fn(() => vi.fn()),
  getGrpcBasePath: vi.fn(() => '/redpanda-console'),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
  checkExpiredLicenseInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('@builder.io/sdk-react', () => ({
  Content: () => null,
}));

vi.mock('@connectrpc/connect-query', () => ({
  TransportProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@redpanda-data/ui', () => ({
  ChakraProvider: ({ children }: { children: React.ReactNode }) => children,
  redpandaToastOptions: {},
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

vi.mock('@tanstack/react-router', () => ({
  createRouter: vi.fn(() => ({})),
  RouterProvider: () => null,
}));

vi.mock('components/builder-io/builder-custom-components', () => ({
  builderCustomComponents: [],
}));

vi.mock('components/constants', () => ({
  BUILDER_API_KEY: 'test-key',
}));

vi.mock('custom-feature-flag-provider', () => ({
  CustomFeatureFlagProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('hooks/use-developer-view', () => ({
  default: () => false,
}));

vi.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

vi.mock('query-client', () => ({
  default: {},
}));

vi.mock('utils/env', () => ({
  getBasePath: () => '/redpanda-console',
}));

vi.mock('utils/redpanda-theme', () => ({
  patchedRedpandaTheme: {},
}));

vi.mock('./components/misc/not-found-page', () => ({
  NotFoundPage: () => null,
}));

vi.mock('./routeTree.gen', () => ({
  routeTree: {},
}));

vi.mock('./state/ui', () => ({
  installUISettingsSideEffects: vi.fn(() => vi.fn()),
}));

const importAppWithMocks = async ({ grpcBasePath = '/redpanda-console' }: { grpcBasePath?: string } = {}) => {
  const { getGrpcBasePath } = await import('./config');
  vi.mocked(getGrpcBasePath).mockReturnValue(grpcBasePath);

  await import('./app');

  const { createConnectTransport } = await import('@connectrpc/connect-web');

  return { createConnectTransport, getGrpcBasePath };
};

describe('App dataplane transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  test('uses the configured gRPC base path for Connect Query requests', async () => {
    const { createConnectTransport, getGrpcBasePath } = await importAppWithMocks();

    expect(getGrpcBasePath).toHaveBeenCalledWith();
    expect(createConnectTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: '/redpanda-console',
      })
    );
  });

  test('keeps origin-root behavior for root-mounted deployments', async () => {
    const { createConnectTransport, getGrpcBasePath } = await importAppWithMocks({ grpcBasePath: '' });

    expect(getGrpcBasePath).toHaveBeenCalledWith();
    expect(createConnectTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: '',
      })
    );
  });
});
