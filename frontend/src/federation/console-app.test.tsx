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

import { useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock TanStack Router before any imports
rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    createRouter: rs.fn(() => ({
      subscribe: rs.fn(() => rs.fn()), // Returns unsubscribe function
      load: rs.fn().mockResolvedValue(undefined),
      state: { location: { pathname: '/topics', searchStr: '' } },
      navigate: rs.fn().mockResolvedValue(undefined),
    })),
    createMemoryHistory: rs.fn(() => ({
      location: { pathname: '/topics' },
      listen: rs.fn(),
      push: rs.fn(),
      replace: rs.fn(),
    })),
    RouterProvider: MockRouterProvider,
  };
});

rs.mock('config', () => ({
  config: {
    jwt: undefined as string | undefined,
  },
  setup: rs.fn(),
  getGrpcBasePath: rs.fn(() => 'http://localhost:9090'),
  addBearerTokenInterceptor: rs.fn((next) => async (request: unknown) => await next(request)),
  checkExpiredLicenseInterceptor: rs.fn((next) => async (request: unknown) => await next(request)),
}));

rs.mock('protobuf-registry', () => ({
  protobufRegistry: {},
}));

rs.mock('../routeTree.gen', () => ({
  routeTree: {},
}));

rs.mock('../components/misc/not-found-page', () => ({
  NotFoundPage: MockNotFoundPage,
}));

import { ConsoleApp } from './console-app';
import type { ConsoleAppProps } from './types';
import { config, setup } from '../config';

let pendingTopic: Promise<string> | undefined;
let reportBreadcrumbsDuringRender = false;

const mockGetAccessToken = rs.fn();
const mockOnRouteChange = rs.fn();
const mockOnSidebarItemsChange = rs.fn();
const mockOnBreadcrumbsChange = rs.fn();
const mockOnError = rs.fn();
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

describe('the ConsoleApp', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    pendingTopic = undefined;
    reportBreadcrumbsDuringRender = false;
    mockGetAccessToken.mockResolvedValue('test-token-123');
    // Reset config.jwt
    config.jwt = undefined;
  });

  describe('initialization', () => {
    test('updates the host error callback without restarting initialization', async () => {
      const { rerender } = render(<ConsoleApp {...defaultProps} />);
      await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
      await act(() => {
        rerender(<ConsoleApp {...defaultProps} onError={rs.fn()} />);
      });
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    test('retries a failed initialization without reloading the host', async () => {
      const user = userEvent.setup();
      mockGetAccessToken.mockRejectedValueOnce(new Error('Token service unavailable'));
      render(<ConsoleApp {...defaultProps} />);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
      expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    test('keeps the mounted app while updated configuration waits for a token', async () => {
      const { rerender } = render(<ConsoleApp {...defaultProps} />);
      await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
      const mounted = screen.getByTestId('router-provider');
      const token = Promise.withResolvers<string>();
      mockGetAccessToken.mockReturnValueOnce(token.promise);
      rerender(<ConsoleApp {...defaultProps} config={{ urlOverride: { grpc: 'https://updated.example.com' } }} />);
      expect(mounted.isConnected).toBe(true);
      await act(async () => {
        token.resolve('updated-token');
        await token.promise;
      });
      expect(screen.getByTestId('router-provider')).toBe(mounted);
    });
  });

  describe('initialization ownership', () => {
    test('does not let an unmounted cluster overwrite the active token', async () => {
      const staleToken = Promise.withResolvers<string>();
      const oldApp = render(<ConsoleApp {...defaultProps} getAccessToken={() => staleToken.promise} />);
      oldApp.unmount();
      render(<ConsoleApp {...defaultProps} clusterId="current-cluster" />);
      await waitFor(() => expect(config.jwt).toBe('test-token-123'));

      await act(async () => {
        staleToken.resolve('stale-cluster-token');
        await staleToken.promise;
      });

      expect(config.jwt).toBe('test-token-123');
      expect(setup).toHaveBeenCalledTimes(1);
      expect(setup).toHaveBeenCalledWith(expect.objectContaining({ clusterId: 'current-cluster' }));
    });

    test('keeps an active query subscribed when a host callback changes', async () => {
      const topic = Promise.withResolvers<string>();
      pendingTopic = topic.promise;
      const { rerender } = render(<ConsoleApp {...defaultProps} />);
      await screen.findByText('Loading topic fixture');

      rerender(<ConsoleApp {...defaultProps} onSidebarItemsChange={rs.fn()} />);
      await act(async () => {
        topic.resolve('Loaded topic fixture');
        await topic.promise;
      });

      expect(await screen.findByText('Loaded topic fixture')).toBeInTheDocument();
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    test('forwards subscription events to the latest host callbacks without reconnecting', async () => {
      const { rerender } = render(<ConsoleApp {...defaultProps} />);
      await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
      const callbacks = { sidebar: rs.fn(), breadcrumbs: rs.fn() };
      rerender(
        <ConsoleApp
          {...defaultProps}
          onBreadcrumbsChange={callbacks.breadcrumbs}
          onSidebarItemsChange={callbacks.sidebar}
        />
      );
      const settings = rs.mocked(setup).mock.calls[0]?.[0];
      settings?.setSidebarItems?.([]);
      settings?.setBreadcrumbs?.([]);
      expect(callbacks.sidebar).toHaveBeenCalledWith([]);
      expect(callbacks.breadcrumbs).toHaveBeenCalledWith([]);
      expect(setup).toHaveBeenCalledTimes(1);
    });

    test('accepts breadcrumb notifications from a route rendering', async () => {
      reportBreadcrumbsDuringRender = true;
      render(<ConsoleApp {...defaultProps} />);
      expect(await screen.findByTestId('router-provider')).toBeInTheDocument();
      expect(mockOnBreadcrumbsChange).toHaveBeenCalledWith([]);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    test('hides the previous cluster while a new cluster initializes', async () => {
      const { rerender } = render(<ConsoleApp {...defaultProps} />);
      await screen.findByTestId('router-provider');
      const token = Promise.withResolvers<string>();
      rerender(<ConsoleApp {...defaultProps} clusterId="next-cluster" getAccessToken={() => token.promise} />);
      expect(screen.queryByTestId('router-provider')).not.toBeInTheDocument();
      await act(async () => {
        token.resolve('next-cluster-token');
        await token.promise;
      });
      expect(await screen.findByTestId('router-provider')).toBeInTheDocument();
      expect(setup).toHaveBeenLastCalledWith(expect.objectContaining({ clusterId: 'next-cluster' }));
    });
  });

  describe('initialization lifecycle', () => {
    test('reports token initialization failures to the host and the user', async () => {
      const error = new Error('Token service unavailable');
      mockGetAccessToken.mockRejectedValueOnce(error);
      render(<ConsoleApp {...defaultProps} />);

      expect(await screen.findByRole('alert')).toHaveTextContent('Token service unavailable');
      expect(mockOnError).toHaveBeenCalledWith(error, expect.any(Object));
      expect(setup).not.toHaveBeenCalled();
    });

    test('does not initialize after unmount while token refresh is pending', async () => {
      const token = Promise.withResolvers<string>();
      mockGetAccessToken.mockReturnValueOnce(token.promise);
      const { unmount } = render(<ConsoleApp {...defaultProps} />);
      unmount();

      await act(async () => {
        token.resolve('late-token');
        await token.promise;
      });
      expect(setup).not.toHaveBeenCalled();
    });

    test('shows nothing while loading', async () => {
      // Use a deferred promise so the component stays in its loading branch
      // for the duration of the assertion. This prevents the async
      // initialize() useEffect from flushing a second state update (which
      // would trigger "update was not wrapped in act(...)" since the render()
      // call wasn't awaited).
      const tokenPromise = new Promise<string>(() => {
        // never resolves
      });
      mockGetAccessToken.mockReturnValueOnce(tokenPromise);

      const { container } = render(<ConsoleApp {...defaultProps} />);

      // Component returns null while initializing
      expect(container.firstChild).toBeNull();

      // Let any queued microtasks settle inside act() so React's scheduler
      // doesn't log a deferred-update warning after the test completes.
      await act(async () => {
        await Promise.resolve();
      });
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
        jwt: 'stale-host-token',
        urlOverride: {
          grpc: 'http://custom-grpc:9090',
        },
      };

      render(<ConsoleApp {...defaultProps} config={customConfig} featureFlags={{ enablePipelineDiagrams: true }} />);

      await waitFor(() => {
        expect(setup).toHaveBeenCalledWith(
          expect.objectContaining({
            jwt: 'test-token-123',
            clusterId: 'test-cluster-id',
            setSidebarItems: expect.any(Function),
            setBreadcrumbs: expect.any(Function),
            featureFlags: { enablePipelineDiagrams: true },
            urlOverride: { grpc: 'http://custom-grpc:9090' },
          })
        );
      });
    });

    test('stays in loading state while token refresh is pending', async () => {
      const token = Promise.withResolvers<string>();
      mockGetAccessToken.mockReturnValueOnce(token.promise);
      const { container } = render(<ConsoleApp {...defaultProps} />);
      await waitFor(() => expect(mockGetAccessToken).toHaveBeenCalledTimes(1));

      // Initialization is parked on the token: no setup, nothing rendered.
      await act(async () => {
        await Promise.resolve();
      });
      expect(setup).not.toHaveBeenCalled();
      expect(container.firstChild).toBeNull();

      // Control: the same app initializes as soon as the token arrives.
      await act(async () => {
        token.resolve('late-token');
        await token.promise;
      });
      await waitFor(() => expect(container.firstChild).not.toBeNull());
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

  describe('feature Flags', () => {
    test('passes feature flags to setup()', async () => {
      const flags = { enableRpcnTemplateGallery: false, enablePipelineDiagrams: true };
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

  describe('router Stability', () => {
    test('does not recreate router when initialPath prop changes', async () => {
      const { createRouter, createMemoryHistory } = await import('@tanstack/react-router');

      const { rerender } = render(<ConsoleApp {...defaultProps} initialPath="/topics" />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      const createRouterCallCount = rs.mocked(createRouter).mock.calls.length;
      const createMemoryHistoryCallCount = rs.mocked(createMemoryHistory).mock.calls.length;

      // Rerender with a different initialPath (simulates cloud-ui navigation)
      rerender(<ConsoleApp {...defaultProps} initialPath="/groups" />);

      // Router should NOT have been recreated
      expect(rs.mocked(createRouter).mock.calls.length).toBe(createRouterCallCount);
      expect(rs.mocked(createMemoryHistory).mock.calls.length).toBe(createMemoryHistoryCallCount);
    });

    test('uses first initialPath for memory history, ignores subsequent changes', async () => {
      const { createMemoryHistory } = await import('@tanstack/react-router');

      const { rerender } = render(<ConsoleApp {...defaultProps} initialPath="/topics" />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      // Verify initial path was used
      expect(rs.mocked(createMemoryHistory)).toHaveBeenCalledWith(
        expect.objectContaining({ initialEntries: ['/topics'] })
      );

      const callCount = rs.mocked(createMemoryHistory).mock.calls.length;

      // Changing initialPath should not create a new memory history
      rerender(<ConsoleApp {...defaultProps} initialPath="/schema-registry" />);
      expect(rs.mocked(createMemoryHistory).mock.calls.length).toBe(callCount);
    });
  });

  describe('search Params Handling', () => {
    test('onRouteChange includes searchStr when route resolves with search params', async () => {
      // Get a reference to the subscribe callback so we can invoke it manually
      const { createRouter } = await import('@tanstack/react-router');
      let subscribedCallback: ((event: unknown) => void) | undefined;

      rs.mocked(createRouter).mockReturnValueOnce({
        subscribe: rs.fn((event: string, cb: (event: unknown) => void) => {
          subscribedCallback = cb;
          return rs.fn(); // unsubscribe
        }),
        load: rs.fn().mockResolvedValue(undefined),
        state: { location: { pathname: '/topics', searchStr: '' } },
        navigate: rs.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof createRouter>);

      render(<ConsoleApp {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      // Simulate a route resolution with search params (e.g., ?tab=messages)
      expect(subscribedCallback).toBeDefined();
      subscribedCallback!({
        toLocation: { pathname: '/topics/my-topic', searchStr: '?tab=messages' },
      });

      expect(mockOnRouteChange).toHaveBeenCalledWith('/topics/my-topic?tab=messages');
    });

    test('navigateTo with search params triggers router navigation', async () => {
      const { createRouter } = await import('@tanstack/react-router');
      const mockNavigate = rs.fn().mockResolvedValue(undefined);

      rs.mocked(createRouter).mockReturnValueOnce({
        subscribe: rs.fn(() => rs.fn()),
        load: rs.fn().mockResolvedValue(undefined),
        state: { location: { pathname: '/topics', searchStr: '' } },
        navigate: mockNavigate,
      } as unknown as ReturnType<typeof createRouter>);

      const { rerender } = render(<ConsoleApp {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      // Rerender with navigateTo containing search params
      rerender(<ConsoleApp {...defaultProps} navigateTo="/groups?search=my-group" />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/groups', search: { search: 'my-group' } });
      });
    });

    test('navigateTo without search params still works (backwards compat)', async () => {
      const { createRouter } = await import('@tanstack/react-router');
      const mockNavigate = rs.fn().mockResolvedValue(undefined);

      rs.mocked(createRouter).mockReturnValueOnce({
        subscribe: rs.fn(() => rs.fn()),
        load: rs.fn().mockResolvedValue(undefined),
        state: { location: { pathname: '/topics', searchStr: '' } },
        navigate: mockNavigate,
      } as unknown as ReturnType<typeof createRouter>);

      const { rerender } = render(<ConsoleApp {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      // Rerender with navigateTo without search params
      rerender(<ConsoleApp {...defaultProps} navigateTo="/groups" />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/groups', search: undefined });
      });
    });

    test('navigateTo matching current path + searchStr is a no-op', async () => {
      const { createRouter } = await import('@tanstack/react-router');
      const mockNavigate = rs.fn().mockResolvedValue(undefined);

      rs.mocked(createRouter).mockReturnValueOnce({
        subscribe: rs.fn(() => rs.fn()),
        load: rs.fn().mockResolvedValue(undefined),
        state: { location: { pathname: '/topics', searchStr: '?tab=messages' } },
        navigate: mockNavigate,
      } as unknown as ReturnType<typeof createRouter>);

      const { container, rerender } = render(<ConsoleApp {...defaultProps} />);

      // Host navigation only runs once the app is initialized, which is when it first renders.
      await waitFor(() => {
        expect(container.firstChild).not.toBeNull();
      });

      // navigateTo equals currentPath + currentSearchStr, so navigate should NOT be called
      rerender(<ConsoleApp {...defaultProps} navigateTo="/topics?tab=messages" />);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('config Overrides', () => {
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

function MockRouterProvider({ children }: { children?: React.ReactNode }) {
  if (reportBreadcrumbsDuringRender) {
    rs.mocked(setup).mock.calls[0]?.[0]?.setBreadcrumbs?.([]);
  }
  return <div data-testid="router-provider">{pendingTopic ? <MockTopicQuery /> : children}</div>;
}

function MockNotFoundPage() {
  return <div>Not Found</div>;
}

function MockTopicQuery() {
  const { data } = useQuery({
    queryKey: ['federated-lifecycle-probe'],
    queryFn: () => pendingTopic ?? Promise.resolve('Loaded topic fixture'),
  });
  return <p>{data ?? 'Loading topic fixture'}</p>;
}
