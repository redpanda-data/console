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

import { Link, useLocation, useMatchRoute, useRouter } from '@tanstack/react-router';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { Fragment } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ThemeModeSwitch } from './theme-mode-switch';
import { isEmbedded, isFeatureFlagEnabled } from '../../config';
import { api, useApiStoreHook } from '../../state/backend-api';
import { type BreadcrumbEntry, useUIStateStore } from '../../state/ui-state';
import { isDarkModeAvailable } from '../../theme-init';
import DataRefreshButton from '../misc/buttons/data-refresh/component';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../redpanda-ui/components/breadcrumb';
import { Button as RegistryButton } from '../redpanda-ui/components/button';
import { CopyButton } from '../redpanda-ui/components/copy-button';
import { Separator } from '../redpanda-ui/components/separator';
import { SidebarTrigger } from '../redpanda-ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../redpanda-ui/components/tooltip';

type BreadcrumbHeaderRowProps = {
  useNewSidebar: boolean;
  breadcrumbItems: BreadcrumbEntry[];
};

function BreadcrumbHeaderRow({ useNewSidebar, breadcrumbItems }: BreadcrumbHeaderRowProps) {
  return (
    <div className={cn('w-full border-b', useNewSidebar && 'py-4')}>
      <div className="flex items-center gap-2">
        {useNewSidebar ? (
          <>
            <SidebarTrigger />
            <Separator className="mr-2 h-4" orientation="vertical" />
          </>
        ) : null}
        {isEmbedded() ? null : (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbItems.map((item, index) => (
                <Fragment key={`${index}-${item.linkTo}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {index === breadcrumbItems.length - 1 ? (
                      // The current page's crumb isn't a link: it points at the exact URL
                      // we're already on, and re-navigating to that bare path (no search/hash)
                      // would drop the page's query params (filters, pagination, active tab).
                      <BreadcrumbPage>{item.title}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link to={item.linkTo}>{item.title}</Link>} />
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
        {/* In this row, not the title row, so it holds its place on routes that hide the title row. This
            load's availability rather than the live flag, so the switch writes the key the theme reads. */}
        {!isEmbedded() && isDarkModeAvailable() && (
          <div className="-my-1 ml-auto">
            <ThemeModeSwitch />
          </div>
        )}
      </div>
    </div>
  );
}

function AppPageHeader() {
  useApiStoreHook((s) => s.userData); // re-render when userData changes
  const hideTitleRow = useRouteOwnsTitleRow();
  const showRefresh = useShouldShowRefresh();
  const shouldHideHeader = useShouldHideHeader();

  const { pageBreadcrumbs, pageTitle, backLink, selectedClusterName, shouldHidePageHeader } = useUIStateStore(
    useShallow((state) => ({
      pageBreadcrumbs: state.pageBreadcrumbs,
      pageTitle: state._pageTitle,
      backLink: state.backLink,
      selectedClusterName: state.selectedClusterName,
      shouldHidePageHeader: state.shouldHidePageHeader,
    }))
  );
  const breadcrumbItems = getBreadcrumbItems(pageBreadcrumbs, selectedClusterName);

  const lastBreadcrumb = breadcrumbItems.at(-1);

  if (shouldHideHeader || shouldHidePageHeader || (hideTitleRow && isEmbedded())) {
    return null;
  }

  return (
    // Expanded pages release #mainLayout's gutter; keep the header off the viewport edge.
    <div className="page-expanded-inset transition-[padding] duration-300 ease-in-out">
      <BreadcrumbHeaderRow breadcrumbItems={breadcrumbItems} useNewSidebar={!isEmbedded()} />
      {/* Title + actions row. Hidden for breadcrumb-only headers (e.g. the SQL
          studio, which carries its own title bar and toolbar). */}
      {!hideTitleRow && (
        <div className="flex items-center justify-between pt-6">
          <div className="flex flex-col gap-1">
            {backLink && (
              <RegistryButton
                className="-ml-2 w-fit"
                render={
                  <Link to={backLink.linkTo}>
                    <ChevronLeft className="h-4 w-4" />
                    {backLink.title}
                  </Link>
                }
                variant="ghost"
              />
            )}
            <div className="flex items-center">
              {pageTitle ? (
                <h1
                  className={cn(
                    'mr-2 text-heading-xl',
                    lastBreadcrumb?.options?.canBeTruncated ? 'break-spaces break-all' : 'nowrap'
                  )}
                >
                  {pageTitle}
                </h1>
              ) : null}
              {lastBreadcrumb?.options?.canBeCopied ? (
                <CopyButton content={lastBreadcrumb.title} variant="ghost" />
              ) : null}
              {Boolean(showRefresh) && <DataRefreshButton />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEmbedded() &&
              api.isRedpanda &&
              (api.userData?.canViewDebugBundle ? (
                <RegistryButton render={<Link to="/debug-bundle">Debug bundle</Link>} variant="ghost" />
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    {/* span wrapper: a disabled button swallows pointer events, so it can't anchor the tooltip itself */}
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          <RegistryButton disabled variant="ghost">
                            Debug bundle
                          </RegistryButton>
                        </span>
                      }
                    />
                    <TooltipContent>You need RedpandaCapability.MANAGE_DEBUG_BUNDLE permission</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AppPageHeader;

/**
 * Whether the matched route draws its own title bar (`staticData.breadcrumbOnlyHeader`).
 *
 * Resolved from the pathname rather than `useMatches()`: committed matches lag the
 * location by a render on soft navigation, flashing the title row on the way in.
 */
function useRouteOwnsTitleRow() {
  const router = useRouter();
  const { pathname } = useLocation();

  const [matchedRoutes] = router.getMatchedRoutes(pathname);

  return matchedRoutes.some((route) => route.options.staticData?.breadcrumbOnlyHeader);
}

/**
 * Custom React Hook: Determines whether to show the refresh button based on route matches.
 * It checks various routes and conditions to decide if the refresh button should be displayed
 * in the header next to the breadcrumb.
 *
 * @returns {boolean} Indicates whether the refresh button should be shown (true/false).
 */
const refreshHiddenRoutes = [
  { to: '/schema-registry/create' },
  { to: '/topics/$topicName/produce-record' },
  { to: '/secrets', fuzzy: false },
  { to: '/security/acls/$aclName/details' },
  { to: '/security/roles/create' },
  { to: '/security/roles/$roleName/update' },
  { to: '/security/roles/$roleName/details' },
  { to: '/security/users/$userName/details' },
] as const;

function useShouldShowRefresh() {
  const matchRoute = useMatchRoute();
  const connector = matchRoute({ to: '/connect-clusters/$clusterName/$connector' });
  return !(
    (connector && connector.connector === 'create-connector') ||
    refreshHiddenRoutes.some((route) => matchRoute(route))
  );
}

function useShouldHideHeader() {
  const { pathname } = useLocation();
  const matchRoute = useMatchRoute();

  // Hide header when PipelinePage renders (it has its own header/breadcrumbs)
  const isPipelineRoute =
    matchRoute({ to: '/rp-connect/$pipelineId' }) ||
    matchRoute({ to: '/rp-connect/$pipelineId/edit' }) ||
    matchRoute({ to: '/rp-connect/create' });

  /**
   * Flag is cloud-only (schema requires embedded mode).
   * enablePipelineDiagrams: full new pipeline layout with diagrams.
   */
  if (isPipelineRoute && isEmbedded() && isFeatureFlagEnabled('enablePipelineDiagrams')) {
    return true;
  }

  // Only hide header in embedded mode for pages that have their own headers
  if (!isEmbedded()) {
    return false;
  }

  // Pages that have their own header components - hide AppPageHeader for these
  const pagesWithOwnHeaders = ['/secrets'];

  // Check if current path starts with any of the pages that have their own headers
  return pagesWithOwnHeaders.some((page) => pathname.startsWith(page));
}

function getBreadcrumbItems(pageBreadcrumbs: BreadcrumbEntry[], selectedClusterName: string | null): BreadcrumbEntry[] {
  const items = [...pageBreadcrumbs];
  if (!isEmbedded() && selectedClusterName) {
    items.unshift({ heading: '', title: 'Cluster', linkTo: '/' });
  }
  return items;
}
