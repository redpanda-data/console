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

import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'components/icons';
import { ListLayoutNavigation } from 'components/redpanda-ui/components/list-layout';
import { isServerless } from 'config';
import { useEffect } from 'react';

import { Alert, AlertDescription } from '../components/redpanda-ui/components/alert';
import { Tabs, TabsList, TabsTrigger } from '../components/redpanda-ui/components/tabs';
import { appGlobal } from '../state/app-global';
import { api, rolesApi, useApiStoreHook } from '../state/backend-api';
import { useSupportedFeaturesStore } from '../state/supported-features';

export const Route = createFileRoute('/security')({
  staticData: {
    title: 'Security',
    icon: ShieldCheckIcon,
  },
  component: SecurityLayout,
});

type TabConfig = {
  key: string;
  label: string;
  path: string;
  disabled: boolean;
};

function buildTabs(
  isAdminApiConfigured: boolean,
  featureCreateUser: boolean,
  featureRolesApi: boolean,
  userData: { canManageUsers?: boolean; canListAcls?: boolean; canViewPermissionsList?: boolean } | null | undefined
): TabConfig[] {
  const result: TabConfig[] = [
    {
      key: 'users',
      label: 'Users',
      path: '/security/users',
      disabled:
        !(isAdminApiConfigured && featureCreateUser) ||
        (userData?.canManageUsers !== undefined && userData?.canManageUsers === false),
    },
  ];

  if (!isServerless()) {
    result.push({
      key: 'roles',
      label: 'Roles',
      path: '/security/roles',
      disabled: !featureRolesApi || userData?.canManageUsers === false,
    });
  }

  result.push(
    {
      key: 'acls',
      label: 'ACLs',
      path: '/security/acls',
      disabled: userData?.canListAcls === false,
    },
    {
      key: 'permissions-list',
      label: 'Permissions',
      path: '/security/permissions-list',
      disabled: userData?.canViewPermissionsList === false,
    }
  );

  return result;
}

function deriveActiveTab(pathname: string, tabs: TabConfig[]): string {
  for (const tab of tabs) {
    if (pathname === tab.path || pathname.startsWith(`${tab.path}/`)) {
      return tab.key;
    }
  }
  return 'acls';
}

function SecurityLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const acls = useApiStoreHook((s) => s.ACLs);
  const userData = useApiStoreHook((s) => s.userData);
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);

  const redpandaOverview = useApiStoreHook((s) => s.clusterOverview?.redpanda);
  const isAdminApiConfigured = Boolean(redpandaOverview);

  useEffect(() => {
    const refreshData = async () => {
      await Promise.allSettled([api.refreshClusterOverview(), rolesApi.refreshRoles(), api.refreshUserData()]);
      await rolesApi.refreshRoleMembers();
    };

    appGlobal.onRefresh = async () => {
      await refreshData();
    };

    refreshData().catch(() => {
      // Fail silently for now
    });
  }, []);

  const tabs = buildTabs(isAdminApiConfigured, featureCreateUser, featureRolesApi, userData);
  const activeTab = deriveActiveTab(location.pathname, tabs);

  const warning =
    acls === null ? (
      <Alert className="mb-4" variant="warning">
        <AlertDescription>You do not have the necessary permissions to view ACLs</AlertDescription>
      </Alert>
    ) : null;

  const noAclAuthorizer =
    acls?.isAuthorizerEnabled === false ? (
      <Alert className="mb-4" variant="warning">
        <AlertDescription>There's no authorizer configured in your Kafka cluster</AlertDescription>
      </Alert>
    ) : null;

  const handleTabClick = (tabKey: string) => {
    const tab = tabs.find((t) => t.key === tabKey);
    if (tab && !tab.disabled) {
      navigate({ to: tab.path });
    }
  };

  return (
    <>
      {warning}
      {noAclAuthorizer}

      <ListLayoutNavigation>
        <Tabs value={activeTab}>
          <TabsList activeClassName="after:bg-foreground" className="w-fit" variant="underline">
            {tabs.map((tab) => (
              <TabsTrigger
                className="text-base data-[state=active]:text-foreground"
                disabled={tab.disabled}
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                value={tab.key}
                variant="underline"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </ListLayoutNavigation>
      <Outlet />
    </>
  );
}
