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

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { ConsoleApp } from './console-app';
import type { Breadcrumb, ConsoleAppProps, SidebarItem } from './types';
import { config } from '../config';
import { appGlobal } from '../state/app-global';
import { api, useApiStore } from '../state/backend-api';
import type { Topic } from '../state/rest-interfaces';
import { Feature, useSupportedFeaturesStore } from '../state/supported-features';

const grpc = 'https://dataplane.example.test';
const rest = 'https://rest.example.test/api';
const hostConfig = { urlOverride: { grpc, rest } };
const defaultProps: ConsoleAppProps = {
  getAccessToken: () => Promise.resolve('host-token'),
  clusterId: 'host-cluster',
  config: hostConfig,
};

const topic: Topic = {
  topicName: 'orders-from-broker',
  isInternal: false,
  partitionCount: 3,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions: undefined,
};

const supportedEndpoints = Object.values({ ...Feature }).flatMap((feature) =>
  'endpoint' in feature ? [{ ...feature, isSupported: feature.endpoint === '/api/consumer-groups' }] : []
);

function topicsResponse() {
  return HttpResponse.json({ topics: [topic] });
}

const licenseService = `${grpc}/redpanda.api.console.v1alpha1.LicenseService`;
const statusService = `${grpc}/redpanda.api.console.v1alpha1.ClusterStatusService`;
const server = setupServer(
  http.get(`${rest}/console/endpoints`, () =>
    HttpResponse.json({ endpointCompatibility: { kafkaVersion: '3.8.0', endpoints: supportedEndpoints } })
  ),
  http.get(`${rest}/topics`, topicsResponse),
  http.get(`${rest}/consumer-groups`, () => HttpResponse.json({ consumerGroups: [] })),
  http.get(`${rest}/cluster`, () => HttpResponse.json({ clusterInfo: { brokers: [] } })),
  http.post(`${licenseService}/ListLicenses`, () => HttpResponse.json({ licenses: [] })),
  http.post(`${licenseService}/ListEnterpriseFeatures`, () => HttpResponse.json({ features: [] })),
  http.post(`${statusService}/GetKafkaAuthorizerInfo`, () => HttpResponse.json({})),
  http.post(`${statusService}/GetConsoleInfo`, () => HttpResponse.json({})),
  http.post(`${statusService}/GetKafkaInfo`, () => HttpResponse.json({ brokers: [] })),
  http.post(`${statusService}/GetRedpandaInfo`, () => HttpResponse.json({})),
  http.post(`${statusService}/GetKafkaConnectInfo`, () => HttpResponse.json({}))
);
const requests: Request[] = [];
const unhandledRequests: string[] = [];
const initialConfig = { ...config };

beforeAll(() => {
  server.events.on('request:start', ({ request }) => requests.push(request));
  server.events.on('request:unhandled', ({ request }) => unhandledRequests.push(`${request.method} ${request.url}`));
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  requests.length = 0;
  Object.assign(config, initialConfig, { jwt: initialConfig.jwt });
  useApiStore.setState(useApiStore.getInitialState());
  useSupportedFeaturesStore.setState(useSupportedFeaturesStore.getInitialState());
  expect(unhandledRequests.splice(0)).toEqual([]);
});

afterAll(() => {
  server.close();
});

function requestsFor(url: string) {
  return requests.filter((request) => request.url === url);
}

async function deliverToken(token: PromiseWithResolvers<string>, value: string) {
  await act(async () => {
    token.resolve(value);
    await token.promise;
  });
}

test('waits for the host token and opens Topics using the configured endpoints', async () => {
  const token = Promise.withResolvers<string>();
  const { container } = render(
    <ConsoleApp
      {...defaultProps}
      config={{ ...hostConfig, jwt: 'stale-host-token' }}
      featureFlags={{ enablePipelineDiagrams: true }}
      getAccessToken={() => token.promise}
    />
  );

  expect(container).toBeEmptyDOMElement();
  expect(requests).toEqual([]);
  await deliverToken(token, 'fresh-host-token');

  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());
  expect(
    [`${rest}/topics`, `${licenseService}/ListLicenses`].map((url) => requestsFor(url)[0]?.headers.get('authorization'))
  ).toEqual(['Bearer fresh-host-token', 'Bearer fresh-host-token']);
  expect(config).toMatchObject({
    jwt: 'fresh-host-token',
    clusterId: 'host-cluster',
    featureFlags: { enablePipelineDiagrams: true },
  });
});

function mountWithTokenFailure() {
  const first = Promise.withResolvers<string>();
  const errors: Error[] = [];
  const previousErrors: Error[] = [];
  const host = { calls: 0 };
  const props = {
    ...defaultProps,
    getAccessToken: () => {
      host.calls += 1;
      return host.calls === 1 ? first.promise : Promise.resolve('retry-token');
    },
  };
  const { rerender } = render(<ConsoleApp {...props} onError={(cause) => previousErrors.push(cause)} />);
  rerender(<ConsoleApp {...props} onError={(cause) => errors.push(cause)} />);
  return { first, errors, previousErrors, host };
}

test('reports a failed initialization to the latest host callback and retries in place', async () => {
  const { first, errors, previousErrors, host } = mountWithTokenFailure();
  const error = new Error('Token service unavailable');
  await act(() => first.reject(error));

  expect(await screen.findByRole('alert')).toHaveTextContent(error.message);
  expect({ previousErrors, errors, calls: host.calls }).toEqual({ previousErrors: [], errors: [error], calls: 1 });

  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(host.calls).toBe(2);
});

test('does not initialize after being unmounted with a pending token', async () => {
  const token = Promise.withResolvers<string>();
  const { unmount } = render(<ConsoleApp {...defaultProps} getAccessToken={() => token.promise} />);
  unmount();

  await deliverToken(token, 'retired-token');
  expect(config.jwt).toBeUndefined();
  expect(requests).toEqual([]);
});

test('only commits the active cluster and hides its predecessor while connecting', async () => {
  const tokens = {
    retired: Promise.withResolvers<string>(),
    current: Promise.withResolvers<string>(),
  };
  const { rerender } = render(<ConsoleApp {...defaultProps} />);
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());

  rerender(<ConsoleApp {...defaultProps} clusterId="retired-cluster" getAccessToken={() => tokens.retired.promise} />);
  expect(screen.queryByText(topic.topicName)).not.toBeInTheDocument();
  rerender(<ConsoleApp {...defaultProps} clusterId="current-cluster" getAccessToken={() => tokens.current.promise} />);
  await deliverToken(tokens.current, 'current-token');
  await waitFor(() => expect(screen.getByTestId('topics-table')).toBeInTheDocument());

  await deliverToken(tokens.retired, 'retired-token');
  expect(config).toMatchObject({ jwt: 'current-token', clusterId: 'current-cluster' });
});

test('keeps the existing page mounted while new configuration waits for a token', async () => {
  const { rerender } = render(<ConsoleApp {...defaultProps} />);
  const page = await screen.findByTestId('topics-table');
  const token = Promise.withResolvers<string>();

  rerender(
    <ConsoleApp
      {...defaultProps}
      config={{ ...hostConfig, urlOverride: { ...hostConfig.urlOverride, assets: '/new-assets' } }}
      getAccessToken={() => token.promise}
    />
  );

  expect(page).toBeInTheDocument();
  await deliverToken(token, 'new-config-token');
  expect(screen.getByTestId('topics-table')).toBe(page);
  expect(config.assetsPath).toBe('/new-assets');
});

test('keeps a pending Topics request when a host callback changes', async () => {
  const topicResponse = Promise.withResolvers<Response>();
  server.use(http.get(`${rest}/topics`, () => topicResponse.promise));
  const props = {
    ...defaultProps,
    getAccessToken: () => {
      host.calls += 1;
      return Promise.resolve('host-token');
    },
  };
  const host = { calls: 0, ...collectHostEvents() };
  const { rerender } = render(<ConsoleApp {...props} />);

  await waitFor(() => expect(requestsFor(`${rest}/topics`)).toHaveLength(1));
  rerender(<ConsoleApp {...props} {...host.callbacks} />);
  await act(() => topicResponse.resolve(topicsResponse()));
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());
  expect({
    tokenRequests: host.calls,
    topicRequests: requestsFor(`${rest}/topics`).length,
  }).toEqual({ tokenRequests: 1, topicRequests: 1 });
});

function collectHostEvents() {
  const sidebar: SidebarItem[][] = [];
  const breadcrumbs: Breadcrumb[][] = [];
  return {
    sidebar,
    breadcrumbs,
    callbacks: {
      onSidebarItemsChange: (items: SidebarItem[]) => sidebar.push(items),
      onBreadcrumbsChange: (crumbs: Breadcrumb[]) => breadcrumbs.push(crumbs),
    },
  };
}

test('delivers sidebar and render-time breadcrumbs to the latest host callbacks', async () => {
  const previous = collectHostEvents();
  const latest = collectHostEvents();
  const { rerender } = render(<ConsoleApp {...defaultProps} {...previous.callbacks} />);
  await waitFor(() =>
    expect(previous.sidebar[0]).toEqual(expect.arrayContaining([expect.objectContaining({ to: '/topics' })]))
  );

  rerender(<ConsoleApp {...defaultProps} {...latest.callbacks} navigateTo="/upload-license" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument());
  await act(async () => {
    await api.refreshSupportedEndpoints();
  });
  expect(latest.breadcrumbs).toContainEqual([{ title: 'Upload License', to: '/upload-license' }]);
  expect(latest.sidebar).toEqual(previous.sidebar);
  expect(previous.sidebar).toHaveLength(1);
});

test('uses the initial path only on mount and accepts host navigation with or without search', async () => {
  const { rerender } = render(<ConsoleApp {...defaultProps} initialPath="/groups?q=initial" />);
  await waitFor(() => expect(screen.getByDisplayValue('initial')).toBeInTheDocument());
  const { router } = appGlobal;

  rerender(<ConsoleApp {...defaultProps} initialPath="/topics" />);
  expect(screen.getByDisplayValue('initial')).toBeInTheDocument();
  expect(appGlobal.router).toBe(router);

  rerender(<ConsoleApp {...defaultProps} navigateTo="/topics" />);
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());

  rerender(<ConsoleApp {...defaultProps} navigateTo="/groups?q=host-filter" />);
  await waitFor(() => expect(screen.getByDisplayValue('host-filter')).toBeInTheDocument());
});

test('reports Console pushes and replaces, preserving the search string', async () => {
  const changes: { path: string; replace?: boolean }[] = [];
  render(
    <ConsoleApp
      {...defaultProps}
      initialPath="/groups?q=before"
      onRouteChange={(path, options) => changes.push({ path, replace: options?.replace })}
    />
  );
  await waitFor(() => expect(screen.getByDisplayValue('before')).toBeInTheDocument());
  const { router } = appGlobal;

  await act(async () => {
    await router.navigate({ href: '/groups?q=changed' });
  });
  await waitFor(() => expect(screen.getByDisplayValue('changed')).toBeInTheDocument());
  await act(async () => {
    await router.navigate({ href: '/groups?q=replaced', replace: true });
  });
  await waitFor(() => expect(screen.getByDisplayValue('replaced')).toBeInTheDocument());
  expect(changes).toEqual([
    { path: '/groups?q=changed', replace: false },
    { path: '/groups?q=replaced', replace: true },
  ]);
});

test('ignores a host echo of the current path and search', async () => {
  const props = { ...defaultProps, initialPath: '/groups?q=current' };
  const { rerender } = render(<ConsoleApp {...props} />);
  await waitFor(() => expect(screen.getByDisplayValue('current')).toBeInTheDocument());
  const { router } = appGlobal;
  const locations: string[] = [];
  const unsubscribe = router.history.subscribe(({ location }) => locations.push(location.href));
  try {
    await act(() => rerender(<ConsoleApp {...props} navigateTo="/groups?q=current" />));
    expect(locations).toEqual([]);
  } finally {
    unsubscribe();
  }
});

function reportResolvedRoute(router: typeof appGlobal.router, to: '/groups' | '/topics') {
  router.emit({
    type: 'onResolved',
    fromLocation: router.state.location,
    toLocation: router.buildLocation({ to }),
    pathChanged: true,
    hrefChanged: true,
    hashChanged: false,
  });
}

test('stops notifying the host about routes after Console unmounts', async () => {
  const routes: string[] = [];
  const { unmount } = render(<ConsoleApp {...defaultProps} onRouteChange={(path) => routes.push(path)} />);
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());
  const { router } = appGlobal;
  routes.length = 0;

  reportResolvedRoute(router, '/groups');
  expect(routes).toEqual(['/groups']);

  unmount();
  reportResolvedRoute(router, '/topics');
  expect(routes).toEqual(['/groups']);
});

test('clears the federated query cache on unmount', async () => {
  const { unmount } = render(<ConsoleApp {...defaultProps} />);
  await waitFor(() => expect(screen.getByText(topic.topicName)).toBeInTheDocument());
  const { queryClient } = appGlobal.router.options.context;
  expect(queryClient).toBeInstanceOf(QueryClient);
  expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

  unmount();
  expect(queryClient.getQueryCache().getAll()).toEqual([]);
});
