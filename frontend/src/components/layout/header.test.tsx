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

import { describe, expect, it, rs } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';

const { getMatchedRoutes, mockPageBreadcrumbs, isDarkModeAvailable } = rs.hoisted(() => ({
  getMatchedRoutes: rs.fn(() => [[{ options: { staticData: { breadcrumbOnlyHeader: true } } }], {}, undefined]),
  mockPageBreadcrumbs: [] as { title: string; linkTo: string }[],
  isDarkModeAvailable: rs.fn(() => false),
}));

rs.mock('@tanstack/react-router', () => ({
  Link: MockLink,
  useLocation: () => ({ pathname: '/sql' }),
  useMatchRoute: () => () => false,
  useRouter: () => ({ getMatchedRoutes }),
}));

rs.mock('./theme-mode-switch', () => ({
  ThemeModeSwitch: MockThemeModeSwitch,
}));

rs.mock('components/redpanda-ui/lib/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));

rs.mock('lucide-react', () => ({
  ChevronLeft: MockChevronLeft,
}));

rs.mock('../../config', () => ({
  isEmbedded: () => false,
  isFeatureFlagEnabled: () => false,
}));

rs.mock('../../state/backend-api', () => ({
  api: { isRedpanda: false, userData: null },
  useApiStoreHook: <T,>(selector: (state: { userData: null }) => T) => selector({ userData: null }),
}));

rs.mock('../../state/ui-state', () => ({
  useUIStateStore: <T,>(
    selector: (state: {
      _pageTitle: string;
      backLink: null;
      pageBreadcrumbs: { title: string; linkTo: string }[];
      selectedClusterName: null;
      shouldHidePageHeader: boolean;
    }) => T
  ) =>
    selector({
      _pageTitle: 'Cluster details',
      backLink: null,
      pageBreadcrumbs: mockPageBreadcrumbs,
      selectedClusterName: null,
      shouldHidePageHeader: false,
    }),
}));

rs.mock('../../theme-init', () => ({ isDarkModeAvailable }));
rs.mock('../misc/buttons/data-refresh/component', () => ({ default: () => null }));

rs.mock('../redpanda-ui/components/breadcrumb', () => ({
  Breadcrumb: MockBreadcrumb,
  BreadcrumbItem: MockBreadcrumbItem,
  BreadcrumbLink: MockBreadcrumbLink,
  BreadcrumbList: MockBreadcrumbList,
  BreadcrumbPage: MockBreadcrumbPage,
  BreadcrumbSeparator: MockBreadcrumbSeparator,
}));

rs.mock('../redpanda-ui/components/button', () => ({ Button: MockButton }));
rs.mock('../redpanda-ui/components/separator', () => ({ Separator: MockSeparator }));
rs.mock('../redpanda-ui/components/sidebar', () => ({ SidebarTrigger: MockSidebarTrigger }));

import AppPageHeader from './header';

describe('the AppPageHeader', () => {
  it('hides the title row when the matched route owns it', () => {
    render(<AppPageHeader />);

    expect(screen.queryByRole('heading', { name: 'Cluster details' })).not.toBeInTheDocument();
  });

  // Regression: the current page's crumb used to be a real link back to its own
  // bare path, which drops query params (filters, pagination, active tab) when
  // clicked. It must render as non-navigable text instead.
  it('renders every breadcrumb but the last as a link, and the last as plain text', () => {
    mockPageBreadcrumbs.push({ title: 'Topics', linkTo: '/topics' }, { title: 'my-topic', linkTo: '/topics/my-topic' });

    render(<AppPageHeader />);

    expect(screen.getByRole('link', { name: 'Topics' })).toHaveAttribute('href', '/topics');
    expect(screen.queryByRole('link', { name: 'my-topic' })).not.toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-page')).toHaveTextContent('my-topic');

    mockPageBreadcrumbs.length = 0;
  });

  it('shows the theme switch, even when the route hides the title row, only when dark mode is available', () => {
    const { unmount } = render(<AppPageHeader />);
    expect(screen.queryByTestId('theme-mode-switch')).not.toBeInTheDocument();
    unmount();

    isDarkModeAvailable.mockReturnValue(true);
    try {
      render(<AppPageHeader />);
      expect(screen.getByTestId('theme-mode-switch')).toBeInTheDocument();
    } finally {
      isDarkModeAvailable.mockReturnValue(false);
    }
  });
});

function MockLink({
  children,
  to,
}: PropsWithChildren<{
  to: string;
}>) {
  return <a href={to}>{children}</a>;
}

function MockThemeModeSwitch() {
  return <span data-testid="theme-mode-switch" />;
}

function MockChevronLeft() {
  return null;
}

function MockBreadcrumb({ children }: PropsWithChildren) {
  return children;
}

function MockBreadcrumbItem({ children }: PropsWithChildren) {
  return children;
}

function MockBreadcrumbLink({ render: content }: { render: ReactNode }) {
  return content;
}

function MockBreadcrumbList({ children }: PropsWithChildren) {
  return children;
}

function MockBreadcrumbPage({ children }: PropsWithChildren) {
  return <span data-testid="breadcrumb-page">{children}</span>;
}

function MockBreadcrumbSeparator() {
  return null;
}

function MockButton() {
  return null;
}

function MockSeparator() {
  return null;
}

function MockSidebarTrigger() {
  return null;
}
