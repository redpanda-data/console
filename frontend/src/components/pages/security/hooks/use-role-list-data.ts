import { useEffect } from 'react';
import { useStore } from 'zustand';

import { useListRolesQuery } from '../../../../react-query/api/security';
import { rolesApi, useApiStoreHook, useRolesStore } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { useClusterFenceGuard } from '../../../cluster-fence/use-cluster-fence-guard';

export type RoleEntry = {
  name: string;
  members: unknown[];
};

/** Roles with their members; member lists come from the roles store, refreshed on mount. */
export function useRoleListData() {
  useEffect(function refreshRoleMembersOnMount() {
    rolesApi.refreshRoleMembers().catch(() => {
      // Members stay as last loaded; the list still renders.
    });
  }, []);
  const roleMembers = useStore(useRolesStore, (s) => s.roleMembers);
  const { data, isLoading, isError, error } = useListRolesQuery();

  const roles: RoleEntry[] = (data?.roles ?? []).map((r) => ({
    name: r.name,
    members: roleMembers.get(r.name) ?? [],
  }));

  return { roles, isLoading, isError, error };
}

/**
 * Whether the current user can create roles, and why not. `fencedReason` is the fence's, only where
 * the user could otherwise create one, so a missing permission keeps its own tooltip.
 */
export function useCreateRoleAvailability() {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const canCreateRoles = useApiStoreHook((s) => s.userData?.canCreateRoles);
  const editRolesReason = useClusterFenceGuard().reasonFor('editRoles');
  const disabled = canCreateRoles === false || !featureRolesApi;

  return {
    disabled,
    fencedReason: disabled ? undefined : editRolesReason,
    reason: [
      canCreateRoles === false &&
        'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
      !featureRolesApi && 'This feature is not enabled.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}
