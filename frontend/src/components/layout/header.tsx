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
  useApiStoreHook((s) => s.userData);
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
    <div className="page-expanded-inset transition-[padding] duration-300 ease-in-out">
      <BreadcrumbHeaderRow breadcrumbItems={breadcrumbItems} useNewSidebar={!isEmbedded()} />
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

/**
 * Routes that own their title bar still get breadcrumbs and the standalone theme
 * switch. The switch uses the availability loaded for the page, not the live flag.
 * A disabled refresh button needs a separate tooltip trigger to receive hover.
 */
export default AppPageHeader;

// WARNING: Read the live pathname, not committed matches; otherwise soft navigation flashes a second title bar before the route commits.
function useRouteOwnsTitleRow() {
  const router = useRouter();
  const { pathname } = useLocation();

  const [matchedRoutes] = router.getMatchedRoutes(pathname);

  return matchedRoutes.some((route) => route.options.staticData?.breadcrumbOnlyHeader);
}

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

  const isPipelineRoute =
    matchRoute({ to: '/rp-connect/$pipelineId' }) ||
    matchRoute({ to: '/rp-connect/$pipelineId/edit' }) ||
    matchRoute({ to: '/rp-connect/create' });

  if (isPipelineRoute && isEmbedded() && isFeatureFlagEnabled('enablePipelineDiagrams')) {
    return true;
  }

  if (!isEmbedded()) {
    return false;
  }

  const pagesWithOwnHeaders = ['/secrets'];

  return pagesWithOwnHeaders.some((page) => pathname.startsWith(page));
}

function getBreadcrumbItems(pageBreadcrumbs: BreadcrumbEntry[], selectedClusterName: string | null) {
  const items = [...pageBreadcrumbs];
  if (!isEmbedded() && selectedClusterName) {
    items.unshift({ heading: '', title: 'Cluster', linkTo: '/' });
  }
  return items;
}
