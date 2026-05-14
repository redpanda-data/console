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

import { useLocation, useNavigate } from '@tanstack/react-router';
import { ListLayoutNavigation } from 'components/redpanda-ui/components/list-layout';
import { isFeatureFlagEnabled, isServerless } from 'config';

import { useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Tabs, TabsList, TabsTrigger } from '../../../redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';

type TabConfig = {
  key: string;
  label: string;
  path: string;
  disabled: boolean;
  disabledReason?: string;
};

function buildTabs(
  isAdminApiConfigured: boolean,
  featureCreateUser: boolean,
  featureRolesApi: boolean,
  userData: { canManageUsers?: boolean; canListAcls?: boolean; canViewPermissionsList?: boolean } | null | undefined
): TabConfig[] {
  const usersDisabledByApi = !(isAdminApiConfigured && featureCreateUser);
  const usersDisabledByRbac = userData?.canManageUsers !== undefined && userData?.canManageUsers === false;

  const result: TabConfig[] = [
    {
      key: 'users',
      label: 'Users',
      path: '/security/users',
      disabled: usersDisabledByApi || usersDisabledByRbac,
      disabledReason: usersDisabledByRbac
        ? 'You need the MANAGE_REDPANDA_USERS permission to access this tab.'
        : usersDisabledByApi
          ? 'User management requires the Redpanda Admin API, which is not available in Kafka mode.'
          : undefined,
    },
  ];

  if (!isServerless()) {
    const rolesDisabledByFeature = !featureRolesApi;
    const rolesDisabledByRbac = userData?.canManageUsers === false;

    result.push({
      key: 'roles',
      label: 'Roles',
      path: '/security/roles',
      disabled: rolesDisabledByFeature || rolesDisabledByRbac,
      disabledReason: rolesDisabledByRbac
        ? 'You need the MANAGE_REDPANDA_USERS permission to access this tab.'
        : rolesDisabledByFeature
          ? 'Roles are not supported by your cluster.'
          : undefined,
    });
  }

  if (!isFeatureFlagEnabled('enableNewSecurityPage')) {
    result.push({
      key: 'acls',
      label: 'ACLs',
      path: '/security/acls',
      disabled: userData?.canListAcls === false,
      disabledReason:
        userData?.canListAcls === false ? 'You need the LIST_ACLS permission to access this tab.' : undefined,
    });
  }

  result.push({
    key: 'permissions-list',
    label: 'Permissions',
    path: '/security/permissions-list',
    disabled: userData?.canViewPermissionsList === false,
    disabledReason:
      userData?.canViewPermissionsList === false
        ? 'You need the VIEW_PERMISSIONS_LIST permission to access this tab.'
        : undefined,
  });

  return result;
}

function deriveActiveTab(pathname: string, tabs: TabConfig[]): string {
  for (const tab of tabs) {
    if (pathname === tab.path || pathname.startsWith(`${tab.path}/`)) {
      return tab.key;
    }
  }
  return tabs[0]?.key ?? 'users';
}

export function SecurityTabsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const userData = useApiStoreHook((s) => s.userData);
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const redpandaOverview = useApiStoreHook((s) => s.clusterOverview?.redpanda);
  const isAdminApiConfigured = Boolean(redpandaOverview);

  const tabs = buildTabs(isAdminApiConfigured, featureCreateUser, featureRolesApi, userData);
  const activeTab = deriveActiveTab(location.pathname, tabs);

  const handleTabClick = (tabKey: string) => {
    const tab = tabs.find((t) => t.key === tabKey);
    if (tab && !tab.disabled) {
      navigate({ to: tab.path });
    }
  };

  return (
    <>
      <ListLayoutNavigation>
        <Tabs value={activeTab}>
          <TabsList activeClassName="after:bg-foreground" className="w-fit" variant="underline">
            {tabs.map((tab) => (
              <Tooltip key={tab.key}>
                <TooltipTrigger asChild disabled={!tab.disabledReason}>
                  <span>
                    <TabsTrigger
                      className="text-base aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[state=active]:text-foreground"
                      disabled={tab.disabled}
                      onClick={() => handleTabClick(tab.key)}
                      value={tab.key}
                      variant="underline"
                    >
                      {tab.label}
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                {tab.disabledReason && <TooltipContent>{tab.disabledReason}</TooltipContent>}
              </Tooltip>
            ))}
          </TabsList>
        </Tabs>
      </ListLayoutNavigation>
    </>
  );
}
