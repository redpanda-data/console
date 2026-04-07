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

import { useNavigate } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { useEffect } from 'react';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';

import { PermissionsTab } from './permissions-tab';
import { RolesTab } from './roles-tab';
import { UsersTab } from './users-tab';

export type SecurityTab = 'users' | 'roles' | 'permissions';

const tabs: { id: SecurityTab; label: string; requiresFeature?: () => boolean }[] = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles', requiresFeature: () => Boolean(Features.rolesApi) },
  { id: 'permissions', label: 'Permissions' },
];

interface SecurityPageProps {
  tab: SecurityTab;
}

export function SecurityPage({ tab }: SecurityPageProps) {
  const navigate = useNavigate();

  // Validate tab — fall back to 'users' if invalid
  const validTabs: SecurityTab[] = ['users', 'roles', 'permissions'];
  const activeTab = validTabs.includes(tab) ? tab : 'users';

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? 'Users';

  useEffect(() => {
    uiState.pageTitle = 'Security';
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: `/security/${activeTab}` },
      { title: activeTabLabel, linkTo: `/security/${activeTab}` },
    ];
  }, [activeTab, activeTabLabel]);

  const setActiveTab = (newTab: SecurityTab) => {
    navigate({ to: '/security/$tab', params: { tab: newTab }, replace: true });
  };

  const visibleTabs = tabs.filter((t) => !t.requiresFeature || t.requiresFeature());

  return (
    <Tabs className="gap-6" onValueChange={(v) => setActiveTab(v as SecurityTab)} value={activeTab}>
      <TabsList className="h-11 [&>*]:w-auto" variant="underline">
        {visibleTabs.map((t) => (
          <TabsTrigger className="w-auto text-base" key={t.id} value={t.id} variant="underline">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContents>
        <TabsContent value="users">
          <UsersTab onNavigateToTab={(tab: string) => setActiveTab(tab as SecurityTab)} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
}
