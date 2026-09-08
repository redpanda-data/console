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

const { getMatchedRoutes } = rs.hoisted(() => ({
  getMatchedRoutes: rs.fn(() => [[{ options: { staticData: { breadcrumbOnlyHeader: true } } }], {}, undefined]),
}));

rs.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => <a href="/">{children}</a>,
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
      pageBreadcrumbs: never[];
      selectedClusterName: null;
      shouldHidePageHeader: boolean;
    }) => T
  ) =>
    selector({
      _pageTitle: 'Cluster details',
      backLink: null,
      pageBreadcrumbs: [],
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
});
