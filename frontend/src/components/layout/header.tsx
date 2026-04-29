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

import { Button, ColorModeSwitch, CopyButton } from '@redpanda-data/ui';
import { Link, useLocation, useMatchRoute } from '@tanstack/react-router';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { Fragment, useMemo } from 'react';

import { isEmbedded, isFeatureFlagEnabled } from '../../config';
import { api, useApiStoreHook } from '../../state/backend-api';
import { type BreadcrumbEntry, useUIStateStore } from '../../state/ui-state';
import { IsDev } from '../../utils/env';
import DataRefreshButton from '../misc/buttons/data-refresh/component';
import { UserPreferencesButton } from '../misc/user-preferences';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../redpanda-ui/components/breadcrumb';
import { Button as RegistryButton } from '../redpanda-ui/components/button';
import { Separator } from '../redpanda-ui/components/separator';
import { SidebarTrigger } from '../redpanda-ui/components/sidebar';

type BreadcrumbHeaderRowProps = {
  useNewSidebar: boolean;
  breadcrumbItems: BreadcrumbEntry[];
};

function BreadcrumbHeaderRow({ useNewSidebar, breadcrumbItems }: BreadcrumbHeaderRowProps) {
  return (
    <div className="w-full border-b">
      <div className="flex items-center gap-2 px-6 py-4">
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
                    <BreadcrumbLink asChild>
                      <Link to={item.linkTo}>{item.title}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
    </div>
  );
}

function AppPageHeader() {
  useApiStoreHook((s) => s.userData); // re-render when userData changes
  const showRefresh = useShouldShowRefresh();
  const shouldHideHeader = useShouldHideHeader();
  const useNewSidebar = !isEmbedded();

  const pageBreadcrumbs = useUIStateStore((s) => s.pageBreadcrumbs);
  const pageTitle = useUIStateStore((s) => s._pageTitle);
  const backLink = useUIStateStore((s) => s.backLink);
  const selectedClusterName = useUIStateStore((s) => s.selectedClusterName);
  const shouldHidePageHeader = useUIStateStore((s) => s.shouldHidePageHeader);
  const breadcrumbItems = useMemo(() => {
    const items: BreadcrumbEntry[] = [...pageBreadcrumbs];

    if (!isEmbedded() && selectedClusterName) {
      items.unshift({
        heading: '',
        title: 'Cluster',
        linkTo: '/',
      });
    }

    return items;
  }, [pageBreadcrumbs, selectedClusterName]);

  const lastBreadcrumb = breadcrumbItems.at(-1);

  if (shouldHideHeader || shouldHidePageHeader) {
    return null;
  }

  return (
    <div>
      <BreadcrumbHeaderRow breadcrumbItems={breadcrumbItems} useNewSidebar={useNewSidebar} />

      <div className="flex items-center justify-between px-12 pt-6">
        <div className="flex flex-col gap-1">
          {backLink && (
            <RegistryButton asChild className="-ml-2 w-fit text-muted-foreground" variant="ghost">
              <Link to={backLink.linkTo}>
                <ChevronLeft className="h-4 w-4" />
                {backLink.title}
              </Link>
            </RegistryButton>
          )}
          <div className="flex items-center">
            {pageTitle ? (
              <Heading
                className={cn('mr-2', lastBreadcrumb?.options?.canBeTruncated ? 'break-spaces break-all' : 'nowrap')}
                level={1}
              >
                {pageTitle}
              </Heading>
            ) : null}
            {lastBreadcrumb?.options?.canBeCopied ? (
              <CopyButton content={lastBreadcrumb.title} variant="ghost" />
            ) : null}
            {Boolean(showRefresh) && <DataRefreshButton />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmbedded() && api.isRedpanda && (
            <Link to="/debug-bundle">
              <Button
                isDisabled={!api.userData?.canViewDebugBundle}
                tooltip={
                  api.userData?.canViewDebugBundle ? null : 'You need RedpandaCapability.MANAGE_DEBUG_BUNDLE permission'
                }
                variant="ghost"
              >
                Debug bundle
              </Button>
            </Link>
          )}
          <UserPreferencesButton />
          {IsDev && !isEmbedded() && <ColorModeSwitch m={0} p={0} variant="ghost" />}
        </div>
      </div>
    </div>
  );
}

export default AppPageHeader;

/**
 * Custom React Hook: Determines whether to show the refresh button based on route matches.
 * It checks various routes and conditions to decide if the refresh button should be displayed
 * in the header next to the breadcrumb.
 *
 * @returns {boolean} Indicates whether the refresh button should be shown (true/false).
 */
function useShouldShowRefresh() {
  const matchRoute = useMatchRoute();

  const connectClusterMatch = matchRoute({ to: '/connect-clusters/$clusterName/$connector' });
  const schemaCreateMatch = matchRoute({ to: '/schema-registry/create' });
  const topicProduceRecordMatch = matchRoute({ to: '/topics/$topicName/produce-record' });
  const secretsMatch = matchRoute({ to: '/secrets', fuzzy: false });
  const connectWizardPagesMatch = matchRoute({ to: '/rp-connect/wizard' });
  const getStartedApiMatch = matchRoute({ to: '/get-started/api' });

  // matches acls
  const aclDetailMatch = matchRoute({ to: '/security/acls/$aclName/details' });
  const isACLRelated = aclDetailMatch;

  // matches roles
  const roleCreateMatch = matchRoute({ to: '/security/roles/create' });
  const roleUpdateMatch = matchRoute({ to: '/security/roles/$roleName/update' });
  const roleDetailMatch = matchRoute({ to: '/security/roles/$roleName/details' });
  const isRoleRelated = roleCreateMatch || roleUpdateMatch || roleDetailMatch;

  // matches user detail
  const userDetailMatch = matchRoute({ to: '/security/users/$userName/details' });

  if (connectClusterMatch && connectClusterMatch.connector === 'create-connector') {
    return false;
  }
  if (schemaCreateMatch) {
    return false;
  }
  if (topicProduceRecordMatch) {
    return false;
  }
  if (secretsMatch) {
    return false;
  }
  if (isACLRelated) {
    return false;
  }
  if (isRoleRelated) {
    return false;
  }
  if (userDetailMatch) {
    return false;
  }
  if (connectWizardPagesMatch) {
    return false;
  }
  if (getStartedApiMatch) {
    return false;
  }

  return true;
}
function useShouldHideHeader() {
  const { pathname } = useLocation();
  const matchRoute = useMatchRoute();

  // Hide header when PipelinePage renders (it has its own header/breadcrumbs)
  const isPipelineRoute =
    matchRoute({ to: '/rp-connect/$pipelineId' }) ||
    matchRoute({ to: '/rp-connect/$pipelineId/edit' }) ||
    matchRoute({ to: '/rp-connect/create' });

  // Both flags are cloud-only (schema requires embedded mode).
  // enablePipelineDiagrams: full new pipeline layout with diagrams.
  // enableRpcnTiles: new tiles-based create flow embedded in legacy layout.
  if (
    isPipelineRoute &&
    isEmbedded() &&
    (isFeatureFlagEnabled('enablePipelineDiagrams') || isFeatureFlagEnabled('enableRpcnTiles'))
  ) {
    return true;
  }

  // Only hide header in embedded mode for pages that have their own headers
  if (!isEmbedded()) {
    return false;
  }

  // Pages that have their own header components - hide AppPageHeader for these
  const pagesWithOwnHeaders = ['/mcp-servers', '/agents', '/knowledgebases', '/secrets', '/transcripts'];

  // Check if current path starts with any of the pages that have their own headers
  return pagesWithOwnHeaders.some((page) => pathname.startsWith(page));
}
