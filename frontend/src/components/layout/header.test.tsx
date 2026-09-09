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

const { getMatchedRoutes, mockPageBreadcrumbs } = rs.hoisted(() => ({
  getMatchedRoutes: rs.fn(() => [[{ options: { staticData: { breadcrumbOnlyHeader: true } } }], {}, undefined]),
  mockPageBreadcrumbs: [] as { title: string; linkTo: string }[],
}));

rs.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: '/sql' }),
  useMatchRoute: () => () => false,
  useRouter: () => ({ getMatchedRoutes }),
}));

rs.mock('@redpanda-data/ui', () => ({
  Button: () => null,
  ColorModeSwitch: () => null,
  CopyButton: () => null,
}));

rs.mock('components/redpanda-ui/lib/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));

rs.mock('lucide-react', () => ({
  ChevronLeft: () => null,
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

rs.mock('../../utils/env', () => ({ IsDev: false }));
rs.mock('../misc/buttons/data-refresh/component', () => ({ default: () => null }));

rs.mock('../redpanda-ui/components/breadcrumb', () => ({
  Breadcrumb: ({ children }: PropsWithChildren) => children,
  BreadcrumbItem: ({ children }: PropsWithChildren) => children,
  BreadcrumbLink: ({ render: content }: { render: ReactNode }) => content,
  BreadcrumbList: ({ children }: PropsWithChildren) => children,
  BreadcrumbPage: ({ children }: PropsWithChildren) => <span data-testid="breadcrumb-page">{children}</span>,
  BreadcrumbSeparator: () => null,
}));

rs.mock('../redpanda-ui/components/button', () => ({ Button: () => null }));
rs.mock('../redpanda-ui/components/separator', () => ({ Separator: () => null }));
rs.mock('../redpanda-ui/components/sidebar', () => ({ SidebarTrigger: () => null }));

import AppPageHeader from './header';

describe('AppPageHeader', () => {
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
});
