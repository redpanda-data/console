import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect } from 'react';

import { useListUsersQuery } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { api, rolesApi } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';

const formatMechanism = (mechanism?: SASLMechanism): string | null => {
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256) {
    return 'SCRAM-SHA-256';
  }
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512) {
    return 'SCRAM-SHA-512';
  }
  return null;
};

/** Whether the principal is a SASL-SCRAM user of the cluster, and its mechanism label when it is. */
export function useScramUserDetails(userName: string) {
  const { data: usersData, isLoading } = useListUsersQuery();
  const currentUser = usersData?.users?.find((u) => u.name === userName);
  return {
    isLoading,
    isServiceAccount: currentUser !== undefined,
    mechanismLabel: formatMechanism(currentUser?.mechanism),
  };
}

/**
 * Loads ACLs, roles and role members for the user's page, now and on every app refresh. None of it
 * is per user, so opening another user's page doesn't load it again.
 */
export function useRefreshUserAccessData() {
  useEffect(function refreshUserAccessData() {
    const refreshData = async () => {
      if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
        return;
      }
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), rolesApi.refreshRoles()]);
      await rolesApi.refreshRoleMembers();
    };

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    refreshData().catch(console.error);
    appGlobal.onRefresh = () =>
      // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
      refreshData().catch(console.error);
  }, []);
}
