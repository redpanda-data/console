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

import { render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';

const getMatchedRoutes = vi.fn(() => [[{ options: { staticData: { breadcrumbOnlyHeader: true } } }], {}, undefined]);

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => <a href="/">{children}</a>,
  useLocation: () => ({ pathname: '/sql-studio' }),
  useMatchRoute: () => () => false,
  useRouter: () => ({ getMatchedRoutes }),
}));

vi.mock('@redpanda-data/ui', () => ({
  Button: () => null,
  ColorModeSwitch: () => null,
  CopyButton: () => null,
}));

vi.mock('components/redpanda-ui/lib/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  ChevronLeft: () => null,
}));

vi.mock('../../config', () => ({
  isEmbedded: () => false,
  isFeatureFlagEnabled: () => false,
}));

vi.mock('../../state/backend-api', () => ({
  api: { isRedpanda: false, userData: null },
  useApiStoreHook: <T,>(selector: (state: { userData: null }) => T) => selector({ userData: null }),
}));

vi.mock('../../state/ui-state', () => ({
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

vi.mock('../../utils/env', () => ({ IsDev: false }));
vi.mock('../misc/buttons/data-refresh/component', () => ({ default: () => null }));

vi.mock('../redpanda-ui/components/breadcrumb', () => ({
  Breadcrumb: ({ children }: PropsWithChildren) => children,
  BreadcrumbItem: ({ children }: PropsWithChildren) => children,
  BreadcrumbLink: ({ render: content }: { render: ReactNode }) => content,
  BreadcrumbList: ({ children }: PropsWithChildren) => children,
  BreadcrumbSeparator: () => null,
}));

vi.mock('../redpanda-ui/components/button', () => ({ Button: () => null }));
vi.mock('../redpanda-ui/components/separator', () => ({ Separator: () => null }));
vi.mock('../redpanda-ui/components/sidebar', () => ({ SidebarTrigger: () => null }));

import AppPageHeader from './header';

describe('AppPageHeader', () => {
  it('hides the title row when the matched route owns it', () => {
    render(<AppPageHeader />);

    expect(screen.queryByRole('heading', { name: 'Cluster details' })).not.toBeInTheDocument();
  });
});
