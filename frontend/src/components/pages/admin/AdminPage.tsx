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

import { Alert, AlertIcon, Tabs } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type { ReactElement } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { toJson } from '../../../utils/jsonUtils';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { PageComponent, type PageInitHelper } from '../Page';
import { AdminDebugBundle } from './Admin.DebugBundle';
import { AdminLicenses } from './Admin.Licenses';
import { AdminRoles } from './Admin.Roles';
import { AdminUsers } from './Admin.Users';

export type AdminPageTab = 'users' | 'roles' | 'permissions-debug' | 'debug-bundle' | 'licenses';

@observer
export default class AdminPage extends PageComponent<{ tab: AdminPageTab }> {
  @observable x = '';

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Admin';
    p.addBreadcrumb('Admin', '/admin');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshAdminInfo(force);
    void api.refreshDebugBundleStatuses();
  }

  render() {
    if (api.adminInfo === undefined) return DefaultSkeleton;
    const hasAdminPermissions = api.adminInfo !== null;

    const tabs: { key: AdminPageTab; name: string; component: ReactElement }[] = [
      {
        key: 'users',
        name: 'Users',
        component: <AdminUsers />,
      },
      {
        key: 'roles',
        name: 'Roles',
        component: <AdminRoles />,
      },
      {
        key: 'permissions-debug',
        name: 'Permissions debug',
        component: (
          <code>
            <pre>{toJson(api.adminInfo, 4)}</pre>
          </code>
        ),
      },
    ];

    if (api.userData?.canViewDebugBundle && Features.debugBundle) {
      tabs.push({
        key: 'debug-bundle',
        name: 'Debug bundle',
        component: <AdminDebugBundle />,
      });
    }

    tabs.push({
      key: 'licenses',
      name: 'License details',
      component: <AdminLicenses />,
    });

    const activeTab = tabs.findIndex((x) => x.key === this.props.tab);
    if (activeTab === -1) {
      // No tab selected, default to users
      appGlobal.history.replace('/admin/users');
    }

    return (
      <PageContent>
        <Section>
          {hasAdminPermissions ? (
            <Tabs
              size="lg"
              items={tabs}
              index={activeTab >= 0 ? activeTab : 0}
              onChange={(_, key) => {
                appGlobal.history.push(`/admin/${key}`);
              }}
            />
          ) : (
            <div>
              <Alert status="error">
                <AlertIcon />
                You do not have the necessary permissions to view this page.
              </Alert>
            </div>
          )}
        </Section>
      </PageContent>
    );
  }
}
