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
import { Text } from 'components/redpanda-ui/components/typography';
import { useEffect } from 'react';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';

import { PermissionsTab } from './permissions-tab';
import { RolesTab } from './roles-tab';
import { UsersTab } from './users-tab';

export type SecurityTab = 'users' | 'roles' | 'permissions';

const tabs: { id: SecurityTab; label: string; requiresFeature?: () => boolean; description: string }[] = [
  {
    id: 'users',
    label: 'Users',
    description:
      'These users are SASL-SCRAM users managed by your cluster. View the full permissions picture for all identities (including OIDC and mTLS) on the Permissions tab.',
  },
  {
    id: 'roles',
    label: 'Roles',
    requiresFeature: () => Boolean(Features.rolesApi),
    description:
      'Roles are groups of access control lists (ACLs) that can be assigned to principals. A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user, OIDC identity, or mTLS client).',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    description:
      'A unified view of all principal permissions across your cluster, including direct ACLs and those inherited from role bindings. Inherited ACLs are read-only here and must be edited on the respective role page.',
  },
];

interface SecurityPageProps {
  tab: SecurityTab;
}

function TabContentWithDescription({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <div className="flex items-start gap-8">
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="w-72 shrink-0">
        <Text className="text-sm leading-6" variant="muted">
          {description}
        </Text>
      </aside>
    </div>
  );
}

export function SecurityPage({ tab }: SecurityPageProps) {
  const navigate = useNavigate();

  // Validate tab — fall back to 'users' if invalid
  const validTabs: SecurityTab[] = ['users', 'roles', 'permissions'];
  const activeTab = validTabs.includes(tab) ? tab : 'users';

  const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  useEffect(() => {
    uiState.pageTitle = 'Security';
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: `/security/${activeTab}` },
      { title: activeTabData.label, linkTo: `/security/${activeTab}` },
    ];
  }, [activeTab, activeTabData.label]);

  const setActiveTab = (newTab: SecurityTab) => {
    if (newTab === 'users') navigate({ to: '/security/users', replace: true });
    else if (newTab === 'roles') navigate({ to: '/security/roles', replace: true });
    else navigate({ to: '/security/permissions-list', replace: true });
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
          <TabContentWithDescription description={tabs[0].description}>
            <UsersTab onNavigateToTab={(tab: string) => setActiveTab(tab as SecurityTab)} />
          </TabContentWithDescription>
        </TabsContent>
        <TabsContent value="roles">
          <TabContentWithDescription description={tabs[1].description}>
            <RolesTab />
          </TabContentWithDescription>
        </TabsContent>
        <TabsContent value="permissions">
          <TabContentWithDescription description={tabs[2].description}>
            <PermissionsTab />
          </TabContentWithDescription>
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
}
