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

import { onTestFinished } from '@rstest/core';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { SidebarProvider } from 'components/redpanda-ui/components/sidebar';
import { ThemeProvider } from 'components/redpanda-ui/components/theme-provider';
import { config } from 'config';
import { setPageHeader, useUIStateStore } from 'state/ui-state';
import { render } from 'test-utils';

import AppPageHeader from './header';
import { DARK_MODE_AVAILABLE_KEY, isDarkModeAvailable, themeInitFor } from '../../theme-init';

function HeaderLayout() {
  return (
    <ThemeProvider {...themeInitFor(isDarkModeAvailable())}>
      <SidebarProvider>
        <AppPageHeader />
      </SidebarProvider>
    </ThemeProvider>
  );
}

function configureHeader(darkModeAvailable: boolean) {
  const { jwt } = config;
  const state = useUIStateStore.getState();
  config.jwt = undefined;
  localStorage.setItem(DARK_MODE_AVAILABLE_KEY, String(darkModeAvailable));
  setPageHeader('Cluster details', [
    { title: 'Topics', linkTo: '/topics' },
    { title: 'my-topic', linkTo: '/topics/my-topic' },
  ]);
  onTestFinished(() => {
    config.jwt = jwt;
    useUIStateStore.setState(state, true);
    localStorage.removeItem(DARK_MODE_AVAILABLE_KEY);
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove('dark');
    document.documentElement.style.removeProperty('color-scheme');
  });
}

export function renderHeader(darkModeAvailable: boolean) {
  configureHeader(darkModeAvailable);
  const root = createRootRoute({ component: HeaderLayout });
  const routes = [
    createRoute({ getParentRoute: () => root, path: '/sql', staticData: { breadcrumbOnlyHeader: true } }),
    createRoute({ getParentRoute: () => root, path: '/topics' }),
  ];
  const history = createMemoryHistory({ initialEntries: ['/sql'] });
  const router = createRouter({ history, routeTree: root.addChildren(routes) });
  onTestFinished(() => history.destroy());
  return render(<RouterProvider router={router} />);
}
