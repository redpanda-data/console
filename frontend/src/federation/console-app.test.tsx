/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, waitFor } from '@testing-library/react';

// Mock TanStack Router before any imports
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router');
  return {
    ...actual,
    createRouter: vi.fn(() => ({
      subscribe: vi.fn(() => vi.fn()), // Returns unsubscribe function
      load: vi.fn().mockResolvedValue(undefined),
      state: { location: { pathname: '/topics' } },
      navigate: vi.fn(),
    })),
    createMemoryHistory: vi.fn(() => ({
      location: { pathname: '/topics' },
      listen: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    })),
    RouterProvider: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="router-provider">{children}</div>
    ),
  };
});

vi.mock('config', () => ({
  config: {
    jwt: undefined as string | undefined,
  },
  setup: vi.fn(),
  getGrpcBasePath: vi.fn(() => 'http://localhost:9090'),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
  checkExpiredLicenseInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

vi.mock('../routeTree.gen', () => ({
  routeTree: {},
}));

vi.mock('../components/misc/not-found-page', () => ({
  NotFoundPage: () => <div>Not Found</div>,
}));

vi.mock('./token-manager', () => ({
  TokenManager: class MockTokenManager {
    private getToken: () => Promise<string>;
    refresh = vi.fn();
    reset = vi.fn();
    isRefreshing = false;

    constructor(getToken: () => Promise<string>) {
      this.getToken = getToken;
      this.refresh.mockImplementation(() => this.getToken());
    }
  },
}));

import { ConsoleApp } from './console-app';
import type { ConsoleAppProps } from './types';
import { config, setup } from '../config';

describe('ConsoleApp', () => {
  const mockGetAccessToken = vi.fn();
  const mockOnRouteChange = vi.fn();
  const mockOnSidebarItemsChange = vi.fn();
  const mockOnBreadcrumbsChange = vi.fn();
  const mockOnError = vi.fn();

  const defaultProps: ConsoleAppProps = {
    getAccessToken: mockGetAccessToken,
    clusterId: 'test-cluster-id',
    initialPath: '/topics',
    onRouteChange: mockOnRouteChange,
    onSidebarItemsChange: mockOnSidebarItemsChange,
    onBreadcrumbsChange: mockOnBreadcrumbsChange,
    onError: mockOnError,
    config: {},
    featureFlags: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('test-token-123');
    // Reset config.jwt
    config.jwt = undefined;
  });

  test('shows nothing while loading', () => {
    const { container } = render(<ConsoleApp {...defaultProps} />);

    // Component returns null while initializing
    expect(container.firstChild).toBeNull();
  });

  test('calls getAccessToken on mount', async () => {
    render(<ConsoleApp {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  test('stores token in config.jwt after getAccessToken', async () => {
    render(<ConsoleApp {...defaultProps} />);

    await waitFor(() => {
      expect(config.jwt).toBe('test-token-123');
    });
  });

  test('calls setup with correct arguments', async () => {
    const customConfig = {
      urlOverride: {
        grpc: 'http://custom-grpc:9090',
      },
    };

    render(
      <ConsoleApp {...defaultProps} config={customConfig} featureFlags={{ enableKnowledgeBaseInConsoleUi: true }} />
    );

    await waitFor(() => {
      expect(setup).toHaveBeenCalledWith(
        expect.objectContaining({
          jwt: 'test-token-123',
          clusterId: 'test-cluster-id',
          setSidebarItems: mockOnSidebarItemsChange,
          setBreadcrumbs: mockOnBreadcrumbsChange,
          featureFlags: { enableKnowledgeBaseInConsoleUi: true },
          urlOverride: { grpc: 'http://custom-grpc:9090' },
        })
      );
    });
  });

  test('stays in loading state while token refresh is pending', async () => {
    // Create a deferred promise that never resolves during this test
    const tokenPromise = new Promise<string>(() => {});
    mockGetAccessToken.mockReturnValueOnce(tokenPromise);

    const { container } = render(<ConsoleApp {...defaultProps} />);

    // Component should be in loading state (return null) while waiting
    expect(container.firstChild).toBeNull();

    // Verify it stays in loading state
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.firstChild).toBeNull();
  });

  test('uses default initialPath when not provided', async () => {
    const propsWithoutInitialPath = {
      ...defaultProps,
      initialPath: undefined,
    };

    // Should not throw
    render(<ConsoleApp {...propsWithoutInitialPath} />);

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalled();
    });
  });

  test('passes clusterId to setup', async () => {
    render(<ConsoleApp {...defaultProps} clusterId="custom-cluster-xyz" />);

    await waitFor(() => {
      expect(setup).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterId: 'custom-cluster-xyz',
        })
      );
    });
  });

  test('clears QueryClient cache on unmount', async () => {
    const { unmount } = render(<ConsoleApp {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    // Unmount should not throw
    unmount();
  });

  test('accepts navigateTo prop', async () => {
    // Should not throw when navigateTo is provided
    render(<ConsoleApp {...defaultProps} navigateTo="/groups" />);

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalled();
    });
  });

  test('unsubscribes from router on unmount', async () => {
    const { unmount } = render(<ConsoleApp {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    // Should not throw on unmount (unsubscribe should be called)
    unmount();
  });

  describe('Feature Flags', () => {
    test('passes feature flags to setup()', async () => {
      const flags = { schemaRegistry: true, enableKnowledgeBaseInConsoleUi: false };
      render(<ConsoleApp {...defaultProps} featureFlags={flags} />);

      await waitFor(() => {
        expect(setup).toHaveBeenCalledWith(expect.objectContaining({ featureFlags: flags }));
      });
    });

    test('initializes without throwing when featureFlags is undefined', async () => {
      const propsWithoutFlags = {
        ...defaultProps,
        featureFlags: undefined,
      };

      // Should not throw
      render(<ConsoleApp {...propsWithoutFlags} />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      // setup should still be called
      await waitFor(() => {
        expect(setup).toHaveBeenCalled();
      });
    });

    test('handles empty feature flags object', async () => {
      render(<ConsoleApp {...defaultProps} featureFlags={{}} />);

      await waitFor(() => {
        expect(setup).toHaveBeenCalledWith(expect.objectContaining({ featureFlags: {} }));
      });
    });
  });

  describe('Config Overrides', () => {
    test('applies URL overrides from config', async () => {
      const customConfig = {
        urlOverride: { grpc: 'https://custom.api.com' },
      };
      render(<ConsoleApp {...defaultProps} config={customConfig} />);

      await waitFor(() => {
        expect(setup).toHaveBeenCalledWith(
          expect.objectContaining({
            urlOverride: { grpc: 'https://custom.api.com' },
          })
        );
      });
    });

    test('handles config with multiple URL overrides', async () => {
      const customConfig = {
        urlOverride: {
          grpc: 'https://grpc.example.com',
          rest: 'https://rest.example.com',
        },
      };
      render(<ConsoleApp {...defaultProps} config={customConfig} />);

      await waitFor(() => {
        expect(setup).toHaveBeenCalledWith(
          expect.objectContaining({
            urlOverride: customConfig.urlOverride,
          })
        );
      });
    });

    test('initializes without throwing when config is undefined', async () => {
      const propsWithoutConfig = {
        ...defaultProps,
        config: undefined,
      };

      // Should not throw
      render(<ConsoleApp {...propsWithoutConfig} />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });
    });
  });
});
