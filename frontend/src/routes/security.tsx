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

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'components/icons';
import { useEffect } from 'react';

import { Alert, AlertDescription } from '../components/redpanda-ui/components/alert';
import { appGlobal } from '../state/app-global';
import { api, rolesApi, useApiStoreHook } from '../state/backend-api';

export const Route = createFileRoute('/security')({
  staticData: {
    title: 'Security',
    icon: ShieldCheckIcon,
  },
  beforeLoad: ({ location }) => {
    if (location.pathname === '/security' || location.pathname === '/security/') {
      throw redirect({ to: '/security/users' });
    }
  },
  component: SecurityLayout,
});

function SecurityLayout() {
  const acls = useApiStoreHook((s) => s.ACLs);

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

  return (
    <>
      {warning}
      {noAclAuthorizer}
      <Outlet />
    </>
  );
}
