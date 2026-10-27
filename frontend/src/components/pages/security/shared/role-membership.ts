import { rolesApi } from '../../../../state/backend-api';

/** Removes the user from every role it belongs to; resolves with the outcome of each removal. */
export const removeUserFromAllRoles = (userName: string) =>
  Promise.allSettled(
    [...rolesApi.roleMembers]
      .filter(([, members]) => members.any((m) => m.name === userName))
      .map(([roleName]) => rolesApi.updateRoleMembership(roleName, [], [{ name: userName, principalType: 'User' }]))
  );
