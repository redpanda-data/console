import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';

import { useRefreshUserAccessData } from './use-user-details';
import { AuthenticationMethod } from '../../../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { appGlobal } from '../../../../state/app-global';
import { useApiStore, useRolesStore } from '../../../../state/backend-api';
import type { UserData } from '../../../../state/rest-interfaces';

const initialApiState = useApiStore.getState();
const initialRolesState = useRolesStore.getState();
const initialRefresh = appGlobal.onRefresh;

const refreshAcls = rs.fn(() => Promise.resolve());
const refreshRoles = rs.fn(() => Promise.resolve());
const refreshRoleMembers = rs.fn(() => Promise.resolve());

beforeEach(() => {
  useApiStore.setState({ refreshAcls, userData: undefined });
  useRolesStore.setState({ refreshRoles, refreshRoleMembers });
});

afterEach(() => {
  useApiStore.setState(initialApiState, true);
  useRolesStore.setState(initialRolesState, true);
  appGlobal.onRefresh = initialRefresh;
  rs.clearAllMocks();
});

test('loads ACLs and roles, then role members, on mount and on every app refresh', async () => {
  renderHook(() => useRefreshUserAccessData());
  await waitFor(() => expect(refreshRoleMembers).toHaveBeenCalledTimes(1));
  expect(refreshAcls).toHaveBeenCalledTimes(1);
  expect(refreshRoles).toHaveBeenCalledTimes(1);

  appGlobal.onRefresh();

  await waitFor(() => expect(refreshRoleMembers).toHaveBeenCalledTimes(2));
  expect(refreshAcls).toHaveBeenCalledTimes(2);
});

/** A signed-in user with no permissions at all, so no ACL listing either. */
const userWithoutAclAccess: UserData = {
  displayName: 'viewer',
  avatarUrl: '',
  authenticationMethod: AuthenticationMethod.UNSPECIFIED,
  canViewConsoleUsers: false,
  canListAcls: false,
  canListQuotas: false,
  canReassignPartitions: false,
  canPatchConfigs: false,
  canCreateRoles: false,
  canManageUsers: false,
  canViewPermissionsList: false,
  canManageLicense: false,
  canViewSchemas: false,
  canCreateSchemas: false,
  canDeleteSchemas: false,
  canManageSchemaRegistry: false,
  canViewDebugBundle: false,
  canListTransforms: false,
  canCreateTransforms: false,
  canDeleteTransforms: false,
};

// The permission check runs before the first await, so any load would already have started.
test('loads nothing for a user who cannot list ACLs', () => {
  useApiStore.setState({ userData: userWithoutAclAccess });

  renderHook(() => useRefreshUserAccessData());
  appGlobal.onRefresh();

  expect(refreshAcls).not.toHaveBeenCalled();
  expect(refreshRoles).not.toHaveBeenCalled();
  expect(refreshRoleMembers).not.toHaveBeenCalled();
});
